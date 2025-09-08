// services/llm-processor/src/server.ts - FINAL FIX
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { LLMDataProcessor, UniversalInput } from "./processor";
import { Logger } from "../../../shared/utils/logger";
import dotenv from "dotenv";

dotenv.config();
const logger = new Logger("LLMProcessor");

class LLMProcessorServiceImpl {
  private processor: LLMDataProcessor;

  constructor() {
    this.processor = new LLMDataProcessor();
  }

  async processUniversalData(call: any, callback: any) {
    try {
      // With camelCase, we now use call.request.tenantId, etc.
      const request = call.request;
      logger.info(
        `Processing universal data for tenant: ${request.tenantId}, stream: ${request.streamId}`
      );

      let inputData: UniversalInput | undefined;

      if (request.rawText) {
        inputData = { type: "text", content: request.rawText };
        logger.info("Processing raw text input");
      } else if (request.fileData) {
        inputData = {
          type: "file",
          content: request.fileData,
          mimetype: request.metadata?.mimetype || "application/octet-stream",
        };
        logger.info(`Processing file data (${inputData.mimetype})`);
      } else if (request.fileUrl) {
        inputData = { type: "url", content: request.fileUrl };
        logger.info(`Processing URL: ${request.fileUrl}`);
      } else if (request.structuredData) {
        inputData = { type: "structured", content: request.structuredData };
        logger.info("Processing structured data");
      }

      if (!inputData) {
        logger.error("Invalid request: no valid input data found");
        return callback(
          new Error("Invalid request: no valid input data found")
        );
      }

      const result = await this.processor.processData({
        tenantId: request.tenantId,
        streamId: request.streamId,
        inputData,
        description: request.dataDescription || "Unknown data",
        desiredFormat: request.desiredFormat || "time_series",
      });

      logger.info(
        `LLM processing completed: detected type: ${result.detectedType}, confidence: ${result.confidence}, records: ${result.records.length}`
      );

      callback(null, {
        success: true,
        detectedType: result.detectedType,
        records: result.records.map((record) => ({
          timestamp: { seconds: Math.floor(record.timestamp.getTime() / 1000) },
          payload: record.payload,
          metadata: record.metadata,
        })),
        schema: result.schema,
        confidence: result.confidence,
        processingSteps: result.processingSteps,
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
      logger.info(`Analyzing data format for tenant: ${request.tenantId}`);

      let inputData: UniversalInput;

      if (request.textSample) {
        inputData = { type: "text", content: request.textSample };
      } else if (request.fileSample) {
        inputData = {
          type: "file",
          content: request.fileSample,
          filename: request.filename,
          mimetype: request.mimeType,
        };
      } else {
        return callback(new Error("No sample data provided"));
      }

      const result = await this.processor.processData({
        tenantId: request.tenantId,
        streamId: "format_analysis",
        inputData,
        description: "Format analysis sample",
        desiredFormat: "analysis_only",
      });

      callback(null, {
        success: true,
        detectedFormat: this.mapTypeToFormat(result.detectedType),
        dataType: result.detectedType,
        confidence: result.confidence,
        suggestedSchema: result.schema,
        extractionMethods: result.processingSteps,
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

async function startServer() {
  try {
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, "../../../shared/proto/analytics.proto"),
      {
        // keepCase: true, // <-- REMOVED
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
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
