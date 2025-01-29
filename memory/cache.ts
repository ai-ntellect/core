import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, EmbeddingModel } from "ai";
import { createClient } from "redis";
import {
  CacheMemoryOptions,
  CacheMemoryType,
  CreateMemoryInput,
  MatchOptions,
  MemoryScope,
} from "../types";

interface RecentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface RecentAction {
  action: any;
  timestamp: Date;
}

export class CacheMemory {
  private redis;
  private readonly CACHE_PREFIX: string;
  private readonly CACHE_TTL: number;
  private readonly embeddingModel: EmbeddingModel<string>;
  private readonly MESSAGE_PREFIX = "message:";
  private readonly ACTION_PREFIX = "action:";

  constructor(options: CacheMemoryOptions) {
    this.embeddingModel = options.embeddingModel;
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

  private async storeMemory(memory: CacheMemoryType, ttl?: number) {
    const prefix = this.CACHE_PREFIX;
    const key = `${prefix}${memory.id}`;
    const result = await this.redis.set(key, JSON.stringify(memory), {
      EX: ttl || this.CACHE_TTL,
    });
    console.log("💾 Cache memory created:", result);
  }

  async findSimilarActions(
    query: string,
    options: MatchOptions & { userId?: string; scope?: MemoryScope } = {}
  ): Promise<
    {
      data: any;
      query: string;
      createdAt: Date;
    }[]
  > {
    console.log("\n🔍 Searching in cache");
    console.log("Query:", query);
    console.log("Options:", JSON.stringify(options, null, 2));

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const memories = await this.getAllMemories();
    console.log(`\n📚 Found ${memories.length} cached queries to compare`);

    const matches = memories
      .map((memory) => {
        const similarity = cosineSimilarity(embedding, memory.embedding);
        const similarityPercentage = (similarity + 1) * 50;
        return {
          data: memory.data,
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
        console.log(`   Data: ${JSON.stringify(match.data)}`);
        console.log(`   Similarity: ${match.similarityPercentage.toFixed(2)}%`);
        console.log("─".repeat(50));
      });
    } else {
      console.log("\n❌ No similar queries found in cache");
    }

    return results.map((match) => {
      return {
        data: match.data,
        query: match.query,
        createdAt: match.createdAt,
      };
    });
  }

  async getAllMemories(): Promise<CacheMemoryType[]> {
    const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
    const memories = await this.getMemoriesFromKeys(keys);

    return memories;
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
    console.log("Content:", input.query);
    console.log("TTL:", input.ttl ? `${input.ttl} seconds` : "default");

    const existingPattern = await this.findSimilarActions(input.query, {
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
        console.log(`   Data: ${JSON.stringify(match.data)}`);
        console.log(`   Created At: ${match.createdAt}`);
      });
      console.log("\n⏭️  Skipping creation of new memory");
      return;
    }

    console.log("\n🆕 No similar memory found - creating new one");

    const memory = await this.createSingleMemory({
      id: crypto.randomUUID(),
      query: input.query,
      data: input.data,
      userId: input.userId,
      scope: input.scope,
      ttl: input.ttl,
    });

    return memory;
  }

  private async createSingleMemory(params: {
    id: string;
    query: string;
    data: any;
    userId?: string;
    scope?: MemoryScope;
    ttl?: number;
  }): Promise<CacheMemoryType> {
    console.log("\n🏗️  Creating new cache memory");
    console.log("ID:", params.id);
    console.log("Content:", params.query);

    console.log("\n🧮 Generating embedding...");
    const { embedding } = await embed({
      model: this.embeddingModel,
      value: params.query,
    });
    console.log("✅ Embedding generated successfully");

    const memory: CacheMemoryType = {
      id: params.id,
      data: params.data,
      query: params.query,
      embedding,
      userId: params.userId,
      scope:
        params.scope || (params.userId ? MemoryScope.USER : MemoryScope.GLOBAL),
      createdAt: new Date(),
    };

    await this.storeMemory(memory, params.ttl);
    console.log("✅ Short-term memory created and stored successfully", {
      ...memory,
      ttl: params.ttl || this.CACHE_TTL,
    });

    return memory;
  }

  async storeRecentMessage(
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<void> {
    const id = crypto.randomUUID();
    const key = `${this.MESSAGE_PREFIX}${id}`;

    const message: RecentMessage = {
      role,
      content,
      timestamp: new Date(),
    };

    await this.redis.set(key, JSON.stringify(message), {
      EX: this.CACHE_TTL,
    });
    console.log("💬 Recent message stored:", { role, content });
  }

  async getRecentMessages(limit: number = 10): Promise<RecentMessage[]> {
    const keys = await this.redis.keys(`${this.MESSAGE_PREFIX}*`);
    const messages: RecentMessage[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const parsedData = JSON.parse(data);
        parsedData.timestamp = new Date(parsedData.timestamp);
        messages.push(parsedData);
      }
    }

    return messages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async storeAction(action: any): Promise<void> {
    const id = crypto.randomUUID();
    const key = `${this.ACTION_PREFIX}${id}`;

    const actionData: RecentAction = {
      action,
      timestamp: new Date(),
    };

    await this.redis.set(key, JSON.stringify(actionData), {
      EX: this.CACHE_TTL,
    });
    console.log("🎯 Action stored:", action);
  }

  async getRecentActions(limit: number = 10): Promise<any[]> {
    const keys = await this.redis.keys(`${this.ACTION_PREFIX}*`);
    const actions: RecentAction[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const parsedData = JSON.parse(data);
        parsedData.timestamp = new Date(parsedData.timestamp);
        actions.push(parsedData);
      }
    }

    console.log("🔄 Returning recent actions:", actions);

    return actions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map((item) => item.action);
  }

  private async cleanupExpiredData(): Promise<void> {
    const messageKeys = await this.redis.keys(`${this.MESSAGE_PREFIX}*`);
    const actionKeys = await this.redis.keys(`${this.ACTION_PREFIX}*`);

    console.log("📊 Cache status:", {
      messages: messageKeys.length,
      actions: actionKeys.length,
    });
  }
}
