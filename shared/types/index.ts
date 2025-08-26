// shared/types/index.ts

// Universal Data Interfaces
export interface StreamData {
  tenantId: string;
  streamId: string;
  dataType: string; // Flexible string instead of enum
  payload: any; // Any structure
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface UniversalDataInput {
  type: "file" | "text" | "url" | "structured";
  content: any;
  filename?: string;
  mimetype?: string;
  description?: string;
  desiredFormat?: string;
}

// Tenant Management
export interface TenantContext {
  tenantId: string;
  limits: TenantLimits;
  permissions: string[];
  metadata: Record<string, any>;
}

export interface TenantLimits {
  maxConcurrentStreams: number;
  maxStrategiesPerHour: number;
  maxStorageMb: number;
  rateLimitPerMinute: number;
}

// Auth Types
export interface AuthRequest {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface TokenValidationRequest {
  token: string;
  required_scopes?: string[];
}

export interface TokenValidationResponse {
  valid: boolean;
  tenant_id: string;
  scopes: string[];
  expires_at: { seconds: number };
}

export interface RefreshTokenRequest {
  refresh_token: string;
  tenant_id?: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// Strategy Engine Types
export interface AnalysisResult {
  resultId: string;
  type:
    | "PREDICTION"
    | "ANOMALY"
    | "RECOMMENDATION"
    | "CLASSIFICATION"
    | "AGGREGATION"
    | "INSIGHT"
    | "TRANSFORMATION";
  data: any;
  confidence: number;
  metrics: Record<string, number>;
}

export interface StrategyPlugin {
  id: string;
  name: string;
  version: string;
  execute(data: any[], config: any): Promise<AnalysisResult>;
  validate(config: any): { valid: boolean; errors: string[] };
  backtest?(historicalData: any[], config: any): Promise<any>;
}

export interface StrategyPlugin1 {
  id: string;
  name: string;
  version: string;
  execute(data: any[], config: any): Promise<AnalysisResult>;
  validate(config: any): boolean;
}

// Worker Types
export interface WorkerMessage {
  type: "EXECUTE_STRATEGY" | "PROCESS_STREAM" | "ANALYZE_DATA";
  tenantId: string;
  payload: any;
  correlationId: string;
}

export interface WorkerResponse {
  success: boolean;
  result?: any;
  error?: string;
  correlationId: string;
}

// LLM Processing Types
export interface LLMProcessingResult {
  detectedType: string;
  records: ProcessedRecord[];
  schema: DataSchema;
  confidence: number;
  processingSteps: string[];
}

export interface ProcessedRecord {
  timestamp: Date;
  payload: any;
  metadata: Record<string, any>;
}

export interface DataSchema {
  timestampField: string | null;
  valueFields: string[];
  categoryFields: string[];
  fieldTypes?: Record<string, string>;
  requiredFields?: string[];
}

// Notification Types
export interface NotificationMessage {
  tenantId: string;
  type: "STRATEGY_RESULT" | "STREAM_PROCESSED" | "ALERT" | "SYSTEM_STATUS";
  payload: any;
  correlationId?: string;
  timestamp?: string;
}

// Metrics Types
export interface MetricValue {
  value: number;
  unit: string;
  timestamp?: Date;
}

export interface TenantUsage {
  streamsProcessed: number;
  strategiesExecuted: number;
  cpuUsage: number;
  memoryUsage: number;
  storageUsed: number;
}

// API Request/Response Types
export interface UniversalDataRequest {
  stream_id: string;
  data_description?: string;
  desired_format?: string;
  // One of these will be present:
  file?: Buffer;
  text?: string;
  url?: string;
  data?: any;
}

export interface UniversalDataResponse {
  success: boolean;
  message: string;
  stream_id: string;
  llm_analysis: {
    detected_type: string;
    confidence: number;
    records_found: number;
    processing_steps: string[];
  };
  stream_result: {
    success: boolean;
    records_processed: number;
    detected_type: string;
    confidence: number;
  };
  timestamp: string;
}

// Error Types
export class StratosmeshError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "StratosmeshError";
  }
}

export class ValidationError extends StratosmeshError {
  constructor(message: string, details?: any) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends StratosmeshError {
  constructor(message: string = "Authentication failed") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends StratosmeshError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_ERROR", 429);
    this.name = "RateLimitError";
  }
}

// Legacy Types (keep for backward compatibility)
export enum DataType {
  MARKET_DATA = "MARKET_DATA",
  IOT_SENSOR = "IOT_SENSOR",
  ECOMMERCE_EVENT = "ECOMMERCE_EVENT",
  LOG_EVENT = "LOG_EVENT",
  CUSTOM = "CUSTOM",
}

export enum ResultType {
  PREDICTION = "PREDICTION",
  ANOMALY = "ANOMALY",
  RECOMMENDATION = "RECOMMENDATION",
  CLASSIFICATION = "CLASSIFICATION",
  AGGREGATION = "AGGREGATION",
  INSIGHT = "INSIGHT",
  TRANSFORMATION = "TRANSFORMATION",
}

export enum AlertLevel {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

export enum ExecutionStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum TenantStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  INACTIVE = "INACTIVE",
}

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

// Configuration Types
export interface ServiceConfig {
  port: number;
  mongoUri: string;
  rabbitMqUri: string;
  jwtSecret: string;
  geminiApiKey?: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  options?: Record<string, any>;
}
