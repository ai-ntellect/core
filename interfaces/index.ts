import { Observable } from "rxjs";
import { ZodSchema } from "zod";
import {
  BaseMemoryType,
  CreateMemoryInput,
  GraphContext,
  GraphEvent,
  GraphNodeConfig,
  ScheduledRequest,
  SchemaType,
} from "../types";

/* ======================== EMBEDDING SERVICE ======================== */

/**
 * Interface for an embedding service that processes text into vector representations.
 */
export interface EmbeddingModule {
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

/**
 * Extended interface for memory service operations
 * @interface
 */
export interface IMemoryService {
  /**
   * Initializes the memory service
   * @returns {Promise<void>}
   */
  init(): Promise<void>;

  /**
   * Creates a new memory entry with optional embedding
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or undefined
   */
  createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined>;

  /**
   * Retrieves a memory by ID and room ID
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType | null>} Memory entry or null if not found
   */
  getMemoryById(id: string, roomId: string): Promise<BaseMemoryType | null>;

  /**
   * Searches for memories based on query and options
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<BaseMemoryType[]>} Array of matching memories
   */
  getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]>;

  /**
   * Retrieves all memories for a specific room
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories
   */
  getAllMemories(roomId: string): Promise<BaseMemoryType[]>;

  /**
   * Deletes a specific memory
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  clearMemoryById(id: string, roomId: string): Promise<void>;

  /**
   * Clears all memories
   * @returns {Promise<void>}
   */
  clearAllMemories(): Promise<void>;

  saveJob(id: string, job: any): Promise<void>;
  saveRequest(id: string, request: any): Promise<void>;
  getJob(id: string): Promise<any>;
  getRequest(id: string): Promise<any>;
  deleteJob(id: string): Promise<void>;
  deleteRequest(id: string): Promise<void>;
  getAllRequests(): Promise<any[]>;
  clear(): Promise<void>;
}

/**
 * Interface for memory adapter implementations
 * @interface
 */
export interface IMemoryAdapter {
  /**
   * Initializes the memory adapter for a specific room
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  init(roomId?: string): Promise<void>;

  /**
   * Creates a new memory entry in the adapter
   * @param {CreateMemoryInput & { embedding?: number[] }} input - Memory data with optional embedding
   * @returns {Promise<BaseMemoryType | undefined>} Created memory or undefined
   */
  createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined>;

  /**
   * Stores a job in the adapter
   * @param {string} id - Job identifier
   * @param {ICronJob} job - Cron job instance
   * @returns {Promise<void>}
   */
  saveJob?(id: string, job: ICronJob): Promise<void>;

  /**
   * Stores a scheduled request in the adapter
   * @param {string} id - Request identifier
   * @param {ScheduledRequest} request - Scheduled request data
   * @returns {Promise<void>}
   */
  saveRequest?(id: string, request: ScheduledRequest): Promise<void>;

  /**
   * Retrieves a job by ID
   * @param {string} id - Job identifier
   * @returns {Promise<ICronJob | undefined>}
   */
  getJob?(id: string): Promise<ICronJob | undefined>;

  /**
   * Retrieves a scheduled request by ID
   * @param {string} id - Request identifier
   * @returns {Promise<ScheduledRequest | undefined>}
   */
  getRequest?(id: string): Promise<ScheduledRequest | undefined>;

  /**
   * Deletes a job by ID
   * @param {string} id - Job identifier
   * @returns {Promise<void>}
   */
  deleteJob?(id: string): Promise<void>;

  /**
   * Deletes a scheduled request by ID
   * @param {string} id - Request identifier
   * @returns {Promise<void>}
   */
  deleteRequest?(id: string): Promise<void>;

  /**
   * Retrieves all scheduled requests
   * @returns {Promise<ScheduledRequest[]>}
   */
  getAllRequests?(): Promise<ScheduledRequest[]>;

  /**
   * Retrieves a memory by ID and room ID from the adapter
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType | null>} Memory entry or null if not found
   */
  getMemoryById(id: string, roomId: string): Promise<BaseMemoryType | null>;

  /**
   * Searches for memories in the adapter
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<BaseMemoryType[]>} Array of matching memories
   */
  getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]>;

  /**
   * Retrieves all memories for a room from the adapter
   * @param {string} roomId - Room identifier
   * @returns {Promise<BaseMemoryType[]>} Array of all memories
   */
  getAllMemories(roomId: string): Promise<BaseMemoryType[]>;

  /**
   * Deletes a specific memory from the adapter
   * @param {string} id - Memory identifier
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  clearMemoryById(id: string, roomId: string): Promise<void>;

  /**
   * Clears all memories from the adapter
   * @returns {Promise<void>}
   */
  clearAllMemories(): Promise<void>;

  /**
   * Clears all jobs and requests
   * @returns {Promise<void>}
   */
  clear?(): Promise<void>;
}

/**
 * Abstract base class for memory implementations
 * @abstract
 */
export abstract class BaseMemory implements IMemoryService {
  /**
   * Creates an instance of BaseMemory
   * @param {IMemoryAdapter} adapter - Memory adapter implementation
   */
  constructor(protected readonly adapter: IMemoryAdapter) {}

