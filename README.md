# StratosMesh Analytics Platform v1.0

<div align="center">

![StratosMesh Logo](https://img.shields.io/badge/StratosMesh-v1.0%20Analytics%20Platform-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K)

**Enterprise-grade real-time analytics platform with AI-powered data processing and intelligent insights**

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-green.svg)](https://www.mongodb.com/)
[![gRPC](https://img.shields.io/badge/gRPC-enabled-orange.svg)](https://grpc.io/)
[![Gemini AI](https://img.shields.io/badge/Gemini-AI%20Powered-purple.svg)](https://ai.google/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## 🚀 What is StratosMesh v1.0?

StratosMesh v1.0 is a **next-generation, AI-powered analytics platform** that combines real-time stream processing with advanced machine learning capabilities. Built from the ground up with a microservices architecture, it features **universal data ingestion**, **LLM-powered data analysis**, and **sophisticated trading strategies** for enterprise-scale deployments.

### 🎯 Key Innovations in v1.0

- **🤖 AI-Powered Data Processing**: Gemini AI integration for universal data format understanding
- **📊 Advanced Analytics Engine**: ARIMA predictions, hybrid strategies, and custom ML models
- **🔄 Universal Data Ingestion**: Supports any data format - CSV, JSON, PDFs, URLs, plain text
- **⚡ Real-time Stream Processing**: Handle millions of data points with sub-second latency
- **🏢 Multi-tenant Architecture**: Complete isolation and customizable limits per tenant
- **🔔 Intelligent Notifications**: WebSocket-based real-time alerts and strategy results
- **🛡️ Enterprise Security**: JWT authentication, rate limiting, and comprehensive audit trails

## 🏗️ Enhanced Architecture Overview

```
                           ┌─────────────────────────────────────┐
                           │         Client Applications          │
                           └─────────────┬───────────────────────┘
                                         │
                           ┌─────────────▼───────────────────────┐
                           │       API Gateway (Port 3000)       │
                           │   Load Balancer, Auth & Routing     │
                           └─┬─────┬─────┬─────┬─────┬─────┬─────┘
                             │     │     │     │     │     │
                    ┌────────▼─┐ ┌─▼───┐ ┌▼────▼┐ ┌─▼───┐ ┌▼─────┐ ┌▼─────────┐
                    │  Auth    │ │Tenant│ │ LLM  │ │Stream│ │Strat │ │  Notify  │
                    │ Service  │ │ Mgr  │ │Proc. │ │Ingest│ │Engine│ │ Service  │
                    │ :50051   │ │:50054│ │:50056│ │:50052│ │:50053│ │ :50055   │
                    └────┬─────┘ └─┬────┘ └┬─────┘ └─┬────┘ └─┬────┘ └┬─────────┘
                         │         │       │         │        │       │
                    ┌────▼─────────▼───────▼─────────▼────────▼───────▼─────────┐
                    │                Infrastructure Layer                       │
                    │  MongoDB Cluster   RabbitMQ    Redis   Worker Pool       │
                    │  (Multi-tenant)    (Events)   (Cache)  (Analytics)       │
                    └─────────────────────────────────────────────────────────┘
```

### 🔧 Core Services Architecture

| Service | Port | Purpose | Key Features | Technology Stack |
|---------|------|---------|--------------|------------------|
| **API Gateway** | 3000 | Request routing, load balancing | Rate limiting, JWT validation, CORS | Express.js, Helmet, Morgan |
| **Auth Service** | 50051 | Authentication & authorization | JWT tokens, refresh tokens, scoping | gRPC, bcrypt, jsonwebtoken |
| **Tenant Manager** | 50054 | Multi-tenant account management | Resource limits, strategy configs | gRPC, MongoDB, UUID |
| **LLM Processor** | 50056 | **🆕 AI-powered data analysis** | Universal format support, Gemini AI | Google AI, PDF-parse, XLSX |
| **Stream Ingestion** | 50052 | Real-time data processing | Universal ingestion, batch processing | gRPC, WebSockets, Buffers |
| **Strategy Engine** | 50053 | Advanced analytics execution | ARIMA, hybrid strategies, backtesting | Worker Threads, ARIMA lib |
| **Notification** | 50055 | Real-time alerts & updates | WebSocket connections, event streaming | Socket.IO, RabbitMQ |

### 🔥 New Features in v1.0

#### 🤖 LLM Processor Service (Port 50056)
- **Universal Data Understanding**: Automatically detects and processes any data format
- **Gemini AI Integration**: Advanced pattern recognition and data structure analysis  
- **Smart Schema Detection**: Automatically identifies timestamps, values, and categories
- **Multi-format Support**: PDF, CSV, JSON, XLSX, plain text, URLs
- **Confidence Scoring**: AI-powered reliability assessment for data processing

#### ⚡ Enhanced Strategy Engine
- **ARIMA Time Series Prediction**: Professional-grade forecasting algorithms
- **Hybrid Strategies**: Combines multiple ML models for superior accuracy
- **Worker Pool Architecture**: Parallel processing for high-throughput analytics
- **Backtesting Framework**: Historical performance validation
- **Real-time Strategy Execution**: Sub-second response times

#### 🔔 Advanced Notification System
- **Real-time WebSocket Streaming**: Instant strategy results and alerts
- **Event-driven Architecture**: RabbitMQ-powered reliable messaging
- **Multi-tenant Isolation**: Secure, isolated notification channels
- **Custom Alert Rules**: Configurable thresholds and conditions

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js** 18.x or higher
- **Docker** and **Docker Compose**
- **Git**
- **Google AI API Key** (for LLM features)

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/shivam-1827/stratosmesh.git
cd stratosmesh

```

### 2. Essential Environment Configuration

```bash
# Application Core
NODE_ENV=development
PORT=3000

# Database and Infrastructure
MONGODB_URI=mongodb://admin:password@mongodb:27017/stratosmesh?authSource=admin
RABBITMQ_URI=amqp://admin:password@rabbitmq:5672
REDIS_URI=redis://redis:6379

# AI Integration (REQUIRED for LLM features)
GEMINI_API_KEY=your_google_ai_api_key_here

# Security and Authentication
JWT_SECRET=your_super_secure_secret_key_here_at_least_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_key_here
BCRYPT_ROUNDS=12

# Performance Tuning
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
WORKER_POOL_SIZE=4
MAX_EXECUTION_TIME=30000

# Logging and Monitoring  
LOG_LEVEL=info
LOG_FORMAT=json
```

### 3. Start the Complete Platform

```bash
# Start all services with dependencies
docker-compose up -d

# Verify all services are healthy
docker-compose ps

# Check service logs
docker-compose logs -f

# Quick health check
curl http://localhost:3000/health
```

### 4. Create Your First Tenant

```bash
# Create a new tenant account
curl -X POST http://localhost:3000/api/tenant \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Analytics Corp",
    "email": "admin@demo-analytics.com",
    "limits": {
      "max_concurrent_streams": 50,
      "max_strategies_per_hour": 500,
      "max_storage_mb": 5000,
      "rate_limit_per_minute": 120
    },
    "allowed_strategies": [
      "moving_average",
      "anomaly_detection", 
      "arima_prediction",
      "hybrid_arima_ma"
    ]
  }'

# Response includes your credentials:
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_credentials": {
    "client_id": "client_1641234567890",
    "client_secret": "secret_key_here"
  }
}
```

## 📊 Universal Data Processing with AI

### 🤖 LLM-Powered Data Analysis

StratosMesh v1.0 can automatically understand and process **any data format** using advanced AI:

```bash
# Process a CSV file with AI analysis
curl -X POST http://localhost:3000/api/llm/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@financial_data.csv" \
  -F "description=Daily stock prices and trading volumes" \
  -F "stream_id=stock_analysis_stream"

# AI Response:
{
  "success": true,
  "detected_type": "financial_data",
  "confidence": 0.94,
  "records_processed": 1247,
  "schema": {
    "timestamp_field": "date",
    "value_fields": ["price", "volume", "high", "low"],
    "category_fields": ["symbol", "exchange"]
  },
  "suggested_strategies": ["moving_average", "arima_prediction"]
}
```

### 📈 Supported Data Formats

| Format | Detection | Processing | AI Analysis |
|--------|-----------|------------|-------------|
| **CSV Files** | ✅ Auto | ✅ Headers + Data | ✅ Schema detection |
| **JSON Documents** | ✅ Structure | ✅ Nested objects | ✅ Time series extraction |
| **PDF Reports** | ✅ Text extraction | ✅ Table parsing | ✅ Pattern recognition |
| **Excel Files** | ✅ Sheets + Formulas | ✅ Multi-sheet support | ✅ Chart understanding |
| **Plain Text** | ✅ Format inference | ✅ Log parsing | ✅ Entity extraction |
| **Web URLs** | ✅ Content fetching | ✅ API responses | ✅ Real-time feeds |

### 💡 Smart Processing Examples

```javascript
// Process any text data with AI understanding
const result = await fetch('/api/llm/process', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token },
  body: JSON.stringify({
    raw_text: `
      2025-01-15: Temperature 23.5°C, Humidity 65%, Pressure 1013hPa
      2025-01-15: Temperature 24.1°C, Humidity 63%, Pressure 1012hPa  
      2025-01-15: Temperature 23.8°C, Humidity 64%, Pressure 1014hPa
    `,
    description: "IoT sensor readings from weather station",
    stream_id: "weather_data"
  })
});

