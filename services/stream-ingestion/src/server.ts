import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import * as amqp from "amqplib";
import path from "path";
import type { Channel, ChannelModel } from "amqplib";
import { Logger } from "../../../shared/utils/logger";
import { StreamData, TenantContext } from "../../../shared/types";
import { RateLimiter } from "../../../shared/utils/rate-limiter";
import { MetricsCollector } from "../../../shared/utils/metrics";
import dotenv from 'dotenv';

dotenv.config();

const logger = new Logger("StreamIngestion");

class UniversalDataStreamServiceImpl {
  private db: Db;
  private rabbitConnection: amqp.ChannelModel;
  private channel!: Channel;
  private rateLimiter: RateLimiter;
  private metrics: MetricsCollector;

  constructor(db: Db, rabbitConnection: ChannelModel) {
    this.db = db;
    this.rabbitConnection = rabbitConnection;
    this.rateLimiter = new RateLimiter();
    this.metrics = new MetricsCollector();
  }

  async init(): Promise<void> {
    this.channel = await this.rabbitConnection.createChannel();

    // Declare exchanges and queues
    await this.channel.assertExchange("stream.data", "topic", {
      durable: true,
    });
    await this.channel.assertExchange("strategy.execution", "topic", {
      durable: true,
    });

    await this.channel.assertQueue("stream.processing", { durable: true });
    await this.channel.assertQueue("strategy.tasks", { durable: true });

    logger.info("Stream ingestion service initialized");
  }

  // Universal LLM data processing (main entry point)
  async processLLMData(call: any, callback: any) {
    try {
      const { tenant_id, stream_id, processed_data, original_format } =
        call.request;

      logger.info(
        `Processing LLM data for tenant ${tenant_id}, stream ${stream_id}`
      );
      logger.info(
        `Detected type: ${processed_data.detected_type}, confidence: ${processed_data.confidence}`
      );

      // Validate tenant
      const tenant = await this.getTenantContext(tenant_id);
      if (!tenant) {
        return callback(new Error("Tenant not found or inactive"));
      }

      const results = [];

      // Process each record from LLM processor
      for (const record of processed_data.records) {
        const streamData: StreamData = {
          tenantId: tenant_id,
          streamId: stream_id,
          dataType: processed_data.detected_type, // Use LLM's detection directly
          payload: record.payload,
          timestamp: new Date(record.timestamp.seconds * 1000),
          metadata: {
            ...record.metadata,
            llm_processed: true,
            original_format: original_format,
            confidence: processed_data.confidence,
            processing_steps: processed_data.processing_steps,
            schema: processed_data.schema,
          },
        };

        // Store in database
        await this.storeStreamData(streamData);

        // Queue for strategy processing if auto-processing is enabled
        await this.queueForProcessing(streamData, tenant);

        results.push({
          record_id: `${stream_id}_${Date.now()}_${results.length}`,
          timestamp: streamData.timestamp,
          data_type: streamData.dataType,
        });
      }

      // Update metrics
      this.metrics.incrementCounter("llm_streams_processed_total", {
        tenant_id: tenant_id,
        detected_type: processed_data.detected_type,
        original_format: original_format,
      });

      callback(null, {
        success: true,
        records_processed: results.length,
        detected_type: processed_data.detected_type,
        confidence: processed_data.confidence,
        results: results,
      });

      logger.info(
        `Successfully processed ${results.length} records for tenant ${tenant_id}`
      );
    } catch (error) {
      const err = error as Error;
      logger.error("LLM data processing error:", err);
      callback(new Error(`Processing failed: ${err.message}`));
    }
  }

