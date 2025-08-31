import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from 'dotenv';
import path from "path";
import { MongoClient, Db } from "mongodb";
import { Logger } from "../../../shared/utils/logger";
import {
  AuthRequest,
  AuthResponse,
  TokenValidationRequest,
  TokenValidationResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from "../../../shared/types";

dotenv.config();

const logger = new Logger('AuthService');

class AuthServiceImpl {
  private db: Db;
  private jwtSecret: string;
  private jwtRefreshSecret: string;

  constructor(db: Db) {
    this.db = db;
    this.jwtSecret =
      process.env.JWT_SECRET || "5e8f894aa9a8cdf107d46b2b79801a43";
    this.jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET || "e3417a9a2073ccad30dcd39a97387abf";
  }

  async authenticate(
    call: { request: AuthRequest },
    callback: (err: Error | null, response?: AuthResponse) => void
  ) {
    try {
      const { tenant_id, client_id, client_secret, scopes } = call.request;

      if(!tenant_id || !client_id){
        return callback(new Error("Missing tenant id or client id"));
      }
      // validating client credentials
      const tenant = await this.db.collection("tenants").findOne({
        tenantId: tenant_id,
        "credentials.clientId": client_id,
        status: "ACTIVE",
      });

      if (!tenant) {
        return callback(new Error("Invalid tenant credentials"));
      }

      const validSecret = await bcrypt.compare(
        client_secret,
        tenant.credentials.clientSecret
      );

      if (!validSecret) {
        return callback(new Error("Invalid client secret"));
      }

      // generate tokens
      const accessToken = jwt.sign(
        {
          tenantId: tenant_id,
          clientId: client_id,
          scopes: scopes || ["read", "write"],
        },
        this.jwtSecret,
        { expiresIn: "1h" }
      );

      const refreshToken = jwt.sign(
        { tenantId: tenant_id, clientId: client_id },
        this.jwtRefreshSecret,
        { expiresIn: "7d" }
      );

      await this.db.collection("refresh_tokens").insertOne({
        token: refreshToken,
        tenantId: tenant_id,
        clientId: client_id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      callback(null, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        token_type: "Bearer",
      });
    } catch (error) {
      logger.error("Authentication error:", error);
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async validateToken(
    call: { request: TokenValidationRequest },
    callback: (err: Error | null, response?: TokenValidationResponse) => void
  ) {
    try {
      const { token, required_scopes } = call.request;

      if(!token){
        return callback(new Error("Missing token! Please provide a token"));
      }

      const decoded = jwt.verify(token, this.jwtSecret) as any;

      // Check if tenant is still active
      const tenant = await this.db.collection("tenants").findOne({
        tenantId: decoded.tenantId,
        status: "ACTIVE",
      });

      if (!tenant) {
        return callback(null, { valid: false, tenant_id: "", scopes: [], expires_at: { seconds: 0 } });
      }

      // Check scopes if required
      if (required_scopes && required_scopes.length > 0) {
        const hasRequiredScopes = required_scopes.every((scope: string) =>
          decoded.scopes.includes(scope)
        );

        if (!hasRequiredScopes) {
          return callback(null, { valid: false, tenant_id: "", scopes: [], expires_at: { seconds: 0 } });
        }
      }

      callback(null, {
        valid: true,
        tenant_id: decoded.tenantId,
        scopes: decoded.scopes,
        expires_at: { seconds: decoded.exp },
      });
    } catch (error) {
      logger.error("Token validation error:", error);
      callback(null, { valid: false, tenant_id: "", scopes: [], expires_at: { seconds: 0 } });
    }
  }

  async refreshToken(
    call: { request: RefreshTokenRequest },
    callback: (err: Error | null, response?: RefreshTokenResponse) => void
  ) {
    try {
      const { refresh_token, tenant_id } = call.request;

      if(!refresh_token){
        return callback(new Error("Refresh token is missing"));
      }

      // Verify refresh token
      const decoded = jwt.verify(refresh_token, this.jwtRefreshSecret) as any;

      // Validate tenant_id matches
      if (tenant_id && decoded.tenantId !== tenant_id) {
        return callback(new Error("Tenant ID mismatch"));
      }

      // Check if refresh token exists and is valid
      const storedToken = await this.db.collection("refresh_tokens").findOne({
        token: refresh_token,
        tenantId: decoded.tenantId,
        expiresAt: { $gt: new Date() },
      });

      if (!storedToken) {
        return callback(new Error("Invalid or expired refresh token"));
      }

      // Get tenant details for new token
      const tenant = await this.db.collection("tenants").findOne({
        tenantId: decoded.tenantId,
        status: "ACTIVE",
      });

      if (!tenant) {
        return callback(new Error("Tenant not found or inactive"));
      }

      // Generate new tokens
      const newAccessToken = jwt.sign(
        {
          tenantId: decoded.tenantId,
          clientId: decoded.clientId,
          scopes: tenant.scopes || ["read", "write"],
        },
        this.jwtSecret,
        { expiresIn: "1h" }
      );

      const newRefreshToken = jwt.sign(
        { tenantId: decoded.tenantId, clientId: decoded.clientId },
        this.jwtRefreshSecret,
        { expiresIn: "30d" }
      );

      // Store new refresh token and invalidate old one
      await this.db.collection("refresh_tokens").replaceOne(
        { token: refresh_token },
        {
          token: newRefreshToken,
          tenantId: decoded.tenantId,
          clientId: decoded.clientId,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }
      );

      callback(null, {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 3600,
        token_type: "Bearer",
      });
    } catch (error) {
      logger.error("Refresh token error:", error);
      callback(new Error("Invalid refresh token"));
    }
  }
}

async function startServer() {
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017"
  );
  await client.connect();
  const db = client.db("stratosmesh");

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

  const server = new grpc.Server();
  const authServiceImpl = new AuthServiceImpl(db);
  server.addService(
    proto.stratosmesh.analytics.AuthService.service,
    {
      authenticate: authServiceImpl.authenticate.bind(authServiceImpl),
      validateToken: authServiceImpl.validateToken.bind(authServiceImpl),
      refreshToken: authServiceImpl.refreshToken.bind(authServiceImpl),
    }
  );

  const port = process.env.PORT || "50051";
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error("Failed to start server:", err);
        return;
      }
      logger.info(`Auth service running on port ${port}`);
      
    }
  );
}

startServer().catch(console.error);