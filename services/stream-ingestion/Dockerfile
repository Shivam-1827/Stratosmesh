FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy service, shared code, and workers
COPY ./services/stream-ingestion ./services/stream-ingestion
COPY ./shared ./shared
COPY ./workers ./workers

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S stratosmesh -u 1001
RUN chown -R stratosmesh:nodejs /app
USER stratosmesh

CMD ["npm", "run", "dev:stream-ingestion"]
