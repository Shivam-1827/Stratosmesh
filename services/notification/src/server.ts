// services/notification/src/server.ts
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import amqp from "amqplib";
import type { Channel, ChannelModel } from "amqplib";
import jwt from "jsonwebtoken";
import { Logger } from "../../../shared/utils/logger";

const logger = new Logger("NotificationService");

class NotificationService {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private rabbitConnection!: ChannelModel;
  private channel!: Channel;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server);

    this.setupExpress();
    this.setupSocketIO();
    this.setupRabbitMQ();
  }

  private setupExpress() {
    this.app.use(express.json());

    this.app.get("/health", (req, res) => {
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // REST endpoint for sending notifications
    this.app.post("/notify/:tenantId", async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { type, payload } = req.body;

        this.io.to(`tenant:${tenantId}`).emit("notification", {
          type,
          payload,
          timestamp: new Date().toISOString(),
        });

        res.json({ success: true });
      } catch (error: unknown) {
        const err = error as Error;
        logger.error("REST notification error:", error);
        res.status(500).json({ error: err.message });
      }
    });
  }

  private setupSocketIO() {
    // Authentication middleware for Socket.IO
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const jwtSecret =
          process.env.JWT_SECRET || "5e8f894aa9a8cdf107d46b2b79801a43";

        const decoded = jwt.verify(token, jwtSecret) as any;
        socket.data.tenantId = decoded.tenantId;
        next();
      } catch (error) {
        next(new Error("Authentication failed"));
      }
    });

    this.io.on("connection", (socket) => {
      const tenantId = socket.data.tenantId;
      logger.info(`Client connected for tenant: ${tenantId}`);

      // Join tenant-specific room
      socket.join(`tenant:${tenantId}`);

      // Handle subscription to specific stream updates
      socket.on("subscribe_stream", (streamId) => {
        socket.join(`stream:${tenantId}:${streamId}`);
        logger.info(
          `Client subscribed to stream ${streamId} for tenant ${tenantId}`
        );
      });

      // Handle strategy result subscriptions
      socket.on("subscribe_strategy", (strategyId) => {
        socket.join(`strategy:${tenantId}:${strategyId}`);
        logger.info(
          `Client subscribed to strategy ${strategyId} for tenant ${tenantId}`
        );
      });

      socket.on("disconnect", () => {
        logger.info(`Client disconnected for tenant: ${tenantId}`);
      });
    });
  }

  private async setupRabbitMQ() {
    try {
      this.rabbitConnection = await amqp.connect(
        process.env.RABBITMQ_URI || "amqp://localhost"
      );
      this.channel = await this.rabbitConnection.createChannel();

      // Declare notification exchange
      await this.channel.assertExchange("notifications", "topic", {
        durable: true,
      });

      // Create queue for this service instance
      const queue = await this.channel.assertQueue("", { exclusive: true });

      // Bind to all notification routing keys
      await this.channel.bindQueue(queue.queue, "notifications", "result.*");
      await this.channel.bindQueue(queue.queue, "notifications", "alert.*");
      await this.channel.bindQueue(queue.queue, "notifications", "status.*");

      // Consume notifications
      this.channel.consume(queue.queue, async (msg) => {
        if (msg) {
          try {
            const notification = JSON.parse(msg.content.toString());
            await this.handleNotification(notification);
            this.channel.ack(msg);
          } catch (error) {
            logger.error("Notification processing error:", error);
            this.channel.nack(msg, false, false);
          }
        }
      });

      logger.info("RabbitMQ notification consumer started");
    } catch (error) {
      logger.error("RabbitMQ setup error:", error);
    }
  }

  private async handleNotification(notification: any) {
    const { tenantId, type, payload, correlationId } = notification;

    try {
      switch (type) {
        case "STRATEGY_RESULT":
          this.io.to(`tenant:${tenantId}`).emit("strategy_result", {
            type: "STRATEGY_RESULT",
            data: payload,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          break;

        case "STREAM_PROCESSED":
          this.io.to(`tenant:${tenantId}`).emit("stream_update", {
            type: "STREAM_PROCESSED",
            data: payload,
            timestamp: new Date().toISOString(),
          });
          break;

        case "ALERT":
          this.io.to(`tenant:${tenantId}`).emit("alert", {
            type: "ALERT",
            level: payload.level,
            message: payload.message,
            context: payload.context,
            timestamp: new Date().toISOString(),
          });
          break;

        case "SYSTEM_STATUS":
          this.io.to(`tenant:${tenantId}`).emit("system_status", {
            type: "SYSTEM_STATUS",
            status: payload.status,
            details: payload.details,
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          logger.warn(`Unknown notification type: ${type}`);
      }
    } catch (error) {
      logger.error("Notification handling error:", error);
    }
  }

  start(port: number = 50055) {
    this.server.listen(port, () => {
      logger.info(`Notification service running on port ${port}`);
    });
  }
}

const notificationService = new NotificationService();
notificationService.start(parseInt(process.env.PORT || "50055"));
