import { type CoreMessage } from "ai";
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

    // this.cleanupEverything();

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

  async storeMessage(
    role: "user" | "assistant" | "system",
    message: string
  ): Promise<void> {
    const id = crypto.randomUUID();
    const key = `recent_messages:${id}`;
    const coreMessage: CoreMessage = {
      role,
      content: message,
    };
    await this.redis.setex(
      key,
      this.defaultTTL,
      JSON.stringify({ ...coreMessage, timestamp: new Date().toISOString() })
    );
    console.log("🔍 Message stored successfully", { key, message });
  }

  /**
   * Store a recent message following CoreMessage structure
   */
  async storeRecentMessage(
    message: string,
    metadata?: {
      socialResponse?: string;
      agentName?: string;
      agentResponse?: string;
      actions?: any[];
    }
  ): Promise<void> {
    console.log("🔍 Storing recent message:", message);
    const id = crypto.randomUUID();
    const key = `recent_messages:${id}`;

    // Create CoreMessage structure
    const coreMessage: CoreMessage[] = [
      {
        role: "user",
        content: message,
      },
    ];

    // Add assistant response if available
    if (metadata?.socialResponse || metadata?.agentResponse) {
      coreMessage.push({
        role: "assistant",
        content:
          metadata.socialResponse || metadata.agentResponse
            ? `Agent ${metadata.agentName ? metadata.agentName : "Main"}: ${
                metadata.socialResponse || metadata.agentResponse
              }`
            : "",
      });
    }

    await this.redis.setex(
      key,
      this.defaultTTL,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        messages: coreMessage,
        actions: metadata?.actions || [],
      })
    );
    console.log("🔍 Recent message stored successfully", {
      key,
      message,
    });
  }

  /**
   * Get previous actions
   */
  async getRecentPreviousActions(limit: number = 10): Promise<any[]> {
    const keys = await this.redis.keys("previous_actions:*");
    if (!keys.length) return [];

    const actions = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return actions.slice(0, limit);
  }

  /**
   * Get recent messages in CoreMessage format
   */
  async getRecentMessages(limit: number = 10): Promise<CoreMessage[]> {
    const keys = await this.redis.keys("recent_messages:*");
    if (!keys.length) return [];

    const messages = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    const formattedMessages = messages
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ) // Tri par timestamp
      .map((message) => {
        return {
          role: message.role,
          content: message.content,
        };
      }) // Extraire les messages de chaque entrée
      .slice(0, limit); // Limiter le nombre de messages
    return formattedMessages;
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
  async cleanupEverything(): Promise<void> {
    const keys = await this.redis.keys("*");
    console.log("🔍 Cleaning up messages with TTL:", keys);

    for (const key of keys) {
      console.log(`🧹 Suppression de la clé expirée ou invalide: ${key}`);
      await this.redis.del(key);
    }
  }

  /**
   * Stop the cleanup job and close Redis connection
   */
  async close(): Promise<void> {
    this.cleanupJob.stop();
    await this.redis.quit();
  }

  /**
   * Store a memory with tags and categories
   */
  async storeMemory(
    data: string,
    category: string,
    tags: string[],
    ttl?: number
  ): Promise<void> {
    const id = crypto.randomUUID();
    const key = `memory:${id}`;
    const memoryData = {
      data,
      category,
      tags,
      timestamp: new Date().toISOString(),
    };

    // Enregistrer la mémoire avec TTL
    await this.redis.setex(
      key,
      ttl || this.defaultTTL,
      JSON.stringify(memoryData)
    );

    // Indexer les tags
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      await this.redis.sadd(tagKey, key);
    }

    // Indexer les catégories
    const categoryKey = `category:${category}`;
    await this.redis.sadd(categoryKey, key);
    console.log("🔍 Memory stored successfully", { key, memoryData });
  }

  /**
   * Get memories by a specific tag
   */
  async getMemoriesByTag(tag: string): Promise<any[]> {
    const tagKey = `tag:${tag}`;
    const keys = await this.redis.smembers(tagKey);

    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    return memories.filter(Boolean); // Filtrer les valeurs nulles
  }

  /**
   * Get memories by a specific category
   */
  async getMemoriesByCategory(category: string): Promise<any[]> {
    const categoryKey = `category:${category}`;
    const keys = await this.redis.smembers(categoryKey);

    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    return memories.filter(Boolean); // Filtrer les valeurs nulles
  }

  /**
   * Get all available tags
   */
  async getAllTags(): Promise<string[]> {
    const keys = await this.redis.keys("tag:*");
    return keys.map((key) => key.replace("tag:", ""));
  }

  /**
   * Get all available categories
   */
  async getAllCategories(): Promise<string[]> {
    const keys = await this.redis.keys("category:*");
    return keys.map((key) => key.replace("category:", ""));
  }
}
