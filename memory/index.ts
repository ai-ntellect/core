import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, embedMany, generateObject } from "ai";
import { createClient } from 'redis';
import { z } from "zod";
import { CreateMemoryInput, MatchOptions, Memory, MemoryCacheOptions, MemoryScope } from "../types";

export class MemoryCache {
  private redis;
  private readonly CACHE_PREFIX: string;
  private readonly CACHE_TTL: number;

  constructor(options: MemoryCacheOptions = {}) {
    const ttlInHours = options.cacheTTL ?? 1;
    this.CACHE_TTL = ttlInHours * 60 * 60;
    this.CACHE_PREFIX = options.cachePrefix ?? 'memory:';
    
    this.redis = createClient({
      url: options.redisUrl || process.env.REDIS_URL,
      socket: {
        tls: true,
        rejectUnauthorized: true
      }
    });
    this.initRedis();
  }

  private async initRedis() {
    this.redis.on('error', err => {
      console.error('Redis Client Error:', err);
      // Implement retry logic if needed
    });
    
    try {
      await this.redis.connect();
      console.log('Successfully connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      // Handle connection failure
    }
  }

  private getMemoryKey(scope: MemoryScope, userId?: string): string {
    if (scope === MemoryScope.GLOBAL) {
      return `${this.CACHE_PREFIX}global:`;
    }
    return `${this.CACHE_PREFIX}user:${userId}:`;
  }

  private async storeMemory(memory: Memory) {
    const prefix = this.getMemoryKey(memory.scope, memory.userId);
    const key = `${prefix}${memory.id}`;
    await this.redis.set(key, JSON.stringify(memory), {
      EX: this.CACHE_TTL
    });
  }

  async findBestMatches(
    query: string, 
    options: MatchOptions & { userId?: string; scope?: MemoryScope } = {}
  ): Promise<{
    data: any;
    similarityPercentage: number;
    purpose: string;
  }[]> {
    console.log("\n🔍 Searching for query:", query);

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query
    });

    const memories = await this.getAllMemories(options.scope, options.userId);
    console.log("\n📚 Found", memories.length, "memories to compare with");

    const matches = memories
      .map(memory => {
        const similarities = memory.embeddings.map(emb => {
          const similarity = cosineSimilarity(embedding, emb);
         
          return (similarity + 1) * 50; // Convert to percentage
        });

        const maxSimilarity = Math.max(...similarities);
        console.log(`\n📊 Memory "${memory.purpose}":
          - Similarity: ${maxSimilarity.toFixed(2)}%
          - Original queries: ${memory.queries.join(", ")}`);

        return {
          data: memory.data,
          similarityPercentage: maxSimilarity,
          purpose: memory.purpose,
        };
      })
      .filter(match => match.similarityPercentage >= (options.similarityThreshold ?? 70))
      .sort((a, b) => b.similarityPercentage - a.similarityPercentage);

    const results = options.maxResults ? matches.slice(0, options.maxResults) : matches;
    
    if (results.length > 0) {
    console.log("\n✨ Best matches found:");
      results.forEach(match => {
        console.log(`- ${match.purpose} (${match.similarityPercentage.toFixed(2)}%)`);
      });
    } else {
      console.log("No matches found");
    }

    console.dir({results});
    return results;
  }

  private async getAllMemories(scope?: MemoryScope, userId?: string): Promise<Memory[]> {
    let patterns: Memory[] = [];

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

  private async getMemoriesFromKeys(keys: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        memories.push(JSON.parse(data));
      }
    }
    return memories;
  }

  public async createMemory(input: CreateMemoryInput): Promise<string | undefined> {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: input.content
    });

    const existingPattern = await this.findBestMatches(input.content, {
      similarityThreshold: 95,
      userId: input.userId,
      scope: input.scope
    });

    if (existingPattern.length > 0) {
      console.log("\n🔍 Similar memory found:");
      // Display only the name and similarity percentage
      existingPattern.forEach(match => {
        console.log(`- ${match.purpose} (${match.similarityPercentage.toFixed(2)}%)`);
      });
      return;
    }

    const variations = await generateObject({
      model: openai("gpt-4"),
      schema: z.object({
        request: z.string().describe("The request to be performed"),
        queries: z.array(z.object({
              text: z.string()
        }))
      }),
      prompt: `For this input: "${input.content}"
        Generate similar variations that should match the same context.
        Context type: ${input.type}
        Data: ${JSON.stringify(input.data)}
        - Keep variations natural and human-like
        - Include the original input
        - Add 3-5 variations`
    });

    const embeddingResults = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: variations.object.queries.map(q => q.text)
    });

    const memory: Memory = {
      id: crypto.randomUUID(),
      type: input.type,
      data: input.data,
      purpose: variations.object.request,
      queries: [input.content, ...variations.object.queries.map(q => q.text)],
      embeddings: [embedding, ...embeddingResults.embeddings],
      userId: input.userId,
      scope: input.scope || (input.userId ? MemoryScope.USER : MemoryScope.GLOBAL),
      createdAt: new Date()
    };
    
    await this.storeMemory(memory);
    return variations.object.request;
  }
}
