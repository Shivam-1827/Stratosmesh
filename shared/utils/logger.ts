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