import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from "dotenv";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import multer from "multer";
import {createProxyMiddleware} from 'http-proxy-middleware';
import {authMiddleware} from '../../../shared/middleware/auth';
import {Logger} from '../../../shared/utils/logger';

dotenv.config();

const app = express();
const logger = new Logger('Gateway');

// using middleware for the security
app.use(helmet());
app.use(cors());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'To many requests from this IP'
});
app.use(limiter);

app.use(express.json({limit: '10mb'}));

app.get('/health', (req, res) => {
    res.json({status: 'healthy', timestamp: new Date().toISOString()});
});

class EnhancedGateway {
  private llmClient: any;
  private streamClient: any;

  constructor() {
    this.setupGrpcClients();
    this.setupUniversalRoutes();
  }

  private setupGrpcClients() {
    const packageDefinition = protoLoader.loadSync(
      "./shared/proto/analytics.proto"
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

  private setupUniversalRoutes() {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    });

    // Universal data endpoint
    app.post(
      "/api/stream/universal",
      authMiddleware,
      upload.single("file"),
      this.handleUniversalData.bind(this)
    );

    // Text data endpoint
    app.post(
      "/api/stream/text",
      authMiddleware,
      this.handleTextData.bind(this)
    );

    // URL data endpoint
    app.post("/api/stream/url", authMiddleware, this.handleUrlData.bind(this));
  }

  async handleUniversalData(req: any, res: any) {
    try {
      const tenantId = req.tenantId; // From auth middleware
      const { stream_id, data_description, desired_format } = req.body;

      // Prepare request for LLM processor
      let llmRequest: any = {
        tenant_id: tenantId,
        stream_id: stream_id,
        data_description: data_description || "Unknown data",
        desired_format: desired_format || "time_series",
      };

      // Handle different input types
      if (req.file) {
        llmRequest.file_data = req.file.buffer;
      } else if (req.body.text) {
        llmRequest.raw_text = req.body.text;
      } else if (req.body.url) {
        llmRequest.file_url = req.body.url;
      } else if (req.body.data) {
        llmRequest.structured_data = req.body.data;
      } else {
        return res.status(400).json({ error: "No data provided" });
      }

      // Process with LLM
      const llmResult = await new Promise((resolve, reject) => {
        this.llmClient.processUniversalData(
          llmRequest,
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
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
            original_format: req.file ? req.file.mimetype : "text",
          },
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          }
        );
      });

      res.json({
        success: true,
        message: "Data processed successfully",
        llm_analysis: {
          detected_type: (llmResult as any).detected_type,
          confidence: (llmResult as any).confidence,
          records_found: (llmResult as any).records.length,
        },
        stream_result: streamResult,
      });
    } catch (error) {
      const err = error as Error;
      console.error("Universal data processing error:", error);
      res.status(500).json({ error: err.message });
    }
  }

  async handleTextData(req: any, res: any) {
    // Similar to handleUniversalData but specifically for text
    const { text, stream_id, data_description } = req.body;

    req.body = { text, stream_id, data_description };
    return this.handleUniversalData(req, res);
  }

  async handleUrlData(req: any, res: any) {
    // Similar to handleUniversalData but specifically for URLs
    const { url, stream_id, data_description } = req.body;

    req.body = { url, stream_id, data_description };
    return this.handleUniversalData(req, res);
  }
}

type ServiceConfig = {
  target: string;
  pathRewrite: Record<string, string>;
  middleware?: Array<(req: express.Request, res: express.Response, next: express.NextFunction) => void>;
};

const services: Record<string, ServiceConfig> = {
  '/api/auth': {
    target: 'http://auth-service:50051',
    pathRewrite: { '^/api/auth': '' }
  },
  '/api/stream': {
    target: 'http://stream-ingestion:50052',
    pathRewrite: { '^/api/stream': '' },
    middleware: [authMiddleware]
  },
  '/api/strategy': {
    target: 'http://strategy-engine:50053',
    pathRewrite: { '^/api/strategy': '' },
    middleware: [authMiddleware]
  },
  '/api/tenant': {
    target: 'http://tenant-manager:50054',
    pathRewrite: { '^/api/tenant': '' },
    middleware: [authMiddleware]
  },
  '/api/notifications': {
    target: 'http://notification:50055',
    pathRewrite: { '^/api/notifications': '' },
    middleware: [authMiddleware]
  }
};

// setup proxies
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
      // @ts-expect-error: onError is a valid runtime option but not typed in Options
      onError: (err, req, res) => {
        logger.error("Proxy error:", err);
        res.status(502).json({ error: "Service unavailable" });
      },
    } as any)
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`Gateway is running on port ${PORT}`);
})