import { createClient } from "redis";
import { BaseMemoryService } from "../../../interfaces";
import { BaseMemoryType } from "../../../types";

export class RedisAdapter implements BaseMemoryService {
  private redis;
  private readonly cachePrefix: string;
  private readonly cacheTTL: number;

  constructor(
    private readonly redisUrl: string,
    options: {
      cachePrefix?: string;
      cacheTTL?: number;
    }
  ) {
    this.cachePrefix = options.cachePrefix || "memory:";
    this.cacheTTL = options.cacheTTL || 3600;
    this.redis = createClient({
      url: redisUrl,
      socket: {
        tls: true,
        rejectUnauthorized: true,
      },
    });
  }

  async initializeConnection(): Promise<void> {
    this.redis.on("error", (err) => console.error("Redis Client Error:", err));
    await this.redis.connect();
  }

  async createMemory(memory: BaseMemoryType, ttl?: number): Promise<void> {
    const key = memory.roomId
      ? `${this.cachePrefix}${memory.roomId}:${memory.id}`
      : `${this.cachePrefix}${memory.id}`;

    await this.redis.set(key, JSON.stringify(memory), {
      EX: ttl || this.cacheTTL,
    });
  }

  async getMemoryById(
    id: string,
    roomId?: string
  ): Promise<BaseMemoryType | null> {
    const key = roomId
      ? `${this.cachePrefix}${roomId}:${id}`
      : `${this.cachePrefix}${id}`;

    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async getMemoryByIndex(
    query: string,
    options: {
      roomId?: string;
      limit?: number;
    } = {}
  ): Promise<BaseMemoryType[]> {
    const pattern = options.roomId
      ? `${this.cachePrefix}${options.roomId}:*`
      : `${this.cachePrefix}*`;

    const keys = await this.redis.keys(pattern);
    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return memories.filter(Boolean).slice(0, options.limit || 10);
  }

  async getAllMemories(): Promise<BaseMemoryType[]> {
    const keys = await this.redis.keys(`${this.cachePrefix}*`);
    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return memories.filter(Boolean);
  }

  async clearMemoryById(id: string): Promise<void> {
    await this.redis.del(`${this.cachePrefix}${id}`);
  }

  async clearAllMemories(): Promise<void> {
    const keys = await this.redis.keys(`${this.cachePrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  async quit(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
