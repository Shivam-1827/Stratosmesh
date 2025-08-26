
const { parentPort } = require("worker_threads");
const { MongoClient } = require("mongodb");

let db;

// Initialize MongoDB connection in worker
MongoClient.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017"
).then((client) => {
  db = client.db("stratosmesh");
  console.log("Worker connected to MongoDB");
});

//
const strategies = {
  moving_average: async (data, config) => {
    const period = config.period || 20;
    const values = data.map((d) => d.payload.price).slice(-period);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;

    return {
      resultId: `ma_${Date.now()}`,
      type: "PREDICTION",
      data: { movingAverage: average, period },
      confidence: 0.8,
      metrics: { calculation_time: Date.now() },
    };
  },

  anomaly_detection: async (data, config) => {
    const threshold = config.threshold || 2;
    const values = data.map((d) => d.payload.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length
    );

    const latestValue = values[values.length - 1];
    const isAnomaly = Math.abs(latestValue - mean) > threshold * stdDev;

    return {
      resultId: `anomaly_${Date.now()}`,
      type: "ANOMALY",
      data: {
        isAnomaly,
        value: latestValue,
        mean,
        stdDev,
        threshold: threshold * stdDev,
      },
      confidence: isAnomaly ? 0.9 : 0.3,
      metrics: { mean, std_dev: stdDev },
    };
  },
};

parentPort.on("message", async (message) => {
  try {
    const { type, tenantId, payload, correlationId } = message;

    if (type === "EXECUTE_STRATEGY") {
      const { strategyId, config, historicalData } = payload;

      // Get historical data if not provided
      let data = historicalData;
      if (!data || data.length === 0) {
        const cursor = db
          .collection("stream_data")
          .find({ tenantId })
          .sort({ timestamp: -1 })
          .limit(100);
        data = await cursor.toArray();
      }

      // Execute strategy
      const strategy = strategies[strategyId];
      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      const result = await strategy(data, config);

      parentPort.postMessage({
        success: true,
        result,
        correlationId,
      });
    } else if (type === "PROCESS_STREAM") {
      // Process individual stream data
      const streamData = payload;

      // Apply all enabled strategies for this tenant
      const tenant = await db.collection("tenants").findOne({ tenantId });
      const enabledStrategies = tenant.enabledStrategies || ["moving_average"];

      const results = [];
      for (const strategyId of enabledStrategies) {
        const strategy = strategies[strategyId];
        if (strategy) {
          const result = await strategy(
            [streamData],
            tenant.strategyConfigs?.[strategyId] || {}
          );
          results.push(result);
        }
      }

      parentPort.postMessage({
        success: true,
        result: results,
        correlationId,
      });
    }
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
      correlationId: message.correlationId,
    });
  }
});