// AI automatically detects:
// - Data type: "sensor_data" 
// - Timestamp pattern: "YYYY-MM-DD"
// - Value fields: ["temperature", "humidity", "pressure"]
// - Suggested analytics: ["anomaly_detection", "moving_average"]
```

## 🧠 Advanced Analytics Strategies

### 📈 ARIMA Time Series Prediction

Professional-grade forecasting with statistical modeling:

```bash
# Execute ARIMA prediction strategy
curl -X POST http://localhost:3000/api/strategy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "arima_prediction",
    "config": {
      "p": 2,
      "d": 1, 
      "q": 2,
      "steps": 5
    }
  }'

# Advanced ARIMA Response:
{
  "execution_id": "exec_1641234567890_abc123",
  "result": {
    "type": "PREDICTION",
    "data": {
      "currentPrice": 150.25,
      "predictions": [151.30, 152.15, 151.95, 153.20, 154.10],
      "confidenceInterval": {
        "upper": [152.50, 154.20, 155.10, 156.80, 158.30],
        "lower": [150.10, 150.10, 148.80, 149.60, 149.90]
      },
      "signal": {
        "action": "BUY",
        "strength": 0.87,
        "reason": "ARIMA predicts 2.56% price increase"
      },
      "modelParams": {"p": 2, "d": 1, "q": 2},
      "stationarity": {"isStationary": true, "pValue": 0.03}
    },
    "confidence": 0.91,
    "metrics": {
      "mape": 0.89,
      "rmse": 0.45,
      "aic": -127.34,
      "bic": -119.78
    }
  }
}
```

### 🔬 Hybrid Strategy Framework

Combines multiple ML models for superior accuracy:

```bash
# Execute hybrid ARIMA + Moving Average strategy
curl -X POST http://localhost:3000/api/strategy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "hybrid_arima_ma",
    "config": {
      "arimaConfig": {
        "p": 2, "d": 1, "q": 2, "steps": 3
      },
      "maConfig": {
        "period": 20
      }
    }
  }'

