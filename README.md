# StratosMesh Analytics Platform

<div align="center">

![StratosMesh Logo](https://img.shields.io/badge/StratosMesh-Analytics%20Platform-blue?style=for-the-badge)

**Real-time data analytics platform for streaming data processing and intelligent insights**

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## 🎯 What is StratosMesh?

StratosMesh is a **multi-tenant, real-time analytics platform** that processes streaming data from multiple sources and applies machine learning strategies to generate actionable insights. Built with a microservices architecture, it provides enterprise-grade scalability, security, and performance for data-driven applications.

### 🏆 Key Features

- **Real-time Stream Processing**: Handle millions of data points per second
- **Multi-tenant Architecture**: Secure data isolation for multiple clients
- **Built-in Analytics**: Moving averages, anomaly detection, and custom strategies
- **Real-time Notifications**: WebSocket-based instant alerts and updates  
- **RESTful & gRPC APIs**: Multiple interface options for different use cases
- **Horizontal Scalability**: Microservices ready for cloud deployment
- **Enterprise Security**: JWT authentication, rate limiting, and data encryption

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.x or higher
- **Docker** and **Docker Compose**
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/stratosmesh.git
cd stratosmesh
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 3. Start the Platform

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Verify Installation

```bash
# Check API Gateway health
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"2025-01-15T10:30:00.000Z"}
```

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Applications                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   API Gateway (Port 3000)                   │
│                 Load Balancer & Auth                        │
└─────────┬─────────┬─────────┬─────────┬─────────┬───────────┘
          │         │         │         │         │
    ┌─────▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼────┐
    │  Auth   │ │Tenant │ │Stream │ │Strategy│ │Notify  │
    │ Service │ │Manager│ │Ingest │ │Engine  │ │Service │
    │ :50051  │ │:50054 │ │:50052 │ │:50053  │ │:50055  │
    └─────────┘ └───────┘ └───────┘ └────────┘ └────────┘
          │         │         │         │         │
    ┌─────▼─────────▼─────────▼─────────▼─────────▼───────┐
    │              Infrastructure Layer                   │
    │  MongoDB    RabbitMQ    Redis      Worker Pool     │
    └─────────────────────────────────────────────────────┘
```

### Core Services

| Service | Port | Purpose | Technology |
|---------|------|---------|------------|
| **API Gateway** | 3000 | Request routing, authentication, rate limiting | Express.js, JWT |
| **Auth Service** | 50051 | User authentication, token management | gRPC, bcrypt |
| **Tenant Manager** | 50054 | Multi-tenant account management | gRPC, MongoDB |
| **Stream Ingestion** | 50052 | Real-time data processing | gRPC, WebSockets |
| **Strategy Engine** | 50053 | Analytics execution, ML algorithms | Worker Threads |
| **Notification Service** | 50055 | Real-time alerts, WebSocket connections | Socket.IO |

### Infrastructure

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| **MongoDB** | Primary database, tenant data, analytics results | Replica set ready |
| **RabbitMQ** | Message queue, async processing, event streaming | Clustered setup |
| **Redis** | Caching, rate limiting, session storage | Persistent storage |
| **Docker** | Containerization, development, deployment | Multi-stage builds |

## 📚 API Documentation

### Authentication

All API requests (except `/api/auth`) require a valid JWT token:

```bash
# Get access token
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "your_tenant_id",
    "client_id": "your_client_id", 
    "client_secret": "your_client_secret"
  }'

# Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### Streaming Data

```bash
# Send real-time data
curl -X POST http://localhost:3000/api/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stream_id": "sensor_01",
    "data_type": "IOT_SENSOR",
    "payload": {
      "temperature": 23.5,
      "humidity": 65.2,
      "location": "warehouse_a"
    },
    "timestamp": {"seconds": 1705312200},
    "metadata": {"device_id": "temp_sensor_001"}
  }'
```

### Execute Analytics Strategy

```bash
# Run anomaly detection
curl -X POST http://localhost:3000/api/strategy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "anomaly_detection",
    "config": {
      "threshold": 2.0,
      "window_size": 100
    }
  }'
```

