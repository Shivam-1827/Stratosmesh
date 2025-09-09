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
      const request = call.request;
      logger.info(
        `Processing universal data for tenant: ${request.tenantId}, stream: ${request.streamId}`
      );

      let inputData: UniversalInput | undefined;

      if (request.rawText) {
        inputData = { type: "text", content: request.rawText };
      } else if (request.fileData) {
        inputData = {
          type: "file",
          content: request.fileData,
          mimetype: request.metadata?.mimetype || "application/octet-stream",
        };
      } else if (request.fileUrl) {
        inputData = { type: "url", content: request.fileUrl };
      } else if (request.structuredData) {
        inputData = { type: "structured", content: request.structuredData };
      }

      if (!inputData) {
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

      // SIMPLIFIED: Create clean, flat structure instead of complex protobuf nesting
      const cleanRecords = result.records.map((record, index) => {
        const timestamp =
          record.timestamp instanceof Date
            ? record.timestamp
            : new Date(record.timestamp);

        // Extract clean data from payload
        const payload = record.payload || {};
        const fields = payload.fields || {};

        // Create a simple, flat payload structure
        const cleanPayload: any = {
          // Include the processed numeric and categorical fields directly
          ...fields,
          // Add metadata about the record
          _metadata: {
            recordIndex: index,
            source: "llm_processed",
            processingTime: new Date().toISOString(),
            confidence: result.confidence,
          },
        };

        return {
          timestamp: {
            seconds: Math.floor(timestamp.getTime() / 1000),
            nanos: 0,
          },
          // Simple payload structure that's easy to work with
          payload: this.createSimpleStruct(cleanPayload),
          // Clean metadata
          metadata: this.createSimpleStruct({
            source: "llm_processed",
            originalFormat: "csv",
            confidence: result.confidence,
            recordIndex: index,
          }),
        };
      });

      // Clean schema response
      const cleanSchema = this.createSimpleStruct({
        valueFields: result.schema?.valueFields || [],
        categoryFields: result.schema?.categoryFields || [],
        timestampField: result.schema?.timestampField || "",
        fieldTypes: result.schema?.fieldTypes || {},
        detectedColumns: this.extractColumnsFromData(result.records),
      });

      const response = {
        success: true,
        detectedType: result.detectedType || "unknown",
        records: cleanRecords,
        schema: cleanSchema,
        confidence: Number(result.confidence) || 0.5,
        processingSteps: result.processingSteps || [],
      };

      logger.info(
        `Processed ${cleanRecords.length} records with clean structure`
      );
      callback(null, response);
    } catch (error) {
      const err = error as Error;
      logger.error("LLM processing error:", err);
      callback(new Error(`LLM processing failed: ${err.message}`));
    }
  }

  // SIMPLIFIED: Create minimal protobuf struct without excessive nesting
  private createSimpleStruct(obj: any): any {
    if (!obj || typeof obj !== "object") {
      return { fields: {} };
    }

    const fields: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === "number") {
        fields[key] = { numberValue: value };
      } else if (typeof value === "boolean") {
        fields[key] = { boolValue: value };
      } else if (Array.isArray(value)) {
        fields[key] = {
          listValue: {
            values: value.map((v) => ({ stringValue: String(v) })),
          },
        };
      } else {
        fields[key] = { stringValue: String(value) };
      }
    }

    return { fields };
  }

  // Helper to extract column information from processed data
  private extractColumnsFromData(records: any[]): any {
    if (!records || records.length === 0) {
      return {};
    }

    const sample = records[0];
    const payload = sample.payload || {};
    const fields = payload.fields || {};

    const columns: any = {};
    Object.keys(fields).forEach((key) => {
      const value = fields[key];
      if (typeof value === "number") {
        columns[key] = "numeric";
      } else if (typeof value === "string") {
        columns[key] = "categorical";
      } else {
        columns[key] = "unknown";
      }
    });

    return columns;
  }

  async analyzeDataFormat(call: any, callback: any) {
    try {
      const request = call.request;

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
        confidence: Number(result.confidence) || 0.5,
        suggestedSchema: this.createSimpleStruct(result.schema || {}),
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
