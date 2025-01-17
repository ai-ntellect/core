import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, generateObject } from "ai";
import { createClient } from "redis";
import { z } from "zod";
import {
  CacheMemoryOptions,
  CacheMemoryType,
  CreateMemoryInput,
  MatchOptions,
  MemoryScope,
  MemoryType,
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
      console.error("Redis Client Error:", err);
      // Implement retry logic if needed
    });

    try {
      await this.redis.connect();
      console.log("Successfully connected to Redis");
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      // Handle connection failure
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
    console.log("Cache memory created: ", result);
  }

  async findSimilarQueries(
    query: string,
    options: MatchOptions & { userId?: string; scope?: MemoryScope } = {}
  ): Promise<
    {
      data: any;
      similarityPercentage: number;
      query: string;
    }[]
  > {
    console.log("\nSearching in cache for query:", query);

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const memories = await this.getAllMemories(options.scope, options.userId);
    console.log("\n📚 Found", memories.length, "queries to compare with");

    const matches = memories
      .map((memory) => {
        const similarity = cosineSimilarity(embedding, memory.embedding);
        const similarityPercentage = (similarity + 1) * 50; // Conversion en pourcentage

        console.log(`\n📊 Query "${memory.query}":
        - Similarity: ${similarityPercentage.toFixed(2)}%`);

        return {
          data: memory.data,
          query: memory.query,
          similarityPercentage,
          // Optionnel : ajouter des métadonnées utiles
          memoryId: memory.id,
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
      results.forEach((match) => {
        console.log(
          `- ${match.query} (${match.similarityPercentage.toFixed(2)}%)`
        );
      });
    } else {
      console.log("No matches found");
    }

    console.dir({ results });
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
  ): Promise<string | undefined> {
    console.log("Searching for similar memory", input);
    const existingPattern = await this.findSimilarQueries(input.content, {
      similarityThreshold: 95,
      userId: input.userId,
      scope: input.scope,
    });

    if (existingPattern.length > 0) {
      console.log("\nSimilar cache memory found:");
      existingPattern.forEach((match) => {
        console.log(
          `- ${match.query} (${match.similarityPercentage.toFixed(2)}%)`
        );
      });
      console.log("Cache memory already exists. No need to create new one..");
      return;
    }

    console.log("No similar memory found");

    // Générer les variations via GPT-4
    console.log("Generating variations...");
    const variations = await generateObject({
      model: openai("gpt-4"),
      schema: z.object({
        request: z.string().describe("The request to be performed"),
        queries: z.array(z.object({ text: z.string() })),
      }),
      prompt: `For this input: "${input.content}"
        Generate similar way to ask the same question.
        Action results: ${JSON.stringify(input.data)}
        - Keep variations natural and human-like
        - Add 3-5 variations`,
    });
    console.log("Variations generated:", variations.object.queries);
    await this.createSingleMemory({
      id: crypto.randomUUID(),
      content: input.content,
      type: input.type,
      data: input.data,
      userId: input.userId,
      scope: input.scope,
    });

    const variationPromises = variations.object.queries.map(
      async (variation) => {
        if (variation.text !== input.content) {
          await this.createSingleMemory({
            id: crypto.randomUUID(),
            content: variation.text,
            type: input.type,
            data: input.data,
            userId: input.userId,
            scope: input.scope,
          });
        }
      }
    );

    await Promise.all(variationPromises);
    return variations.object.request;
  }

  private async createSingleMemory(params: {
    id: string;
    content: string;
    type: MemoryType;
    data: any;
    userId?: string;
    scope?: MemoryScope;
  }): Promise<CacheMemoryType> {
    console.log("Creating new cache memory...", params.content);
    console.log("Creating embedding...");
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: params.content,
    });
    console.log("Embedding created");
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
    return memory;
  }
}