### Real-time Notifications

```javascript
// WebSocket connection
const io = require('socket.io-client');
const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

// Listen for real-time events
socket.on('strategy_result', (data) => {
  console.log('New analysis result:', data);
});

socket.on('alert', (alert) => {
  console.log('Alert received:', alert);
});
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
MONGODB_URI=mongodb://admin:password@mongodb:27017/stratosmesh?authSource=admin

# Message Queue
RABBITMQ_URI=amqp://admin:password@rabbitmq:5672

# Cache
REDIS_URI=redis://redis:6379

# Security
JWT_SECRET=your_super_secure_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Service Configuration

Each service can be configured through environment variables:

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  auth-service:
    environment:
      - JWT_EXPIRY=1h
      - REFRESH_TOKEN_EXPIRY=7d
      
  stream-ingestion:
    environment:
      - MAX_CONCURRENT_STREAMS=1000
      - BATCH_SIZE=100
      
  strategy-engine:
    environment:
      - WORKER_POOL_SIZE=4
      - MAX_EXECUTION_TIME=30000
```

## 📊 Built-in Analytics Strategies

### Moving Average
Calculates smoothed trends from time-series data:

```json
{
  "strategy_id": "moving_average",
  "config": {
    "period": 20,
    "data_field": "price"
  }
}
```

**Use Cases**: Stock trading, IoT sensor smoothing, trend analysis

### Anomaly Detection
Identifies unusual patterns using statistical analysis:

```json
{
  "strategy_id": "anomaly_detection", 
  "config": {
    "threshold": 2.0,
    "method": "z_score",
    "window_size": 100
  }
}
```

**Use Cases**: Fraud detection, equipment monitoring, quality control

### Custom Strategies
Extend the platform with your own algorithms:

```typescript
// workers/custom-strategy.ts
export const customStrategy: StrategyPlugin = {
  id: "custom_ml_model",
  name: "Custom ML Prediction",
  version: "1.0.0",
  execute: async (data: any[], config: any) => {
    // Your custom logic here
    return {
      resultId: `custom_${Date.now()}`,
      type: "PREDICTION",
      data: { prediction: 0.85, confidence: 0.92 },
      confidence: 0.92,
      metrics: { processing_time: Date.now() }
    };
  },
  validate: (config: any) => {
    return config.model_path && config.threshold;
  }
};
```

## 🚀 Deployment

### Development

```bash
# Start in development mode
docker-compose up

# Start specific service
docker-compose up auth-service mongodb

# View logs
docker-compose logs -f stream-ingestion

# Restart service
docker-compose restart strategy-engine
```

### Production

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with production settings
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale stream-ingestion=3
```

### Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stratosmesh-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: stratosmesh-gateway
  template:
    metadata:
      labels:
        app: stratosmesh-gateway
    spec:
      containers:
      - name: gateway
        image: stratosmesh/gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
```

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/
kubectl get pods -l app=stratosmesh
```

### Cloud Deployment (AWS/GCP/Azure)

```bash
# AWS ECS deployment
aws ecs create-service --cluster stratosmesh --service-name gateway \
  --task-definition stratosmesh-gateway:1 --desired-count 2

# Google Cloud Run
gcloud run deploy stratosmesh-gateway \
  --image gcr.io/project/stratosmesh-gateway \
  --platform managed --region us-central1

# Azure Container Instances
az container create --resource-group stratosmesh-rg \
  --name gateway --image stratosmesh/gateway:latest
```

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific service tests
npm run test:auth-service
npm run test:stream-ingestion

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# API endpoint testing
npm run test:api
```

### Load Testing

```bash
# Install k6
npm install -g k6

# Run load tests
k6 run tests/load/stream-ingestion.js
k6 run tests/load/strategy-execution.js
```

## 📊 Monitoring & Observability

### Health Checks

```bash
# Service health endpoints
curl http://localhost:3000/health
curl http://localhost:50051/health  
curl http://localhost:50052/health

# MongoDB health
docker exec stratosmesh-mongodb mongosh --eval "db.adminCommand('ping')"

# RabbitMQ management
open http://localhost:15672  # admin/password
```

