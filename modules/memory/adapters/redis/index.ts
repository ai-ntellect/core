import { IMemoryAdapter } from "interfaces";
import { createClient } from "redis";
import { BaseMemoryType, CreateMemoryInput } from "types";

/**
 * @module RedisAdapter
 * @description Adapter implementation for Redis as a memory storage solution.
 * Provides integration with Redis for storing and retrieving memory entries with TTL support.
 * @implements {IMemoryAdapter}
 */
export class RedisAdapter implements IMemoryAdapter {
  private redis;
  private readonly cachePrefix: string;
  private readonly cacheTTL: number;

  /**
   * Creates an instance of RedisAdapter
   * @param {string} redisUrl - Redis connection URL
   * @param {Object} options - Configuration options
   * @param {string} [options.cachePrefix="memory:"] - Prefix for Redis keys
   * @param {number} [options.cacheTTL=3600] - Default TTL in seconds
   */
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

  /**
   * Initializes the Redis connection
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async init(roomId: string): Promise<void> {
    this.redis.on("error", (err) => console.error("Redis Client Error:", err));
    await this.redis.connect();
  }

  /**
   * Creates a new memory entry in Redis
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or undefined
   */
  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    const memory: BaseMemoryType = {
      id: input.id || crypto.randomUUID(),
      data: input.data,
      embedding: input.embedding,
      roomId: input.roomId,
      createdAt: new Date(),
    };

    const key = memory.roomId
      ? `${this.cachePrefix}${memory.roomId}:${memory.id}`
      : `${this.cachePrefix}${memory.id}`;

    await this.redis.set(key, JSON.stringify(memory), {
      EX: this.cacheTTL,
    });

    return memory;
  }

  /**
   * Retrieves a memory by ID and room ID from Redis
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType | null>} Memory entry or null if not found
   */
  async getMemoryById(
    id: string,
    roomId: string
  ): Promise<BaseMemoryType | null> {
    const key = `${this.cachePrefix}${roomId}:${id}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Searches for memories in Redis based on pattern matching
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} options.roomId - Room identifier
   * @param {number} [options.limit] - Maximum number of results
   * @returns {Promise<BaseMemoryType[]>} Array of matching memories
   */
  async getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]> {
    const pattern = `${this.cachePrefix}${options.roomId}:*`;
    const keys = await this.redis.keys(pattern);
    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return memories.filter(Boolean).slice(0, options.limit || 10);
  }

  /**
   * Retrieves all memories for a room from Redis
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories
   */
  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    const pattern = `${this.cachePrefix}${roomId}:*`;
    const keys = await this.redis.keys(pattern);
    const memories = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return memories.filter(Boolean);
  }

  /**
   * Deletes a specific memory from Redis
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async clearMemoryById(id: string, roomId: string): Promise<void> {
    const key = `${this.cachePrefix}${roomId}:${id}`;
    await this.redis.del(key);
  }

  /**
   * Clears all memories across all rooms from Redis
   * @returns {Promise<void>}
   */
  async clearAllMemories(): Promise<void> {
    const keys = await this.redis.keys(`${this.cachePrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  /**
   * Closes the Redis connection
   * @returns {Promise<void>}
   */
  async quit(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
