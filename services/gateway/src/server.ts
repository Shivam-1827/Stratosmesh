import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from "dotenv";
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