# Hybrid Strategy Response:
{
  "result": {
    "data": {
      "arima": {
        "predictions": [151.30, 152.15, 151.95],
        "signal": {"action": "BUY", "strength": 0.87}
      },
      "movingAverage": {
        "movingAverage": 149.85,
        "signal": "BUY"
      },
      "combinedSignal": {
        "action": "BUY", 
        "strength": 0.89,
        "reason": "Both models confirm upward trend"
      },
      "consensus": "STRONG"
    },
    "confidence": 0.92,
    "metrics": {
      "arimaAccuracy": 0.89,
      "signalAlignment": 1.0,
      "combinedScore": 0.91
    }
  }
}
```

### 🔍 Enhanced Anomaly Detection

Advanced statistical analysis with configurable thresholds:

```bash
# Advanced anomaly detection
curl -X POST http://localhost:3000/api/strategy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "anomaly_detection",
    "config": {
      "threshold": 2.5,
      "method": "z_score",
      "window_size": 100,
      "alert_level": "CRITICAL"
    }
  }'
```

## 🔔 Real-time Notifications & WebSockets

### 🌊 Live Strategy Results

```javascript
// Connect to real-time notifications
const io = require('socket.io-client');
const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

// Subscribe to strategy results
socket.on('strategy_result', (data) => {
  console.log('📊 New Analysis:', {
    strategy: data.type,
    confidence: data.data.confidence,
    prediction: data.data.predictions,
    signal: data.data.signal
  });
});

// Subscribe to real-time alerts
socket.on('alert', (alert) => {
  console.log(`🚨 ${alert.level}: ${alert.message}`, alert.context);
});

// Subscribe to specific streams
socket.emit('subscribe_stream', 'stock_analysis_stream');
socket.emit('subscribe_strategy', 'arima_prediction');
```

### 📱 Multi-Channel Notifications

```bash
# Send custom notifications via REST API
curl -X POST http://localhost:3000/api/notify/YOUR_TENANT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CUSTOM_ALERT",
    "payload": {
      "title": "Trading Signal Generated",
      "message": "ARIMA model recommends BUY action",
      "confidence": 0.91,
      "urgency": "HIGH"
    }
  }'
```

## 🔒 Enterprise Security & Multi-tenancy

### 🛡️ Advanced Authentication

```bash
# Get JWT access token
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "client_id": "client_1641234567890",
    "client_secret": "your_client_secret"
  }'

# Response with refresh token support:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": ["stream:read", "strategy:execute", "tenant:manage"]
}

# Refresh expired tokens
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "your_refresh_token",
    "tenant_id": "your_tenant_id"
  }'
```

### 🏢 Tenant Resource Management

```bash
# Update tenant limits dynamically
curl -X PUT http://localhost:3000/api/tenant/YOUR_TENANT_ID/limits \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "limits": {
      "max_concurrent_streams": 100,
      "max_strategies_per_hour": 1000,
      "max_storage_mb": 10000,
      "rate_limit_per_minute": 200
    },
    "reason": "Upgraded to premium plan"
  }'
