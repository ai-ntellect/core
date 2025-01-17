import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, embedMany } from "ai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MeiliSearch } from "meilisearch";

export const MemoryScope = {
  GLOBAL: "global",
  USER: "user",
};

export class PersistentMemory {
  /**
   * @param {Object} options
   * @param {string} options.host - MeiliSearch host URL
   * @param {string} options.apiKey - MeiliSearch API key
   * @param {string} [options.indexPrefix="memory_"] - Prefix for index names
   */
  constructor(options) {
    this.client = new MeiliSearch({
      host: options.host,
      apiKey: options.apiKey,
    });
    this.INDEX_PREFIX = options.indexPrefix || "memory_";
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
  }

  /**
   * Get the index name based on scope and userId
   * @private
   */
  _getIndexName(scope, userId) {
    if (scope === MemoryScope.GLOBAL) {
      return `${this.INDEX_PREFIX}global`;
    }
    return `${this.INDEX_PREFIX}user_${userId}`;
  }

  /**
   * Get or create an index with proper settings
   * @private
   */
  async _getOrCreateIndex(indexName) {
    const index = this.client.index(indexName);

    try {
      await this.client.createIndex(indexName, { primaryKey: "id" });
      await index.updateSettings({
        searchableAttributes: ["query", "purpose", "chunks.content"],
        sortableAttributes: ["createdAt"],
      });
    } catch (error) {
      // Index might already exist, which is fine
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    return index;
  }

  /**
   * Process content into chunks with embeddings
   * @private
   */
  async _processContent(content) {
    // Split content into chunks
    const chunks = await this.textSplitter.createDocuments([content]);

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
   * @param {Object} memory - Memory object to store
   */
  async storeMemory(memory) {
    const indexName = this._getIndexName(memory.scope, memory.userId);
    const index = await this._getOrCreateIndex(indexName);

    // Process the query into chunks with embeddings
    const chunks = await this._processContent(memory.query);

    const result = await index.addDocuments([
      {
        ...memory,
        chunks,
        createdAt: memory.createdAt.toISOString(),
      },
    ]);
    return result;
  }

  /**
   * Find best matching memories using cosine similarity
   * @param {string} query - Search query
   * @param {Object} options - Search options
   */
  async findBestMatches(query, options = {}) {
    console.log("\n🔍 Searching in persistent memory:", query);

    // Generate embedding for the query
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });
    const searchResults = [];

    // Search in global memories
    if (!options.scope || options.scope === MemoryScope.GLOBAL) {
      const globalIndex = await this._getOrCreateIndex(
        this._getIndexName(MemoryScope.GLOBAL)
      );
      const globalResults = await globalIndex.search(query, {
        limit: options.maxResults || 10,
      });
      searchResults.push(...globalResults.hits);
    }

    // Search in user memories
    if (
      options.userId &&
      (!options.scope || options.scope === MemoryScope.USER)
    ) {
      const userIndex = await this._getOrCreateIndex(
        this._getIndexName(MemoryScope.USER, options.userId)
      );
      const userResults = await userIndex.search(query, {
        limit: options.maxResults || 10,
      });
      searchResults.push(...userResults.hits);
    }

    // Process and filter results using cosine similarity
    const results = searchResults
      .flatMap((hit) => {
        // Calculate similarities for each chunk
        console.log(hit);
        const chunkSimilarities = hit.chunks.map((chunk) => ({
          data: hit.data,
          purpose: hit.purpose,
          chunk: chunk.content,
          similarityPercentage:
            (cosineSimilarity(queryEmbedding, chunk.embedding) + 1) * 50,
        }));
        console.log({ chunkSimilarities });
        // Return the chunk with highest similarity
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

    // Log results
    if (results.length > 0) {
      console.log("\n✨ Best matches found:");
      results.forEach((match) => {
        console.log(
          `- ${match.purpose} (${match.similarityPercentage.toFixed(2)}%)`
        );
        console.log(`  Matching chunk: "${match.chunk}"`);
      });
    } else {
      console.log("No matches found");
    }

    return results;
  }

  /**
   * Delete memories for a given scope and user
   * @param {string} scope - Memory scope
   * @param {string} [userId] - User ID for user-specific memories
   */
  async deleteMemories(scope, userId) {
    const indexName = this._getIndexName(scope, userId);
    await this.client.deleteIndex(indexName);
  }
}
