import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import amqp from "amqplib";
import type { Channel, ChannelModel } from "amqplib";
import { Worker } from "worker_threads";
import path from "path";
import { Logger } from "../../../shared/utils/logger";
import { WorkerPool } from "../../../shared/utils/worker-pool";
import {
  StrategyPlugin1,
  StrategyPlugin,
  WorkerMessage,
  AnalysisResult,
} from "../../../shared/types";

import dotenv from "dotenv";

dotenv.config();
const logger = new Logger("StrategyEngine");

class StrategyEngineService {
  private db: Db;
  private rabbitConnection: ChannelModel;
  private channel!: Channel;
  private workerPool: WorkerPool;
  private strategies: Map<string, StrategyPlugin1>;

  constructor(db: Db, rabbitConnection: ChannelModel) {
    this.db = db;
    this.rabbitConnection = rabbitConnection;
    this.strategies = new Map();
    this.workerPool = new WorkerPool({
      minWorkers: 2,
      maxWorkers: 10,
      workerScript: path.join(__dirname, "../../../workers/strategy-worker.js"),
    });
    this.setupRabbitMQ();
    this.loadStrategies();
  }

  private async setupRabbitMQ() {
    try {
      this.channel = await this.rabbitConnection.createChannel();

      await this.channel.assertQueue("strategy.tasks", { durable: true });
      await this.channel.prefetch(1);

      // Consume strategy execution tasks
      this.channel.consume("strategy.tasks", async (msg) => {
        if (msg) {
          try {
            const message: WorkerMessage = JSON.parse(msg.content.toString());
            await this.processStrategyTask(message);
            this.channel.ack(msg);
          } catch (error) {
            logger.error("Strategy task processing error:", error);
            this.channel.nack(msg, false, false);
          }
        }
      });

      logger.info("RabbitMQ setup completed for Strategy Engine");
    } catch (error) {
      logger.error("RabbitMQ setup error:", error);
    }
  }