```

## 📈 Performance & Monitoring

### 🔍 Built-in Metrics & Analytics

```bash
# Get tenant performance metrics
curl -X GET "http://localhost:3000/api/metrics/YOUR_TENANT_ID?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "tenant_id": "your_tenant_id",
  "metrics": {
    "streams_processed": {"value": 15420, "unit": "count"},
    "avg_processing_time": {"value": 127.5, "unit": "ms"},
    "total_data_size": {"value": 2340000, "unit": "bytes"},
    "strategy_executions": {"value": 890, "unit": "count"},
    "accuracy_score": {"value": 0.91, "unit": "percentage"}
  },
  "usage": {
    "cpu_usage": 0.45,
    "memory_usage": 0.67,
    "storage_used": 2340000
  }
}
```

### ⚡ Performance Optimization

```yaml
# docker-compose.override.yml - Production optimizations
version: '3.8'
services:
  strategy-engine:
    environment:
      - WORKER_POOL_SIZE=8        # Increase for CPU-intensive strategies
      - MAX_EXECUTION_TIME=60000  # Extended for complex ARIMA models
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2.0'
          memory: 4G

  stream-ingestion:
    environment:
      - MAX_CONCURRENT_STREAMS=1000
      - BATCH_SIZE=500
    deploy:
      replicas: 4

  llm-processor:
    environment:
      - GEMINI_API_TIMEOUT=30000
      - MAX_FILE_SIZE_MB=100
    deploy:
      replicas: 2
```

## 🧪 Testing & Quality Assurance

### 🔧 Comprehensive Testing Suite

```bash
# Run full test suite
npm test

# Test specific services
npm run test:llm-processor
npm run test:strategy-engine
npm run test:stream-ingestion

# Integration testing
npm run test:integration

# Load testing with K6
k6 run tests/load/arima-strategy-load-test.js
k6 run tests/load/llm-processing-load-test.js
```

### 📊 Strategy Backtesting

```bash
# Run strategy backtesting
curl -X POST http://localhost:3000/api/strategy/backtest \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "arima_prediction",
    "config": {"p": 2, "d": 1, "q": 2},
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "initial_capital": 100000
  }'

# Backtesting Results:
{
  "strategy_id": "arima_prediction",
  "backtest_period": "2024-01-01 to 2024-12-31",
  "total_trades": 245,
  "winning_trades": 156,
  "win_rate": 0.637,
  "total_return": 0.184,
  "sharpe_ratio": 1.23,
  "max_drawdown": 0.087,
  "average_accuracy": 0.891
}
```

## 🚀 Deployment Strategies

### 🐳 Docker Production Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  api-gateway:
    image: stratosmesh/gateway:v1.0
    ports: ["80:3000", "443:3001"]
    environment:
      - NODE_ENV=production
      - ENABLE_HTTPS=true
    deploy:
      replicas: 3
      placement:
        constraints: [node.role == manager]

  strategy-engine:
    image: stratosmesh/strategy-engine:v1.0
    deploy:
      replicas: 5
      resources:
        limits: {cpus: '2.0', memory: '4G'}
    environment:
      - WORKER_POOL_SIZE=8
      - ENABLE_GPU=true  # For advanced ML models

  llm-processor:
    image: stratosmesh/llm-processor:v1.0
    deploy:
      replicas: 3
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - MAX_CONCURRENT_REQUESTS=100
```

```bash
# Deploy to production
docker-compose -f docker-compose.prod.yml up -d

# Scale specific services
docker-compose -f docker-compose.prod.yml up -d --scale strategy-engine=5
```

### ☸️ Kubernetes Deployment

```yaml
# k8s/stratosmesh-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stratosmesh-strategy-engine
  labels:
    app: stratosmesh
    service: strategy-engine
spec:
  replicas: 5
  selector:
    matchLabels:
      app: stratosmesh
      service: strategy-engine
  template:
    metadata:
      labels:
        app: stratosmesh
        service: strategy-engine
    spec:
      containers:
      - name: strategy-engine
        image: stratosmesh/strategy-engine:v1.0
        ports:
        - containerPort: 50053
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: stratosmesh-secrets
              key: mongodb-uri
        - name: WORKER_POOL_SIZE
          value: "8"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
```

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/
kubectl get pods -l app=stratosmesh
kubectl scale deployment stratosmesh-strategy-engine --replicas=10
```

### ☁️ Cloud Platform Deployments

```bash
# AWS ECS with Fargate
aws ecs create-service \
  --cluster stratosmesh-cluster \
  --service-name strategy-engine \
  --task-definition stratosmesh-strategy:1 \
  --desired-count 5 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345]}"

# Google Cloud Run
gcloud run deploy stratosmesh-llm-processor \
  --image gcr.io/your-project/stratosmesh-llm-processor:v1.0 \
  --platform managed \
  --region us-central1 \
  --cpu 2 \
  --memory 4Gi \
  --max-instances 10 \
  --set-env-vars GEMINI_API_KEY=${GEMINI_API_KEY}

# Azure Container Instances
az container create \
  --resource-group stratosmesh-rg \
  --name strategy-engine \
  --image stratosmesh/strategy-engine:v1.0 \
  --cpu 2 --memory 4 \
  --environment-variables NODE_ENV=production
