import { ICronJob, IMemoryAdapter } from "../../../../interfaces";
import {
  BaseMemoryType,
  CreateMemoryInput,
  ScheduledRequest,
} from "../../../../types";

/**
 * @module InMemoryAdapter
 * @description In-memory implementation of the memory storage adapter.
 * Provides a simple Map-based storage solution
 * @implements {IMemoryAdapter}
 */
export class InMemoryAdapter implements IMemoryAdapter {
  /** Internal storage using Map structure for jobs and requests */
  private jobs: Map<string, ICronJob>;
  /** Internal storage using Map structure for requests */
  private requests: Map<string, ScheduledRequest>;
  /** Internal storage using Map structure */
  private storage: Map<string, BaseMemoryType[]>;

  /**
   * Creates an instance of InMemoryAdapter
   */
  constructor() {
    this.storage = new Map();
    this.jobs = new Map();
    this.requests = new Map();
  }

  /**
   * Initializes storage for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async init(roomId: string): Promise<void> {
    if (!this.storage.has(roomId)) {
      this.storage.set(roomId, []);
    }
  }

  /**
   * Creates a new memory entry
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or existing memory if duplicate
   */
  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    await this.init(input.roomId);

    // Check if memory already exists
    const memories = this.storage.get(input.roomId) || [];
    const existingMemory = memories.find((m) => m.content === input.content);
    if (existingMemory) {
      return existingMemory;
    }

    // Create new memory
    const memory: BaseMemoryType = {
      id: input.id || crypto.randomUUID(),
      content: input.content,
      metadata: input.metadata,
      embedding: input.embedding,
      roomId: input.roomId,
      createdAt: new Date(),
    };

    memories.push(memory);
    this.storage.set(input.roomId, memories);
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
    const memories = this.storage.get(roomId) || [];
    return memories.find((m) => m.id === id) || null;
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
    const memories = this.storage.get(options.roomId) || [];
    const filtered = memories.filter((m) => m.content.includes(query));
    return filtered.slice(0, options.limit || filtered.length);
  }

  /**
   * Retrieves all memories for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories
   */
  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    return this.storage.get(roomId) || [];
  }

  /**
   * Deletes a specific memory
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async clearMemoryById(id: string, roomId: string): Promise<void> {
    const memories = this.storage.get(roomId) || [];
    const filtered = memories.filter((m) => m.id !== id);
    this.storage.set(roomId, filtered);
  }

  /**
   * Clears all memories across all rooms
   * @returns {Promise<void>}
   */
  async clearAllMemories(): Promise<void> {
    this.storage.clear();
    this.jobs.clear();
    this.requests.clear();
  }

  /**
   * Saves a job to the internal storage
   * @param {string} id - Job identifier
   * @param {ICronJob} job - Job data
   * @returns {Promise<void>}
   */
  async saveJob(id: string, job: ICronJob): Promise<void> {
    this.jobs.set(id, job);
  }

  /**
   * Saves a request to the internal storage
   * @param {string} id - Request identifier
   * @param {ScheduledRequest} request - Request data
   * @returns {Promise<void>}
   */
  async saveRequest(id: string, request: ScheduledRequest): Promise<void> {
    this.requests.set(id, request);
  }

  /**
   * Retrieves a job by ID
   * @param {string} id - Job identifier
   * @returns {Promise<ICronJob | undefined>} Job data or undefined if not found
   */
  async getJob(id: string): Promise<ICronJob | undefined> {
    return this.jobs.get(id);
  }

  /**
   * Retrieves a request by ID
   * @param {string} id - Request identifier
   * @returns {Promise<ScheduledRequest | undefined>} Request data or undefined if not found
   */
  async getRequest(id: string): Promise<ScheduledRequest | undefined> {
    return this.requests.get(id);
  }

  /**
   * Deletes a job by ID
   * @param {string} id - Job identifier
   * @returns {Promise<void>}
   */
  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  /**
   * Deletes a request by ID
   * @param {string} id - Request identifier
   * @returns {Promise<void>}
   */
  async deleteRequest(id: string): Promise<void> {
    this.requests.delete(id);
  }

  /**
   * Retrieves all requests
   * @returns {Promise<ScheduledRequest[]>} Array of all requests
   */
  async getAllRequests(): Promise<ScheduledRequest[]> {
    return Array.from(this.requests.values());
  }

  /**
   * Clears all jobs and requests
   * @returns {Promise<void>}
   */
  async clear(): Promise<void> {
    this.jobs.clear();
    this.requests.clear();
  }
}
