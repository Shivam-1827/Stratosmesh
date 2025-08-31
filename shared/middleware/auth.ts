import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {Logger} from "../utils/logger"

dotenv.config();

const logger = new Logger("AuthMiddleware");

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  scopes?: string[];
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // ✅ FIX: Better debug logging
    logger.info("🔍 Auth Middleware Debug:");
    logger.info("Request URL:", req.url);
    logger.info("Request Method:", req.method);

    const authHeader = req.headers.authorization;
    logger.info("Auth Header present:", !!authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.error("Missing or invalid authorization header");
      return res.status(401).json({
        error: "Missing or invalid authorization header",
      });
    }

    // ✅ FIX: Proper token extraction
    const token = authHeader.split(" ")[1];
    console.log(" Auth Debug - Token length:", token?.length);


    if (!token) {
      logger.error("Token not found after Bearer");
      return res.status(401).json({
        error: "Token not found in authorization header",
      });
    }

    logger.info("Token extracted, length:", token.length);

    const jwtSecret =
      process.env.JWT_SECRET || "5e8f894aa9a8cdf107d46b2b79801a43";
    logger.info("JWT Secret available:", !!jwtSecret);

    // ✅ FIX: Better JWT verification with detailed error handling
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret) as any;
      logger.info(" Token decoded successfully");
      logger.info("Tenant ID from token:", decoded.tenantId);
      logger.info("Scopes from token:", decoded.scopes);
    } catch (jwtError) {
      logger.error("JWT verification failed:", jwtError);
      return res.status(401).json({
        error: "Token verification failed",
        details:
          jwtError instanceof Error
            ? jwtError.message
            : "JWT verification error",
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const timeToExpiry = decoded.exp - now;
    logger.info(`Token expires in: ${timeToExpiry} seconds`);

    if (timeToExpiry <= 0) {
      logger.error(" Token has expired");
      return res.status(401).json({
        error: "Token has expired",
      });
    }

    if (timeToExpiry < 300) {
      // Less than 5 minutes
      res.setHeader("X-Token-Refresh-Needed", "true");
      logger.info("⚠️  Token refresh needed");
    }

    req.tenantId = decoded.tenantId;
    req.scopes = decoded.scopes || [];

    // ✅ FIX: Ensure tenant-id header is set properly
    req.headers["tenant-id"] = decoded.tenantId;

    logger.info("✅ Auth middleware completed successfully");
    next();
  } catch (error) {
    logger.error("❌ Auth Middleware Error:", error);
    return res.status(401).json({
      error: "Authentication failed",
      details:
        error instanceof Error ? error.message : "Unknown authentication error",
    });
  }
};
