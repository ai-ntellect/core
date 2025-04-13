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
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  roomId: string;
  ttl?: number;
  type?: string;
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
  content: string;
  metadata?: Record<string, any>;
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
export type GraphContext<T extends ZodSchema> = {
  [key: string]: any;
};

/**
 * Configuration for event handling strategies in nodes
 * @typedef {Object} EventStrategy
 * @property {"single" | "all" | "correlate"} type - The type of event handling strategy
 * - single: Waits for any single event from the specified events
 * - all: Waits for all specified events to occur
 * - correlate: Uses a correlation function to match related events
 * @property {(events: any[]) => boolean} [correlation] - Optional correlation function for "correlate" strategy
 */
export type EventStrategy = {
  type: "single" | "all" | "correlate";
  correlation?: (events: any[]) => boolean;
};

/**
 * Configuration for event handling in nodes
 * @typedef {Object} EventConfig
 * @property {string[]} events - Array of event names to wait for
 * @property {number} [timeout] - Optional timeout in milliseconds
 * @property {EventStrategy} strategy - Strategy for handling multiple events
 * @property {(events: any[]) => Promise<void>} [onSuccess] - Optional callback when events are successfully received
 * @property {() => Promise<void>} [onTimeout] - Optional callback when event waiting times out
 * @example
 * ```typescript
 * const eventConfig: EventConfig = {
 *   events: ["payment.received", "order.validated"],
 *   timeout: 5000,
 *   strategy: {
 *     type: "correlate",
 *     correlation: (events) => events.every(e => e.transactionId === events[0].transactionId)
 *   },
 *   onSuccess: async (events) => {
 *     console.log("Correlated events received:", events);
 *   },
 *   onTimeout: async () => {
 *     console.log("Event waiting timed out");
 *   }
 * };
 * ```
 */
export type EventConfig = {
  events: string[];
  timeout?: number;
  strategy: EventStrategy;
  onSuccess?: (events: any[]) => Promise<void>;
  onTimeout?: () => Promise<void>;
};

/**
 * Represents an event in the graph system
 * @template T - Schema type for context validation
 * @property {string} type - The type/name of the event
 * @property {any} [payload] - Optional payload data
 * @property {number} timestamp - Unix timestamp of when the event occurred
 * @example
 * ```typescript
 * const event: GraphEvent<MySchema> = {
 *   type: "payment.received",
 *   payload: {
 *     transactionId: "tx123",
 *     amount: 100,
 *     currency: "USD"
 *   },
 *   timestamp: Date.now()
 * };
 * ```
 */
export type GraphEvent<T extends ZodSchema> = {
  type: string;
  payload?: any;
  timestamp: number;
};

/**
 * Configuration for waiting on multiple events
 * @template T - Schema type for context validation
 * @property {string[]} events - Array of event names to wait for
 * @property {number} [timeout] - Optional timeout in milliseconds
 * @property {"all" | "any" | "race"} strategy - Strategy for handling multiple events
 * @property {(context: GraphContext<T>) => Promise<void>} [onSuccess] - Optional success callback
 * @example
 * ```typescript
 * const config: WaitForEvents<MySchema> = {
 *   events: ["event1", "event2"],
 *   timeout: 5000,
 *   strategy: "all",
 *   onSuccess: async (context) => {
 *     console.log("All events received");
 *   }
 * };
 * ```
 */
export type WaitForEvents<T extends ZodSchema> = {
  events: string[];
  timeout?: number;
  strategy: "all" | "any" | "race";
  onSuccess?: <T extends ZodSchema>(context: GraphContext<T>) => Promise<void>;
};

/**
 * Interface representing a node in the graph
 * @interface
 * @template T - Schema type
 * @template P - Parameters type
 */
export interface GraphNodeConfig<T extends ZodSchema, P = any> {
  /** Name of the node */
  name: string;
  /** Description of the node */
  description?: string;
  /** Schema for node inputs */
  params?: P extends void ? never : ZodSchema<P>;
  /** Execute function for the node */
  execute: (
    context: GraphContext<T>,
    tools?: { eventEmitter: IEventEmitter }
  ) => Promise<void>;
  /** Optional condition for node execution */
  condition?: (context: GraphContext<T>, params?: P) => boolean;
  /** Array of next node names or objects with conditions */
  next?:
    | Array<
        | string
        | { node: string; condition: (context: GraphContext<T>) => boolean }
      >
    | string
    | ((context: GraphContext<T>) => string[]);
  /** Array of event names that trigger this node */
  events?: string[];
  /** Event handling configuration */
  when?: EventConfig;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delay: number;
    onRetryFailed?: (error: Error, context: GraphContext<T>) => Promise<void>;
    continueOnFailed?: boolean;
  };
  /** Error handler function */
  onError?: (error: Error) => void;
  agent?: string;
}

/**
 * Interface for graph definition
 * @interface
 * @template T - Schema type
 */
export type GraphConfig<T extends ZodSchema> = {
  /** Name of the graph */
  name: string;
  /** Schema for validation */
  schema: T;
  /** Initial context */
  context: SchemaType<T>;
  /** Array of nodes in the graph */
  nodes: GraphNodeConfig<T, any>[];
  /** Global error handler */
  onError?: (error: Error, context: GraphContext<T>) => void;
  /** Entry node name */
  entryNode?: string;
  /** Event emitter instance */
  eventEmitter?: IEventEmitter | EventEmitter;
  /** Array of events */
  events?: string[];
};

/**
 * Type for graph execution result
 * @template T - Schema type
 */
export type GraphExecutionResult<T extends ZodSchema> = {
  graphName: string;
  nodeName: string;
  context: GraphContext<T>;
};

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

/**
 * Configuration interface for NLP Engine
 * @interface NLPConfig
 * @property {any} [corpus] - Training corpus data
 * @property {Record<string, any>} [responses] - Response templates
 * @property {Record<string, any>} [entities] - Entity definitions
 * @property {string} [language] - Language code (default: 'en')
 * @property {number} [threshold] - Entity recognition threshold (default: 0.5)
 * @property {string} [path] - Path to save/load model
 */
export type NLPConfig = {
  corpus?: any;
  responses?: Record<string, any>;
  entities?: Record<string, any>;
  language?: string;
  threshold?: number;
  path?: string;
};

/**
 * Type definition for action handlers
 * @callback ActionHandler
 * @param {any} data - Input data for the action
 * @returns {Promise<any>} Result of the action
 */
export type ActionHandler = (data: any) => Promise<any>;

/**
 * Options for the observer
 * @typedef {Object} ObserverOptions
 * @property {number} [debounce] - Debounce time in milliseconds
 * @property {number} [delay] - Delay time in milliseconds
 * @property {boolean} [stream] - Whether to stream the response
 * @property {(string | number)[]} [properties] - Properties to observe
 */
export type ObserverOptions = {
  debounce?: number;
  delay?: number;
  stream?: boolean;
  properties?: (string | number)[]; // Accepte uniquement string ou number comme clés
  onStreamLetter?: (data: { letter: string; property: string }) => void;
  onStreamComplete?: () => void;
};
