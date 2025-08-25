import Redis from 'ioredis';

export class RateLimiter {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URI || "redis://localhost:6379");
  }

  async checkLimit(tenantId: string, limitPerMinute: number): Promise<boolean> {
    const key = `rate_limit:${tenantId}:${Math.floor(Date.now() / 60000)}`;

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60); // expire after 1 min
    }

    return current <= limitPerMinute;
  }

  async getRemainingRequests(
    tenantId: string,
    limitPerMinute: number
  ): Promise<number> {
    const key = `rate_limit:${tenantId}:${Math.floor(Date.now() / 60000)}`;
    const current = await this.redis.get(key);

    return Math.max(0, limitPerMinute - parseInt(current || "0"));
  }
}