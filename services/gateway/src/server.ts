// services/gateway/src/server.ts - FINAL, CORRECTED VERSION
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

app.use(helmet());
app.use(cors());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP",
});
app.use(limiter);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

class UniversalGateway {
  private clients: any = {};
  private llmClient: any;
  private streamClient: any;
  private strategyClient: any;

  constructor() {
    this.setupGrpcClients();
    this.setupUniversalRoute();
    this.setupHttpGrpcBridgeRoutes();
  }

  // This helper function is now used ONLY for the final JSON response to the user.
  private keysToCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((v) => this.keysToCamelCase(v));
    } else if (obj !== null && obj.constructor === Object) {
      return Object.keys(obj).reduce((result, key) => {
        const camelKey = key.replace(/([-_][a-z])/gi, ($1) => {
          return $1.toUpperCase().replace("-", "").replace("_", "");
        });
        result[camelKey] = this.keysToCamelCase(obj[key]);
        return result;
      }, {} as any);
    }
    return obj;
  }

  private setupGrpcClients() {
    const protoPath = path.join(
      __dirname,
      "../../../shared/proto/analytics.proto"
    );

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    // ✅ THE FIX: Access services using the full package name.
    const serviceConfig = {
      tenant: {
        url: process.env.TENANT_SERVICE_URL || "localhost:50054",
        constructor: proto.stratosmesh.analytics.TenantService,
      },
      auth: {
        url: process.env.AUTH_SERVICE_URL || "localhost:50051",
        constructor: proto.stratosmesh.analytics.AuthService,
      },
      stream: {
        url: process.env.STREAM_SERVICE_URL || "localhost:50052",
        constructor: proto.stratosmesh.analytics.EnhancedStreamService,
      },
      llm: {
        url: process.env.LLM_SERVICE_URL || "localhost:50056",
        constructor: proto.stratosmesh.analytics.LLMProcessorService,
      },
      strategy: {
        url: process.env.STRATEGY_SERVICE_URL || "localhost:50053",
        constructor: proto.stratosmesh.analytics.StrategyEngineService,
      },
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
        if (error)
          logger.error(
            `Failed to connect to ${serviceName} at ${url}:`,
            error.message
          );
        else logger.info(`✅ Connected to ${serviceName}`);
      });
      return client;
    };

    Object.entries(serviceConfig).forEach(([serviceName, config]) => {
      this.clients[serviceName] = createClientWithRetry(
        serviceName,
        config.url,
        config.constructor
      );
    });

    this.llmClient = this.clients.llm;
    this.streamClient = this.clients.stream;
    this.strategyClient = this.clients.strategy;

    logger.info("All gRPC clients initialized using PascalCase methods.");
  }

  private bridgeCall(service: string, method: string) {
    return async (req: express.Request, res: express.Response) => {
      try {
        let requestData = { ...req.body, ...req.params };

        if ((req as any).tenantId) {
          requestData.tenant_id = (req as any).tenantId;
        }

        logger.info(`Bridging ${service}.${method}`, {
          requestData: { ...requestData, client_secret: "[REDACTED]" },
        });

        const pascalCaseMethod =
          method.charAt(0).toUpperCase() + method.slice(1);

        if (
          !this.clients[service] ||
          !this.clients[service][pascalCaseMethod]
        ) {
          const availableMethods = this.clients[service]
            ? Object.keys(this.clients[service].$method_names)
            : "none";
          logger.error(
            `Method '${pascalCaseMethod}' not found on service '${service}'. Available: ${availableMethods}`
          );
          throw new Error(
            `Method ${pascalCaseMethod} not found on service ${service}`
          );
        }

        const result = await new Promise((resolve, reject) => {
          this.clients[service][pascalCaseMethod](
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
                logger.info(`gRPC call succeeded: ${service}.${method}`);
                resolve(response);
              }
            }
          );
        });

        const camelCaseResult = this.keysToCamelCase(result);
        res.json({
          success: true,
          data: camelCaseResult,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(`Bridge error: ${service}.${method}`, error);
        let statusCode = 500;
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
          }
        }
        res.status(statusCode).json({
          success: false,
          error: error.message,
          service,
          method,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }

  async handleUniversalData(req: any, res: any) {
    try {
      const tenantId = req.tenantId;
      const { stream_id, text, data_description, desired_format } = req.body;

      if (!stream_id) {
        return res.status(400).json({ error: "stream_id is required" });
      }

      const llmRequest = {
        tenant_id: tenantId,
        stream_id: stream_id,
        raw_text: text,
        data_description: data_description,
        desired_format: desired_format,
      };

      const llmResult: any = await new Promise((resolve, reject) => {
        this.llmClient.ProcessUniversalData(
          llmRequest,
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          }
        );
      });

      const streamRequest = {
        tenant_id: tenantId,
        stream_id: stream_id,
        processed_data: llmResult,
        original_format: "text/plain",
      };

      const streamResult: any = await new Promise((resolve, reject) => {
        this.streamClient.ProcessLLMData(
          streamRequest,
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
        streamId: stream_id,
        llmAnalysis: this.keysToCamelCase(llmResult),
        streamResult: this.keysToCamelCase(streamResult),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error("Universal data processing error:", {
        message: err.message,
        stack: err.stack,
      });
      res.status(500).json({
        error: err.message,
        stream_id: req.body.stream_id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private setupHttpGrpcBridgeRoutes() {
    app.post("/api/tenant/create", this.bridgeCall("tenant", "createTenant"));
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
    app.post("/api/auth/login", this.bridgeCall("auth", "authenticate"));
    app.post("/api/auth/validate", this.bridgeCall("auth", "validateToken"));
    app.post("/api/auth/refresh", this.bridgeCall("auth", "refreshToken"));
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
      this.bridgeCall("strategy", "listStrategies")
    );
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
      limits: { fileSize: 100 * 1024 * 1024 },
    });
    app.post(
      "/api/data/universal",
      authMiddleware,
      upload.single("file"),
      this.handleUniversalData.bind(this)
    );
  }

  async handleStrategyExecution(req: any, res: any) {
    try {
      const tenantId = req.tenantId;
      const { strategy_id, config, data } = req.body;
      if (!strategy_id) {
        return res.status(400).json({ error: "strategy_id is required" });
      }
      const result = await new Promise((resolve, reject) => {
        this.strategyClient.ExecuteStrategy(
          {
            tenant_id: tenantId,
            strategy_id: strategy_id,
            config: config || {},
            data: data || [],
          },
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          }
        );
      });
      res.json({
        success: true,
        message: "Strategy execution initiated",
        execution_result: result,
        strategy_id,
      });
    } catch (error: any) {
      logger.error("Strategy execution handler error:", error);
      res
        .status(500)
        .json({ error: error.message, strategy_id: req.body.strategy_id });
    }
  }
}

const universalGateway = new UniversalGateway();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Universal Gateway running on port ${PORT}`);
});