### Metrics Collection

```javascript
// Built-in metrics endpoints
GET /metrics          // Prometheus format
GET /health/detailed  // Detailed health status
GET /stats            // Platform statistics
```

### Logging

```bash
# Centralized logging with ELK Stack
docker-compose -f docker-compose.elk.yml up -d

# View logs in Kibana
open http://localhost:5601

# Query specific service logs
docker-compose logs -f --tail=100 auth-service
```

### Performance Monitoring

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    
  grafana:
    image: grafana/grafana
    ports: ["3001:3000"]
    
  jaeger:
    image: jaegertracing/all-in-one
    ports: ["16686:16686"]
```

## 🔒 Security

### Authentication & Authorization

- **JWT Tokens**: Stateless authentication with configurable expiration
- **Refresh Tokens**: Secure token renewal mechanism  
- **Scoped Access**: Fine-grained permissions per tenant
- **Rate Limiting**: Prevent abuse and DDoS attacks

### Data Security

- **Multi-tenant Isolation**: Complete data separation between tenants
- **Encryption at Rest**: MongoDB encryption for sensitive data
- **Encryption in Transit**: TLS/SSL for all communications
- **Input Validation**: Comprehensive request validation

### Network Security

```bash
# Configure firewall rules
sudo ufw allow 3000/tcp    # API Gateway
sudo ufw deny 50051/tcp    # Block direct gRPC access
sudo ufw allow from 10.0.0.0/8 to any port 27017  # MongoDB internal only
```

### Security Headers

```typescript
// Already configured in gateway
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: 31536000 }
}));
```

## 🎛️ Use Cases & Examples

### 1. Financial Trading Platform

```javascript
// Monitor stock prices and execute trading strategies
const tradingData = {
  stream_id: "AAPL_prices",
  data_type: "MARKET_DATA", 
  payload: {
    symbol: "AAPL",
    price: 150.25,
    volume: 1000000,
    bid: 150.20,
    ask: 150.30
  }
};

// Execute moving average strategy
const strategy = {
  strategy_id: "moving_average",
  config: { period: 20, signal_threshold: 0.02 }
};
```

### 2. IoT Equipment Monitoring

```javascript
// Monitor industrial equipment sensors
const sensorData = {
  stream_id: "motor_01_sensors",
  data_type: "IOT_SENSOR",
  payload: {
    temperature: 85.5,
    vibration: 2.3,
    rpm: 1750,
    power_draw: 5.2
  }
};

// Detect equipment anomalies
const anomalyDetection = {
  strategy_id: "anomaly_detection",
  config: { threshold: 2.5, alert_level: "CRITICAL" }
};
```

### 3. E-commerce Fraud Detection

```javascript
// Monitor user transactions
const transactionData = {
  stream_id: "user_transactions", 
  data_type: "ECOMMERCE_EVENT",
  payload: {
    user_id: "user_12345",
    amount: 2500.00,
    location: "New York",
    payment_method: "credit_card",
    session_duration: 120
  }
};

// Detect suspicious patterns
const fraudDetection = {
  strategy_id: "anomaly_detection",
  config: { 
    fields: ["amount", "location", "session_duration"],
    threshold: 3.0,
    time_window: 3600
  }
};
```

### 4. Social Media Analytics

```javascript
// Monitor social engagement
const socialData = {
  stream_id: "brand_mentions",
  data_type: "CUSTOM",
  payload: {
    platform: "twitter",
    mentions: 1250,
    sentiment: 0.75,
    reach: 50000,
    engagement_rate: 0.05
  }
};

