// services/llm-processor/src/server.ts
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { LLMDataProcessor, UniversalInput } from "./processor";
import { Logger } from "../../../shared/utils/logger";

const logger = new Logger("LLMProcessor");

class LLMProcessorServiceImpl {
  private processor: LLMDataProcessor;

  constructor() {
    this.processor = new LLMDataProcessor();
  }
  llmServiceImpl = new LLMProcessorServiceImpl();

  async processUniversalData(call: any, callback: any) {
    try {
      const request = call.request;

      // Convert protobuf request to our internal format
      let inputData: UniversalInput | undefined;
      if (request.raw_text) {
        inputData = { type: "text", content: request.raw_text };
      } else if (request.file_data) {
        inputData = { type: "file", content: request.file_data };
      } else if (request.file_url) {
        inputData = { type: "url", content: request.file_url };
      } else if (request.structured_data) {
        inputData = { type: "structured", content: request.structured_data };
      }

      if (!inputData) {
        throw new Error("Invalid request: no valid input data found");
      }

      const result = await this.processor.processData({
        tenantId: request.tenant_id,
        streamId: request.stream_id,
        inputData,
        description: request.data_description,
        desiredFormat: request.desired_format,
      });

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
      logger.error("LLM processing error:", error);
      callback(error);
    }
  }
}

// Start the server
async function startServer() {
  const packageDefinition = protoLoader.loadSync(
    "../../../shared/proto/analytics.proto"
  );
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  const llmServiceImpl = new LLMProcessorServiceImpl();

  const server = new grpc.Server();
  server.addService(proto.stratosmesh.analytics.LLMProcessorService.service, {
    processUniversalData:
      llmServiceImpl.processUniversalData.bind(llmServiceImpl),
  });

  const port = process.env.PORT || "50056";
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error("Failed to start server:", err);
        return;
      }
      logger.info(`LLM Processor service running on port ${port}`);
      server.start();
    }
  );
}

startServer().catch(console.error);
