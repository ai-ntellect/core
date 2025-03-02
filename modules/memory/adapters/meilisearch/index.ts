import { IMemoryAdapter } from "../../../../interfaces";
import {
  BaseMemoryType,
  CreateMemoryInput,
  MeilisearchConfig,
} from "../../../../types";

/**
 * @module MeilisearchAdapter
 * @description Adapter implementation for Meilisearch as a memory storage solution.
 * Provides integration with Meilisearch for storing and retrieving memory entries.
 * @implements {IMemoryAdapter}
 */
export class MeilisearchAdapter implements IMemoryAdapter {
  /**
   * Creates an instance of MeilisearchAdapter
   * @param {MeilisearchConfig} config - Configuration for Meilisearch connection
   */
  constructor(private readonly config: MeilisearchConfig) {}

  /**
   * Makes an HTTP request to the Meilisearch API
   * @private
   * @param {string} path - API endpoint path
   * @param {RequestInit} [options] - Fetch request options
   * @returns {Promise<any>} Response data
   * @throws {Error} If the request fails
   */
  private async makeRequest(path: string, options?: RequestInit) {
    try {
      const url = `${this.config.host}${path}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${errorBody || response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          `Network error: Unable to connect to Meilisearch at ${this.config.host}`
        );
      }
      throw error;
    }
  }

  /**
   * Initializes a storage index for a room
   * @private
   * @param {string} roomId - Room identifier to create index for
   * @returns {Promise<void>}
   */
  private async initializeStorage(roomId: string): Promise<void> {
    try {
      let indexExists = false;

      try {
        await this.makeRequest(`/indexes/${roomId}`);
        indexExists = true;
      } catch (error) {
        if (!indexExists) {
          const createResponse = await this.makeRequest("/indexes", {
            method: "POST",
            body: JSON.stringify({
              uid: roomId,
              primaryKey: "id",
            }),
          });

          console.log("✅ Index creation response:", createResponse);
        }
      }

      // Appliquer les settings seulement si l'index existe bien
      await this.makeRequest(`/indexes/${roomId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          searchableAttributes: this.config.searchableAttributes || [
            "data",
            "query",
          ],
          sortableAttributes: this.config.sortableAttributes || ["createdAt"],
        }),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `❌ Error initializing storage for index ${roomId}:`,
        errorMessage
      );
      throw new Error(
        `Failed to initialize storage for index ${roomId}: ${errorMessage}`
      );
    }
  }

  /**
   * Adds documents to the Meilisearch index
   * @private
   * @param {BaseMemoryType[]} documents - Documents to add
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  private async addDocuments(
    documents: BaseMemoryType[],
    roomId: string
  ): Promise<void> {
    await this.makeRequest(`/indexes/${roomId}/documents`, {
      method: "POST",
      body: JSON.stringify(documents),
    });
  }

  /**
   * Deletes a storage index for a room
   * @private
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  private async deleteStorage(roomId: string): Promise<void> {
    await this.makeRequest(`/indexes/${roomId}`, {
      method: "DELETE",
    });
  }

  /**
   * Initializes the adapter for a specific room
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async init(roomId: string): Promise<void> {
    try {
      // Initialize the default "memories" index
      await this.initializeStorage(roomId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to initialize default index:", errorMessage);
      throw new Error(`Failed to initialize default index: ${errorMessage}`);
    }
  }

  /**
   * Performs a search in the Meilisearch index
   * @private
   * @param {string} query - Search query
   * @param {string} roomId - Room identifier
   * @param {Object} [options] - Search options
   * @param {number} [options.limit] - Maximum number of results
   * @param {number} [options.threshold] - Minimum score threshold
   * @returns {Promise<SearchResult[]>} Search results
   */
  private async search(
    query: string,
    roomId: string,
    options?: { limit?: number; threshold?: number }
  ): Promise<SearchResult[]> {
    const searchResults = await this.makeRequest(`/indexes/${roomId}/search`, {
      method: "POST",
      body: JSON.stringify({
        q: query,
        limit: options?.limit || 10,
      }),
    });

    if (!searchResults.hits) {
      return [];
    }

    return searchResults.hits.map((hit: any) => ({
      document: {
        id: hit.id,
        data: hit.data,
        embedding: hit.embedding,
        roomId: hit.roomId,
        createdAt: hit.createdAt,
      },
      score: hit._score || 0,
    }));
  }

  /**
   * Creates a new memory entry
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or undefined
   */
  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    // Initialize storage for this roomId if needed
    await this.initializeStorage(input.roomId);

    // Check if the memory already exists
    const existingMemory = await this.search(input.content, input.roomId, {
      limit: 1,
    });
    if (existingMemory.length > 0) {
      return existingMemory[0].document;
    }

    // If not found, create new memory
    const memory: BaseMemoryType = {
      id: input.id || crypto.randomUUID(),
      content: input.content,
      metadata: input.metadata,
      embedding: input.embedding,
      roomId: input.roomId,
      createdAt: new Date(),
    };

    await this.addDocuments([memory], input.roomId);
    return memory;
  }

  /**
   * Retrieves a memory by ID and room ID
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType | null>} Memory entry or null if not found
   */
  async getMemoryById(
    id: string,
    roomId: string
  ): Promise<BaseMemoryType | null> {
    try {
      const result = await this.makeRequest(
        `/indexes/${roomId}/documents/${id}`
      );
      return result
        ? {
            id: result.id,
            content: result.content,
            metadata: result.metadata,
            embedding: result.embedding,
            roomId: result.roomId,
            createdAt: result.createdAt,
          }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Searches for memories based on query and options
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
    const results = await this.search(query, options.roomId, {
      limit: options.limit,
    });
    return results
      .filter((result) => result.document.roomId === options.roomId)
      .map((result) => ({
        id: result.document.id,
        content: result.document.content,
        metadata: result.document.metadata,
        embedding: result.document.embedding,
        roomId: result.document.roomId,
        createdAt: result.document.createdAt,
      }));
  }

  /**
   * Retrieves all memories for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories
   */
  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    const results = await this.makeRequest(`/indexes/${roomId}/documents`);
    if (results.total === 0) {
      return [];
    }

    return results.results.map((doc: any) => ({
      id: doc.id,
      data: doc.data,
      embedding: doc.embedding,
      roomId: doc.roomId,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Deletes a specific memory
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async clearMemoryById(id: string, roomId: string): Promise<void> {
    try {
      // Ensure the index exists before attempting to delete
      await this.initializeStorage(roomId);

      await this.makeRequest(`/indexes/${roomId}/documents/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Error clearing memory ${id} from index ${roomId}:`,
        errorMessage
      );
      throw new Error(
        `Failed to clear memory ${id} from index ${roomId}: ${errorMessage}`
      );
    }
  }

  /**
   * Clears all memories across all rooms
   * @returns {Promise<void>}
   */
  async clearAllMemories(): Promise<void> {
    try {
      // Get all indexes
      const response = await this.makeRequest("/indexes");
      const indexes = response.results || [];

      // Delete each index
      for (const index of indexes) {
        await this.deleteStorage(index.uid);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to clear all memories: ${errorMessage}`);
    }
  }
}

/**
 * @interface SearchResult
 * @description Interface for search results from Meilisearch
 */
interface SearchResult {
  /** The matched document */
  document?: any;
  /** Relevance score of the match */
  score?: number;
  /** Array of additional results */
  results?: any[];
}