// Detect viral content
const viralDetection = {
  strategy_id: "trend_analysis",
  config: { 
    growth_threshold: 2.0,
    time_window: 1800,
    min_baseline: 100
  }
};
```

## 🛠️ Development

### Project Structure

```
stratosmesh/
├── services/                 # Microservices
│   ├── auth-service/        # Authentication & authorization
│   ├── gateway/             # API gateway & routing  
│   ├── notification/        # Real-time notifications
│   ├── strategy-engine/     # Analytics execution
│   ├── stream-ingestion/    # Data processing
│   └── tenant-manager/      # Multi-tenant management
├── shared/                  # Shared code
│   ├── middleware/         # Express middleware
│   ├── proto/             # gRPC definitions
│   ├── types/             # TypeScript types
│   └── utils/             # Common utilities
├── workers/               # Background workers
├── tests/                 # Test suites
├── k8s/                   # Kubernetes manifests
├── docker-compose.yml     # Development environment
└── README.md             # This file
```

### Adding New Services

1. **Create Service Directory**:
```bash
mkdir services/new-service
cd services/new-service
```

2. **Add Dockerfile**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
USER 1001
CMD ["npm", "run", "dev:new-service"]
```

3. **Update Docker Compose**:
```yaml
# docker-compose.yml
services:
  new-service:
    build:
      context: .
      dockerfile: services/new-service/Dockerfile
    ports:
      - "50056:50056"
    environment:
      - PORT=50056
    depends_on:
      - mongodb
```

4. **Add to Gateway Routes**:
```typescript
// services/gateway/src/server.ts
const services = {
  // ... existing services
  '/api/new-service': {
    target: 'http://new-service:50056',
    pathRewrite: { '^/api/new-service': '' },
    middleware: [authMiddleware]
  }
};
```

### Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/new-analytics-strategy`
3. **Write tests**: `npm run test:new-feature`
4. **Commit changes**: `git commit -am 'Add new analytics strategy'`
5. **Push to branch**: `git push origin feature/new-analytics-strategy`
6. **Submit pull request**

### Code Style

```bash
# Linting
npm run lint
npm run lint:fix

# Type checking
npm run type-check

# Formatting
npm run format
```

## 🐛 Troubleshooting

### Common Issues

**1. Services not starting**
```bash
# Check Docker daemon
systemctl status docker

# Rebuild containers
docker-compose build --no-cache

# Check port conflicts
netstat -tulpn | grep :3000
```

**2. Database connection errors**
```bash
# Check MongoDB status
docker-compose logs mongodb

# Test connection
docker exec -it stratosmesh-mongodb mongosh

# Reset MongoDB data
docker-compose down -v
docker-compose up mongodb
```

**3. Authentication failures**
```bash
# Verify JWT secrets match across services
grep JWT_SECRET .env

# Check token expiration
jwt decode your_token_here

# Reset tenant credentials
docker-compose exec mongodb mongosh stratosmesh --eval "db.tenants.find()"
```

**4. Message queue issues**
```bash
# Check RabbitMQ status
docker-compose logs rabbitmq

# Access management UI
open http://localhost:15672

# Clear stuck queues
docker-compose exec rabbitmq rabbitmqctl list_queues
```

### Performance Issues

**High memory usage**:
```bash
# Monitor container resources
docker stats

# Adjust worker pool sizes
echo "WORKER_POOL_SIZE=2" >> .env
docker-compose restart strategy-engine
```

**Slow database queries**:
```bash
# Check MongoDB slow queries
docker-compose exec mongodb mongosh stratosmesh --eval "
  db.setProfilingLevel(2, {slowms: 100});
  db.system.profile.find().sort({ts: -1}).limit(5);
"

# Add missing indexes
# See services/tenant-manager/src/server.ts
```

**Network connectivity**:
```bash
# Test service-to-service communication
docker-compose exec gateway curl http://auth-service:50051/health

# Check Docker networks
docker network ls
docker network inspect stratosmesh_default
```

### Debug Mode

```bash
# Enable debug logging
export NODE_ENV=development
export LOG_LEVEL=debug

# Debug specific service
docker-compose logs -f auth-service

# Attach debugger
node --inspect-brk=0.0.0.0:9229 services/auth-service/src/server.ts
```

## 🙏 Acknowledgments

- **gRPC Team** - High-performance RPC framework
- **MongoDB Team** - Flexible document database
- **RabbitMQ Team** - Reliable message queuing
- **Socket.IO Team** - Real-time communication
- **Docker Team** - Containerization platform
- **Node.js Community** - JavaScript runtime ecosystem

---

<div align="center">

**Built with ❤️ by Shivam Yadav**
</div>