```

## 🛠️ Advanced Configuration

### 🤖 LLM Processing Configuration

```javascript
// Advanced LLM processor settings
const llmConfig = {
  geminiModel: "gemini-pro",
  maxTokens: 8192,
  temperature: 0.1,  // Low temperature for consistent analysis
  supportedFormats: [
    "text/csv", "application/json", "application/pdf",
    "application/vnd.ms-excel", "text/plain"
  ],
  processingTimeouts: {
    textAnalysis: 30000,
    fileProcessing: 120000,
    urlFetching: 60000
  },
  confidenceThresholds: {
    high: 0.85,
    medium: 0.65,
    low: 0.45
  }
};
```

### ⚙️ Strategy Engine Tuning

```javascript
// Advanced strategy configurations
const strategyConfigs = {
  arima_prediction: {
    defaultParams: { p: 2, d: 1, q: 2 },
    maxDataPoints: 10000,
    minDataPoints: 100,
    optimizationMethod: "ml", // maximum likelihood
    seasonalityDetection: true,
    outlierHandling: "interpolate"
  },
  hybrid_arima_ma: {
    weights: { arima: 0.7, ma: 0.3 },
    consensusThreshold: 0.8,
    rebalancingFrequency: "daily"
  },
  anomaly_detection: {
    methods: ["z_score", "isolation_forest", "one_class_svm"],
    ensemble: true,
    adaptiveThreshold: true
  }
};
```

## 🔧 Troubleshooting Guide

### 🚨 Common Issues & Solutions

**1. LLM Processor Errors**
```bash
# Check Gemini API key configuration
docker-compose logs llm-processor | grep -i "api key"

# Test API connectivity
curl -X POST http://localhost:50056/health

# Reset LLM processor
docker-compose restart llm-processor
```

**2. Strategy Execution Failures**
```bash
# Monitor worker pool status
docker-compose exec strategy-engine ps aux | grep node

# Check MongoDB connections
docker-compose exec mongodb mongosh --eval "db.stats()"

# Debug ARIMA model issues
docker-compose logs strategy-engine | grep -i "arima"
```

**3. Performance Bottlenecks**
```bash
# Monitor resource usage
docker stats

# Check queue backlogs
docker-compose exec rabbitmq rabbitmqctl list_queues

# Analyze slow queries
docker-compose exec mongodb mongosh stratosmesh \
  --eval "db.setProfilingLevel(2, {slowms: 100})"
```

### 🔍 Debug Mode

```bash
# Enable comprehensive debugging
export NODE_ENV=development
export LOG_LEVEL=debug
export DEBUG=stratosmesh:*

# Debug specific services
docker-compose logs -f --tail=100 llm-processor
docker-compose logs -f --tail=100 strategy-engine

# Attach Node.js debugger
docker-compose exec strategy-engine node --inspect-brk=0.0.0.0:9229 src/server.js

# Monitor gRPC calls
export GRPC_TRACE=all
export GRPC_VERBOSITY=DEBUG
```

### 📊 Performance Monitoring

```bash
# Real-time performance metrics
curl -X GET http://localhost:3000/metrics

# Prometheus metrics endpoint
curl -X GET http://localhost:3000/metrics/prometheus

# Health check all services
curl -X GET http://localhost:3000/health/detailed
```

## 📚 Comprehensive API Reference

### 🔐 Authentication Endpoints

```http
POST /api/auth
Content-Type: application/json

{
  "tenant_id": "uuid",
  "client_id": "string", 
  "client_secret": "string",
  "scopes": ["stream:read", "strategy:execute"]
}
```

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "string",
  "tenant_id": "uuid"
}
```

### 🤖 LLM Processing Endpoints

```http
POST /api/llm/process
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: <file_upload>
description: "Stock market data analysis" 
stream_id: "financial_stream"
desired_format: "time_series"
```

```http
POST /api/llm/analyze
Authorization: Bearer {token}
Content-Type: application/json

{
  "text_sample": "2025-01-15,AAPL,150.25,1000000",
  "description": "Sample CSV data",
  "tenant_id": "uuid"
}
```

### 📊 Stream Processing Endpoints

```http
POST /api/stream
Authorization: Bearer {token}
Content-Type: application/json

{
  "stream_id": "sensor_data_01",
  "data_type": "IOT_SENSOR", 
  "payload": {
    "temperature": 23.5,
    "humidity": 65.2,
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "metadata": {
    "device_id": "temp_001",
    "location": "warehouse_a"
  }
}
```

### ⚡ Strategy Execution Endpoints

```http
POST /api/strategy
Authorization: Bearer {token}
Content-Type: application/json

{
  "strategy_id": "arima_prediction",
  "config": {
    "p": 2,
    "d": 1, 
    "q": 2,
    "steps": 5
  },
  "historical_data_filter": {
    "start_date": "2025-01-01T00:00:00Z",
    "end_date": "2025-01-15T23:59:59Z"
  }
}
```

```http
GET /api/strategy/{execution_id}
Authorization: Bearer {token}
```

### 🏢 Tenant Management Endpoints

