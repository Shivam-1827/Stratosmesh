// services/stream-ingestion/src/server.ts - COMPLETE FIX
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import * as amqp from "amqplib";
import path from "path";
import type { Channel, ChannelModel } from "amqplib";
import { Logger } from "../../../shared/utils/logger";
import { StreamData, TenantContext } from "../../../shared/types";
import dotenv from "dotenv";

dotenv.config();

const logger = new Logger("StreamIngestion");

// Simple rate limiter
class RateLimiter {
  private limits = new Map<string, { count: number; resetTime: number }>();

  async checkLimit(tenantId: string, limitPerMinute: number): Promise<boolean> {
    const now = Date.now();
    const resetTime = Math.floor(now / 60000) * 60000 + 60000;
    const existing = this.limits.get(tenantId);

    if (!existing || existing.resetTime <= now) {
      this.limits.set(tenantId, { count: 1, resetTime });
      return true;
    }

    if (existing.count >= limitPerMinute) {
      logger.warn(`Rate limit exceeded for tenant ${tenantId}`);
      return false;
    }

    existing.count++;
    return true;
  }
}

// Simple metrics collector
class MetricsCollector {
  private counters = new Map<string, number>();

  incrementCounter(
    name: string,
    labels: Record<string, string> = {},
    value: number = 1
  ) {
    const key = `${name}_${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
    logger.debug(`Counter incremented: ${name}`, { labels, value });
  }
}

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

  // ✅ CRITICAL: ProcessLLMData method - exact name from proto
  // async processLLMData(call: any, callback: any) {
  //   logger.info("🔥 ProcessLLMData method called!");

  //   try {
  //     const request = call.request;
  //     logger.info("Request received:", {
  //       tenantId: request.tenant_id,
  //       streamId: request.stream_id,
  //       hasProcessedData: !!request.processed_data,
  //       originalFormat: request.original_format,
  //     });

  //     const {
  //       tenant_id: tenantId,
  //       stream_id: streamId,
  //       processed_data: processedData,
  //       original_format: originalFormat,
  //     } = request;

  //     if (!tenantId || !streamId || !processedData) {
  //       logger.error("Missing required fields", {
  //         tenantId,
  //         streamId,
  //         hasProcessedData: !!processedData,
  //       });
  //       return callback(
  //         new Error(
  //           "Missing required fields: tenant_id, stream_id, or processed_data"
  //         )
  //       );
  //     }

  //     logger.info(
  //       `Processing LLM data for tenant ${tenantId}, stream ${streamId}`
  //     );
  //     logger.info(
  //       `Detected type: ${
  //         processedData.detected_type || processedData.detectedType
  //       }, confidence: ${processedData.confidence}`
  //     );

  //     // Validate tenant exists
  //     const tenant = await this.getTenantContext(tenantId);
  //     if (!tenant) {
  //       return callback(new Error("Tenant not found or inactive"));
  //     }

  //     const results = [];
  //     const records = processedData.records || [];

  //     // Process each record from LLM
  //     for (let i = 0; i < records.length; i++) {
  //       const record = records[i];

  //       // Handle timestamp conversion
  //       let timestamp = new Date();
  //       if (record.timestamp) {
  //         if (record.timestamp.seconds) {
  //           timestamp = new Date(record.timestamp.seconds * 1000);
  //         } else {
  //           timestamp = new Date(record.timestamp);
  //         }
  //       }

  //       const streamData: StreamData = {
  //         tenantId: tenantId,
  //         streamId: streamId,
  //         dataType:
  //           processedData.detected_type ||
  //           processedData.detectedType ||
  //           "processed_data",
  //         payload: record.payload || record,
  //         timestamp: timestamp,
  //         metadata: {
  //           ...(record.metadata || {}),
  //           llm_processed: true,
  //           original_format: originalFormat || "text",
  //           confidence: processedData.confidence || 0.5,
  //           processing_steps:
  //             processedData.processing_steps ||
  //             processedData.processingSteps ||
  //             [],
  //           schema: processedData.schema || {},
  //         },
  //       };

  //       // Store the processed data
  //       await this.storeStreamData(streamData);

  //       // Queue for further processing if needed
  //       await this.queueForProcessing(streamData, tenant);

  //       results.push({
  //         recordId: `${streamId}_${Date.now()}_${i}`,
  //         processedAt: { seconds: Math.floor(Date.now() / 1000) },
  //         success: true, // ✅ Mark as successful
  //         errorMessage: "",
  //       });
  //     }

  //     // Update metrics
  //     this.metrics.incrementCounter("llm_streams_processed_total", {
  //       tenant_id: tenantId,
  //       detected_type:
  //         processedData.detected_type ||
  //         processedData.detectedType ||
  //         "unknown",
  //       original_format: originalFormat || "text",
  //     });

  //     // Send success response with both snake_case and camelCase for compatibility
  //     const response = {
  //       success: true,
  //       records_processed: results.length,
  //       recordsProcessed: results.length, // camelCase version
  //       detected_type:
  //         processedData.detected_type || processedData.detectedType,
  //       detectedType: processedData.detected_type || processedData.detectedType, // camelCase version
  //       confidence: processedData.confidence || 0.5,
  //       results: results,
  //     };

  //     logger.info(
  //       `✅ Successfully processed ${results.length} records for tenant ${tenantId}`
  //     );
  //     callback(null, response);
  //   } catch (error) {
  //     const err = error as Error;
  //     logger.error("❌ LLM data processing error:", err);
  //     callback(new Error(`Processing failed: ${err.message}`));
  //   }
  // }

  async processLLMData(call: any, callback: any) {
    logger.info("ProcessLLMData method called");

    try {
      const request = call.request;
      const {
        tenant_id: tenantId,
        stream_id: streamId,
        processed_data: processedData,
        original_format: originalFormat,
      } = request;

      if (!tenantId || !streamId || !processedData) {
        return callback(
          new Error(
            "Missing required fields: tenant_id, stream_id, or processed_data"
          )
        );
      }

      // Validate tenant exists
      const tenant = await this.getTenantContext(tenantId);
      if (!tenant) {
        return callback(new Error("Tenant not found or inactive"));
      }

      const results = [];
      const records = processedData.records || [];
      let successfullyProcessed = 0;
      const timestamp = Date.now();

      logger.info(`Processing ${records.length} records from LLM`);

      // Process each record from LLM
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        let processingSuccessful = true;
        let errorMessage = "";

        try {
          // Handle timestamp conversion
          let recordTimestamp = new Date();
          if (record.timestamp) {
            if (record.timestamp.seconds) {
              recordTimestamp = new Date(record.timestamp.seconds * 1000);
            } else {
              recordTimestamp = new Date(record.timestamp);
            }
          }

          // IMPROVED: Extract clean data from the protobuf structure
          const cleanPayload = this.extractCleanPayload(record.payload);

          logger.debug(`Record ${i} clean payload:`, cleanPayload);

          // Validate we have meaningful data
          const hasData = cleanPayload && Object.keys(cleanPayload).length > 0;
          if (!hasData) {
            logger.warn(
              `Record ${i} has no meaningful data, but continuing...`
            );
          }

          const streamData: StreamData = {
            tenantId: tenantId,
            streamId: streamId,
            dataType:
              processedData.detected_type ||
              processedData.detectedType ||
              "processed_data",
            payload: cleanPayload,
            timestamp: recordTimestamp,
            metadata: {
              llm_processed: true,
              original_format: originalFormat || "text",
              confidence: processedData.confidence || 0.5,
              processing_steps:
                processedData.processing_steps ||
                processedData.processingSteps ||
                [],
              schema: processedData.schema || {},
              record_index: i,
              stream_timestamp: timestamp,
            },
          };

          // Store the processed data
          await this.storeStreamData(streamData);

          // Queue for further processing
          await this.queueForProcessing(streamData, tenant);

          successfullyProcessed++;
          logger.info(
            `Successfully processed record ${i} for stream ${streamId}`
          );
        } catch (recordError) {
          processingSuccessful = false;
          errorMessage =
            recordError instanceof Error
              ? recordError.message
              : String(recordError);
          logger.error(`Failed to process record ${i}:`, recordError);
        }

        // FIXED: Generate proper record IDs and timestamps
        results.push({
          recordId: `${streamId}_${timestamp}_${i}`, // Unique, consistent ID
          processedAt: { seconds: Math.floor(Date.now() / 1000) },
          success: processingSuccessful,
          errorMessage: errorMessage,
          metadata: {
            recordIndex: i,
            processingTime: new Date().toISOString(),
            dataExtracted: processingSuccessful,
          },
        });
      }

      // Update metrics
      this.metrics.incrementCounter("llm_streams_processed_total", {
        tenant_id: tenantId,
        detected_type:
          processedData.detected_type ||
          processedData.detectedType ||
          "unknown",
        original_format: originalFormat || "text",
      });

      // IMPROVED: Better response structure
      const response = {
        success: true,
        records_processed: successfullyProcessed,
        recordsProcessed: successfullyProcessed,
        total_records: records.length,
        detected_type:
          processedData.detected_type || processedData.detectedType,
        detectedType: processedData.detected_type || processedData.detectedType,
        confidence: processedData.confidence || 0.5,
        results: results,
        processing_summary: {
          successful: successfullyProcessed,
          failed: records.length - successfullyProcessed,
          total: records.length,
          success_rate:
            ((successfullyProcessed / records.length) * 100).toFixed(1) + "%",
        },
      };

      logger.info(
        `Successfully processed ${successfullyProcessed}/${records.length} records for tenant ${tenantId}`
      );
      callback(null, response);
    } catch (error) {
      const err = error as Error;
      logger.error("LLM data processing error:", err);
      callback(new Error(`Processing failed: ${err.message}`));
    }
  }

  private extractCleanPayload(protobufPayload: any): any {
    if (!protobufPayload || !protobufPayload.fields) {
      return {};
    }

    const cleanData: any = {};

    try {
      // Extract fields from protobuf structure
      const fields = protobufPayload.fields;

      for (const [key, valueObj] of Object.entries(fields)) {
        if (!valueObj || typeof valueObj !== "object") continue;

        const typedValue = valueObj as any;

        // Extract the actual value based on protobuf Value type
        if (typedValue.numberValue !== undefined) {
          cleanData[key] = typedValue.numberValue;
        } else if (typedValue.stringValue !== undefined) {
          cleanData[key] = typedValue.stringValue;
        } else if (typedValue.boolValue !== undefined) {
          cleanData[key] = typedValue.boolValue;
        } else if (typedValue.listValue && typedValue.listValue.values) {
          cleanData[key] = typedValue.listValue.values.map(
            (v: any) => v.stringValue || v.numberValue || v.boolValue || v
          );
        } else if (typedValue.structValue && typedValue.structValue.fields) {
          cleanData[key] = this.extractCleanPayload(typedValue.structValue);
        } else {
          // Fallback: try to extract any recognizable value
          cleanData[key] = typedValue.value || typedValue;
        }
      }

      logger.debug("Extracted clean payload:", cleanData);
      return cleanData;
    } catch (error) {
      logger.error("Error extracting clean payload:", error);
      return {};
    }
  }

  async processRealTimeStream(call: grpc.ServerDuplexStream<any, any>) {
    const tenantId = call.metadata.get("tenant-id")[0] as string;
    let streamCount = 0;

    try {
      const tenant = await this.getTenantContext(tenantId);

      call.on("data", async (request: any) => {
        try {
          streamCount++;

          const allowed = await this.rateLimiter.checkLimit(
            tenantId,
            tenant.limits.rateLimitPerMinute
          );

          if (!allowed) {
            call.write({
              tenantId: tenantId,
              streamId: request.streamId,
              result: {
                type: "ERROR",
                data: { message: "Rate limit exceeded" },
              },
              processedAt: { seconds: Math.floor(Date.now() / 1000) },
            });
            return;
          }

          const streamData: StreamData = {
            tenantId: request.tenantId,
            streamId: request.streamId,
            dataType: request.dataType || "custom_data",
            payload: request.payload,
            timestamp: new Date(request.timestamp.seconds * 1000),
            metadata: request.metadata || {},
          };

          await this.storeStreamData(streamData);
          await this.queueForProcessing(streamData, tenant);

          call.write({
            tenantId: tenantId,
            streamId: request.streamId,
            result: {
              result_id: `result_${Date.now()}`,
              type: "RECEIVED",
              data: { status: "queued_for_processing" },
              confidence: 1.0,
            },
            processedAt: { seconds: Math.floor(Date.now() / 1000) },
          });

          this.metrics.incrementCounter("streams_processed", {
            tenant_id: tenantId,
          });
        } catch (error) {
          logger.error("Stream processing error:", error);
          call.write({
            tenantId: tenantId,
            streamId: request.streamId,
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
      const {
        tenant_id: tenantId,
        start_time: startTime,
        end_time: endTime,
      } = call.request;

      const startDate = new Date(startTime.seconds * 1000);
      const endDate = new Date(endTime.seconds * 1000);

      const pipeline = [
        {
          $match: {
            tenantId: tenantId,
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
        tenant_id: tenantId,
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
      const {
        tenant_id: tenantId,
        strategy_id: strategyId,
        config,
        historical_data: historicalData,
      } = call.request;

      const executionId = `exec_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const message = {
        type: "EXECUTE_STRATEGY",
        tenantId: tenantId,
        payload: {
          executionId,
          strategyId: strategyId,
          config,
          historicalData: historicalData,
        },
        correlationId: executionId,
      };

      this.channel.publish(
        "strategy.execution",
        `strategy.${tenantId}`,
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
    logger.info("✅ Connected to MongoDB");

    const rabbitConnection = await amqp.connect(
      process.env.RABBITMQ_URI || "amqp://localhost"
    );
    logger.info("✅ Connected to RabbitMQ");

    // ✅ CRITICAL: Load proto with keepCase: true to preserve method names
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, "../../../shared/proto/analytics.proto"),
      {
        keepCase: true, // ✅ KEEP THIS - preserves snake_case method names
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
      }
    );
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    const dataStreamServiceImpl = new UniversalDataStreamServiceImpl(
      db,
      rabbitConnection
    );
    await dataStreamServiceImpl.init();

    const server = new grpc.Server();

    // ✅ CRITICAL: Make sure service is properly bound
    logger.info("Registering EnhancedStreamService...");

    const serviceDefinition =
      proto.stratosmesh.analytics.EnhancedStreamService.service;
    logger.info("Service definition methods:", Object.keys(serviceDefinition));

    const serviceImpl = {
      // ✅ Use PascalCase method names (matching debug output)
      ProcessRealTimeStream: dataStreamServiceImpl.processRealTimeStream.bind(
        dataStreamServiceImpl
      ),
      ProcessLLMData: dataStreamServiceImpl.processLLMData.bind(
        dataStreamServiceImpl
      ),
      GetTenantMetrics: dataStreamServiceImpl.getTenantMetrics.bind(
        dataStreamServiceImpl
      ),
      ExecuteStrategy: dataStreamServiceImpl.executeStrategy.bind(
        dataStreamServiceImpl
      ),
    };

    logger.info("Service implementation methods:", Object.keys(serviceImpl));

    server.addService(serviceDefinition, serviceImpl);

    const port = process.env.STREAM_INGESTION_PORT || "50052";
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          logger.error("Failed to start server:", err);
          process.exit(1);
        }
        logger.info(
          `🚀 Universal Stream Ingestion service running on port ${boundPort}`
        );
        logger.info("✅ processLLMData method is registered and ready!");
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

startServer().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});
