import { BaseMemoryType, SharedState } from "../types";

/* ======================== PERSISTENCE ======================== */

/**
 * Interface for persisting graph execution state.
 */
export interface Persistence<T> {
  saveState(
    graphName: string,
    state: SharedState<T>,
    currentNode: string
  ): Promise<void>;
  loadState(
    graphName: string
  ): Promise<{ state: SharedState<T>; currentNode: string } | null>;
}

/* ======================== REAL-TIME NOTIFICATIONS ======================== */

/**
 * Interface for real-time notifications.
 */
export interface RealTimeNotifier {
  notify(event: string, data: any): void;
}

/* ======================== EMBEDDING SERVICE ======================== */

/**
 * Interface for an embedding service that processes text into vector representations.
 */
export interface EmbeddingService {
  /**
   * Generates an embedding for a single text.
   * @param {string} text - The input text to embed.
   * @returns {Promise<number[]>} - A vector representation of the text.
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Generates embeddings for multiple texts at once.
   * @param {string[]} texts - The array of texts to embed.
   * @returns {Promise<number[][]>} - A list of vector representations.
   */
  embedMany(texts: string[]): Promise<number[][]>;

  /**
   * Calculates the similarity between two embeddings.
   * @param {number[]} embedding1 - First vector.
   * @param {number[]} embedding2 - Second vector.
   * @returns {number} - A similarity score between the two vectors.
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;
}

/* ======================== MEMORY SERVICE ======================== */

/**
 * Interface for managing memory storage and retrieval.
 */
export interface BaseMemoryService {
  /**
   * Initializes the memory storage connection.
   * @returns {Promise<void>} - Resolves when initialization is complete.
   */
  initializeConnection(): Promise<void>;

  /**
   * Stores a new memory entry.
   * @param {BaseMemoryType} memory - The memory data to store.
   * @param {number} [ttl] - Optional time-to-live in seconds.
   * @returns {Promise<void>}
   */
  createMemory(memory: BaseMemoryType, ttl?: number): Promise<void>;

  /**
   * Retrieves a memory entry by its unique ID.
   * @param {string} id - The memory entry identifier.
   * @returns {Promise<BaseMemoryType | null>} - The found memory or null.
   */
  getMemoryById(id: string): Promise<BaseMemoryType | null>;

  /**
   * Searches for memory entries based on a query and optional constraints.
   * @param {string} query - The search query.
   * @param {Object} options - Search options.
   * @param {string} options.roomId - The room identifier.
   * @param {number} [options.limit] - Maximum number of results (optional).
   * @returns {Promise<BaseMemoryType[]>} - A list of matched memory entries.
   */
  getMemoryByIndex(
    query: string,
    options: {
      roomId: string;
      limit?: number;
    }
  ): Promise<BaseMemoryType[]>;

  /**
   * Retrieves all stored memory entries.
   * @returns {Promise<BaseMemoryType[]>} - A list of all memory entries.
   */
  getAllMemories(): Promise<BaseMemoryType[]>;

  /**
   * Deletes a memory entry by its unique ID.
   * @param {string} id - The memory entry identifier.
   * @returns {Promise<void>}
   */
  clearMemoryById(id: string): Promise<void>;

  /**
   * Clears all stored memory entries.
   * @returns {Promise<void>}
   */
  clearAllMemories(): Promise<void>;
}