```http
POST /api/tenant
Content-Type: application/json

{
  "name": "Enterprise Corp",
  "email": "admin@enterprise.com",
  "limits": {
    "max_concurrent_streams": 100,
    "max_strategies_per_hour": 1000,
    "max_storage_mb": 10000,
    "rate_limit_per_minute": 200
  },
  "allowed_strategies": [
    "moving_average",
    "anomaly_detection",
    "arima_prediction", 
    "hybrid_arima_ma"
  ]
}
```

```http
PUT /api/tenant/{tenant_id}/limits
Authorization: Bearer {token}
Content-Type: application/json

{
  "limits": {
    "max_concurrent_streams": 200,
    "max_strategies_per_hour": 2000
  }
}
```

## 🎯 Real-World Use Cases & Examples

### 📈 Financial Trading Platform

```javascript
// Comprehensive trading strategy implementation
const tradingBot = {
  async analyzeMarketData() {
    // 1. Upload CSV market data with AI processing
    const dataResponse = await fetch('/api/llm/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData // CSV file with OHLCV data
    });
    
    // 2. Execute hybrid ARIMA + MA strategy
    const strategyResponse = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        strategy_id: 'hybrid_arima_ma',
        config: {
          arimaConfig: { p: 2, d: 1, q: 2, steps: 3 },
          maConfig: { period: 20 }
        }
      })
    });
    
    // 3. Monitor real-time results
    socket.on('strategy_result', (result) => {
      if (result.data.combinedSignal.action === 'BUY' && 
          result.confidence > 0.85) {
        this.executeTrade(result);
      }
    });
  },
  
  executeTrade(signal) {
    console.log(`🚀 Executing ${signal.data.combinedSignal.action} signal`);
    console.log(`📊 Confidence: ${signal.confidence}`);
    console.log(`💰 Predicted price: ${signal.data.arima.predictions[0]}`);
  }
};
```

### 🏭 Industrial IoT Monitoring

```javascript
// Smart factory monitoring system
const factoryMonitoring = {
  async processEquipmentData() {
    // Process sensor logs with AI
    const sensorData = `
      2025-01-15T10:00:00Z Motor-001 Temperature:85°C Vibration:2.3Hz RPM:1750
      2025-01-15T10:01:00Z Motor-001 Temperature:87°C Vibration:2.8Hz RPM:1745
      2025-01-15T10:02:00Z Motor-001 Temperature:92°C Vibration:3.2Hz RPM:1740
    `;
    
    const processed = await fetch('/api/llm/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        raw_text: sensorData,
        description: 'Industrial motor sensor readings',
        stream_id: 'factory_equipment_monitoring'
      })
    });
    
    // Run anomaly detection
    await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        strategy_id: 'anomaly_detection',
        config: {
          threshold: 2.5,
          alert_level: 'CRITICAL',
          fields: ['temperature', 'vibration', 'rpm']
        }
      })
    });
  }
};

// Real-time equipment alerts
socket.on('alert', (alert) => {
  if (alert.level === 'CRITICAL') {
    console.log('🚨 EQUIPMENT ALERT:', alert.message);
    // Send to maintenance team
    notifyMaintenanceTeam(alert);
  }
});
```

### 🛒 E-commerce Analytics

```javascript
// Customer behavior analysis
const ecommerceAnalytics = {
  async analyzeCustomerData() {
    // Process customer transaction CSV
    const transactionData = new FormData();
    transactionData.append('file', csvFile);
    transactionData.append('description', 'Customer purchase history and behavior patterns');
    transactionData.append('stream_id', 'customer_analytics');
    
    const analysis = await fetch('/api/llm/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: transactionData
    });
    
    // Detect purchasing anomalies (fraud detection)
    const fraudDetection = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        strategy_id: 'anomaly_detection',
        config: {
          threshold: 3.0,
          method: 'isolation_forest',
          fields: ['transaction_amount', 'purchase_frequency', 'location_variance']
        }
      })
    });
  }
};
```

### 🌐 Social Media Sentiment Analysis

```javascript
// Social media monitoring with AI
const socialMediaAnalytics = {
  async processSocialData() {
    // Analyze social media mentions from various sources
    const socialData = {
      raw_text: `
        @user1: "Loving the new product launch! #amazing #brand"
        @user2: "Customer service was terrible today #disappointed" 
        @user3: "Best purchase I've made this year! Highly recommend!"
      `,
      description: 'Social media brand mentions and sentiment',
      stream_id: 'brand_sentiment_monitoring'
    };
    
    const processed = await fetch('/api/llm/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(socialData)
    });
    
    // Track sentiment trends
    const sentimentAnalysis = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        strategy_id: 'moving_average',
        config: {
          period: 50,
          field: 'sentiment_score'
        }
      })
    });
  }
};
```

## 🔄 Data Pipeline Workflows

### 🚀 End-to-End Processing Pipeline

