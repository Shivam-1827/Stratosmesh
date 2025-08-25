// services/tenant-manager/src/server.ts
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { MongoClient, Db } from "mongodb";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../shared/utils/logger";

const logger = new Logger("TenantManager");

class TenantServiceImpl {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async createTenant(call: any, callback: any) {
    try {
      const { name, email, limits, allowed_strategies } = call.request;

      const tenantId = uuidv4();
      const clientId = `client_${Date.now()}`;
      const clientSecret = uuidv4();
      const hashedSecret = await bcrypt.hash(clientSecret, 10);

      const tenant = {
        tenantId,
        name,
        email,
        status: "ACTIVE",
        limits: {
          maxConcurrentStreams: limits?.max_concurrent_streams || 10,
          maxStrategiesPerHour: limits?.max_strategies_per_hour || 100,
          maxStorageMb: limits?.max_storage_mb || 1000,
          rateLimitPerMinute: limits?.rate_limit_per_minute || 60,
        },
        credentials: {
          clientId,
          clientSecret: hashedSecret,
        },
        allowedStrategies: allowed_strategies || [
          "moving_average",
          "anomaly_detection",
        ],
        enabledStrategies: ["moving_average"],
        strategyConfigs: {
          moving_average: { period: 20 },
          anomaly_detection: { threshold: 2 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.collection("tenants").insertOne(tenant);

      // Create tenant-specific collections
      await this.createTenantCollections(tenantId);

      callback(null, {
        tenant_id: tenantId,
        name,
        status: "ACTIVE",
        limits: tenant.limits,
        created_at: { seconds: Math.floor(Date.now() / 1000) },
        client_credentials: {
          client_id: clientId,
          client_secret: clientSecret, // Return unhashed secret only once
        },
      });
    } catch (error) {
      logger.error("Create tenant error:", error);
      callback(error);
    }
  }

  async getTenantConfig(call: any, callback: any) {
    try {
      const { tenant_id } = call.request;

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

  private async createTenantCollections(tenantId: string) {
    // Create indexes for tenant-specific queries
    await this.db
      .collection("stream_data")
      .createIndex({ tenantId: 1, timestamp: -1 });
    await this.db
      .collection("strategy_results")
      .createIndex({ tenantId: 1, timestamp: -1 });
    await this.db
      .collection("audit_logs")
      .createIndex({ tenantId: 1, timestamp: -1 });
  }
}

async function startServer() {
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017"
  );
  await client.connect();
  const db = client.db("stratosmesh");

  const packageDefinition = protoLoader.loadSync(
    "../../../shared/proto/analytics.proto"
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

  const port = process.env.PORT || "50054";
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error("Failed to start server:", err);
        return;
      }
      logger.info(`Tenant manager service running on port ${port}`);
      server.start();
    }
  );
}

startServer().catch(console.error);
