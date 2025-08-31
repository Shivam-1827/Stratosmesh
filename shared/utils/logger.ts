export class Logger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      service: this.service,
      level,
      message,
      ...(meta && { meta }),
    };
    return JSON.stringify(logEntry);
  }

  info(message: string, meta?: any) {
    console.info(this.formatMessage("INFO", message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage("WARN", message, meta));
  }

  error(message: string, meta?: any) {
    console.error(this.formatMessage("ERROR", message, meta));
  }

  debug(message: string, meta?: any) {
    if(process.env.NODE_ENV !== 'production'){
        console.log(this.formatMessage('DEBUG', message, meta));
    }
  }
}


/*

  import winston from "winston";
import path from "path";
import DailyRotateFile from "winston-daily-rotate-file";
import util from "util";

// --- Winston Config ---

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
} as const;

type LogLevel = keyof typeof levels;

const colors: Record<LogLevel, string> = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
};
winston.addColors(colors);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg: string;

    if (typeof message === "object") {
      msg = util.inspect(message, { depth: null, colors: true });
    } else if (message instanceof Error) {
      msg = `${message.message}\n${message.stack}`;
    } else {
      msg = message as string;
    }

    let extra = "";
    if (Object.keys(meta).length > 0) {
      extra = util.inspect(meta, { depth: null, colors: true });
    }

    return `${timestamp} ${level}: ${msg} ${extra}`;
  })
);

const dailyRotateTransport = new DailyRotateFile({
  dirname: path.join(__dirname, "../../logs/archived"),
  filename: "%DATE%-app.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const winstonLogger = winston.createLogger({
  level: (process.env.LOG_LEVEL as LogLevel) || "info",
  levels,
  format: logFormat,
  transports: [
    new winston.transports.Console({ format: logFormat }),
    new DailyRotateFile({
      dirname: path.join(__dirname, "../../logs/archived"),
      filename: "%DATE%-error.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    dailyRotateTransport,
  ],
});

(winstonLogger as any).stream = {
  write: (message: string) => {
    winstonLogger.http(message.trim());
  },
};

// --- Your Class Wrapper ---

export class Logger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  private enrichMessage(message: any, meta?: any) {
    return { service: this.service, message, ...(meta && { meta }) };
  }

  info(message: any, meta?: any) {
    winstonLogger.info(this.enrichMessage(message, meta));
  }

  warn(message: any, meta?: any) {
    winstonLogger.warn(this.enrichMessage(message, meta));
  }

  error(message: any, meta?: any) {
    winstonLogger.error(this.enrichMessage(message, meta));
  }

  debug(message: any, meta?: any) {
    if (process.env.NODE_ENV !== "production") {
      winstonLogger.debug(this.enrichMessage(message, meta));
    }
  }
}

// Usage
// const logger = new Logger("TenantService");
// logger.info("Tenant created", { tenantId: "1234" });

export default winstonLogger;


*/