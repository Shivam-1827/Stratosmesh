// services/llm-processor/src/processor.ts - ENHANCED ERROR HANDLING
import { GoogleGenerativeAI } from "@google/generative-ai";
import pdf from "pdf-parse";
import * as XLSX from "xlsx";
import csv from "csv-parser";
import axios from "axios";
import { Readable } from "stream";
import dotenv from "dotenv";
import { Logger } from "../../../shared/utils/logger";

const logger = new Logger("llm-processor");

dotenv.config();
export interface UniversalInput {
  type: "file" | "text" | "url" | "structured";
  content: any;
  filename?: string;
  mimetype?: string;
}

interface ProcessedData {
  detectedType: string;
  records: any[];
  schema: any;
  confidence: number;
  processingSteps: string[];
}

export class LLMDataProcessor {
  private geminiModel: any;
  private geminiAvailable: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "") {
      logger.warn("⚠️ GEMINI_API_KEY not found - using fallback analysis only");
      this.geminiAvailable = false;
    } else {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        this.geminiModel = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
        });
        this.geminiAvailable = true;
        logger.info("✅ Gemini AI initialized successfully");
      } catch (error) {
        logger.error("Failed to initialize Gemini AI:", error);
        this.geminiAvailable = false;
      }
    }
  }

  async processData(input: {
    tenantId: string;
    streamId: string;
    inputData: UniversalInput;
    description: string;
    desiredFormat: string;
  }): Promise<ProcessedData> {
    const { inputData, description, desiredFormat } = input;
    let rawContent: string;
    let processingSteps: string[] = [];

    try {
      // Step 1: Extract content based on input type
      switch (inputData.type) {
        case "file":
          rawContent = await this.extractFromFile(inputData);
          processingSteps.push(
            `Extracted content from ${inputData.mimetype} file`
          );
          break;

        case "url":
          rawContent = await this.extractFromUrl(inputData.content);
          processingSteps.push(`Downloaded and extracted content from URL`);
          break;

        case "text":
          rawContent = inputData.content;
          processingSteps.push("Processing raw text input");
          break;

        case "structured":
          return this.handleStructuredData(inputData.content, processingSteps);

        default:
          throw new Error("Unsupported input type");
      }

      // Step 2: Analyze content (with or without Gemini)
      const analysisResult = await this.analyzeContent(
        rawContent,
        description,
        desiredFormat
      );

      if (this.geminiAvailable) {
        processingSteps.push("Analyzed content structure with Gemini AI");
      } else {
        processingSteps.push("Analyzed content structure with fallback logic");
      }

      // Step 3: Extract structured data based on analysis
      const structuredData = await this.extractStructuredData(
        rawContent,
        analysisResult
      );
      processingSteps.push(`Extracted ${structuredData.length} records`);

      // Step 4: Convert to time series format for analytics
      const timeSeriesData = await this.convertToTimeSeries(
        structuredData,
        analysisResult
      );
      processingSteps.push("Converted to time series format");

      return {
        detectedType: analysisResult.dataType,
        records: timeSeriesData,
        schema: analysisResult.schema,
        confidence: analysisResult.confidence,
        processingSteps,
      };
    } catch (error) {
      logger.error("LLM processing error:", error);
      const err = error as Error;
      let rawContent: string = "";

      // Return fallback result
      return {
        detectedType: "unknown_data",
        records: [
          {
            timestamp: new Date(),
            payload: { raw_content: rawContent || inputData.content },
            metadata: { processing_error: err.message },
          },
        ],
        schema: {
          timestampField: "timestamp",
          valueFields: [],
          categoryFields: [],
        },
        confidence: 0.3,
        processingSteps: [...processingSteps, `Error: ${err.message}`],
      };
    }
  }

  // ✅ NEW: Unified analysis method that handles both Gemini and fallback
  private async analyzeContent(
    content: string,
    description: string,
    desiredFormat: string
  ): Promise<any> {
    if (this.geminiAvailable) {
      try {
        logger.info("Attempting Gemini analysis...");
        return await this.analyzeWithGemini(
          content,
          description,
          desiredFormat
        );
      } catch (error) {
        logger.warn("Gemini analysis failed, using fallback:", error);
        return this.fallbackAnalysis(content, description);
      }
    } else {
      logger.info("Using fallback analysis (Gemini not available)");
      return this.fallbackAnalysis(content, description);
    }
  }

  private async extractFromFile(inputData: UniversalInput): Promise<string> {
    const { content, mimetype } = inputData;

    if (!mimetype) {
      return content.toString("utf-8");
    }

    switch (mimetype) {
      case "application/pdf":
        const pdfData = await pdf(content);
        return pdfData.text;

      case "text/csv":
        return content.toString("utf-8");

      case "application/vnd.ms-excel":
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        const workbook = XLSX.read(content, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_csv(worksheet);

      case "application/json":
        return content.toString("utf-8");

      case "text/plain":
      default:
        return content.toString("utf-8");
    }
  }

  private async extractFromUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024, // 50MB
      });

      const contentType = response.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        return JSON.stringify(response.data, null, 2);
      } else if (contentType.includes("text/csv")) {
        return response.data;
      } else {
        return response.data.toString();
      }
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to fetch URL: ${err.message}`);
    }
  }

  private async analyzeWithGemini(
    content: string,
    description: string,
    desiredFormat: string
  ): Promise<any> {
    const prompt = `