  abstract init(): Promise<void>;
  abstract createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined>;
  abstract getMemoryById(
    id: string,
    roomId: string
  ): Promise<BaseMemoryType | null>;
  abstract getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]>;
  abstract getAllMemories(roomId: string): Promise<BaseMemoryType[]>;
  abstract clearMemoryById(id: string, roomId: string): Promise<void>;
  abstract clearAllMemories(): Promise<void>;

  async saveJob(id: string, job: any): Promise<void> {
    await this.adapter.saveJob?.(id, job);
  }

  async saveRequest(id: string, request: any): Promise<void> {
    await this.adapter.saveRequest?.(id, request);
  }

  async getJob(id: string): Promise<any> {
    return this.adapter.getJob?.(id);
  }

  async getRequest(id: string): Promise<any> {
    return this.adapter.getRequest?.(id);
  }

  async deleteJob(id: string): Promise<void> {
    await this.adapter.deleteJob?.(id);
  }

  async deleteRequest(id: string): Promise<void> {
    await this.adapter.deleteRequest?.(id);
  }

  async getAllRequests(): Promise<any[]> {
    return this.adapter.getAllRequests?.() || [];
  }

  async clear(): Promise<void> {
    await this.adapter.clear?.();
  }
}

/**
 * Interface for event emitter functionality
 * @interface
 */
export interface IEventEmitter {
  /**
   * Emits an event with optional arguments
   * @param {string} event - Event name
   * @param {...any[]} args - Event arguments
   * @returns {boolean} Whether the event had listeners
   */
  emit(event: string, ...args: any[]): boolean;

  /**
   * Registers an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   */
  on(event: string, listener: (...args: any[]) => void): void;

  /**
   * Removes all listeners for an event
   * @param {string} [event] - Optional event name
   */
  removeAllListeners(event?: string): void;

  /**
   * Returns raw listeners for an event
   * @param {string} event - Event name
   * @returns {Function[]} Array of listener functions
   */
  rawListeners(event: string): Function[];

  /**
   * Registers an event listener that will be called only once
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   */
  once(event: string, listener: (...args: any[]) => void): void;

  /**
   * Removes a specific listener for an event
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   */
  removeListener(event: string, listener: (...args: any[]) => void): void;
}

/**
 * Interface for cron service functionality
 * @interface
 */
export interface ICronService {
  /**
   * Schedules a job using cron expression
   * @param {string} expression - Cron expression
   * @param {Function} callback - Job callback
   * @returns {ICronJob} Cron job instance
   */
  schedule(expression: string, callback: () => void): ICronJob;
}

/**
 * Interface for cron job control
 * @interface
 */
export interface ICronJob {
  /**
   * Starts the cron job
   */
  start(): void;

  /**
   * Stops the cron job
   */
  stop(): void;
}

/**
 * Interface for embedding model operations
 * @interface
 */
export interface IEmbeddingModel {
  /**
   * Embeds a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Vector embedding
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embeds multiple texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of vector embeddings
   */
  embedMany(texts: string[]): Promise<number[][]>;
}

/**
 * Interface for similarity calculations
 * @interface
 */
export interface ISimilarityCalculator {
  /**
   * Calculates similarity between two embeddings
   * @param {number[]} embedding1 - First embedding
   * @param {number[]} embedding2 - Second embedding
   * @returns {number} Similarity score
   */
  calculate(embedding1: number[], embedding2: number[]): number;
}

/**
 * Interface for embedding module operations
 * @interface
 */
export interface IEmbeddingModule {
  /**
   * Embeds a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Vector embedding
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Embeds multiple texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of vector embeddings
   */
  embedMany(texts: string[]): Promise<number[][]>;

  /**
   * Calculates similarity between two embeddings
   * @param {number[]} embedding1 - First embedding
   * @param {number[]} embedding2 - Second embedding
   * @returns {number} Similarity score
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;
}

export interface IJobStorage {
  saveJob(id: string, job: ICronJob): Promise<void>;
  saveRequest(id: string, request: ScheduledRequest): Promise<void>;
  getJob(id: string): Promise<ICronJob | undefined>;
  getRequest(id: string): Promise<ScheduledRequest | undefined>;
  deleteJob(id: string): Promise<void>;
  deleteRequest(id: string): Promise<void>;
  getAllRequests(): Promise<ScheduledRequest[]>;
  clear(): Promise<void>;
}

/**
 * Interface defining the extended functionality of a graph observable
 * @template T - The Zod schema type that defines the structure of the graph data
 */
export interface GraphObservable<T extends ZodSchema> extends Observable<any> {
  /**
   * Observes the entire graph state
   */
  state(): Observable<GraphContext<T>>;

  /**
   * Observes a specific node's state
   * @param nodeName - The name of the node to observe
   */
  node(nodeName: string): Observable<any>;

  /**
   * Observes multiple nodes' states
   * @param nodeNames - Array of node names to observe
   */
  nodes(nodeNames: string[]): Observable<any>;

  /**
   * Observes specific properties of the graph context
   * @param prop - Property or array of properties to observe
   */
  property(
    prop: keyof SchemaType<T> | Array<keyof SchemaType<T>>
  ): Observable<any>;

  /**
   * Observes specific events in the graph
   * @param eventName - The name of the event to observe
   */
  event(eventName: string): Observable<GraphEvent<T>>;

  /**
   * Waits for a specific condition to be met
   * @param observable - The observable to watch
   * @param predicate - Function that determines when the condition is met
   */
  until(
    observable: Observable<any>,
    predicate: (state: any) => boolean
  ): Promise<any>;
}

export interface NLPNodeConfig<T extends ZodSchema>
  extends Omit<GraphNodeConfig<T>, "execute"> {
  nlpConfig: {
    corpus?: any;
    responses?: Record<string, any>;
    entities?: Record<string, any>;
    language?: string;
  };
  intentHandlers?: Record<string, (data: any) => Promise<any>>;
}
