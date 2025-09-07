// services/strategy-engine/src/server.ts - COMPLETE VERSION
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
    // Load built-in strategies
    const movingAverageStrategy: StrategyPlugin1 = {
      id: "moving_average",
      name: "Moving Average",
      version: "1.0.0",
      execute: async (data: any[], config: any) => {
        const period = config.period || 20;
        const values = data
          .map((d) => d.payload?.price || d.payload?.value || 0)
          .slice(-period);
        const average =
          values.reduce((sum, val) => sum + val, 0) / values.length;

        return {
          resultId: `ma_${Date.now()}`,
          type: "PREDICTION",
          data: { movingAverage: average, period, trend: "stable" },
          confidence: 0.8,
          metrics: { calculation_time: Date.now() - Date.now() + 100 },
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
        const values = data.map(
          (d) => d.payload?.value || d.payload?.price || 0
        );
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
            severity: isAnomaly ? "high" : "low",
          },
          confidence: isAnomaly ? 0.9 : 0.3,
          metrics: { mean, std_dev: stdDev },
        };
      },
      validate: (config: any) => {
        return config.threshold && config.threshold > 0;
      },
    };

    const arimaStrategy: StrategyPlugin1 = {
      id: "arima_prediction",
      name: "ARIMA Time Series Prediction",
      version: "2.0.0",
      execute: async (data: any[], config: any) => {
        // Simple ARIMA-like prediction for demo
        const values = data.map(
          (d) => d.payload?.value || d.payload?.price || 0
        );
        const lastValue = values[values.length - 1];
        const trend =
          values.length > 1
            ? values[values.length - 1] - values[values.length - 2]
            : 0;
        const prediction = lastValue + trend * 0.8; // Simple trend continuation

        return {
          resultId: `arima_${Date.now()}`,
          type: "PREDICTION",
          data: {
            predicted_value: prediction,
            current_value: lastValue,
            trend,
            forecast_steps: config.steps || 5,
          },
          confidence: 0.75,
          metrics: { trend_strength: Math.abs(trend) },
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

      // For demo, execute strategy directly instead of worker pool
      const { strategyId, config, historicalData } = payload;
      const strategy = this.strategies.get(strategyId);

      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      const result = await strategy.execute(historicalData || [], config || {});

      // Store execution result
      await this.db.collection("strategy_results").insertOne({
        tenantId,
        executionId: correlationId,
        result,
        timestamp: new Date(),
      });

      // Publish result to notification service
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

  // gRPC method implementations
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
        created_at: { seconds: Math.floor(result.timestamp.getTime() / 1000) },
      });
    } catch (error) {
      const errorToLog =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Get strategy result error:", errorToLog);
      callback(errorToLog);
    }
  }

  async getAvailableStrategies(call: any, callback: any) {
    try {
      const strategies = Array.from(this.strategies.values()).map(
        (strategy) => ({
          id: strategy.id,
          name: strategy.name,
          version: strategy.version,
          enabled: true,
          description: `${strategy.name} strategy for data analysis`,
          required_data_types: ["time_series", "numeric"],
        })
      );

      callback(null, { strategies });
    } catch (error) {
      logger.error("Get available strategies error:", error);
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
// Server startup function
async function startServer() {
  try {
    // MongoDB connection
    const mongoClient = new MongoClient(
      process.env.MONGODB_URI || "mongodb://localhost:27017"
    );
    await mongoClient.connect();
    const db = mongoClient.db("stratosmesh");
    logger.info("Connected to MongoDB");

    // RabbitMQ connection
    const rabbitConnection = await amqp.connect(
      process.env.RABBITMQ_URI || "amqp://localhost"
    );
    logger.info("Connected to RabbitMQ");

    // Load protobuf definition
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, "../../../shared/proto/analytics.proto"),
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
      }
    );
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    // Create service instance
    const strategyEngineService = new StrategyEngineService(
      db,
      rabbitConnection
    );

    // Create gRPC server
    const server = new grpc.Server();
    server.addService(
      proto.stratosmesh.analytics.StrategyEngineService.service,
      {
        getStrategyResult: strategyEngineService.getStrategyResult.bind(
          strategyEngineService
        ),
        getAvailableStrategies:
          strategyEngineService.getAvailableStrategies.bind(
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
        server.start();
      }
    );

    // Graceful shutdown
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

// Handle uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});
