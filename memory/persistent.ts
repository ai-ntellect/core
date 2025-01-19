import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, embedMany } from "ai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Memory, MemoryScope } from "../types";

interface SearchOptions {
  scope?: MemoryScope;
  userId?: string;
  maxResults?: number;
  similarityThreshold?: number;
}

interface MeilisearchSettings {
  searchableAttributes?: string[];
  sortableAttributes?: string[];
}

interface MeilisearchResponse {
  hits: Array<{
    query: string;
    purpose: string;
    data?: any;
    chunks: Array<{
      content: string;
      embedding: number[];
    }>;
  }>;
}

interface SearchParams {
  q?: string;
  offset?: number;
  limit?: number;
  filter?: string | string[];
  facets?: string[];
  attributesToRetrieve?: string[];
  attributesToSearchOn?: string[];
  sort?: string[];
  matchingStrategy?: "last" | "all" | "frequency";
}

interface ProcessedChunk {
  content: string;
  embedding: number[];
}

/**
 * Handles persistent memory storage using Meilisearch API
 */
export class PersistentMemory {
  private readonly host: string;
  private readonly apiKey: string;
  private readonly INDEX_PREFIX: string;

  constructor(options: { host: string; apiKey: string; indexPrefix?: string }) {
    this.host = options.host;
    this.apiKey = options.apiKey;
    this.INDEX_PREFIX = options.indexPrefix || "memory_";
  }

  /**
   * Initialize indexes
   */
  async init() {
    // Create global index
    await this._getOrCreateIndex(this._getIndexName(MemoryScope.GLOBAL));

    // Create user index
    await this._getOrCreateIndex(this._getIndexName(MemoryScope.USER));
  }

  /**
   * Make API request to Meilisearch
   */
  private async _makeRequest<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.host}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      console.log({ response });
      throw new Error(`Meilisearch API error: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get index name based on scope and userId
   */
  private _getIndexName(scope: MemoryScope, userId?: string): string {
    if (scope === "global") {
      return `${this.INDEX_PREFIX}global`;
    }
    return `${this.INDEX_PREFIX}user_${userId}`;
  }

  /**
   * Get or create an index with proper settings
   */
  private async _getOrCreateIndex(indexName: string) {
    try {
      // Try to create index
      await this._makeRequest("/indexes", {
        method: "POST",
        body: JSON.stringify({
          uid: indexName,
          primaryKey: "id",
        }),
      });

      // Update index settings
      const settings: MeilisearchSettings = {
        searchableAttributes: ["query", "purpose", "chunks.content"],
        sortableAttributes: ["createdAt"],
      };

      await this._makeRequest(`/indexes/${indexName}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
    } catch (error: any) {
      // Index might already exist, which is fine
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }
  }

  async processContent(content: string): Promise<ProcessedChunk[]> {
    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const chunks = await textSplitter.createDocuments([content]);

    // Generate embeddings for all chunks
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: chunks.map((chunk) => chunk.pageContent),
    });

    // Create processed chunks with embeddings
    return chunks.map((chunk, i) => ({
      content: chunk.pageContent,
      embedding: embeddings[i],
    }));
  }

  /**
   * Store a memory in the database
   */
  async createMemory(memory: Memory) {
    const indexName = this._getIndexName(memory.scope, memory.userId);
    await this._getOrCreateIndex(indexName);

    const chunks = await this.processContent(memory.query);

    const document = {
      ...memory,
      chunks,
      createdAt: memory.createdAt.toISOString(),
    };

    const response = await this._makeRequest(
      `/indexes/${indexName}/documents`,
      {
        method: "POST",
        body: JSON.stringify([document]),
      }
    );
    console.log("Stored persistent memory response:", response);
    return response;
  }

  /**
   * Find best matching memories
   */
  async searchSimilarQueries(query: string, options: SearchOptions = {}) {
    console.log("\n🔍 Searching in persistent memory");
    console.log("Query:", query);
    console.log("Options:", JSON.stringify(options, null, 2));

    // Generate embedding for the query
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const searchResults = [];

    // Search in global memories
    if (!options.scope || options.scope === "global") {
      const globalIndex = this._getIndexName(MemoryScope.GLOBAL);
      console.log("\n📚 Searching in global index:", globalIndex);
      try {
        const globalResults = await this._makeRequest<MeilisearchResponse>(
          `/indexes/${globalIndex}/search`,
          {
            method: "POST",
            body: JSON.stringify({ q: query }),
          }
        );
        if (globalResults?.hits) {
          searchResults.push(...globalResults.hits);
        }
      } catch (error) {
        console.error("❌ Error searching global index:", error);
      }
    }

    // Search in user memories
    if (
      options.userId &&
      (!options.scope || options.scope === MemoryScope.USER)
    ) {
      const userIndex = this._getIndexName(MemoryScope.USER, options.userId);
      const userResults = await this._makeRequest<MeilisearchResponse>(
        `/indexes/${userIndex}/search`,
        {
          method: "POST",
          body: JSON.stringify({ q: query }),
        }
      );
      if (userResults.hits) {
        searchResults.push(...userResults.hits);
      }
    }

    const totalResults = searchResults.length;
    console.log(`\n📊 Found ${totalResults} total matches`);

    // Process and filter results using cosine similarity
    const results = searchResults
      .flatMap((hit) => {
        const chunkSimilarities = hit.chunks.map((chunk) => ({
          data: hit.data,
          purpose: hit.purpose,
          query: hit.query,
          chunk: chunk.content,
          similarityPercentage:
            (cosineSimilarity(queryEmbedding, chunk.embedding) + 1) * 50,
        }));

        return chunkSimilarities.reduce(
          (best, current) =>
            current.similarityPercentage > best.similarityPercentage
              ? current
              : best,
          chunkSimilarities[0]
        );
      })
      .filter(
        (match) =>
          match.similarityPercentage >= (options.similarityThreshold || 70)
      )
      .sort((a, b) => b.similarityPercentage - a.similarityPercentage);

    // Log filtered results in a more structured way
    if (results.length > 0) {
      console.log("\n✨ Relevant matches found:");
      console.log("─".repeat(50));

      results.forEach((match, index) => {
        console.log(`\n${index + 1}. Match Details:`);
        console.log(`   Query: ${match.query}`);
        console.log(`   Purpose: ${match.purpose}`);
        console.log(`   Similarity: ${match.similarityPercentage.toFixed(2)}%`);
        console.log(`   Content: "${match.chunk}"`);
        console.log("─".repeat(50));
      });
    } else {
      console.log("\n❌ No relevant matches found");
    }

    return results;
  }

  /**
   * Delete memories for a given scope and user
   */
  async deleteMemories(scope: MemoryScope, userId?: string) {
    const indexName = this._getIndexName(scope, userId);
    return this._makeRequest(`/indexes/${indexName}`, {
      method: "DELETE",
    });
  }
}