Analyze the following data and provide a JSON response with this exact structure.
IMPORTANT: Respond ONLY with valid JSON, no markdown formatting or backticks.

{
  "dataType": "string (e.g., 'financial_data', 'sensor_data', 'sales_data', 'log_data', etc.)",
  "confidence": number (0-1),
  "schema": {
    "timestampField": "field name for timestamp/date or null",
    "valueFields": ["array", "of", "numeric", "field", "names"],
    "categoryFields": ["array", "of", "categorical", "field", "names"]
  },
  "extractionMethod": "csv|json|logs|structured_text",
  "suggestedAnalytics": ["array", "of", "recommended", "strategies"]
}

Data Description: ${description}
Desired Output Format: ${desiredFormat}

Data Sample (first 2000 characters):
${content.substring(0, 2000)}

Analyze this data and determine:
1. What type of business/technical data this represents
2. How to extract time-series information
3. Which fields contain numerical values suitable for analysis
4. Which fields represent time/dates
5. Best method to parse this data format

Respond with ONLY the JSON object, no additional text or formatting.
`;

    try {
      const result = await this.geminiModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      logger.info("Raw Gemini response length:", text.length);

      // ✅ Enhanced JSON extraction
      let jsonText = text;

      // Remove markdown formatting if present
      if (text.includes("```json")) {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonText = match[1].trim();
        }
      } else if (text.includes("```")) {
        const match = text.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonText = match[1].trim();
        }
      }

      // Find JSON object in text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      logger.info("Extracted JSON text length:", jsonText.length);

      try {
        const parsed = JSON.parse(jsonText);
        logger.info("✅ Successfully parsed Gemini response");
        return {
          ...parsed,
          confidence: Math.min(Math.max(parsed.confidence || 0.5, 0.1), 1.0),
        };
      } catch (parseError) {
        logger.error("JSON parsing failed:", parseError);
        logger.error("Failed JSON text preview:", jsonText.substring(0, 200));
        throw new Error(`JSON parsing failed: ${parseError}`);
      }
    } catch (error) {
      logger.error("Gemini API error:", error);
      throw error; // Let caller handle fallback
    }
  }

  private async extractStructuredData(
    content: string,
    analysis: any
  ): Promise<any[]> {
    const { extractionMethod } = analysis;

    try {
      switch (extractionMethod) {
        case "json":
          return this.parseJSON(content);
        case "csv":
          return this.parseCSV(content);
        case "logs":
          return this.parseLogs(content);
        default:
          return this.parseStructuredText(content);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn("Structured extraction failed, using fallback:", err.message);
      return this.parseAsFallback(content);
    }
  }

  private parseJSON(content: string): any[] {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data;
    } else if (typeof data === "object") {
      return [data];
    }
    return [{ content: data }];
  }

  private async parseCSV(content: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = Readable.from(content);

      stream
        .pipe(csv())
        .on("data", (data: any) => results.push(data))
        .on("end", () => resolve(results))
        .on("error", reject);
    });
  }

  private parseLogs(content: string): any[] {
    const lines = content.split("\n").filter((line) => line.trim());
    return lines.map((line, index) => {
      // Try to extract timestamp from common log formats
      const timestampMatch = line.match(
        /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/
      );
      const timestamp = timestampMatch
        ? new Date(timestampMatch[1])
        : new Date();

      return {
        line_number: index + 1,
        timestamp: timestamp,
        message: line,
        raw_line: line,
      };
    });
  }

  private parseStructuredText(content: string): any[] {
    const lines = content.split("\n").filter((line) => line.trim());
    return lines.map((line, index) => ({
      line_number: index + 1,
      content: line,
      timestamp: new Date(Date.now() - (lines.length - index) * 1000), // Sequential timestamps
    }));
  }

  private parseAsFallback(content: string): any[] {
    return [
      {
        timestamp: new Date(),
        content: content,
        raw_data: content,
      },
    ];
  }

  private async convertToTimeSeries(
    data: any[],
    analysis: any
  ): Promise<any[]> {
    const { schema } = analysis;

    return data.map((record, index) => {
      // Extract timestamp
      let timestamp = new Date();
      if (schema.timestampField && record[schema.timestampField]) {
        timestamp = new Date(record[schema.timestampField]);
      } else if (record.timestamp) {
        timestamp = new Date(record.timestamp);
      } else {
        // Generate sequential timestamps if no timestamp field
        timestamp = new Date(Date.now() - (data.length - index) * 60000); // 1 minute intervals
      }

      // Extract numeric values
      const values: any = {};
      if (schema.valueFields && schema.valueFields.length > 0) {
        schema.valueFields.forEach((field: string) => {
          const value = parseFloat(record[field]);
          if (!isNaN(value)) {
            values[field] = value;
          }
        });
      } else {
        // Auto-detect numeric fields
        Object.entries(record).forEach(([key, value]) => {
          const numValue = parseFloat(value as string);
          if (
            !isNaN(numValue) &&
            key !== "timestamp" &&
            key !== "line_number"
          ) {
            values[key] = numValue;
          }
        });
      }

      // If no numeric values found, create a default value
      if (Object.keys(values).length === 0) {
        values.value = 1; // Default value for counting/aggregation
      }

      return {
        timestamp,
        payload: {
          ...values,
          ...record, // Include original data
        },
        metadata: {
          source: "llm_processed",
          original_format: typeof record,
          processing_time: new Date().toISOString(),
          confidence: analysis.confidence,
        },
      };
    });
  }

  // ✅ ENHANCED: Much better fallback analysis
  private fallbackAnalysis(content: string, description: string): any {
    logger.info("Using enhanced fallback analysis");

    let dataType = "generic_data";
    let extractionMethod = "structured_text";
    let confidence = 0.6; // Higher confidence for rule-based detection
    let timestampField = null;
    let valueFields: string[] = [];
    let categoryFields: string[] = [];

    // Enhanced detection logic
    const lines = content.split("\n").filter((line) => line.trim());
    const firstLine = lines[0] || "";
    const sampleLines = lines.slice(0, 5);

    // CSV detection
    if (firstLine.includes(",") && lines.length > 1) {
      extractionMethod = "csv";
      dataType = "tabular_data";
      confidence = 0.8;

      // Try to parse CSV headers
      const headers = firstLine
        .split(",")
        .map((h) => h.trim().replace(/['"]/g, ""));

      headers.forEach((header) => {
        const lowerHeader = header.toLowerCase();
        if (
          lowerHeader.includes("date") ||
          lowerHeader.includes("time") ||
          lowerHeader.includes("timestamp")
        ) {
          timestampField = header;
        } else if (
          lowerHeader.includes("price") ||
          lowerHeader.includes("value") ||
          lowerHeader.includes("amount") ||
          lowerHeader.includes("quantity") ||
          lowerHeader.includes("count")
        ) {
          valueFields.push(header);
        } else {
          categoryFields.push(header);
        }
      });

      // Further classify based on content
      if (
        description.toLowerCase().includes("stock") ||
        description.toLowerCase().includes("trading") ||
        firstLine.toLowerCase().includes("price") ||
        firstLine.toLowerCase().includes("buy") ||
        firstLine.toLowerCase().includes("sell")
      ) {
        dataType = "financial_data";
        confidence = 0.9;
      } else if (
        description.toLowerCase().includes("sensor") ||
        description.toLowerCase().includes("iot")
      ) {
        dataType = "sensor_data";
        confidence = 0.85;
      } else if (
        description.toLowerCase().includes("sales") ||
        description.toLowerCase().includes("revenue")
      ) {
        dataType = "sales_data";
        confidence = 0.85;
      }
    }
    // JSON detection
    else if (
      (content.trim().startsWith("{") && content.trim().endsWith("}")) ||
      (content.trim().startsWith("[") && content.trim().endsWith("]"))
    ) {
      dataType = "structured_data";
      extractionMethod = "json";
      confidence = 0.9;
    }
    // Log detection
    else if (
      sampleLines.some(
        (line) =>
          /\d{4}-\d{2}-\d{2}/.test(line) || /\d{2}:\d{2}:\d{2}/.test(line)
      )
    ) {
      dataType = "log_data";
      extractionMethod = "logs";
      confidence = 0.75;
      timestampField = "timestamp";
      valueFields = ["value"];
    }
    // Time series detection
    else if (/\d{4}-\d{2}-\d{2}/.test(content) && /[\d.]+/.test(content)) {
      dataType = "time_series_data";
      confidence = 0.8;
      timestampField = "timestamp";
      valueFields = ["value"];
    }

    // Default fallbacks if nothing detected
    if (valueFields.length === 0) {
      valueFields = ["value"];
    }

    const suggestedAnalytics = this.getSuggestedAnalytics(dataType);

    logger.info(
      `Fallback analysis result: ${dataType} (confidence: ${confidence})`
    );

    return {
      dataType,
      confidence,
      schema: {
        timestampField,
        valueFields,
        categoryFields,
      },
      extractionMethod,
      suggestedAnalytics,
    };
  }

  private getSuggestedAnalytics(dataType: string): string[] {
    const analyticsMap: Record<string, string[]> = {
      financial_data: [
        "moving_average",
        "anomaly_detection",
        "arima_prediction",
        "trend_analysis",
      ],
      sensor_data: ["anomaly_detection", "moving_average", "threshold_alerts"],
      sales_data: [
        "trend_analysis",
        "seasonal_decomposition",
        "growth_analysis",
      ],
      log_data: [
        "anomaly_detection",
        "pattern_recognition",
        "frequency_analysis",
      ],
      time_series_data: [
        "arima_prediction",
        "moving_average",
        "seasonal_analysis",
      ],
      tabular_data: ["moving_average", "anomaly_detection"],
      structured_data: ["aggregation", "classification"],
      generic_data: ["moving_average", "anomaly_detection"],
    };

    return analyticsMap[dataType] || ["moving_average", "anomaly_detection"];
  }

  private handleStructuredData(
    data: any,
    processingSteps: string[]
  ): ProcessedData {
    processingSteps.push("Processing pre-structured data");

    const records = Array.isArray(data) ? data : [data];

    return {
      detectedType: "structured_data",
      records: records.map((record) => ({
        timestamp: new Date(),
        payload: record,
        metadata: {
          source: "structured_input",
          processing_time: new Date().toISOString(),
        },
      })),
      schema: this.inferSchema(records),
      confidence: 1.0,
      processingSteps,
    };
  }

  private inferSchema(data: any[]): any {
    if (data.length === 0)
      return { timestampField: null, valueFields: [], categoryFields: [] };

    const sample = data[0];
    const schema = {
      timestampField: null as string | null,
      valueFields: [] as string[],
      categoryFields: [] as string[],
    };

    Object.entries(sample).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("time") ||
        lowerKey.includes("date") ||
        lowerKey.includes("timestamp")
      ) {
        schema.timestampField = key;
      } else if (typeof value === "number") {
        schema.valueFields.push(key);
      } else if (typeof value === "string") {
        schema.categoryFields.push(key);
      }
    });

    return schema;
  }
}