```mermaid
graph LR
    A[Raw Data] --> B[LLM Processor]
    B --> C[Format Detection]
    C --> D[Schema Extraction]
    D --> E[Stream Ingestion]
    E --> F[Strategy Engine]
    F --> G[Real-time Results]
    G --> H[Notifications]
    
    B --> I[Confidence Scoring]
    I --> J[Quality Assessment]
    J --> E
    
    F --> K[Worker Pool]
    K --> L[ARIMA Analysis]
    K --> M[Anomaly Detection]
    K --> N[Hybrid Strategies]
```

### 🔗 Integration Patterns

```javascript
// Webhook integration for external systems
app.post('/webhooks/external-data', async (req, res) => {
  const { data, source, format } = req.body;
  
  // Process with LLM understanding
  const processed = await llmProcessor.processData({
    tenantId: req.headers['x-tenant-id'],
    streamId: `webhook_${source}`,
    inputData: {
      type: format === 'json' ? 'structured' : 'text',
      content: data
    },
    description: `Webhook data from ${source}`,
    desiredFormat: 'time_series'
  });
  
  // Auto-trigger relevant strategies
  if (processed.confidence > 0.8) {
    await strategyEngine.executeStrategy({
      tenantId: req.headers['x-tenant-id'],
      strategyId: 'auto_analysis',
      data: processed.records
    });
  }
  
  res.json({ processed: true, confidence: processed.confidence });
});

// Scheduled data processing
cron.schedule('*/5 * * * *', async () => {
  const tenants = await db.collection('tenants').find({ 
    'settings.autoProcessing': true 
  }).toArray();
  
  for (const tenant of tenants) {
    await processScheduledAnalytics(tenant.tenantId);
  }
});
```

## 🛡️ Security & Compliance

### 🔒 Data Privacy & Protection

```javascript
// Data encryption configuration
const securityConfig = {
  encryption: {
    algorithm: 'aes-256-gcm',
    keyRotation: '30d',
    atRest: true,
    inTransit: true
  },
  audit: {
    logAllAccess: true,
    retentionPeriod: '7years',
    complianceStandards: ['GDPR', 'SOX', 'HIPAA']
  },
  tenantIsolation: {
    databaseLevel: true,
    networkLevel: true,
    processingLevel: true
  }
};

// GDPR compliance endpoints
app.delete('/api/tenant/:tenantId/data', async (req, res) => {
  // Complete data deletion for GDPR right to be forgotten
  await Promise.all([
    db.collection('stream_data').deleteMany({ tenantId: req.params.tenantId }),
    db.collection('strategy_results').deleteMany({ tenantId: req.params.tenantId }),
    db.collection('audit_logs').deleteMany({ tenantId: req.params.tenantId })
  ]);
  
  res.json({ deleted: true, timestamp: new Date().toISOString() });
});
```

### 🛡️ Rate Limiting & DDoS Protection