  private async loadStrategies() {
    // const movingAverageStrategy: StrategyPlugin1 = {
    //   id: "moving_average",
    //   name: "Moving Average",
    //   version: "1.0.0",
    //   execute: async (data: any[], config: any) => {
    //     const period = config.period || 20;
    //     const values = data
    //       .map((d) => d.payload?.price || d.payload?.value || 0)
    //       .slice(-period);
    //     const average =
    //       values.reduce((sum, val) => sum + val, 0) / values.length;

    //     return {
    //       resultId: `ma_${Date.now()}`,
    //       type: "PREDICTION",
    //       data: { movingAverage: average, period, trend: "stable" },
    //       confidence: 0.8,
    //       metrics: { calculation_time: Date.now() - Date.now() + 100 },
    //     };
    //   },
    //   validate: (config: any) => {
    //     return config.period && config.period > 0;
    //   },
    // };

    // const anomalyDetectionStrategy: StrategyPlugin1 = {
    //   id: "anomaly_detection",
    //   name: "Anomaly Detection",
    //   version: "1.0.0",
    //   execute: async (data: any[], config: any) => {
    //     const threshold = config.threshold || 2;
    //     const values = data.map(
    //       (d) => d.payload?.value || d.payload?.price || 0
    //     );
    //     const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    //     const stdDev = Math.sqrt(
    //       values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    //         values.length
    //     );

    //     const latestValue = values[values.length - 1];
    //     const isAnomaly = Math.abs(latestValue - mean) > threshold * stdDev;

    //     return {
    //       resultId: `anomaly_${Date.now()}`,
    //       type: "ANOMALY",
    //       data: {
    //         isAnomaly,
    //         value: latestValue,
    //         mean,
    //         stdDev,
    //         threshold: threshold * stdDev,
    //         severity: isAnomaly ? "high" : "low",
    //       },
    //       confidence: isAnomaly ? 0.9 : 0.3,
    //       metrics: { mean, std_dev: stdDev },
    //     };
    //   },
    //   validate: (config: any) => {
    //     return config.threshold && config.threshold > 0;
    //   },
    // };

    const movingAverageStrategy: StrategyPlugin1 = {
      id: "moving_average",
      name: "Moving Average",
      version: "1.0.0",
      execute: async (data: any[], config: any) => {
        const period = config.period || 20;
        const field = config.field || "Price"; // Default to Price for financial data

        logger.info(
          `Executing Moving Average with period ${period} on field ${field}`
        );
        logger.debug("Input data sample:", data.slice(0, 2));

        // IMPROVED: Better data extraction with multiple fallback strategies
        const values = data
          .map((record, index) => {
            let value = 0;

            try {
              // Strategy 1: Direct field access in payload
              if (record.payload && record.payload[field]) {
                value = parseFloat(record.payload[field]);
              }
              // Strategy 2: Check for nested fields structure
              else if (
                record.payload &&
                record.payload.fields &&
                record.payload.fields[field]
              ) {
                value = parseFloat(record.payload.fields[field]);
              }
              // Strategy 3: Look for common field names
              else if (record.payload) {
                const payload = record.payload;
                // Try common variations
                const fieldVariations = [
                  field,
                  field.toLowerCase(),
                  field.toUpperCase(),
                  "price",
                  "value",
                  "amount",
                ];
                for (const variation of fieldVariations) {
                  if (payload[variation] !== undefined) {
                    const parsed = parseFloat(payload[variation]);
                    if (!isNaN(parsed)) {
                      value = parsed;
                      break;
                    }
                  }
                  // Also check in nested fields
                  if (
                    payload.fields &&
                    payload.fields[variation] !== undefined
                  ) {
                    const parsed = parseFloat(payload.fields[variation]);
                    if (!isNaN(parsed)) {
                      value = parsed;
                      break;
                    }
                  }
                }
              }

              logger.debug(
                `Record ${index}: extracted value ${value} for field ${field}`
              );
              return isNaN(value) ? 0 : value;
            } catch (error) {
              logger.warn(
                `Failed to extract value from record ${index}:`,
                error
              );
              return 0;
            }
          })
          .filter((v) => v > 0); // Remove zero/invalid values

        if (values.length === 0) {
          logger.warn(
            "No valid numeric values found for moving average calculation"
          );
          return {
            resultId: `ma_${Date.now()}`,
            type: "PREDICTION",
            data: {
              movingAverage: 0,
              period,
              trend: "insufficient_data",
              message: "No valid numeric data found",
              field,
              recordsAnalyzed: data.length,
            },
            confidence: 0.1,
            metrics: {
              calculationTime: Date.now(),
              dataPointsUsed: 0,
              requestedPeriod: period,
              actualPeriod: 0, // Always provide actualPeriod as a number
            },
          };
        }

        // Use available data points, up to the requested period
        const actualPeriod = Math.min(period, values.length);
        const recentValues = values.slice(-actualPeriod);
        const average =
          recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

        // Calculate trend
        let trend = "stable";
        if (recentValues.length >= 2) {
          const older = recentValues[0];
          const newer = recentValues[recentValues.length - 1];
          if (newer > older * 1.02) trend = "upward";
          else if (newer < older * 0.98) trend = "downward";
        }

        logger.info(
          `Moving Average calculated: ${average} (${recentValues.length} points, trend: ${trend})`
        );

        return {
          resultId: `ma_${Date.now()}`,
          type: "PREDICTION",
          data: {
            movingAverage: Number(average.toFixed(4)),
            period: actualPeriod,
            trend,
            field,
            recentValues: recentValues.slice(-5), // Last 5 values
            dataRange: {
              min: Math.min(...recentValues),
              max: Math.max(...recentValues),
            },
          },
          confidence: Math.min(0.9, 0.5 + (recentValues.length / period) * 0.4),
          metrics: {
            calculationTime: Date.now(),
            dataPointsUsed: recentValues.length,
            requestedPeriod: period,
            actualPeriod,
          },
        };
      },
      validate: (config: any) => {
        return config.period && config.period > 0;
      },
    };

    const anomalyDetectionStrategy: StrategyPlugin1 = {
      id: "anomaly_detection",
      name: "Anomaly Detection",
      version: "1.0.0",
      execute: async (data: any[], config: any) => {
        const threshold = config.threshold || 2;

        // FIX: Better data extraction with multiple fallback fields
        const values = data
          .map((d) => {
            // Try multiple possible field names for values
            let value = 0;
            if (d.payload?.fields) {
              // Look for numeric fields in the fields object
              const fields = d.payload.fields;
              const numericFields = Object.keys(fields).filter(
                (key) =>
                  typeof fields[key] === "number" ||
                  !isNaN(parseFloat(fields[key]))
              );
              if (numericFields.length > 0) {
                value = parseFloat(fields[numericFields[0]]);
              }
            } else if (d.payload?.value !== undefined) {
              value = parseFloat(d.payload.value);
            } else if (d.payload?.price !== undefined) {
              value = parseFloat(d.payload.price);
            } else if (d.value !== undefined) {
              value = parseFloat(d.value);
            } else if (d.price !== undefined) {
              value = parseFloat(d.price);
            } else if (typeof d.payload === "number") {
              value = d.payload;
            } else {
              // Try to find any numeric value in the payload
              const payload = d.payload || d;
              for (const [key, val] of Object.entries(payload)) {
                if (
                  typeof val === "number" ||
                  !isNaN(parseFloat(String(val)))
                ) {
                  value = parseFloat(String(val));
                  break;
                }
              }
            }
            return isNaN(value) ? 0 : value;
          })
          .filter((v) => v !== 0); // Remove zero values unless they're legitimate

        // Handle case where we have no meaningful data
        if (values.length === 0) {
          return {
            resultId: `anomaly_${Date.now()}`,
            type: "ANOMALY",
            data: {
              isAnomaly: false,
              reason: "No numeric data available for analysis",
              dataPoints: data.length,
              extractedValues: 0,
            },
            confidence: 0.1,
            metrics: {
              mean: 0,
              stdDev: 0,
              dataPointsAnalyzed: 0,
              thresholdUsed: 0,
            },
          };
        }

        // Calculate statistics
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance =
          values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          values.length;
        const stdDev = Math.sqrt(variance);

        const latestValue = values[values.length - 1];
        const deviation = Math.abs(latestValue - mean);
        const thresholdValue = threshold * stdDev;
        const isAnomaly = deviation > thresholdValue && stdDev > 0;

        // Calculate severity
        let severity = "low";
        if (isAnomaly) {
          const severityRatio = deviation / thresholdValue;
          if (severityRatio > 3) severity = "critical";
          else if (severityRatio > 2) severity = "high";
          else severity = "medium";
        }

        return {
          resultId: `anomaly_${Date.now()}`,
          type: "ANOMALY",
          data: {
            isAnomaly,
            value: latestValue,
            mean,
            stdDev,
            deviation,
            threshold: thresholdValue,
            severity,
            analysisDetails: {
              dataPoints: values.length,
              originalDataPoints: data.length,
              valueRange: {
                min: Math.min(...values),
                max: Math.max(...values),
              },
            },
          },
          confidence: isAnomaly
            ? Math.min(0.9, 0.5 + (deviation / thresholdValue) * 0.4)
            : Math.max(0.3, 0.8 - (deviation / thresholdValue) * 0.3),
          metrics: {
            mean,
            stdDev: Number(stdDev.toFixed(4)),
            dataPointsAnalyzed: values.length,
            thresholdUsed: threshold,
          },
        };
      },
      validate: (config: any) => {
        return config.threshold && config.threshold > 0;
      },
    };

    // const arimaStrategy: StrategyPlugin1 = {
    //   id: "arima_prediction",
    //   name: "ARIMA Time Series Prediction",
    //   version: "2.0.0",
    //   execute: async (data: any[], config: any) => {
    //     // Simple ARIMA-like prediction for demo
    //     const values = data.map(
    //       (d) => d.payload?.value || d.payload?.price || 0
    //     );
    //     const lastValue = values[values.length - 1];
    //     const trend =
    //       values.length > 1
    //         ? values[values.length - 1] - values[values.length - 2]
    //         : 0;
    //     const prediction = lastValue + trend * 0.8; // Simple trend continuation

    //     return {
    //       resultId: `arima_${Date.now()}`,
    //       type: "PREDICTION",
    //       data: {
    //         predicted_value: prediction,
    //         current_value: lastValue,
    //         trend,
    //         forecast_steps: config.steps || 5,
    //       },
    //       confidence: 0.75,
    //       metrics: { trend_strength: Math.abs(trend) },
    //     };
    //   },
    //   validate: (config: any) => {
    //     return config.p >= 0 && config.d >= 0 && config.q >= 0;
    //   },
    // };

    const arimaStrategy: StrategyPlugin1 = {
      id: "arima_prediction",
      name: "ARIMA Time Series Prediction",
      version: "2.0.0",
      execute: async (data: any[], config: any) => {
        const field = config.field || "Price";
        const steps = config.steps || 5;

        logger.info(
          `Executing ARIMA prediction on field ${field} for ${steps} steps`
        );

        // IMPROVED: Same enhanced data extraction as moving average
        const values = data
          .map((record, index) => {
            let value = 0;

            try {
              if (record.payload && record.payload[field]) {
                value = parseFloat(record.payload[field]);
              } else if (
                record.payload &&
                record.payload.fields &&
                record.payload.fields[field]
              ) {
                value = parseFloat(record.payload.fields[field]);
              } else if (record.payload) {
                const payload = record.payload;
                const fieldVariations = [
                  field,
                  field.toLowerCase(),
                  "price",
                  "value",
                ];
                for (const variation of fieldVariations) {
                  if (payload[variation] !== undefined) {
                    const parsed = parseFloat(payload[variation]);
                    if (!isNaN(parsed)) {
                      value = parsed;
                      break;
                    }
                  }
                  if (
                    payload.fields &&
                    payload.fields[variation] !== undefined
                  ) {
                    const parsed = parseFloat(payload.fields[variation]);
                    if (!isNaN(parsed)) {
                      value = parsed;
                      break;
                    }
                  }
                }
              }

              return isNaN(value) ? 0 : value;
            } catch (error) {
              logger.warn(
                `Failed to extract value from record ${index}:`,
                error
              );
              return 0;
            }
          })
          .filter((v) => v > 0);

        if (values.length < 3) {
          return {
            resultId: `arima_${Date.now()}`,
            type: "PREDICTION",
            data: {
              predicted_values: [],
              message:
                "Insufficient data for ARIMA prediction (need at least 3 points)",
              field,
              dataPointsAvailable: values.length,
            },
            confidence: 0.1,
            metrics: {
              trendStrength: 0,
              dataPointsUsed: values.length,
              volatility: 0,
              predictionHorizon: config?.steps || 0,
            },
          };
        }

        // Simple ARIMA-like calculation with improved logic
        const recent = values.slice(-10); // Use last 10 points
        const lastValue = recent[recent.length - 1];

        // Calculate trend and seasonality
        const differences = [];
        for (let i = 1; i < recent.length; i++) {
          differences.push(recent[i] - recent[i - 1]);
        }

        const avgDifference =
          differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
        const trend = avgDifference;

        // Calculate volatility
        const variance =
          differences.reduce(
            (sum, diff) => sum + Math.pow(diff - avgDifference, 2),
            0
          ) / differences.length;
        const volatility = Math.sqrt(variance);

        // Generate predictions
        const predictions = [];
        let currentValue = lastValue;

        for (let i = 0; i < steps; i++) {
          // Simple trend continuation with some noise reduction
          const trendComponent = trend * 0.8; // Dampen trend
          const randomComponent = (Math.random() - 0.5) * volatility * 0.3; // Add small random component
          currentValue = currentValue + trendComponent + randomComponent;
          predictions.push(Number(currentValue.toFixed(4)));
        }

        // Calculate confidence based on data consistency
        const trendConsistency =
          1 - Math.min(volatility / Math.abs(lastValue), 1);
        const confidence = Math.max(
          0.3,
          Math.min(0.9, 0.5 + trendConsistency * 0.4)
        );

        logger.info(
          `ARIMA prediction completed: trend=${trend.toFixed(
            4
          )}, volatility=${volatility.toFixed(4)}`
        );

        return {
          resultId: `arima_${Date.now()}`,
          type: "PREDICTION",
          data: {
            predicted_values: predictions,
            current_value: lastValue,
            trend: Number(trend.toFixed(4)),
            volatility: Number(volatility.toFixed(4)),
            forecast_steps: steps,
            field,
            predictionInterval: {
              lower: predictions.map((p) =>
                Number((p - volatility).toFixed(4))
              ),
              upper: predictions.map((p) =>
                Number((p + volatility).toFixed(4))
              ),
            },
          },
          confidence: Number(confidence.toFixed(3)),
          metrics: {
            trendStrength: Math.abs(trend),
            dataPointsUsed: recent.length,
            volatility: Number(volatility.toFixed(4)),
            predictionHorizon: steps,
          },
        };
      },
      validate: (config: any) => {
        return config.p >= 0 && config.d >= 0 && config.q >= 0;
      },
    };

    this.strategies.set("moving_average", movingAverageStrategy);
    this.strategies.set("anomaly_detection", anomalyDetectionStrategy);
    this.strategies.set("arima_prediction", arimaStrategy);

    logger.info(`Loaded ${this.strategies.size} strategies`);
  }

