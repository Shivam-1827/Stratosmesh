// services/gateway/src/server.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import multer from "multer";
import path from "path";
import { authMiddleware } from "../../../shared/middleware/auth";
import { Logger } from "../../../shared/utils/logger";

dotenv.config();

const app = express();
const logger = new Logger("Gateway");

// Security middleware (from your old code)
app.use(helmet());
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP",
});
app.use(limiter);
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

class UniversalGateway {
  private clients: any = {};
  private llmClient: any;
  private streamClient: any;

  constructor() {
    this.setupGrpcClients();
    this.setupUniversalRoute();
    this.setupHttpGrpcBridgeRoutes();
  }

  private setupGrpcClients() {
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

    // gRPC clients for HTTP-gRPC bridge
    this.clients.tenant = new proto.stratosmesh.analytics.TenantService(
      "tenant-manager:50054",
      grpc.credentials.createInsecure()
    );

    this.clients.auth = new proto.stratosmesh.analytics.AuthService(
      "auth-service:50051",
      grpc.credentials.createInsecure()
    );

    this.clients.stream = new proto.stratosmesh.analytics.EnhancedStreamService(
      "stream-ingestion:50052",
      grpc.credentials.createInsecure()
    );

    // LLM and Stream clients for universal data processing
    this.llmClient = new proto.stratosmesh.analytics.LLMProcessorService(
      "llm-processor:50056",
      grpc.credentials.createInsecure()
    );

    this.streamClient = new proto.stratosmesh.analytics.EnhancedStreamService(
      "stream-ingestion:50052",
      grpc.credentials.createInsecure()
    );

    logger.info("All gRPC clients initialized");
  }

  private setupHttpGrpcBridgeRoutes() {
    // Tenant routes - PUBLIC (no auth needed for creation)
    app.post("/api/tenant/create", this.bridgeCall("tenant", "createTenant"));

    // Tenant routes - PROTECTED (need authentication)
    app.get(
      "/api/tenant/:tenant_id/config",
      authMiddleware,
      this.bridgeCall("tenant", "getTenantConfig")
    );
    app.put(
      "/api/tenant/:tenant_id/limits",
      authMiddleware,
      this.bridgeCall("tenant", "updateTenantLimits")
    );

    // Auth routes - PUBLIC (obviously no auth needed for login)
    app.post("/api/auth/login", this.bridgeCall("auth", "authenticate"));
    app.post("/api/auth/validate", this.bridgeCall("auth", "validateToken"));
    app.post("/api/auth/refresh", this.bridgeCall("auth", "refreshToken"));

    // Stream routes - PROTECTED (need authentication)
    app.post(
      "/api/stream/llm",
      authMiddleware,
      this.bridgeCall("stream", "processLLMData")
    );
    app.get(
      "/api/stream/:tenant_id/metrics",
      authMiddleware,
      this.bridgeCall("stream", "getTenantMetrics")
    );

    logger.info("HTTP-gRPC bridge routes setup complete");
  }

