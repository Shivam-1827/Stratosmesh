// services/gateway/src/server.ts - FINAL FIX WITH CORRECT METHOD NAMES
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

  // private keysToCamelCase(obj: any): any {
  //   if (Array.isArray(obj)) {
  //     return obj.map((v) => this.keysToCamelCase(v));
  //   } else if (obj !== null && obj.constructor === Object) {
  //     return Object.keys(obj).reduce((result, key) => {
  //       const camelKey = key.replace(/([-_][a-z])/gi, ($1) => {
  //         return $1.toUpperCase().replace("-", "").replace("_", "");
  //       });
  //       result[camelKey] = this.keysToCamelCase(obj[key]);
  //       return result;
  //     }, {} as any);
  //   }
  //   return obj;
  // }

  private keysToCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((v) => this.keysToCamelCase(v));
    } else if (
      obj !== null &&
      obj !== undefined &&
      obj.constructor === Object
    ) {
      const result: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Handle protobuf Value types specially
        if (key === "fields" && value && typeof value === "object") {
          result[key] = this.simplifyProtobufFields(value);
        } else if (
          key.endsWith("Value") &&
          ["numberValue", "stringValue", "boolValue"].includes(key)
        ) {
          // For protobuf Value types, return just the value
          return value;
        } else {
          // Convert key to camelCase
          const camelKey = key.replace(/([-_][a-z])/gi, ($1) => {
            return $1.toUpperCase().replace("-", "").replace("_", "");
          });
          result[camelKey] = this.keysToCamelCase(value);
        }
      }
      return result;
    }
    return obj;
  }

  private simplifyProtobufFields(fieldsObj: any): any {
    if (!fieldsObj || typeof fieldsObj !== "object") {
      return fieldsObj;
    }

    const simplified: any = {};

    for (const [fieldName, fieldValue] of Object.entries(fieldsObj)) {
      if (fieldValue && typeof fieldValue === "object") {
        const typedValue = fieldValue as any;

        // Extract the actual value from protobuf Value structure
        if (typedValue.numberValue !== undefined) {
          simplified[fieldName] = typedValue.numberValue;
        } else if (typedValue.stringValue !== undefined) {
          simplified[fieldName] = typedValue.stringValue;
        } else if (typedValue.boolValue !== undefined) {
          simplified[fieldName] = typedValue.boolValue;
        } else if (typedValue.listValue && typedValue.listValue.values) {
          simplified[fieldName] = typedValue.listValue.values.map(
            (v: any) => v.stringValue || v.numberValue || v.boolValue || v
          );
        } else if (typedValue.structValue && typedValue.structValue.fields) {
          simplified[fieldName] = this.simplifyProtobufFields(
            typedValue.structValue.fields
          );
        } else {
          // Fallback: use as-is
          simplified[fieldName] = fieldValue;
        }
      } else {
        simplified[fieldName] = fieldValue;
      }
    }

    return simplified;
  }

  private setupGrpcClients() {
    const protoPath = path.join(
      __dirname,
      "../../../shared/proto/analytics.proto"
    );

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true, // ✅ Keep original case for method names
      longs: String,
      enums: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

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
        if (error) {
          logger.error(
            `Failed to connect to ${serviceName} at ${url}:`,
            error.message
          );
        } else {
          logger.info(`✅ Connected to ${serviceName}`);

          // ✅ DEBUG: Log available methods
          const methods = [];
          for (const key in client) {
            if (
              typeof client[key] === "function" &&
              key.charAt(0).toUpperCase() === key.charAt(0)
            ) {
              methods.push(key);
            }
          }
          logger.info(`Available methods for ${serviceName}:`, methods);
        }
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

    logger.info("All gRPC clients initialized");
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

        // ✅ Use the actual method name from proto
        const actualMethodName = method;

        if (
          !this.clients[service] ||
          !this.clients[service][actualMethodName]
        ) {
          logger.error(
            `Method '${actualMethodName}' not found on service '${service}'.`
          );
          throw new Error(
            `Method ${actualMethodName} not found on service ${service}`
          );
        }

        const result = await new Promise((resolve, reject) => {
          this.clients[service][actualMethodName](
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

  // ✅ FIX: Use correct method names (PascalCase)
  // async handleUniversalData(req: any, res: any) {
  //   try {
  //     const tenantId = req.tenantId;
  //     const { stream_id, text, data_description, desired_format } = req.body;

  //     if (!stream_id) {
  //       return res.status(400).json({ error: "stream_id is required" });
  //     }

  //     logger.info(
  //       `Processing universal data for tenant ${tenantId}, stream ${stream_id}`
  //     );

  //     // Step 1: Call LLM service to process the data
  //     const llmRequest = {
  //       tenant_id: tenantId,
  //       stream_id: stream_id,
  //       raw_text: text,
  //       data_description: data_description,
  //       desired_format: desired_format,
  //     };

  //     logger.info("Calling LLM service...");
  //     const llmResult: any = await new Promise((resolve, reject) => {
  //       // ✅ Use correct method name from your debug output
  //       this.llmClient.ProcessUniversalData(
  //         llmRequest,
  //         (error: any, response: any) => {
  //           if (error) {
  //             logger.error("LLM processing error:", error);
  //             reject(error);
  //           } else {
  //             logger.info("LLM processing successful");
  //             resolve(response);
  //           }
  //         }
  //       );
  //     });

  //     // Step 2: Call Stream service to store the processed data
  //     const streamRequest = {
  //       tenant_id: tenantId,
  //       stream_id: stream_id,
  //       processed_data: llmResult,
  //       original_format: "text/plain",
  //     };

  //     logger.info("Calling Stream service with processed data...");

  //     const streamResult: any = await new Promise((resolve, reject) => {
  //       // ✅ CRITICAL FIX: Use PascalCase method name
  //       this.streamClient.ProcessLLMData(
  //         streamRequest,
  //         (error: any, response: any) => {
  //           if (error) {
  //             logger.error("Stream processing error:", error);
  //             reject(error);
  //           } else {
  //             logger.info(
  //               `Stream processing completed: ${
  //                 response.records_processed || response.recordsProcessed
  //               } records`
  //             );
  //             resolve(response);
  //           }
  //         }
  //       );
  //     });

  //     res.json({
  //       success: true,
  //       message: "Data processed successfully",
  //       streamId: stream_id,
  //       llmAnalysis: this.keysToCamelCase(llmResult),
  //       streamResult: this.keysToCamelCase(streamResult),
  //       timestamp: new Date().toISOString(),
  //     });
  //   } catch (error) {
  //     const err = error as Error;
  //     logger.error("Universal data processing error:", {
  //       message: err.message,
  //       stack: err.stack,
  //     });
  //     res.status(500).json({
  //       error: err.message,
  //       stream_id: req.body.stream_id,
  //       timestamp: new Date().toISOString(),
  //     });
  //   }
  // }

  async handleUniversalData(req: any, res: any) {
    try {
      const tenantId = req.tenantId;
      const { stream_id, text, data_description, desired_format } = req.body;

      if (!stream_id) {
        return res.status(400).json({ error: "stream_id is required" });
      }

      logger.info(
        `Processing universal data for tenant ${tenantId}, stream ${stream_id}`
      );

      // Step 1: Call LLM service with improved error handling
      const llmRequest = {
        tenant_id: tenantId,
        stream_id: stream_id,
        raw_text: text,
        data_description: data_description,
        desired_format: desired_format,
      };

      logger.info("Calling LLM service...");
      const llmResult: any = await new Promise((resolve, reject) => {
        this.llmClient.ProcessUniversalData(
          llmRequest,
          (error: any, response: any) => {
            if (error) {
              logger.error("LLM processing error:", error);
              reject(error);
            } else {
              logger.info("LLM processing successful");
              logger.debug("LLM response structure:", {
                success: response.success,
                detectedType: response.detectedType,
                recordCount: response.records ? response.records.length : 0,
                confidence: response.confidence,
              });
              resolve(response);
            }
          }
        );
      });

      // Step 2: Call Stream service with processed data
      const streamRequest = {
        tenant_id: tenantId,
        stream_id: stream_id,
        processed_data: llmResult,
        original_format: "text/csv",
      };

      logger.info("Calling Stream service with processed data...");
      const streamResult: any = await new Promise((resolve, reject) => {
        this.streamClient.ProcessLLMData(
          streamRequest,
          (error: any, response: any) => {
            if (error) {
              logger.error("Stream processing error:", error);
              reject(error);
            } else {
              logger.info(
                `Stream processing completed: ${
                  response.recordsProcessed || response.records_processed
                } records processed`
              );
              resolve(response);
            }
          }
        );
      });

      // IMPROVED: Clean up the response structure
      const cleanLLMResult = this.cleanLLMResponse(llmResult);
      const cleanStreamResult = this.keysToCamelCase(streamResult);

      const response = {
        success: true,
        message: "Data processed successfully",
        streamId: stream_id,
        llmAnalysis: cleanLLMResult,
        streamResult: cleanStreamResult,
        processing: {
          recordsAnalyzed: cleanLLMResult.records
            ? cleanLLMResult.records.length
            : 0,
          recordsStored: cleanStreamResult.recordsProcessed || 0,
          detectedType: cleanLLMResult.detectedType,
          confidence: cleanLLMResult.confidence,
          processingSteps: cleanLLMResult.processingSteps || [],
        },
        timestamp: new Date().toISOString(),
      };

      logger.info("Universal data processing completed successfully");
      res.json(response);
    } catch (error) {
      const err = error as Error;
      logger.error("Universal data processing error:", {
        message: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        stream_id: req.body.stream_id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private cleanLLMResponse(llmResult: any): any {
    if (!llmResult) return llmResult;

    const cleaned = {
      success: llmResult.success,
      detectedType: llmResult.detectedType,
      confidence: llmResult.confidence,
      processingSteps: llmResult.processingSteps || [],
      schema: this.cleanSchema(llmResult.schema),
      records: llmResult.records
        ? llmResult.records.map((record: any, index: number) => {
            return {
              recordIndex: index,
              timestamp: record.timestamp,
              data: this.extractRecordData(record.payload),
              metadata: this.simplifyMetadata(record.metadata),
              originalPayload: record.payload, // Keep for debugging if needed
            };
          })
        : [],
    };

    return cleaned;
  }

  private extractRecordData(payload: any): any {
    if (!payload || !payload.fields) {
      return {};
    }

    return this.simplifyProtobufFields(payload.fields);
  }

  // NEW: Clean up schema response
  private cleanSchema(schema: any): any {
    if (!schema || !schema.fields) {
      return {
        timestampField: "",
        valueFields: [],
        categoryFields: [],
        fieldTypes: {},
      };
    }

    const simplified = this.simplifyProtobufFields(schema.fields);

    return {
      timestampField: simplified.timestampField || "",
      valueFields: Array.isArray(simplified.valueFields)
        ? simplified.valueFields
        : [],
      categoryFields: Array.isArray(simplified.categoryFields)
        ? simplified.categoryFields
        : [],
      fieldTypes: simplified.fieldTypes || {},
      detectedColumns: simplified.detectedColumns || {},
    };
  }

  private simplifyMetadata(metadata: any): any {
    if (!metadata || !metadata.fields) {
      return {};
    }

    return this.simplifyProtobufFields(metadata.fields);
  }

  private setupHttpGrpcBridgeRoutes() {
    // ✅ Use correct method names (PascalCase as shown in debug)
    app.post("/api/tenant/create", this.bridgeCall("tenant", "CreateTenant"));
    app.get(
      "/api/tenant/:tenant_id/config",
      authMiddleware,
      this.bridgeCall("tenant", "GetTenantConfig")
    );
    app.put(
      "/api/tenant/:tenant_id/limits",
      authMiddleware,
      this.bridgeCall("tenant", "UpdateTenantLimits")
    );
    app.post("/api/auth/login", this.bridgeCall("auth", "Authenticate"));
    app.post("/api/auth/validate", this.bridgeCall("auth", "ValidateToken"));
    app.post("/api/auth/refresh", this.bridgeCall("auth", "RefreshToken"));
    app.post(
      "/api/stream/llm",
      authMiddleware,
      this.bridgeCall("stream", "ProcessLLMData") // ✅ PascalCase
    );
    app.get(
      "/api/stream/:tenant_id/metrics",
      authMiddleware,
      this.bridgeCall("stream", "GetTenantMetrics") // ✅ PascalCase
    );
    app.post(
      "/api/stream/execute-strategy",
      authMiddleware,
      this.bridgeCall("stream", "ExecuteStrategy") // ✅ PascalCase
    );
    app.get(
      "/api/strategy/:execution_id/result",
      authMiddleware,
      this.bridgeCall("strategy", "GetStrategyResult") // ✅ PascalCase
    );
    app.post(
      "/api/strategy/execute",
      authMiddleware,
      this.handleStrategyExecution.bind(this)
    );
    app.get(
      "/api/strategy/available",
      authMiddleware,
      this.bridgeCall("strategy", "ListStrategies") // ✅ PascalCase
    );
    app.post(
      "/api/llm/analyze-format",
      authMiddleware,
      this.bridgeCall("llm", "AnalyzeDataFormat") // ✅ PascalCase
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
        // ✅ Use PascalCase method name
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