  private async processStrategyTask(message: WorkerMessage) {
    const { tenantId, payload, correlationId } = message;

    try {
      const tenant = await this.db.collection("tenants").findOne({ tenantId });
      if (!tenant) {
        throw new Error("Tenant not found");
      }

      const { strategyId, config, historicalData } = payload;
      const strategy = this.strategies.get(strategyId);

      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      const result = await strategy.execute(historicalData || [], config || {});

      await this.db.collection("strategy_results").insertOne({
        tenantId,
        executionId: correlationId,
        result,
        timestamp: new Date(),
      });

      if (this.channel) {
        await this.channel.publish(
          "notifications",
          `result.${tenantId}`,
          Buffer.from(
            JSON.stringify({
              tenantId,
              type: "STRATEGY_RESULT",
              payload: result,
              correlationId,
            })
          ),
          { persistent: true }
        );
      }

      logger.info(`Strategy executed successfully for tenant ${tenantId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Strategy execution failed:", error);

      await this.db.collection("strategy_results").insertOne({
        tenantId,
        executionId: correlationId,
        error: errorMessage,
        timestamp: new Date(),
      });
    }
  }

  // ✅ CRITICAL FIX: Add the missing ExecuteStrategy method
  // async executeStrategy(call: any, callback: any) {
  //   try {
  //     const { tenantId, strategyId, config, data } = call.request;

  //     logger.info(
  //       `🚀 ExecuteStrategy called for tenant ${tenantId}, strategy ${strategyId}`
  //     );

  //     if (!tenantId || !strategyId) {
  //       return callback(
  //         new Error("Missing required fields: tenantId or strategyId")
  //       );
  //     }

  //     // Validate tenant exists
  //     const tenant = await this.db.collection("tenants").findOne({ tenantId });
  //     if (!tenant) {
  //       return callback(new Error("Tenant not found"));
  //     }

  //     // Check if strategy exists
  //     const strategy = this.strategies.get(strategyId);
  //     if (!strategy) {
  //       return callback(new Error(`Strategy ${strategyId} not found`));
  //     }

  //     // Generate execution ID
  //     const executionId = `exec_${Date.now()}_${Math.random()
  //       .toString(36)
  //       .substr(2, 9)}`;

  //     // Get historical data if not provided
  //     let historicalData = data || [];
  //     if (!historicalData || historicalData.length === 0) {
  //       logger.info("No data provided, fetching historical data...");
  //       const cursor = this.db
  //         .collection("stream_data")
  //         .find({ tenantId })
  //         .sort({ timestamp: -1 })
  //         .limit(100);
  //       historicalData = await cursor.toArray();
  //       logger.info(`Fetched ${historicalData.length} historical records`);
  //     }

  //     // Execute strategy directly (immediate execution)
  //     try {
  //       const result = await strategy.execute(historicalData, config || {});

  //       // Store result
  //       await this.db.collection("strategy_results").insertOne({
  //         tenantId,
  //         executionId,
  //         strategyId,
  //         result,
  //         status: "COMPLETED",
  //         timestamp: new Date(),
  //       });

  //       logger.info(
  //         `✅ Strategy ${strategyId} executed successfully for tenant ${tenantId}`
  //       );

  //       callback(null, {
  //         executionId,
  //         status: "COMPLETED",
  //         message: "Strategy executed successfully",
  //         startedAt: { seconds: Math.floor(Date.now() / 1000) },
  //       });
  //     } catch (executionError) {
  //       const err = executionError as Error;
  //       logger.error("Strategy execution error:", err);

  //       // Store error
  //       await this.db.collection("strategy_results").insertOne({
  //         tenantId,
  //         executionId,
  //         strategyId,
  //         error: err.message,
  //         status: "FAILED",
  //         timestamp: new Date(),
  //       });

  //       callback(null, {
  //         executionId,
  //         status: "FAILED",
  //         message: `Strategy execution failed: ${err.message}`,
  //         startedAt: { seconds: Math.floor(Date.now() / 1000) },
  //       });
  //     }
  //   } catch (error) {
  //     const err = error as Error;
  //     logger.error("ExecuteStrategy handler error:", err);
  //     callback(new Error(`Execution failed: ${err.message}`));
  //   }
  // }

  async executeStrategy(call: any, callback: any) {
    try {
      const { tenantId, strategyId, config, data } = call.request;

      logger.info(
        `ExecuteStrategy called for tenant ${tenantId}, strategy ${strategyId}`
      );
      logger.debug("Strategy config:", config);
      logger.debug("Input data length:", data ? data.length : 0);

      if (!tenantId || !strategyId) {
        return callback(
          new Error("Missing required fields: tenantId or strategyId")
        );
      }

      // Validate tenant exists
      const tenant = await this.db.collection("tenants").findOne({ tenantId });
      if (!tenant) {
        return callback(new Error("Tenant not found"));
      }

      // Check if strategy exists
      const strategy = this.strategies.get(strategyId);
      if (!strategy) {
        return callback(new Error(`Strategy ${strategyId} not found`));
      }

      const executionId = `exec_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Get historical data if not provided or insufficient
      let historicalData = data || [];
      if (!historicalData || historicalData.length < 5) {
        logger.info("Insufficient data provided, fetching historical data...");

        // IMPROVED: Fetch recent data with better query
        const cursor = this.db
          .collection("stream_data")
          .find({
            tenantId,
            payload: { $exists: true, $ne: null },
            timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
          })
          .sort({ timestamp: -1 })
          .limit(100);

        const dbData = await cursor.toArray();

        // If we have data from request, combine it with historical data
        if (historicalData && historicalData.length > 0) {
          historicalData = [...dbData, ...historicalData];
        } else {
          historicalData = dbData;
        }

        logger.info(`Combined data: ${historicalData.length} total records`);
      }

      // Log sample of data structure for debugging
      if (historicalData.length > 0) {
        logger.debug(
          "Sample record structure:",
          JSON.stringify(historicalData[0], null, 2)
        );
      }

      try {
        // Execute strategy with improved error handling
        const result = await strategy.execute(historicalData, config || {});

        // Store result
        await this.db.collection("strategy_results").insertOne({
          tenantId,
          executionId,
          strategyId,
          result,
          status: "COMPLETED",
          config,
          dataPointsUsed: historicalData.length,
          timestamp: new Date(),
        });

        logger.info(
          `Strategy ${strategyId} executed successfully: confidence=${result.confidence}`
        );

        callback(null, {
          executionId,
          status: "COMPLETED",
          message: "Strategy executed successfully",
          startedAt: { seconds: Math.floor(Date.now() / 1000) },
          dataPointsProcessed: historicalData.length,
        });
      } catch (executionError) {
        const err = executionError as Error;
        logger.error("Strategy execution error:", err);

        // Store error with more details
        await this.db.collection("strategy_results").insertOne({
          tenantId,
          executionId,
          strategyId,
          error: err.message,
          status: "FAILED",
          config,
          dataPointsAvailable: historicalData.length,
          timestamp: new Date(),
        });

        callback(null, {
          executionId,
          status: "FAILED",
          message: `Strategy execution failed: ${err.message}`,
          startedAt: { seconds: Math.floor(Date.now() / 1000) },
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error("ExecuteStrategy handler error:", err);
      callback(new Error(`Execution failed: ${err.message}`));
    }
  }

  async getStrategyResult(call: any, callback: any) {
    try {
      const { executionId } = call.request;

      const result = await this.db.collection("strategy_results").findOne({
        executionId: executionId,
      });

      if (!result) {
        return callback(new Error("Execution not found"));
      }

      callback(null, {
        executionId: executionId,
        status: result.error ? "FAILED" : "COMPLETED",
        result: result.result || null,
        errors: result.error ? [result.error] : [],
        createdAt: { seconds: Math.floor(result.timestamp.getTime() / 1000) },
      });
    } catch (error) {
      const errorToLog =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Get strategy result error:", errorToLog);
      callback(errorToLog);
    }
  }

  async listStrategies(call: any, callback: any) {
    try {
      const strategies = Array.from(this.strategies.values()).map(
        (strategy) => ({
          id: strategy.id,
          name: strategy.name,
          version: strategy.version,
          enabled: true,
          description: `${strategy.name} strategy for data analysis`,
          requiredDataTypes: ["time_series", "numeric"],
        })
      );

      callback(null, { strategies });
    } catch (error) {
      logger.error("List available strategies error:", error);
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

async function startServer() {
  try {
    const mongoClient = new MongoClient(
      process.env.MONGODB_URI || "mongodb://localhost:27017"
    );
    await mongoClient.connect();
    const db = mongoClient.db("stratosmesh");
    logger.info("Connected to MongoDB");

    const rabbitConnection = await amqp.connect(
      process.env.RABBITMQ_URI || "amqp://localhost"
    );
    logger.info("Connected to RabbitMQ");

    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, "../../../shared/proto/analytics.proto"),
      {
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
      }
    );
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    const strategyEngineService = new StrategyEngineService(
      db,
      rabbitConnection
    );

    const server = new grpc.Server();

    // ✅ CRITICAL FIX: Add ExecuteStrategy to the service methods
    server.addService(
      proto.stratosmesh.analytics.StrategyEngineService.service,
      {
        getStrategyResult: strategyEngineService.getStrategyResult.bind(
          strategyEngineService
        ),
        listStrategies: strategyEngineService.listStrategies.bind(
          strategyEngineService
        ),
        executeStrategy: strategyEngineService.executeStrategy.bind(
          // ✅ ADDED THIS
          strategyEngineService
        ),
      }
    );

    const port = process.env.STRATEGY_SERVICE_PORT || "50053";
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          logger.error("Failed to start server:", err);
          process.exit(1);
        }
        logger.info(`Strategy Engine service running on port ${boundPort}`);
        logger.info("✅ ExecuteStrategy method is now implemented!");
        server.start();
      }
    );

    process.on("SIGINT", async () => {
      logger.info("Shutting down gracefully...");
      server.forceShutdown();
      await mongoClient.close();
      await rabbitConnection.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Server startup error:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

startServer().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});
