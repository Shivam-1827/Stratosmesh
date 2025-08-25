import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import amqp from "amqplib";
import type { Channel, ChannelModel } from "amqplib";
import { Worker } from "worker_threads";
import path from "path";
import { Logger } from "../../../shared/utils/logger";
import { WorkerPool } from "../../../shared/utils/worker-pool";
import { StrategyPlugin, WorkerMessage } from "../../../shared/types";

const logger = new Logger("StrategyEngine");

class StrategyEngineService {
  private db: Db;
  private rabbitConnection: ChannelModel;
  private channel!: Channel; // Fix 1: Use definite assignment assertion
  private workerPool: WorkerPool;
  private strategies: Map<string, StrategyPlugin>;

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
    this.channel = await this.rabbitConnection.createChannel();

    await this.channel.assertQueue("strategy.tasks", { durable: true });
    await this.channel.prefetch(1); // Process one message at a time per worker

    // Consume strategy execution tasks
    this.channel.consume("strategy.tasks", async (msg) => {
      if (msg) {
        try {
          const message: WorkerMessage = JSON.parse(msg.content.toString());
          await this.processStrategyTask(message);
          this.channel.ack(msg);
        } catch (error) {
          logger.error("Strategy task processing error:", error);
          this.channel.nack(msg, false, false); // Don't requeue failed messages
        }
      }
    });
  }

  private async loadStrategies() {
    // Load built-in strategies
    const movingAverageStrategy: StrategyPlugin = {
      id: "moving_average",
      name: "Moving Average",
      version: "1.0.0",
      execute: async (data: any[], config: any) => {
        const period = config.period || 20;
        const values = data.map((d) => d.payload.price).slice(-period);
        const average =
          values.reduce((sum, val) => sum + val, 0) / values.length;

        return {
          resultId: `ma_${Date.now()}`,
          type: "PREDICTION",
          data: { movingAverage: average, period },
          confidence: 0.8,
          metrics: { calculation_time: Date.now() },
        };
      },
      validate: (config: any) => {
        return config.period && config.period > 0;
      },
    };

    const anomalyDetectionStrategy: StrategyPlugin = {
      id: "anomaly_detection",
      name: "Anomaly Detection",
      version: "1.0.0",
      execute: async (data: any[], config: any) => {
        const threshold = config.threshold || 2;
        const values = data.map((d) => d.payload.value);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const stdDev = Math.sqrt(
          values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            values.length
        );

        const latestValue = values[values.length - 1];
        const isAnomaly = Math.abs(latestValue - mean) > threshold * stdDev;

        return {
          resultId: `anomaly_${Date.now()}`,
          type: "ANOMALY",
          data: {
            isAnomaly,
            value: latestValue,
            mean,
            stdDev,
            threshold: threshold * stdDev,
          },
          confidence: isAnomaly ? 0.9 : 0.3,
          metrics: { mean, std_dev: stdDev },
        };
      },
      validate: (config: any) => {
        return config.threshold && config.threshold > 0;
      },
    };

    this.strategies.set("moving_average", movingAverageStrategy);
    this.strategies.set("anomaly_detection", anomalyDetectionStrategy);

    logger.info(`Loaded ${this.strategies.size} strategies`);
  }

  private async processStrategyTask(message: WorkerMessage) {
    const { tenantId, payload, correlationId } = message;

    try {
      // Get tenant context and validate limits
      const tenant = await this.db.collection("tenants").findOne({ tenantId });
      if (!tenant) {
        throw new Error("Tenant not found");
      }

      // Execute strategy in worker thread
      const result = await this.workerPool.execute({
        type: message.type,
        tenantId,
        payload,
        correlationId,
      });

      // Store execution result
      await this.db.collection("strategy_results").insertOne({
        tenantId,
        executionId: correlationId,
        result,
        timestamp: new Date(),
      });

      // Publish result to notification service
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

      logger.info(`Strategy executed successfully for tenant ${tenantId}`);
    } catch (error) {
      // Fix 2: Proper error handling for unknown type
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Strategy execution failed:", error);

      // Store error result
      await this.db.collection("strategy_results").insertOne({
        tenantId,
        executionId: correlationId,
        error: errorMessage, // Use the properly typed error message
        timestamp: new Date(),
      });
    }
  }

  async getStrategyResult(call: any, callback: any) {
    try {
      const { execution_id } = call.request;

      const result = await this.db.collection("strategy_results").findOne({
        executionId: execution_id,
      });

      if (!result) {
        return callback(new Error("Execution not found"));
      }

      callback(null, {
        execution_id,
        status: result.error ? "FAILED" : "COMPLETED",
        result: result.result || null,
        errors: result.error ? [result.error] : [],
      });
    } catch (error) {
      // Fix 2: Proper error handling for unknown type
      const errorToLog =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Get strategy result error:", errorToLog);
      callback(errorToLog);
    }
  }
}

export { StrategyEngineService };
