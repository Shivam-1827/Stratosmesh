// workers/strategies/arima-strategy.ts
import { AnalysisResult, StrategyPlugin } from "../../shared/types";
// import { ARIMA } from "arima";
const ARIMA = require("arima");
import { mean, standardDeviation, min, max } from "simple-statistics";

interface ARIMAConfig {
  p: number; // Auto-regressive order
  d: number; // Differencing degree
  q: number; // Moving average order
  steps: number; // Prediction steps ahead
  minDataPoints: number;
}

export class ARIMAStrategy implements StrategyPlugin {
  id = "arima_prediction";
  name = "ARIMA Time Series Prediction";
  version = "2.0.0";
  requiredDataPoints = 100;

  parameters = [
    {
      name: "p",
      type: "integer",
      required: false,
      min: 0,
      max: 5,
      default: 2,
      description:
        "Auto-regressive order (AR) - how many previous values to use",
    },
    {
      name: "d",
      type: "integer",
      required: false,
      min: 0,
      max: 2,
      default: 1,
      description: "Differencing degree (I) - make series stationary",
    },
    {
      name: "q",
      type: "integer",
      required: false,
      min: 0,
      max: 5,
      default: 2,
      description: "Moving average order (MA) - forecast error terms",
    },
    {
      name: "steps",
      type: "integer",
      required: false,
      min: 1,
      max: 10,
      default: 5,
      description: "Number of future steps to predict",
    },
  ];

  validate(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.p < 0 || config.p > 5) errors.push("p must be between 0 and 5");
    if (config.d < 0 || config.d > 2) errors.push("d must be between 0 and 2");
    if (config.q < 0 || config.q > 5) errors.push("q must be between 0 and 5");
    if (config.steps < 1 || config.steps > 10)
      errors.push("steps must be between 1 and 10");

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async execute(data: any[], config: ARIMAConfig): Promise<AnalysisResult> {
    const { p = 2, d = 1, q = 2, steps = 5 } = config;

    try {
      // Extract price series
      const prices = data.map((d) =>
        parseFloat(d.payload?.price || d.value || d)
      );

      if (prices.length < this.requiredDataPoints) {
        throw new Error(
          `ARIMA requires at least ${this.requiredDataPoints} data points`
        );
      }

      // Prepare time series data
      const timeSeries = this.prepareTimeSeries(prices);

      // Check stationarity and apply differencing if needed
      const stationaryData = this.makeStationary(timeSeries, d);

      // Fit ARIMA model
      const arimaModel = new ARIMA({
        p: p,
        d: d,
        q: q,
        method: 1, // Maximum likelihood estimation
        optimizer: 6, // BFGS optimizer
        transpose: false,
      });

      // Train the model
      await arimaModel.train(stationaryData);

      // Generate predictions
      const predictions = arimaModel.predict(steps);
      const forecast = this.transformPredictions(predictions, prices, d);

      // Calculate confidence intervals
      const confidence = this.calculateConfidenceInterval(predictions, 0.95);

      // Generate trading signal
      const signal = this.generateTradingSignal(prices, forecast, confidence);

      // Calculate model accuracy metrics
      const accuracy = await this.calculateModelAccuracy(arimaModel, prices);

      return {
        resultId: `arima_${Date.now()}`,
        type: "PREDICTION",
        data: {
          currentPrice: prices[prices.length - 1],
          predictions: forecast,
          confidenceInterval: confidence,
          signal: signal,
          modelParams: { p, d, q },
          accuracy: accuracy,
          horizon: steps,
          stationarity: this.testStationarity(prices),
        },
        confidence: accuracy.mape > 0.85 ? 0.9 : 0.7, // Convert MAPE to confidence
        metrics: {
          mape: accuracy.mape,
          rmse: accuracy.rmse,
          aic: arimaModel.aic || 0,
          bic: arimaModel.bic || 0,
          logLikelihood: arimaModel.loglik || 0,
        },
      };
    } catch (error: unknown) {
        const err = error as Error;
      console.error("ARIMA Strategy Error:", error);
      throw new Error(`ARIMA execution failed: ${err.message}`);
    }
  }

  private prepareTimeSeries(prices: number[]): number[] {
    // Remove any NaN or infinite values
    return prices.filter((price) => !isNaN(price) && isFinite(price));
  }

  private makeStationary(data: number[], d: number): number[] {
    let result = [...data];

    for (let i = 0; i < d; i++) {
      result = this.difference(result);
    }

    return result;
  }

  private difference(data: number[]): number[] {
    const diff: number[] = [];
    for (let i = 1; i < data.length; i++) {
      diff.push(data[i] - data[i - 1]);
    }
    return diff;
  }

  private transformPredictions(
    predictions: number[],
    originalPrices: number[],
    d: number
  ): number[] {
    // Reverse differencing to get actual price predictions
    let result = [...predictions];

    for (let i = 0; i < d; i++) {
      result = this.integrateDifferences(result, originalPrices);
    }

    return result;
  }