  // Legacy real-time stream processing (keep for backward compatibility)
  async processRealTimeStream(call: grpc.ServerDuplexStream<any, any>) {
    const tenantId = call.metadata.get("tenant-id")[0] as string;
    let streamCount = 0;

    try {
      const tenant = await this.getTenantContext(tenantId);

      call.on("data", async (request: any) => {
        try {
          streamCount++;

          // Rate limit check
          const allowed = await this.rateLimiter.checkLimit(
            tenantId,
            tenant.limits.rateLimitPerMinute
          );

          if (!allowed) {
            call.write({
              tenant_id: tenantId,
              stream_id: request.stream_id,
              result: {
                type: "ERROR",
                data: { message: "Rate limit exceeded" },
              },
              processed_at: { seconds: Math.floor(Date.now() / 1000) },
            });
            return;
          }

          // Prepare stream data with flexible data type
          const streamData: StreamData = {
            tenantId: request.tenant_id,
            streamId: request.stream_id,
            dataType: request.data_type || "custom_data", // Accept any data type
            payload: request.payload,
            timestamp: new Date(request.timestamp.seconds * 1000),
            metadata: request.metadata || {},
          };

          await this.storeStreamData(streamData);
          await this.queueForProcessing(streamData, tenant);

          // Acknowledge back
          call.write({
            tenant_id: tenantId,
            stream_id: request.stream_id,
            result: {
              result_id: `result_${Date.now()}`,
              type: "RECEIVED",
              data: { status: "queued_for_processing" },
              confidence: 1.0,
            },
            processed_at: { seconds: Math.floor(Date.now() / 1000) },
          });

          this.metrics.incrementCounter("streams_processed", {
            tenant_id: tenantId,
          });
        } catch (error) {
          logger.error("Stream processing error:", error);
          call.write({
            tenant_id: tenantId,
            stream_id: request.stream_id,
            result: {
              type: "ERROR",
              data: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
          });
        }
      });

      call.on("end", () => {
        logger.info(
          `Stream ended for tenant ${tenantId}, processed ${streamCount} messages`
        );
        call.end();
      });

      call.on("error", (error: any) => {
        logger.error("Stream error:", error);
      });
    } catch (error) {
      logger.error("Stream setup error:", error);
      call.destroy(error as Error);
    }
  }

  async getTenantMetrics(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { tenant_id, start_time, end_time } = call.request;

      const startDate = new Date(start_time.seconds * 1000);
      const endDate = new Date(end_time.seconds * 1000);

      const pipeline = [
        {
          $match: {
            tenantId: tenant_id,
            timestamp: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            streamsProcessed: { $sum: 1 },
            avgProcessingTime: { $avg: "$processingTime" },
            totalDataSize: { $sum: { $ifNull: ["$dataSize", 0] } },
            dataTypes: { $addToSet: "$dataType" },
          },
        },
      ];

      const results = await this.db
        .collection("stream_data")
        .aggregate(pipeline)
        .toArray();

      const metrics = results[0] || {};

      callback(null, {
        tenant_id,
        metrics: {
          streams_processed: {
            value: metrics.streamsProcessed || 0,
            unit: "count",
          },
          avg_processing_time: {
            value: metrics.avgProcessingTime || 0,
            unit: "ms",
          },
          total_data_size: {
            value: metrics.totalDataSize || 0,
            unit: "bytes",
          },
          data_types_processed: {
            value: metrics.dataTypes?.length || 0,
            unit: "count",
          },
        },
        usage: {
          streams_processed: metrics.streamsProcessed || 0,
          strategies_executed: 0,
          cpu_usage: 0,
          memory_usage: 0,
          storage_used: metrics.totalDataSize || 0,
        },
      });
    } catch (error) {
      logger.error("Get metrics error:", error);
      callback(error as Error, null);
    }
  }

  async executeStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { tenant_id, strategy_id, config, historical_data } = call.request;

