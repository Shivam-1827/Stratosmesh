import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import multer from "multer";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
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

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

class UniversalGateway {
  private llmClient: any;
  private streamClient: any;

  constructor() {
    this.setupGrpcClients();
    this.setupUniversalRoute();
  }

  private setupGrpcClients() {
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, "../../../shared/proto/analytics.proto")
    );
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    // LLM Processor client
    this.llmClient = new proto.stratosmesh.analytics.LLMProcessorService(
      "llm-processor:50056",
      grpc.credentials.createInsecure()
    );

    // Enhanced Stream client
    this.streamClient = new proto.stratosmesh.analytics.EnhancedStreamService(
      "stream-ingestion:50052",
      grpc.credentials.createInsecure()
    );
  }

  private setupUniversalRoute() {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });

    // Single universal endpoint for all data types
    app.post(
      "/api/data/universal",
      authMiddleware,
      upload.single("file"),
      this.handleUniversalData.bind(this)
    );
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

// Legacy service proxies (keep for backward compatibility if needed)
type ServiceConfig = {
  target: string;
  pathRewrite: Record<string, string>;
  middleware?: Array<
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => void
  >;
};

const services: Record<string, ServiceConfig> = {
  "/api/auth": {
    target: "http://auth-service:50051",
    pathRewrite: { "^/api/auth": "" },
  },
  "/api/tenant": {
    target: "http://tenant-manager:50054",
    pathRewrite: { "^/api/tenant": "" },
    middleware: [authMiddleware],
  },
  "/api/strategy": {
    target: "http://strategy-engine:50053",
    pathRewrite: { "^/api/strategy": "" },
    middleware: [authMiddleware],
  },
  "/api/notifications": {
    target: "http://notification:50055",
    pathRewrite: { "^/api/notifications": "" },
    middleware: [authMiddleware],
  },
};

// Setup service proxies
Object.entries(services).forEach(([path, config]) => {
  if (config.middleware) {
    app.use(path, ...config.middleware);
  }

  app.use(
    path,
    createProxyMiddleware({
      target: config.target,
      changeOrigin: true,
      pathRewrite: config.pathRewrite,
      // @ts-expect-error onError is missing from type defs
      onError: (err, req, res) => {
        logger.error(`Proxy error for ${path}:`, err);
        if (!res.headersSent) {
          res.status(502).json({ error: "Service unavailable" });
        }
      },
    })
  );

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Universal Gateway is running on port ${PORT}`);
  logger.info("Universal data endpoint: POST /api/data/universal");
});
