// shared/types/index.ts
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

export interface StreamProcessor {
  processStream(data: StreamData): Promise<AnalysisResult>;
  validateData(data: StreamData): boolean;
}

export interface StrategyPlugin1 {
  id: string;
  name: string;
  version: string;
  execute(data: any[], config: any): Promise<AnalysisResult>;
  validate(config: any): boolean;
}

export interface StrategyPlugin {
  id: string;
  name: string;
  version: string;
  requiredDataPoints: number;

  parameters: any[];

  // Change here
  validate(config: any): { valid: boolean; errors: string[] };

  execute(data: any[], config: any): Promise<AnalysisResult>;
  backtest?(historicalData: any[], config: any): Promise<any>;
}

export interface StreamData {
  tenantId: string;
  streamId: string;
  dataType: string;
  payload: any;
  timestamp: Date;
  metadata: Record<string, string>;
}

export interface AnalysisResult {
  resultId: string;
  type: string;
  data: any;
  confidence: number;
  metrics: Record<string, number>;
}

export interface WorkerMessage {
  type: "EXECUTE_STRATEGY" | "PROCESS_STREAM" | "HEALTH_CHECK";
  tenantId: string;
  payload: any;
  correlationId: string;
}

export interface QueueConfig {
  exchange: string;
  routingKey: string;
  durable: boolean;
  autoDelete: boolean;
}

// MISSING: AuthService interface
export interface AuthService {
  authenticate(call: any, callback: any): Promise<void>;
  validateToken(call: any, callback: any): Promise<void>;
  refreshToken(call: any, callback: any): Promise<void>;
}

// MISSING: TenantService interface
export interface TenantService {
  createTenant(call: any, callback: any): Promise<void>;
  getTenantConfig(call: any, callback: any): Promise<void>;
  updateTenantLimits(call: any, callback: any): Promise<void>;
}

// MISSING: DataStreamService interface
export interface DataStreamService {
  processRealTimeStream(call: any): Promise<void>;
  getTenantMetrics(call: any, callback: any): Promise<void>;
  executeStrategy(call: any, callback: any): Promise<void>;
}

// MISSING: Auth-related types
export interface AuthRequest {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface TokenValidationRequest {
  token: string;
  required_scopes: string[];
}

export interface TokenValidationResponse {
  valid: boolean;
  tenant_id: string;
  scopes: string[];
  expires_at: { seconds: number };
}

export interface RefreshTokenRequest {
  refresh_token: string;
  tenant_id: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// MISSING: Tenant-related types
export interface CreateTenantRequest {
  name: string;
  email: string;
  limits: TenantLimits;
  allowed_strategies: string[];
}

export interface TenantResponse {
  tenant_id: string;
  name: string;
  status: TenantStatus;
  limits: TenantLimits;
  created_at: { seconds: number };
  client_credentials?: {
    client_id: string;
    client_secret: string;
  };
}

export interface TenantConfigRequest {
  tenant_id: string;
}

export interface TenantConfigResponse {
  tenant_id: string;
  config: TenantConfig;
  updated_at: { seconds: number };
}

export interface TenantConfig {
  limits: TenantLimits;
  allowed_strategies: string[];
  enabled_strategies: string[];
  strategy_configs: Record<string, any>;
  settings: Record<string, string>;
}

export interface UpdateLimitsRequest {
  tenant_id: string;
  limits: TenantLimits;
  reason: string;
  updated_by: string;
}

// MISSING: Stream-related types
export interface StreamDataRequest {
  tenant_id: string;
  stream_id: string;
  data_type: DataType;
  payload: any;
  timestamp: { seconds: number };
  metadata: Record<string, string>;
}

export interface AnalysisResponse {
  tenant_id: string;
  stream_id: string;
  strategy_id: string;
  result: AnalysisResult;
  processed_at: { seconds: number };
  alerts: Alert[];
}

export interface Alert {
  alert_id: string;
  level: AlertLevel;
  message: string;
  context: any;
}

export interface StrategyRequest {
  tenant_id: string;
  strategy_id: string;
  config: StrategyConfig;
  historical_data: StreamDataRequest[];
}

export interface StrategyResponse {
  execution_id: string;
  status: ExecutionStatus;
  result: AnalysisResult | null;
  errors: string[];
}

export interface StrategyConfig {
  name: string;
  version: string;
  parameters: any;
  required_data_types: string[];
}

export interface TenantMetricsRequest {
  tenant_id: string;
  start_time: { seconds: number };
  end_time: { seconds: number };
  metric_types: string[];
}

export interface TenantMetricsResponse {
  tenant_id: string;
  metrics: Record<string, MetricValue>;
  usage: TenantUsage;
}

export interface MetricValue {
  value: number;
  unit: string;
  timestamp: { seconds: number };
}

export interface TenantUsage {
  streams_processed: number;
  strategies_executed: number;
  cpu_usage: number;
  memory_usage: number;
  storage_used: number;
}

// MISSING: Enums
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

// MISSING: Database models
export interface TenantDocument {
  tenantId: string;
  name: string;
  email: string;
  status: TenantStatus;
  limits: TenantLimits;
  credentials: {
    clientId: string;
    clientSecret: string;
  };
  allowedStrategies: string[];
  enabledStrategies: string[];
  strategyConfigs: Record<string, any>;
  settings?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
  auditLog?: AuditLogEntry[];
}

export interface AuditLogEntry {
  action: string;
  reason: string;
  updatedBy: string;
  timestamp: Date;
  oldLimits?: any;
  newLimits?: any;
}

export interface RefreshTokenDocument {
  token: string;
  tenantId: string;
  clientId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface StreamDataDocument {
  tenantId: string;
  streamId: string;
  dataType: string;
  payload: any;
  timestamp: Date;
  metadata: Record<string, string>;
  storedAt: Date;
}

export interface StrategyResultDocument {
  tenantId: string;
  executionId: string;
  result?: AnalysisResult;
  error?: string;
  timestamp: Date;
}

export interface StreamMetricsDocument {
  tenantId: string;
  timestamp: Date;
  processingTime: number;
  dataSize: number;
}

// MISSING: Service configuration types
export interface ServiceConfig {
  port: number;
  mongoUri: string;
  rabbitUri: string;
  redisUri: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  nodeEnv: string;
}

export interface WorkerPoolConfig {
  minWorkers: number;
  maxWorkers: number;
  workerScript: string;
}

// MISSING: Notification types
export interface NotificationMessage {
  tenantId: string;
  type: "STRATEGY_RESULT" | "STREAM_PROCESSED" | "ALERT" | "SYSTEM_STATUS";
  payload: any;
  correlationId?: string;
  timestamp?: string;
}
