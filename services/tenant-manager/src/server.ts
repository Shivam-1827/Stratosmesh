
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import bcrypt from "bcrypt";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../shared/utils/logger";
import dotenv from 'dotenv';

dotenv.config();
const logger = new Logger("TenantManager");

class TenantServiceImpl {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async createTenant(call: any, callback: any) {
    try {
      const { name, email, limits, allowed_strategies } = call.request;

      // Validate required fields
      if (!name || !email) {
        return callback(new Error("Name and email are required"));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return callback(new Error("Invalid email format"));
      }

      // Validate limits are positive numbers
      if (
        limits?.max_concurrent_streams &&
        limits.max_concurrent_streams <= 0
      ) {
        return callback(new Error("Limits must be positive numbers"));
      }

      const tenantId = uuidv4();
      const clientId = `client_${Date.now()}`;
      const clientSecret = uuidv4();
      const hashedSecret = await bcrypt.hash(clientSecret, 10);

      // ✅ Process request limits properly
      const processedLimits = {
        maxConcurrentStreams: limits?.max_concurrent_streams || 10,
        maxStrategiesPerHour: limits?.max_strategies_per_hour || 100,
        maxStorageMb: limits?.max_storage_mb || 1000,
        rateLimitPerMinute: limits?.rate_limit_per_minute || 60,
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
        allowedStrategies: allowed_strategies || [
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

      // 🔥 CRITICAL FIX: Proper protobuf field mapping
      const response = {
        tenant_id: String(tenantId),
        name: String(name),
        status: "ACTIVE", // String, not enum
        limits: {
          max_concurrent_streams: Number(processedLimits.maxConcurrentStreams),
          max_strategies_per_hour: Number(processedLimits.maxStrategiesPerHour),
          max_storage_mb: Number(processedLimits.maxStorageMb),
          rate_limit_per_minute: Number(processedLimits.rateLimitPerMinute),
        },
        created_at: {
          seconds: Number(Math.floor(Date.now() / 1000)),
        },
        client_credentials: {
          client_id: String(clientId),
          client_secret: String(clientSecret),
        },
      };

      // 🔍 Debug logging
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
      const { tenant_id } = call.request;

      if (!tenant_id) {
        return callback(new Error("Missing tenant Id"));
      }

      const tenant = await this.db
        .collection("tenants")
        .findOne({ tenantId: tenant_id });

      if (!tenant) {
        return callback(new Error("Tenant not found"));
      }

      callback(null, {
        tenant_id,
        config: {
          limits: tenant.limits,
          allowed_strategies: tenant.allowedStrategies,
          enabled_strategies: tenant.enabledStrategies,
          strategy_configs: tenant.strategyConfigs,
        },
      });
    } catch (error) {
      logger.error("Get tenant config error:", error);
      callback(error);
    }
  }

  async updateTenantLimits(call: any, callback: any) {
    try {
      const { tenant_id, limits } = call.request;

      const updateDoc = {
        $set: {
          "limits.maxConcurrentStreams": limits.max_concurrent_streams,
          "limits.maxStrategiesPerHour": limits.max_strategies_per_hour,
          "limits.maxStorageMb": limits.max_storage_mb,
          "limits.rateLimitPerMinute": limits.rate_limit_per_minute,
          updatedAt: new Date(),
        },
      };

      const result = await this.db
        .collection("tenants")
        .updateOne({ tenantId: tenant_id }, updateDoc);

      if (result.matchedCount === 0) {
        return callback(new Error("Tenant not found"));
      }

      const tenant = await this.db
        .collection("tenants")
        .findOne({ tenantId: tenant_id });

      if (!tenant) {
        return callback(new Error("Tenant not found"));
      }

      callback(null, {
        tenant_id,
        name: tenant.name,
        status: tenant.status,
        limits: tenant.limits,
        created_at: { seconds: Math.floor(tenant.createdAt.getTime() / 1000) },
      });
    } catch (error) {
      logger.error("Update tenant limits error:", error);
      callback(error);
    }
  }

  // ✅ SOLUTION: Add proper indexes in tenant-manager
  private async createTenantCollections(tenantId: string) {
    // Existing indexes are good, but add more specific ones
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
    ); // Auto-cleanup expired tokens
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
  );;
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
