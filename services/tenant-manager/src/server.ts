// services/tenant-manager/src/server.ts - FINAL FIX
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import bcrypt from "bcrypt";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../shared/utils/logger";
import dotenv from "dotenv";

dotenv.config();
const logger = new Logger("TenantManager");

class TenantServiceImpl {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async createTenant(call: any, callback: any) {
    try {
      // ✅ FIX: Use camelCase for request properties
      const { name, email, limits, allowedStrategies } = call.request;

      if (!name || !email) {
        return callback(new Error("Name and email are required"));
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return callback(new Error("Invalid email format"));
      }

      if (limits?.maxConcurrentStreams && limits.maxConcurrentStreams <= 0) {
        return callback(new Error("Limits must be positive numbers"));
      }

      const tenantId = uuidv4();
      const clientId = `client_${Date.now()}`;
      const clientSecret = uuidv4();
      const hashedSecret = await bcrypt.hash(clientSecret, 10);

      const processedLimits = {
        maxConcurrentStreams: limits?.maxConcurrentStreams || 10,
        maxStrategiesPerHour: limits?.maxStrategiesPerHour || 100,
        maxStorageMb: limits?.maxStorageMb || 1000,
        rateLimitPerMinute: limits?.rateLimitPerMinute || 60,
      };

      const tenant = {
        tenantId,
        name,
        email,
        status: "ACTIVE",
        limits: processedLimits,
        credentials: {
          clientId,
          clientSecret: hashedSecret,
        },
        allowedStrategies: allowedStrategies || [
          "moving_average",
          "anomaly_detection",
          "arima_prediction",
          "hybrid_arima_ma",
        ],
        enabledStrategies: ["moving_average", "arima_prediction"],
        strategyConfigs: {
          moving_average: { period: 20 },
          anomaly_detection: { threshold: 2 },
          arima_prediction: {
            p: 2,
            d: 1,
            q: 2,
            steps: 5,
          },
          hybrid_arima_ma: {
            arimaConfig: { p: 2, d: 1, q: 2, steps: 3 },
            maConfig: { period: 20 },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.collection("tenants").insertOne(tenant);
      await this.createTenantCollections(tenantId);

      // ✅ FIX: Use camelCase for response properties
      const response = {
        tenantId: String(tenantId),
        name: String(name),
        status: "ACTIVE",
        limits: {
          maxConcurrentStreams: Number(processedLimits.maxConcurrentStreams),
          maxStrategiesPerHour: Number(processedLimits.maxStrategiesPerHour),
          maxStorageMb: Number(processedLimits.maxStorageMb),
          rateLimitPerMinute: Number(processedLimits.rateLimitPerMinute),
        },
        createdAt: {
          seconds: Number(Math.floor(Date.now() / 1000)),
        },
        clientCredentials: {
          clientId: String(clientId),
          clientSecret: String(clientSecret),
        },
      };

      logger.info(
        "Tenant creation response:",
        JSON.stringify(response, null, 2)
      );

      callback(null, response);
    } catch (error) {
      logger.error("Create tenant error:", error);
      callback(error);
    }
  }

  async getTenantConfig(call: any, callback: any) {
    try {
      const { tenantId } = call.request;

      if (!tenantId) {
        return callback(new Error("Missing tenant Id"));
      }

      const tenant = await this.db
        .collection("tenants")
        .findOne({ tenantId: tenantId });

      if (!tenant) {
        return callback(new Error("Tenant not found"));
      }

      callback(null, {
        tenantId,
        config: {
          limits: tenant.limits,
          allowedStrategies: tenant.allowedStrategies,
          enabledStrategies: tenant.enabledStrategies,
          strategyConfigs: tenant.strategyConfigs,
        },
      });
    } catch (error) {
      logger.error("Get tenant config error:", error);
      callback(error);
    }
  }

  async updateTenantLimits(call: any, callback: any) {
    try {
      const { tenantId, limits } = call.request;

      const updateDoc = {
        $set: {
          "limits.maxConcurrentStreams": limits.maxConcurrentStreams,
          "limits.maxStrategiesPerHour": limits.maxStrategiesPerHour,
          "limits.maxStorageMb": limits.maxStorageMb,
          "limits.rateLimitPerMinute": limits.rateLimitPerMinute,
          updatedAt: new Date(),
        },
      };

      const result = await this.db
        .collection("tenants")
        .updateOne({ tenantId: tenantId }, updateDoc);

      if (result.matchedCount === 0) {
        return callback(new Error("Tenant not found"));
      }

      const tenant = await this.db
        .collection("tenants")
        .findOne({ tenantId: tenantId });

      if (!tenant) {
        return callback(new Error("Tenant not found"));
      }

      callback(null, {
        tenantId,
        name: tenant.name,
        status: tenant.status,
        limits: tenant.limits,
        createdAt: { seconds: Math.floor(tenant.createdAt.getTime() / 1000) },
      });
    } catch (error) {
      logger.error("Update tenant limits error:", error);
      callback(error);
    }
  }

  private async createTenantCollections(tenantId: string) {
    await this.db.collection("stream_data").createIndex({
      tenantId: 1,
      streamId: 1,
      timestamp: -1,
    });

    await this.db.collection("stream_data").createIndex({
      tenantId: 1,
      dataType: 1,
      timestamp: -1,
    });

    await this.db.collection("strategy_results").createIndex(
      {
        tenantId: 1,
        executionId: 1,
      },
      { unique: true }
    );

    await this.db.collection("refresh_tokens").createIndex(
      {
        expiresAt: 1,
      },
      { expireAfterSeconds: 0 }
    );
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
      // ✅ FIX: REMOVED keepCase and other options for consistency
      longs: String,
      enums: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    }
  );
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  const server = new grpc.Server();
  const tenantServiceImpl = new TenantServiceImpl(db);

  server.addService(proto.stratosmesh.analytics.TenantService.service, {
    createTenant: tenantServiceImpl.createTenant.bind(tenantServiceImpl),
    getTenantConfig: tenantServiceImpl.getTenantConfig.bind(tenantServiceImpl),
    updateTenantLimits:
      tenantServiceImpl.updateTenantLimits.bind(tenantServiceImpl),
  });

  const port = process.env.TENANT_MANAGER_PORT || "50054";
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error("Failed to start server:", err);
        return;
      }
      logger.info(`Tenant manager service running on port ${port}`);
    }
  );
}

startServer().catch(console.error);