```javascript
// Advanced rate limiting
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Dynamic limits based on tenant tier
    const tenant = req.user?.tenant;
    return tenant?.tier === 'enterprise' ? 1000 : 
           tenant?.tier === 'professional' ? 500 : 100;
  },
  keyGenerator: (req) => `${req.user.tenantId}:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
      limit: req.rateLimit.limit
    });
  }
};
```

## 🎨 Frontend Integration Examples

### ⚛️ React Dashboard Component

```jsx
// StratosMesh React Dashboard
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const StratosMeshDashboard = () => {
  const [socket, setSocket] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [realTimeData, setRealTimeData] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io('http://localhost:3000', {
      auth: { token: localStorage.getItem('jwt_token') }
    });

    newSocket.on('strategy_result', (result) => {
      setStrategies(prev => [result, ...prev.slice(0, 9)]);
    });

    newSocket.on('alert', (alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 4)]);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const executeStrategy = async (strategyId, config) => {
    try {
      const response = await fetch('/api/strategy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ strategy_id: strategyId, config })
      });

      const result = await response.json();
      console.log('Strategy executed:', result);
    } catch (error) {
      console.error('Strategy execution failed:', error);
    }
  };

  const processFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', 'Dashboard file upload');
    formData.append('stream_id', `dashboard_${Date.now()}`);

    try {
      const response = await fetch('/api/llm/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: formData
      });

      const result = await response.json();
      console.log('File processed:', result);
      
      // Auto-execute suggested strategies
      if (result.confidence > 0.8 && result.suggested_strategies) {
        result.suggested_strategies.forEach(strategy => {
          executeStrategy(strategy, { auto: true });
        });
      }
    } catch (error) {
      console.error('File processing failed:', error);
    }
  };

  return (
    <div className="stratosmesh-dashboard">
      <header className="dashboard-header">
        <h1>StratosMesh Analytics v1.0</h1>
        <div className="connection-status">
          {socket?.connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <div className="dashboard-grid">
        {/* File Upload Section */}
        <div className="upload-section">
          <h3>Universal Data Upload</h3>
          <input
            type="file"
            onChange={(e) => processFile(e.target.files[0])}
            accept=".csv,.json,.pdf,.xlsx,.txt"
          />
          <p>AI will automatically detect format and process</p>
        </div>

        {/* Strategy Controls */}
        <div className="strategy-controls">
          <h3>Execute Strategies</h3>
          <button onClick={() => executeStrategy('arima_prediction', {
            p: 2, d: 1, q: 2, steps: 5
          })}>
            📈 ARIMA Prediction
          </button>
          <button onClick={() => executeStrategy('hybrid_arima_ma', {
            arimaConfig: { p: 2, d: 1, q: 2 },
            maConfig: { period: 20 }
          })}>
            🔬 Hybrid Strategy
          </button>
          <button onClick={() => executeStrategy('anomaly_detection', {
            threshold: 2.5, method: 'z_score'
          })}>
            🔍 Anomaly Detection
          </button>
        </div>

        {/* Real-time Results */}
        <div className="results-section">
          <h3>Live Strategy Results</h3>
          {strategies.map((strategy, idx) => (
            <div key={idx} className="result-card">
              <div className="result-header">
                <span className="strategy-type">{strategy.type}</span>
                <span className="confidence">
                  {(strategy.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="result-data">
                {strategy.data.signal && (
                  <div className={`signal ${strategy.data.signal.action.toLowerCase()}`}>
                    {strategy.data.signal.action}: {strategy.data.signal.reason}
                  </div>
                )}
                {strategy.data.predictions && (
                  <div className="predictions">
                    Next: {strategy.data.predictions.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Alerts Section */}
        <div className="alerts-section">
          <h3>Real-time Alerts</h3>
          {alerts.map((alert, idx) => (
            <div key={idx} className={`alert alert-${alert.level.toLowerCase()}`}>
              <span className="alert-level">{alert.level}</span>
              <span className="alert-message">{alert.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StratosMeshDashboard;
```

### 📱 Vue.js Mobile Dashboard

```vue
<template>
  <div class="mobile-dashboard">
    <div class="header">
      <h2>StratosMesh Mobile</h2>
      <div :class="connectionStatus">{{ statusText }}</div>
    </div>

    <div class="quick-actions">
      <button @click="quickUpload" class="action-btn upload">
        📤 Quick Upload
      </button>
      <button @click="runQuickAnalysis" class="action-btn analyze">
        ⚡ Quick Analysis
      </button>
    </div>

    <div class="live-feed">
      <h3>Live Results</h3>
      <div v-for="result in liveResults" :key="result.id" class="result-item">
        <div class="result-type">{{ result.type }}</div>
        <div class="result-confidence">
          {{ Math.round(result.confidence * 100) }}%
        </div>
        <div v-if="result.signal" :class="signalClass(result.signal)">
          {{ result.signal.action }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import io from 'socket.io-client';

export default {
  name: 'StratosMeshMobile',
  data() {
    return {
      socket: null,
      connected: false,
      liveResults: [],
      alerts: []
    };
  },
  computed: {
    connectionStatus() {
      return this.connected ? 'status connected' : 'status disconnected';
    },
    statusText() {
      return this.connected ? 'Connected' : 'Disconnected';
    }
  },
  methods: {
    signalClass(signal) {
      return `signal signal-${signal.action.toLowerCase()}`;
    },
    async quickUpload() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.json,.txt,.pdf';
      input.click();
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await this.processFile(file);
      };
    },
    async processFile(file) {
      // Implementation similar to React example
    },
    async runQuickAnalysis() {
      await fetch('/api/strategy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          strategy_id: 'moving_average',
          config: { period: 20, quick: true }
        })
      });
    }
  },
  mounted() {
    this.socket = io('http://localhost:3000', {
      auth: { token: localStorage.getItem('jwt_token') }
    });

    this.socket.on('connect', () => {
      this.connected = true;
    });

    this.socket.on('strategy_result', (result) => {
      this.liveResults.unshift(result);
      if (this.liveResults.length > 5) this.liveResults.pop();
    });
  }
};
</script>
```


## 🚀 Roadmap & Future Features

### 🔮 Version 1.1 (Q2 2025)
- **🧠 Enhanced LLM Models**: GPT-4, Claude, and local model support
- **📊 Advanced Visualizations**: Real-time charts and dashboards
- **🔄 Auto-ML Pipeline**: Automated model selection and hyperparameter tuning
- **🌐 Multi-cloud Deployment**: AWS, GCP, Azure native integrations

### 🚀 Version 1.2 (Q3 2025)
- **🤖 Custom Strategy Builder**: Visual drag-and-drop interface
- **📱 Mobile SDKs**: Native iOS and Android support
- **🔗 Enterprise Integrations**: Salesforce, SAP, Oracle connectors
- **🛡️ Advanced Security**: Zero-trust architecture, SSO integration

### 🌟 Version 2.0 (Q4 2025)
- **🧮 Quantum Computing**: Quantum ML algorithms for complex predictions
- **🌍 Global Edge Network**: Ultra-low latency worldwide deployment
- **🎯 Industry Templates**: Pre-built solutions for finance, healthcare, IoT
- **🤝 Federated Learning**: Privacy-preserving multi-tenant ML


<div align="center">


**Built with ❤️ by Shivam Yadav**

</div>