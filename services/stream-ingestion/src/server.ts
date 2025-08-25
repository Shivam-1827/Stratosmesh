import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import * as amqp from "amqplib";
// import type { Channel } from "amqplib";
import type { Channel, ChannelModel } from "amqplib";
import { Logger } from "../../../shared/utils/logger";
import { StreamData, TenantContext } from "../../../shared/types";
import { RateLimiter } from "../../../shared/utils/rate-limiter";
import { MetricsCollector } from "../../../shared/utils/metrics";

const logger = new Logger("StreamIngestion");

class DataStreamServiceImpl {
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
  }

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

          // Prepare stream data
          const streamData: StreamData = {
            tenantId: request.tenant_id,
            streamId: request.stream_id,
            dataType: request.data_type,
            payload: request.payload,
            timestamp: new Date(request.timestamp.seconds * 1000),
            metadata: request.metadata || {},
          };

          await this.storeStreamData(streamData);
          await this.queueForProcessing(streamData);

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
            totalDataSize: { $sum: "$dataSize" },
          },
        },
      ];

      const results = await this.db
        .collection("stream_metrics")
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
          total_data_size: { value: metrics.totalDataSize || 0, unit: "bytes" },
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
    const tenant = await this.db.collection("tenants").findOne({ tenantId });
    if (!tenant) throw new Error("Tenant not found");

    return {
      tenantId: tenant.tenantId,
      limits: tenant.limits,
      permissions: tenant.permissions || [],
      metadata: tenant.metadata || {},
    };
  }

  private async storeStreamData(data: StreamData) {
    await this.db
      .collection("stream_data")
      .insertOne({ ...data, storedAt: new Date() });
  }

  private async queueForProcessing(data: StreamData) {
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
  }
}

async function startServer() {
  // MongoDB
  const mongoClient = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017"
  );
  await mongoClient.connect();
  const db = mongoClient.db("stratosmesh");

  // RabbitMQ
  const rabbitConnection = await amqp.connect(
    process.env.RABBITMQ_URI || "amqp://localhost"
  );

  const packageDefinition = protoLoader.loadSync(
    "../../../shared/proto/analytics.proto"
  );
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  const server = new grpc.Server();
  const dataStreamServiceImpl = new DataStreamServiceImpl(db, rabbitConnection);
  await dataStreamServiceImpl.init();

  server.addService(proto.stratosmesh.analytics.DataStreamService.service, {
    processRealTimeStream: dataStreamServiceImpl.processRealTimeStream.bind(
      dataStreamServiceImpl
    ),
    getTenantMetrics: dataStreamServiceImpl.getTenantMetrics.bind(
      dataStreamServiceImpl
    ),
    executeStrategy: dataStreamServiceImpl.executeStrategy.bind(
      dataStreamServiceImpl
    ),
  });

  const port = process.env.PORT || "50052";
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        logger.error("Failed to start server:", err);
        return;
      }
      logger.info(`Stream ingestion service running on port ${boundPort}`);
      server.start();
    }
  );
}

startServer().catch(console.error);