  private integrateDifferences(
    diffs: number[],
    originalPrices: number[]
  ): number[] {
    const integrated: number[] = [];
    let lastValue = originalPrices[originalPrices.length - 1];

    for (let i = 0; i < diffs.length; i++) {
      lastValue += diffs[i];
      integrated.push(lastValue);
    }

    return integrated;
  }

  private calculateConfidenceInterval(
    predictions: number[],
    level: number
  ): { upper: number[]; lower: number[] } {
    const z = level === 0.95 ? 1.96 : 1.645; // Z-score for confidence level
    const std = standardDeviation(predictions);

    return {
      upper: predictions.map((pred) => pred + z * std),
      lower: predictions.map((pred) => pred - z * std),
    };
  }

  private generateTradingSignal(
    prices: number[],
    forecast: number[],
    confidence: { upper: number[]; lower: number[] }
  ): { action: string; strength: number; reason: string } {
    const currentPrice = prices[prices.length - 1];
    const nextPrediction = forecast[0];
    const predictionChange =
      ((nextPrediction - currentPrice) / currentPrice) * 100;

    // Calculate signal strength based on confidence interval width
    const confidenceWidth = confidence.upper[0] - confidence.lower[0];
    const strength = Math.max(
      0,
      Math.min(1, 1 - confidenceWidth / currentPrice)
    );

    let action: string;
    let reason: string;

    if (predictionChange > 2) {
      action = "BUY";
      reason = `ARIMA predicts ${predictionChange.toFixed(2)}% price increase`;
    } else if (predictionChange < -2) {
      action = "SELL";
      reason = `ARIMA predicts ${Math.abs(predictionChange).toFixed(
        2
      )}% price decrease`;
    } else {
      action = "HOLD";
      reason = `ARIMA predicts minimal price movement (${predictionChange.toFixed(
        2
      )}%)`;
    }

    return { action, strength, reason };
  }

  private async calculateModelAccuracy(
    model: any,
    actualPrices: number[]
  ): Promise<{
    mape: number;
    rmse: number;
    mae: number;
  }> {
    // Use last 20% of data for backtesting
    const testSize = Math.floor(actualPrices.length * 0.2);
    const trainSize = actualPrices.length - testSize;

    const trainData = actualPrices.slice(0, trainSize);
    const testData = actualPrices.slice(trainSize);

    try {
      // Generate predictions for test period
      const predictions = model.predict(testSize);

      // Calculate accuracy metrics
      const errors = testData.map(
        (actual, i) => actual - (predictions[i] || actual)
      );
      const absoluteErrors = errors.map((e) => Math.abs(e));
      const percentageErrors = testData.map(
        (actual, i) =>
          Math.abs((actual - (predictions[i] || actual)) / actual) * 100
      );

      const mape = mean(percentageErrors) / 100; // Convert to decimal
      const rmse = Math.sqrt(mean(errors.map((e) => e * e)));
      const mae = mean(absoluteErrors);

      return { mape: 1 - mape, rmse, mae }; // Convert MAPE to accuracy (1 - error)
    } catch (error) {
      return { mape: 0.5, rmse: 0, mae: 0 }; // Default values if backtesting fails
    }
  }

  private testStationarity(data: number[]): {
    isStationary: boolean;
    pValue: number;
  } {
    // Simplified stationarity test (Augmented Dickey-Fuller would be better)
    const mean1 = mean(data.slice(0, Math.floor(data.length / 2)));
    const mean2 = mean(data.slice(Math.floor(data.length / 2)));
    const std1 = standardDeviation(data.slice(0, Math.floor(data.length / 2)));
    const std2 = standardDeviation(data.slice(Math.floor(data.length / 2)));

    const meanDiff = Math.abs(mean1 - mean2);
    const stdDiff = Math.abs(std1 - std2);

    // Simple heuristic for stationarity
    const isStationary = meanDiff < std1 * 0.1 && stdDiff < std1 * 0.1;
    const pValue = meanDiff / std1; // Simplified p-value approximation

    return { isStationary, pValue };
  }

  async backtest(historicalData: any[], config: ARIMAConfig): Promise<any> {
    const results = [];
    const windowSize = 100;
    const { steps = 5 } = config;

    for (let i = windowSize; i < historicalData.length - steps; i += steps) {
      const trainData = historicalData.slice(i - windowSize, i);
      const actualFuture = historicalData.slice(i, i + steps);

      try {
        const prediction = await this.execute(trainData, config);
        const predicted = prediction.data.predictions[0];
        const actual =
          actualFuture[0]?.payload?.price || actualFuture[0]?.value;

        results.push({
          timestamp: historicalData[i].timestamp,
          predicted,
          actual,
          accuracy: 1 - Math.abs(predicted - actual) / actual,
          signal: prediction.data.signal,
        });
      } catch (error) {
        const err = error as Error;
        console.warn("Backtest step failed:", err.message);
      }
    }

    return {
      strategyId: this.id,
      config,
      totalPredictions: results.length,
      averageAccuracy: mean(results.map((r) => r.accuracy)),
      results,
    };
  }
}
