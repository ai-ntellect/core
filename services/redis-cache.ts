import Redis from "ioredis";
import cron from "node-cron";

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  ttl?: number; // Time to live in seconds (default 30 minutes)
  cleanupInterval?: string; // Cron expression (default every 30 minutes)
}

export class RedisCache {
  private redis: Redis;
  private readonly defaultTTL: number;
  private readonly cleanupJob: cron.ScheduledTask;

  constructor(config: CacheConfig) {
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
    });

    this.defaultTTL = config.ttl || 1800; // 30 minutes in seconds

    // Setup cleanup job (default: every 30 minutes)
    this.cleanupJob = cron.schedule(
      config.cleanupInterval || "*/30 * * * *",
      () => this.cleanup()
    );
  }

  /**
   * Store previous actions for a specific request
   */
  async storePreviousActions(requestId: string, actions: any[]): Promise<void> {
    const key = `previous_actions:${requestId}`;
    await this.redis.setex(
      key,
      this.defaultTTL,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        actions,
      })
    );
  }

  /**
   * Get previous actions for a specific request
   */
  async getPreviousActions(requestId: string): Promise<any[]> {
    const key = `previous_actions:${requestId}`;
    const data = await this.redis.get(key);
    if (!data) return [];

    const parsed = JSON.parse(data);
    return parsed.actions;
  }

  /**
   * Store a recent message
   */
  async storeRecentMessage(
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const id = crypto.randomUUID();
    const key = `recent_messages:${id}`;
    await this.redis.setex(
      key,
      this.defaultTTL,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message,
        metadata,
      })
    );
  }

  /**
   * Get recent messages
   */
  async getRecentMessages(limit: number = 10): Promise<any[]> {
    const keys = await this.redis.keys("recent_messages:*");
    if (!keys.length) return [];

    const messages = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    return messages
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Cleanup expired keys
   */
  private async cleanup(): Promise<void> {
    console.log("🧹 Starting cache cleanup...");
    try {
      // Redis automatically removes expired keys
      // This is just for logging purposes
      const actionKeys = await this.redis.keys("previous_actions:*");
      const messageKeys = await this.redis.keys("recent_messages:*");
      console.log(
        `Cache status: ${actionKeys.length} actions, ${messageKeys.length} messages`
      );
    } catch (error) {
      console.error("❌ Cache cleanup error:", error);
    }
  }

  /**
   * Stop the cleanup job and close Redis connection
   */
  async close(): Promise<void> {
    this.cleanupJob.stop();
    await this.redis.quit();
  }
}
