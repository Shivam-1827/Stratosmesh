// services/gateway/src/server.ts - FIXED VERSION
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

// Security middleware
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
  private strategyClient: any; // ✅ FIX: Add strategy client

  constructor() {
    this.setupGrpcClients();
    this.setupUniversalRoute();
    this.setupHttpGrpcBridgeRoutes();
  }

  private setupGrpcClients() {
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

    // ✅ FIX: Centralized service configuration
    const serviceConfig = {
      tenant: {
        url: process.env.TENANT_SERVICE_URL || "localhost:50054",
        constructor: proto.stratosmesh.analytics.TenantService
      },
      auth: {
        url: process.env.AUTH_SERVICE_URL || "localhost:50051", 
        constructor: proto.stratosmesh.analytics.AuthService
      },
      stream: {
        url: process.env.STREAM_SERVICE_URL || "localhost:50052",
        constructor: proto.stratosmesh.analytics.EnhancedStreamService
      },
      llm: {
        url: process.env.LLM_SERVICE_URL || "localhost:50056",
        constructor: proto.stratosmesh.analytics.LLMProcessorService
      },
      strategy: {
        url: process.env.STRATEGY_SERVICE_URL || "localhost:50053",
        constructor: proto.stratosmesh.analytics.StrategyEngineService
      }
    };

    const createClientWithRetry = (
      serviceName: string,
      url: string,
      serviceConstructor: any
    ) => {
      const client = new serviceConstructor(
        url,
        grpc.credentials.createInsecure()
      );

      client.waitForReady(Date.now() + 5000, (error: any) => {
        if (error) {
          logger.error(
            `Failed to connect to ${serviceName} at ${url}:`,
            error.message
          );
        } else {
          logger.info(`✅ Connected to ${serviceName}`);
        }
      });

      return client;
    };

    // ✅ FIX: Create all clients using configuration
    Object.entries(serviceConfig).forEach(([serviceName, config]) => {
      this.clients[serviceName] = createClientWithRetry(
        serviceName,
        config.url,
        config.constructor
      );
    });

    // ✅ FIX: Assign specific client references (remove duplication)
    this.llmClient = this.clients.llm;
    this.streamClient = this.clients.stream;
    this.strategyClient = this.clients.strategy; // ✅ NEW: Strategy client reference
    
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

    // Auth routes - PUBLIC
    app.post("/api/auth/login", this.bridgeCall("auth", "authenticate"));
    app.post("/api/auth/validate", this.bridgeCall("auth", "validateToken"));
    app.post("/api/auth/refresh", this.bridgeCall("auth", "refreshToken"));

    // Stream routes - PROTECTED
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

    app.post(
      "/api/stream/execute-strategy",
      authMiddleware,
      this.bridgeCall("stream", "executeStrategy")
    );

    // ✅ FIX: Add missing Strategy Engine routes
    app.get(
      "/api/strategy/:execution_id/result",
      authMiddleware,
      this.bridgeCall("strategy", "getStrategyResult")
    );

    app.post(
      "/api/strategy/execute",
      authMiddleware,
      this.handleStrategyExecution.bind(this)
    );

    app.get(
      "/api/strategy/available",
      authMiddleware,
      this.bridgeCall("strategy", "getAvailableStrategies")
    );

    // ✅ NEW: LLM Processing routes
    app.post(
      "/api/llm/analyze-format",
      authMiddleware,
      this.bridgeCall("llm", "analyzeDataFormat")
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

        if (req.params.execution_id) {
          requestData.execution_id = req.params.execution_id;
        }

        // Add tenant ID from auth middleware if available
        if ((req as any).tenantId && !requestData.tenant_id) {
          requestData.tenant_id = (req as any).tenantId;
        }

        logger.info(`Bridging ${service}.${method}`, {
          requestData: { ...requestData, client_secret: "[REDACTED]" },
        });

        // ✅ FIX: Add client availability check
        if (!this.clients[service]) {
          throw new Error(`Service ${service} client not available`);
        }

        if (!this.clients[service][method]) {
          throw new Error(`Method ${method} not found on service ${service}`);
        }

        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Request timeout for ${service}.${method}`));
          }, 30000); // 30 second timeout

          this.clients[service][method](
            requestData,
            (error: any, response: any) => {
              clearTimeout(timeout);

              if (error) {
                logger.error(`gRPC call failed: ${service}.${method}`, {
                  code: error.code,
                  message: error.message,
                  details: error.details,
                });
                reject(error);
              } else {
                logger.info(`gRPC call succeeded: ${service}.${method}`);
                resolve(response);
              }
            }
          );
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

  // ✅ NEW: Strategy execution handler
  async handleStrategyExecution(req: any, res: any) {
    try {
      const tenantId = req.tenantId; // From auth middleware
      const { strategy_id, config, use_historical_data = true } = req.body;

      if (!strategy_id) {
        return res.status(400).json({ error: "strategy_id is required" });
      }

      let historicalData = [];
      
      if (use_historical_data) {
        // Get recent historical data for the tenant
        const metricsResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Historical data fetch timeout"));
          }, 10000);

          this.streamClient.getTenantMetrics(
            {
              tenant_id: tenantId,
              start_time: { seconds: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000) },
              end_time: { seconds: Math.floor(Date.now() / 1000) },
            },
            (error: any, response: any) => {
              clearTimeout(timeout);
              if (error) {
                logger.warn("Could not fetch historical data:", error.message);
                resolve([]);
              } else {
                resolve(response.historical_data || []);
              }
            }
          );
        });

        historicalData = metricsResult as any[];
      }

      // Execute strategy via stream service
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Strategy execution timeout"));
        }, 60000); // 60 second timeout

        this.streamClient.executeStrategy(
          {
            tenant_id: tenantId,
            strategy_id: strategy_id,
            config: config || {},
            historical_data: historicalData,
          },
          (error: any, response: any) => {
            clearTimeout(timeout);
            if (error) {
              logger.error("Strategy execution error:", error);
              reject(error);
            } else {
              logger.info(`Strategy ${strategy_id} executed for tenant ${tenantId}`);
              resolve(response);
            }
          }
        );
      });

      res.json({
        success: true,
        message: "Strategy execution initiated",
        execution_result: result,
        strategy_id,
        tenant_id: tenantId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      const err = error as Error;
      logger.error("Strategy execution handler error:", error);
      res.status(500).json({
        error: err.message,
        strategy_id: req.body.strategy_id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ✅ FIX: Universal data handler with proper method calls
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
        llmRequest.file_data = req.file.buffer;
        logger.info(
          `Processing file: ${req.file.originalname} (${req.file.mimetype})`
        );
      } else if (req.body.text) {
        llmRequest.raw_text = req.body.text;
        logger.info("Processing raw text data");
      } else if (req.body.url) {
        llmRequest.file_url = req.body.url;
        logger.info(`Processing URL: ${req.body.url}`);
      } else if (req.body.data) {
        llmRequest.structured_data = req.body.data;
        logger.info("Processing structured data");
      } else {
        return res.status(400).json({
          error:
            "No data provided. Please provide file, text, url, or structured data.",
        });
      }

      // ✅ FIX: Process with LLM using correct method name
      logger.info(
        `Starting LLM processing for tenant ${tenantId}, stream ${stream_id}`
      );

      const llmResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("LLM processing timeout"));
        }, 60000); // 60 second timeout

        this.llmClient.processUniversalData(
          llmRequest,
          (error: any, response: any) => {
            clearTimeout(timeout);
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

      // ✅ FIX: Send processed data to stream ingestion using correct method name
      const streamResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Stream processing timeout"));
        }, 30000); // 30 second timeout

        this.streamClient.processLLMData(
          {
            tenant_id: tenantId,
            stream_id: stream_id,
            processed_data: llmResult,
            original_format: req.file ? req.file.mimetype : "text/plain",
          },
          (error: any, response: any) => {
            clearTimeout(timeout);
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
  logger.info(`Universal Gateway running on port ${PORT}`);
  logger.info("Available endpoints:");
  logger.info("  POST /api/tenant/create (public)");
  logger.info("  POST /api/auth/login (public)");
  logger.info("  POST /api/data/universal (authenticated)");
  logger.info("  GET  /api/tenant/:id/config (authenticated)");
  logger.info("  POST /api/strategy/execute (authenticated)");
  logger.info("  GET  /api/strategy/:execution_id/result (authenticated)");
  logger.info("  POST /api/notifications/:tenant_id/send (authenticated)");
  logger.info("  GET  /api/notifications/websocket-info (authenticated)");
  logger.info("  GET  /health (public)");
});