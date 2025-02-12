import { EventEmitter } from "events";
import { ZodSchema } from "zod";
import { IEventEmitter } from "../interfaces";

/* ======================== MEMORY ======================== */

/**
 * Represents the input structure for creating a memory entry.
 * @typedef {Object} CreateMemoryInput
 * @property {string} query - The query associated with the memory.
 * @property {any} data - The data to be stored.
 * @property {string} roomId - The room identifier.
 * @property {number} [ttl] - Time-to-live in seconds (optional).
 */
export interface CreateMemoryInput {
  id?: string;
  data: string;
  embedding?: number[];
  roomId: string;
  ttl?: number;
}

/**
 * Represents a stored memory entry.
 * @typedef {Object} BaseMemoryType
 * @property {string} id - Unique identifier of the memory entry.
 * @property {string} data - Stored data as a string.
 * @property {string} query - The associated query.
 * @property {number[] | null} embedding - Vector representation of the data.
 * @property {string} roomId - The associated room ID.
 * @property {Date} createdAt - Creation date.
 */
export interface BaseMemoryType {
  id: string;
  data: string;
  embedding?: number[];
  roomId: string;
  createdAt: Date;
}

/* ======================== SCHEDULING ======================== */

/**
 * Type for scheduled request entries
 * @typedef {Object} ScheduledRequest
 */
export type ScheduledRequest = {
  /** Unique identifier for the scheduled request */
  id: string;
  /** The original request string */
  originalRequest: string;
  /** The cron expression for scheduling */
  cronExpression: string;
  /** Whether the request is recurring */
  isRecurring: boolean;
  /** The creation date */
  createdAt: Date;
};

/* ======================== GRAPH ======================== */

/**
 * Utility type for extracting schema type from Zod schema
 * @template T - Zod schema type
 */
export type SchemaType<T> = T extends ZodSchema<infer U> ? U : never;

/**
 * Type for graph context based on schema
 * @template T - Schema type
 */
export type GraphContext<T> = SchemaType<T>;

/**
 * Interface representing a node in the graph
 * @interface
 * @template T - Schema type
 * @template I - Input schema type
 * @template O - Output schema type
 */
export interface Node<T extends ZodSchema, I = any> {
  /** Name of the node */
  name: string;
  /** Description of the node */
  description?: string;
  /** Schema for node inputs */
  params?: I extends void ? never : ZodSchema<I>;
  /** Execute function for the node */
  execute: (context: GraphContext<T>, params?: I) => Promise<void>;
  /** Optional condition for node execution */
  condition?: (context: GraphContext<T>, params?: I) => boolean;
  /** Array of next node names */
  next?: string[] | ((context: GraphContext<T>) => string[]);
  /** Array of event names that trigger this node */
  events?: string[];
  /** Wait for a single event before continuing */
  waitForEvent?: boolean;
  /** Wait for multiple events configuration */
  waitForEvents?: WaitForEvents;
  /** Event correlation configuration */
  correlateEvents?: {
    events: string[];
    correlation: (events: GraphEvent<T>[]) => boolean;
    timeout?: number;
  };
  /** Retry configuration */
  retry?: {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Delay between retries in milliseconds */
    delay: number;
    /** Error handler function */
    onRetryFailed?: (error: Error, context: GraphContext<T>) => Promise<void>;
    /** Continue execution on failed retry */
    continueOnFailed?: boolean;
  };
  /** Error handler function */
  onError?: (error: Error) => void;
}

/**
 * Interface for graph definition
 * @interface
 * @template T - Schema type
 */
export interface GraphDefinition<T extends ZodSchema> {
  /** Name of the graph */
  name: string;
  /** Array of nodes in the graph */
  nodes: Node<T, any>[];
  /** Initial context */
  context: SchemaType<T>;
  /** Schema for validation */
  schema: T;
  /** Global error handler */
  onError?: (error: Error, context: GraphContext<T>) => void;
  /** Entry node name */
  entryNode?: string;
  /** Event emitter instance */
  eventEmitter?: IEventEmitter | EventEmitter;
  /** Array of events */
  events?: string[];
}

/* ======================== MEILISEARCH ======================== */

/**
 * Configuration type for Meilisearch
 * @typedef {Object} MeilisearchConfig
 */
export type MeilisearchConfig = {
  /** Meilisearch host URL */
  host: string;
  /** API key for authentication */
  apiKey: string;
  /** Array of searchable attributes */
  searchableAttributes?: string[];
  /** Array of sortable attributes */
  sortableAttributes?: string[];
};

/**
 * Settings type for Meilisearch
 * @typedef {Object} MeilisearchSettings
 */
export type MeilisearchSettings = {
  /** Array of searchable attributes */
  searchableAttributes?: string[];
  /** Array of sortable attributes */
  sortableAttributes?: string[];
};

export interface GraphEvent<T extends ZodSchema> {
  type: string;
  payload?: any;
  timestamp: number;
}

export interface WaitForEvents {
  events: string[];
  timeout?: number;
  strategy: "all" | "any" | "race";
  onSuccess?: <T extends ZodSchema>(context: GraphContext<T>) => Promise<void>;
}
