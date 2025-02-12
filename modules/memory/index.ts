import { BaseMemory, IMemoryAdapter } from "../../interfaces";
import { BaseMemoryType, CreateMemoryInput } from "../../types";

/**
 * @module Memory
 * @description A module for managing memory storage and retrieval operations.
 * Implements the BaseMemory abstract class and provides concrete implementations
 * for memory-related operations using the provided adapter.
 * @extends {BaseMemory}
 */
export class Memory extends BaseMemory {
  /**
   * Creates an instance of Memory
   * @param {IMemoryAdapter} adapter - The memory adapter implementation to use
   */
  constructor(adapter: IMemoryAdapter) {
    super(adapter);
  }

  /**
   * Initializes the memory module with default room
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    await this.adapter.init("default");
  }

  /**
   * Creates a new memory entry
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or undefined
   */
  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    return this.adapter.createMemory(input);
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
    return this.adapter.getMemoryById(id, roomId);
  }

  /**
   * Searches for memories based on query and options
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} options.roomId - Room identifier
   * @param {number} [options.limit] - Maximum number of results to return
   * @returns {Promise<BaseMemoryType[]>} Array of matching memories
   */
  async getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]> {
    return this.adapter.getMemoryByIndex(query, options);
  }

  /**
   * Retrieves all memories for a specific room
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories in the room
   */
  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    return this.adapter.getAllMemories(roomId);
  }

  /**
   * Deletes a specific memory
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async clearMemoryById(id: string, roomId: string): Promise<void> {
    await this.adapter.clearMemoryById(id, roomId);
  }

  /**
   * Clears all memories across all rooms
   * @returns {Promise<void>}
   */
  async clearAllMemories(): Promise<void> {
    await this.adapter.clearAllMemories();
  }
}
