import { cosineSimilarity, embed, EmbeddingModel, embedMany } from "ai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { LongTermMemory, MemoryScope } from "../types";

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
    createdAt: string;
    query: string;
    purpose: string;
    data?: any;
    chunks: Array<{
      content: string;
      embedding: number[];
    }>;
  }>;
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
  private readonly embeddingModel: EmbeddingModel<string>;
  constructor(options: {
    host: string;
    apiKey: string;
    indexPrefix?: string;
    embeddingModel: EmbeddingModel<string>;
  }) {
    this.host = options.host;
    this.apiKey = options.apiKey;
    this.INDEX_PREFIX = options.indexPrefix || "memory";
    this.embeddingModel = options.embeddingModel;
  }

  /**
   * Initialize indexes
   */
  async init() {
    try {
      // Create or get main index
      await this._getOrCreateIndex(this.INDEX_PREFIX);
      console.log(`✅ Index '${this.INDEX_PREFIX}' initialized successfully`);
    } catch (error) {
      console.error(`❌ Failed to initialize index: ${error}`);
      throw error;
    }
  }

  /**
   * Make API request to Meilisearch
   */
  private async _makeRequest<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.host}${path}`;
    console.log("🔍 Making request to Meilisearch:", url);
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
   * Get or create an index with proper settings
   */
  private async _getOrCreateIndex(indexName: string) {
    try {
      // Check if index exists first
      const indexExists = await this._makeRequest(`/indexes/${indexName}`, {
        method: "GET",
      }).catch(() => false);

      if (!indexExists) {
        console.log(`Creating new index: ${indexName}`);
        await this._makeRequest("/indexes", {
          method: "POST",
          body: JSON.stringify({
            uid: indexName,
            primaryKey: "id",
          }),
        });
      }

      // Update index settings
      const settings: MeilisearchSettings = {
        searchableAttributes: ["query", "purpose", "chunks.content"],
        sortableAttributes: ["createdAt"],
      };

      await this._makeRequest(`/indexes/${indexName}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });

      console.log(`Index ${indexName} configured successfully`);
    } catch (error: any) {
      console.error(`Failed to configure index ${indexName}:`, error);
      throw error;
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
      model: this.embeddingModel,
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
  async createMemory(memory: LongTermMemory) {
    try {
      console.log(`📝 Creating memory in index: ${this.INDEX_PREFIX}`);

      // Process content into chunks with embeddings
      const chunks = await this.processContent(memory.data);

      // Generate unique ID if not provided
      const id = memory.id || crypto.randomUUID();

      const document = {
        ...memory,
        chunks,
        createdAt: memory.createdAt.toISOString(),
      };

      const response = await this._makeRequest(
        `/indexes/${this.INDEX_PREFIX}/documents`,
        {
          method: "POST",
          body: JSON.stringify([document]),
        }
      );

      console.log("✅ Memory created successfully", { id });
      return response;
    } catch (error) {
      console.error("❌ Failed to create memory:", error);
      throw error;
    }
  }

  /**
   * Find best matching memories
   */
  async findRelevantDocuments(query: string, options: SearchOptions = {}) {
    console.log(`\n🔍 Searching in index: ${this.INDEX_PREFIX}`);
    console.log("Query:", query);

    try {
      // Generate embedding for the query
      const { embedding: queryEmbedding } = await embed({
        model: this.embeddingModel,
        value: query,
      });

      // Search in the index
      const searchResults = await this._makeRequest<MeilisearchResponse>(
        `/indexes/${this.INDEX_PREFIX}/search`,
        {
          method: "POST",
          body: JSON.stringify({
            q: query,
            limit: options.maxResults || 10,
          }),
        }
      );

      if (!searchResults?.hits?.length) {
        console.log("❌ No matches found");
        return [];
      }

      // Process and filter results using cosine similarity
      const results = searchResults.hits
        .flatMap((hit) => {
          const chunkSimilarities = hit.chunks.map((chunk) => ({
            query: hit.query,
            data: hit.data,
            similarityPercentage:
              (cosineSimilarity(queryEmbedding, chunk.embedding) + 1) * 50,
            createdAt: hit.createdAt,
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

      console.log(`✨ Found ${results.length} relevant matches`);
      return results.map((result) => ({
        query: result.query,
        data: result.data,
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error("❌ Search failed:", error);
      return [];
    }
  }

  /**
   * Delete memories for a given scope and user
   */
  async deleteMemories() {
    return this._makeRequest(`/indexes/${this.INDEX_PREFIX}`, {
      method: "DELETE",
    });
  }
}