  private setupUniversalRoute() {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });

    // Universal data processing endpoint - PROTECTED
    app.post(
      "/api/data/universal",
      authMiddleware,
      upload.single("file"),
      this.handleUniversalData.bind(this)
    );
  }

  private bridgeCall(service: string, method: string) {
    return async (req: express.Request, res: express.Response) => {
      try {
        // Prepare request data
        let requestData = { ...req.body };

        // Add path parameters to request
        if (req.params.tenant_id) {
          requestData.tenant_id = req.params.tenant_id;
        }

        // Add tenant ID from auth middleware if available
        if ((req as any).tenantId && !requestData.tenant_id) {
          requestData.tenant_id = (req as any).tenantId;
        }

        logger.info(`Bridging ${service}.${method}`, {
          requestData: { ...requestData, client_secret: "[REDACTED]" },
        });

        const result = await new Promise((resolve, reject) => {
          this.clients[service][method](
            requestData,
            (error: any, response: any) => {
              if (error) {
                logger.error(`gRPC call failed: ${service}.${method}`, {
                  code: error.code,
                  message: error.message,
                  details: error.details,
                });
                reject(error);
              } else {
                // 🔍 ADD THIS DEBUG LOG
                logger.info(`gRPC raw response for ${service}.${method}:`, {
                  response: JSON.stringify(response, null, 2),
                });

                logger.info(`gRPC call succeeded: ${service}.${method}`);
                resolve(response);
              }
            }
          );
        });

        // 🔍 ADD THIS DEBUG LOG TOO
        logger.info(`Processed result for ${service}.${method}:`, {
          result: JSON.stringify(result, null, 2),
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(`Bridge error: ${service}.${method}`, error);

        // Map gRPC errors to appropriate HTTP status codes
        let statusCode = 500;
        let errorMessage = error.message;

        if (error.code) {
          switch (error.code) {
            case grpc.status.NOT_FOUND:
              statusCode = 404;
              break;
            case grpc.status.ALREADY_EXISTS:
              statusCode = 409;
              break;
            case grpc.status.PERMISSION_DENIED:
              statusCode = 403;
              break;
            case grpc.status.UNAUTHENTICATED:
              statusCode = 401;
              break;
            case grpc.status.INVALID_ARGUMENT:
              statusCode = 400;
              break;
            default:
              statusCode = 500;
          }
        }

        res.status(statusCode).json({
          success: false,
          error: errorMessage,
          service,
          method,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }

  async handleUniversalData(req: any, res: any) {
    try {
      const tenantId = req.tenantId; // From auth middleware
      const { stream_id, data_description, desired_format } = req.body;

      if (!stream_id) {
        return res.status(400).json({ error: "stream_id is required" });
      }

      // Prepare request for LLM processor
      let llmRequest: any = {
        tenant_id: tenantId,
        stream_id: stream_id,
        data_description: data_description || "User uploaded data",
        desired_format: desired_format || "time_series",
      };

      // Handle different input types automatically
      if (req.file) {
        // File upload
        llmRequest.file_data = req.file.buffer;
        logger.info(
          `Processing file: ${req.file.originalname} (${req.file.mimetype})`
        );
      } else if (req.body.text) {
        // Raw text
        llmRequest.raw_text = req.body.text;
        logger.info("Processing raw text data");
      } else if (req.body.url) {
        // URL
        llmRequest.file_url = req.body.url;
        logger.info(`Processing URL: ${req.body.url}`);
      } else if (req.body.data) {
        // Structured data
        llmRequest.structured_data = req.body.data;
        logger.info("Processing structured data");
      } else {
        return res.status(400).json({
          error:
            "No data provided. Please provide file, text, url, or structured data.",
        });
      }

      // Process with LLM
      logger.info(
        `Starting LLM processing for tenant ${tenantId}, stream ${stream_id}`
      );

      const llmResult = await new Promise((resolve, reject) => {
        this.llmClient.processUniversalData(
          llmRequest,
          (error: any, response: any) => {
            if (error) {
              logger.error("LLM processing error:", error);
              reject(error);
            } else {
              logger.info(`LLM detected data type: ${response.detected_type}`);
              resolve(response);
            }
          }
        );
      });

      // Send processed data to stream ingestion
      const streamResult = await new Promise((resolve, reject) => {
        this.streamClient.processLLMData(
          {
            tenant_id: tenantId,
            stream_id: stream_id,
            processed_data: llmResult,
            original_format: req.file ? req.file.mimetype : "text/plain",
          },
          (error: any, response: any) => {
            if (error) {
              logger.error("Stream processing error:", error);
              reject(error);
            } else {
              logger.info(
                `Stream processing completed: ${response.records_processed} records`
              );
              resolve(response);
            }
          }
        );
      });

      res.json({
        success: true,
        message: "Data processed successfully",
        stream_id,
        llm_analysis: {
          detected_type: (llmResult as any).detected_type,
          confidence: (llmResult as any).confidence,
          records_found: (llmResult as any).records.length,
          processing_steps: (llmResult as any).processing_steps,
        },
        stream_result: streamResult,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error("Universal data processing error:", error);
      res.status(500).json({
        error: err.message,
        stream_id: req.body.stream_id,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Initialize universal gateway
const universalGateway = new UniversalGateway();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(
    `Universal Gateway with HTTP-gRPC Bridge running on port ${PORT}`
  );
  logger.info("Available endpoints:");
  logger.info("  POST /api/tenant/create (public)");
  logger.info("  POST /api/auth/login (public)");
  logger.info("  POST /api/data/universal (authenticated)");
  logger.info("  GET  /api/tenant/:id/config (authenticated)");
  logger.info("  GET  /health (public)");
});
