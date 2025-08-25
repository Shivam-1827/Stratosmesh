FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy service and shared code
COPY ./services/auth-service ./services/auth-service
COPY ./shared ./shared

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S stratosmesh -u 1001
RUN chown -R stratosmesh:nodejs /app
USER stratosmesh

CMD ["npm", "run", "dev:auth-service"]