      const executionId = `exec_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const message = {
        type: "EXECUTE_STRATEGY",
        tenantId: tenant_id,
        payload: {
          executionId,
          strategyId: strategy_id,
          config,
          historicalData: historical_data,
        },
        correlationId: executionId,
      };

      this.channel.publish(
        "strategy.execution",
        `strategy.${tenant_id}`,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );

      callback(null, {
        execution_id: executionId,
        status: "PENDING",
        result: null,
        errors: [],
      });
    } catch (error) {
      logger.error("Execute strategy error:", error);
      callback(error as Error, null);
    }
  }

  private async getTenantContext(tenantId: string): Promise<TenantContext> {
    try {
      logger.info(`Looking up tenant: ${tenantId}`);

      const tenant = await this.db.collection("tenants").findOne({
        tenantId,
        status: "ACTIVE",
      });

      logger.info(`Tenant lookup result:`, tenant ? "Found" : "Not found");

      if (!tenant) {
        // ✅ FIX: More detailed error for debugging
        const allTenants = await this.db
          .collection("tenants")
          .find({})
          .project({ tenantId: 1, status: 1 })
          .toArray();
        logger.error("Available tenants:", allTenants);
        throw new Error(`Tenant not found or inactive: ${tenantId}`);
      }

      return {
        tenantId: tenant.tenantId,
        limits: tenant.limits,
        permissions: tenant.permissions || [],
        metadata: tenant.metadata || {},
      };
    } catch (error) {
      logger.error("Tenant context lookup error:", error);
      throw error;
    }
  }
  private async storeStreamData(data: StreamData) {
    try {
      await this.db.collection("stream_data").insertOne({
        ...data,
        storedAt: new Date(),
        processed: false,
        dataSize: JSON.stringify(data.payload).length,
      });
    } catch (error) {
      logger.error("Error storing stream data:", error);
      throw error;
    }
  }

  private async queueForProcessing(data: StreamData, tenant: TenantContext) {
    try {
      // Check if tenant has auto-processing enabled
      const autoProcessing = tenant.metadata?.autoProcessing !== false;

      if (!autoProcessing) {
        logger.info(`Auto-processing disabled for tenant ${data.tenantId}`);
        return;
      }

      const message = {
        type: "PROCESS_STREAM",
        tenantId: data.tenantId,
        payload: data,
        correlationId: `${data.streamId}_${Date.now()}`,
      };

      this.channel.publish(
        "stream.data",
        `stream.${data.tenantId}.${data.dataType}`,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );

      logger.debug(`Queued for processing: ${data.tenantId}/${data.streamId}`);
    } catch (error) {
      logger.error("Error queueing for processing:", error);
      // Don't throw - this shouldn't fail the main operation
    }
  }
}

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
        keepCase: true, // keep snake_case field names from proto
        longs: String, // int64 as string
        enums: String, // enums as string names (“ACTIVE”) so Gateway doesn’t coerce
        defaults: true, // populate default values
        arrays: true, // ensure empty repeated fields are []
        objects: true, // ensure empty nested messages are {}
        oneofs: true, // populate oneof helper
      }
    );
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    // Create and initialize service
    const dataStreamServiceImpl = new UniversalDataStreamServiceImpl(
      db,
      rabbitConnection
    );
    await dataStreamServiceImpl.init();

    // Create gRPC server
    const server = new grpc.Server();
    server.addService(
      proto.stratosmesh.analytics.EnhancedStreamService.service,
      {
        processRealTimeStream: dataStreamServiceImpl.processRealTimeStream.bind(
          dataStreamServiceImpl
        ),
        processLLMData: dataStreamServiceImpl.processLLMData.bind(
          dataStreamServiceImpl
        ),
        getTenantMetrics: dataStreamServiceImpl.getTenantMetrics.bind(
          dataStreamServiceImpl
        ),
        executeStrategy: dataStreamServiceImpl.executeStrategy.bind(
          dataStreamServiceImpl
        ),
      }
    );

    const port = process.env.PORT || "50052";
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          logger.error("Failed to start server:", err);
          process.exit(1);
        }
        logger.info(
          `Universal Stream Ingestion service running on port ${boundPort}`
        );
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

startServer().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});
