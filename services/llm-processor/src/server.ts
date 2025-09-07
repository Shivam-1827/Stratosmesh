// services/llm-processor/src/server.ts
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { LLMDataProcessor, UniversalInput } from "./processor";
import { Logger } from "../../../shared/utils/logger";
import dotenv from 'dotenv';

dotenv.config();
const logger = new Logger("LLMProcessor");

class LLMProcessorServiceImpl {
  private processor: LLMDataProcessor;

  constructor() {
    this.processor = new LLMDataProcessor();
  }

  async processUniversalData(call: any, callback: any) {
    try {
      const request = call.request;
      logger.info(
        `Processing universal data for tenant: ${request.tenant_id}, stream: ${request.stream_id}`
      );

      // Convert protobuf request to our internal format
      let inputData: UniversalInput | undefined;

      if (request.raw_text) {
        inputData = { type: "text", content: request.raw_text };
        logger.info("Processing raw text input");
      } else if (request.file_data) {
        inputData = {
          type: "file",
          content: request.file_data,
          mimetype: request.metadata?.mimetype || "application/octet-stream",
        };
        logger.info(`Processing file data (${inputData.mimetype})`);
      } else if (request.file_url) {
        inputData = { type: "url", content: request.file_url };
        logger.info(`Processing URL: ${request.file_url}`);
      } else if (request.structured_data) {
        inputData = { type: "structured", content: request.structured_data };
        logger.info("Processing structured data");
      }

      if (!inputData) {
        logger.error("Invalid request: no valid input data found");
        return callback(
          new Error("Invalid request: no valid input data found")
        );
      }

      // Process the data
      const result = await this.processor.processData({
        tenantId: request.tenant_id,
        streamId: request.stream_id,
        inputData,
        description: request.data_description || "Unknown data",
        desiredFormat: request.desired_format || "time_series",
      });

      logger.info(
        `LLM processing completed: detected type: ${result.detectedType}, confidence: ${result.confidence}, records: ${result.records.length}`
      );

      // Convert back to protobuf format
      callback(null, {
        success: true,
        detected_type: result.detectedType,
        records: result.records.map((record) => ({
          timestamp: { seconds: Math.floor(record.timestamp.getTime() / 1000) },
          payload: record.payload,
          metadata: record.metadata,
        })),
        schema: result.schema,
        confidence: result.confidence,
        processing_steps: result.processingSteps,
      });
    } catch (error) {
      const err = error as Error;
      logger.error("LLM processing error:", err);
      callback(new Error(`LLM processing failed: ${err.message}`));
    }
  }

  async analyzeDataFormat(call: any, callback: any) {
    try {
      const request = call.request;
      logger.info(`Analyzing data format for tenant: ${request.tenant_id}`);

      let inputData: UniversalInput;

      if (request.text_sample) {
        inputData = { type: "text", content: request.text_sample };
      } else if (request.file_sample) {
        inputData = {
          type: "file",
          content: request.file_sample,
          filename: request.filename,
          mimetype: request.mime_type,
        };
      } else {
        return callback(new Error("No sample data provided"));
      }

      // Quick analysis without full processing
      const result = await this.processor.processData({
        tenantId: request.tenant_id,
        streamId: "format_analysis",
        inputData,
        description: "Format analysis sample",
        desiredFormat: "analysis_only",
      });

      callback(null, {
        success: true,
        detected_format: this.mapTypeToFormat(result.detectedType),
        data_type: result.detectedType,
        confidence: result.confidence,
        suggested_schema: result.schema,
        extraction_methods: result.processingSteps,
      });
    } catch (error) {
      const err = error as Error;
      logger.error("Data format analysis error:", err);
      callback(new Error(`Format analysis failed: ${err.message}`));
    }
  }

  private mapTypeToFormat(detectedType: string): string {
    const formatMapping: Record<string, string> = {
      financial_data: "csv",
      sensor_data: "json",
      log_data: "text",
      sales_data: "csv",
      social_media: "json",
      unknown_data: "text",
    };

    return formatMapping[detectedType] || "text";
  }
}

// Start the server
async function startServer() {
  try {
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

    const server = new grpc.Server();
    const llmServiceImpl = new LLMProcessorServiceImpl();

    server.addService(proto.stratosmesh.analytics.LLMProcessorService.service, {
      processUniversalData:
        llmServiceImpl.processUniversalData.bind(llmServiceImpl),
      analyzeDataFormat: llmServiceImpl.analyzeDataFormat.bind(llmServiceImpl),
    });

    const port = process.env.LLM_PROCESSOR_PORT || "50056";
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          logger.error("Failed to start server:", err);
          process.exit(1);
        }
        logger.info(`LLM Processor service running on port ${boundPort}`);
        server.start();
      }
    );
  } catch (error) {
    logger.error("Server startup error:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

startServer().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});
