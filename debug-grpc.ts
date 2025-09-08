// debug-grpc.ts - Run this to debug your gRPC services
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

async function debugGrpcServices() {
  console.log("🔍 Debugging gRPC Services...\n");

  const protoPath = path.join(__dirname, "shared/proto/analytics.proto");
  console.log("📄 Proto file path:", protoPath);

  try {
    // Load with keepCase: true (same as your services)
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
    console.log("✅ Proto loaded successfully");

    // Check EnhancedStreamService
    console.log("\n🔍 Checking EnhancedStreamService:");
    const streamService = proto.stratosmesh.analytics.EnhancedStreamService;

    if (streamService) {
      console.log("✅ EnhancedStreamService found");
      console.log("📋 Service definition:", streamService.service);

      if (streamService.service) {
        console.log("🔧 Available methods:");
        Object.keys(streamService.service).forEach((method) => {
          console.log(`  - ${method}`);
        });

        // Check for processLLMData specifically
        if (streamService.service.processLLMData) {
          console.log("✅ processLLMData method found in service definition");
        } else if (streamService.service.ProcessLLMData) {
          console.log(
            "✅ ProcessLLMData method found in service definition (PascalCase)"
          );
        } else {
          console.log(
            "❌ processLLMData method NOT found in service definition"
          );
          console.log(
            "Available methods are:",
            Object.keys(streamService.service)
          );
        }
      } else {
        console.log("❌ No service definition found");
      }
    } else {
      console.log("❌ EnhancedStreamService not found");
    }

    // Test connection to stream service
    console.log("\n🔗 Testing connection to Stream service...");
    const client = new streamService(
      "localhost:50052",
      grpc.credentials.createInsecure()
    );

    // Check available methods on client
    console.log("🔧 Client methods:");
    if (client.$method_names) {
      Object.keys(client.$method_names).forEach((method) => {
        console.log(`  - ${method}`);
      });
    } else {
      console.log("No $method_names found on client");
    }

    // Test client readiness
    client.waitForReady(Date.now() + 5000, (error: any) => {
      if (error) {
        console.log("❌ Failed to connect to Stream service:", error.message);
      } else {
        console.log("✅ Connected to Stream service successfully");

        // Test if processLLMData method is callable
        if (client.processLLMData) {
          console.log("✅ processLLMData method is available on client");
        } else if (client.ProcessLLMData) {
          console.log(
            "✅ ProcessLLMData method is available on client (PascalCase)"
          );
        } else {
          console.log("❌ processLLMData method is NOT available on client");
        }
      }
      client.close();
    });
  } catch (error) {
    console.error("❌ Error loading proto or connecting:", error);
  }
}

// Run the debug script
debugGrpcServices().catch(console.error);
