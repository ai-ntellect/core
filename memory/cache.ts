import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed } from "ai";
import { createClient } from "redis";
import {
  CacheMemoryOptions,
  CacheMemoryType,
  CreateMemoryInput,
  MatchOptions,
  MemoryScope,
  MemoryType,
  QueueResult,
} from "../types";

export class CacheMemory {
  private redis;
  private readonly CACHE_PREFIX: string;
  private readonly CACHE_TTL: number;

  constructor(options: CacheMemoryOptions = {}) {
    const ttlInHours = options.cacheTTL ?? 1;
    this.CACHE_TTL = ttlInHours * 60 * 60;
    this.CACHE_PREFIX = options.cachePrefix ?? "memory:";

    this.redis = createClient({
      url: options.redisUrl || process.env.REDIS_URL,
      socket: {
        tls: true,
        rejectUnauthorized: true,
      },
    });
    this.initRedis();
  }

  private async initRedis() {
    this.redis.on("error", (err) => {
      console.error("❌ Redis Client Error:", err);
    });

    try {
      await this.redis.connect();
      console.log("✅ Successfully connected to Redis");
    } catch (error) {
      console.error("❌ Failed to connect to Redis:", error);
    }
  }

  private getMemoryKey(scope: MemoryScope, userId?: string): string {
    if (scope === MemoryScope.GLOBAL) {
      return `${this.CACHE_PREFIX}global:`;
    }
    return `${this.CACHE_PREFIX}user:${userId}:`;
  }

  private async storeMemory(memory: CacheMemoryType) {
    const prefix = this.getMemoryKey(memory.scope, memory.userId);
    const key = `${prefix}${memory.id}`;
    const result = await this.redis.set(key, JSON.stringify(memory), {
      EX: this.CACHE_TTL,
    });
    console.log("💾 Cache memory created:", result);
  }

  async findSimilarActions(
    query: string,
    options: MatchOptions & { userId?: string; scope?: MemoryScope } = {}
  ): Promise<
    {
      actions: QueueResult[];
      similarityPercentage: number;
      query: string;
    }[]
  > {
    console.log("\n🔍 Searching in cache");
    console.log("Query:", query);
    console.log("Options:", JSON.stringify(options, null, 2));

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const memories = await this.getAllMemories(options.scope, options.userId);
    console.log(`\n📚 Found ${memories.length} cached queries to compare`);

    const matches = memories
      .map((memory) => {
        const similarity = cosineSimilarity(embedding, memory.embedding);
        const similarityPercentage = (similarity + 1) * 50;
        return {
          actions: memory.data,
          query: memory.query,
          similarityPercentage,
          createdAt: memory.createdAt,
        };
      })
      .filter(
        (match) =>
          match.similarityPercentage >= (options.similarityThreshold ?? 70)
      )
      .sort((a, b) => b.similarityPercentage - a.similarityPercentage);

    const results = options.maxResults
      ? matches.slice(0, options.maxResults)
      : matches;

    if (results.length > 0) {
      console.log("\n✨ Similar queries found:");
      console.log("─".repeat(50));

      results.forEach((match, index) => {
        console.log(`\n${index + 1}. Match Details:`);
        console.log(`   Query: ${match.query}`);
        console.log(`   Similarity: ${match.similarityPercentage.toFixed(2)}%`);
        console.log("─".repeat(50));
      });
    } else {
      console.log("\n❌ No similar queries found in cache");
    }

    return results;
  }

  async getAllMemories(
    scope?: MemoryScope,
    userId?: string
  ): Promise<CacheMemoryType[]> {
    let patterns: CacheMemoryType[] = [];

    if (!scope || scope === MemoryScope.GLOBAL) {
      const globalPrefix = this.getMemoryKey(MemoryScope.GLOBAL);
      const globalKeys = await this.redis.keys(`${globalPrefix}*`);
      const globalPatterns = await this.getMemoriesFromKeys(globalKeys);
      patterns = patterns.concat(globalPatterns);
    }

    if (userId && (!scope || scope === MemoryScope.USER)) {
      const userPrefix = this.getMemoryKey(MemoryScope.USER, userId);
      const userKeys = await this.redis.keys(`${userPrefix}*`);
      const userPatterns = await this.getMemoriesFromKeys(userKeys);
      patterns = patterns.concat(userPatterns);
    }

    return patterns;
  }

  private async getMemoriesFromKeys(
    keys: string[]
  ): Promise<CacheMemoryType[]> {
    const memories: CacheMemoryType[] = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        memories.push(JSON.parse(data));
      }
    }
    return memories;
  }

  public async createMemory(
    input: CreateMemoryInput
  ): Promise<CacheMemoryType | undefined> {
    console.log("\n📝 Processing new memory creation");
    console.log("Content:", input.content);
    console.log("Type:", input.type);
    console.log("Scope:", input.scope);

    const existingPattern = await this.findSimilarActions(input.content, {
      similarityThreshold: 95,
      userId: input.userId,
      scope: input.scope,
    });

    if (existingPattern.length > 0) {
      console.log("\n🔄 Similar cache memory already exists");
      console.log("─".repeat(50));
      existingPattern.forEach((match, index) => {
        console.log(`\n${index + 1}. Existing Match:`);
        console.log(`   Query: ${match.query}`);
        console.log(`   Similarity: ${match.similarityPercentage.toFixed(2)}%`);
      });
      console.log("\n⏭️  Skipping creation of new memory");
      return;
    }

    console.log("\n🆕 No similar memory found - creating new one");

    const memory = await this.createSingleMemory({
      id: crypto.randomUUID(),
      content: input.content,
      type: input.type,
      data: input.data,
      userId: input.userId,
      scope: input.scope,
    });

    return memory;
  }

  private async createSingleMemory(params: {
    id: string;
    content: string;
    type: MemoryType;
    data: any;
    userId?: string;
    scope?: MemoryScope;
  }): Promise<CacheMemoryType> {
    console.log("\n🏗️  Creating new cache memory");
    console.log("ID:", params.id);
    console.log("Content:", params.content);

    console.log("\n🧮 Generating embedding...");
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: params.content,
    });
    console.log("✅ Embedding generated successfully");

    const memory: CacheMemoryType = {
      id: params.id,
      type: params.type,
      data: params.data,
      query: params.content,
      embedding,
      userId: params.userId,
      scope:
        params.scope || (params.userId ? MemoryScope.USER : MemoryScope.GLOBAL),
      createdAt: new Date(),
    };

    await this.storeMemory(memory);
    console.log("✅ Memory created and stored successfully");

    return memory;
  }
}
