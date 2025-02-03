import { z, ZodSchema } from "zod";

/* ======================== MEMORY ======================== */

/**
 * Represents the input structure for creating a memory entry.
 * @typedef {Object} CreateMemoryInput
 * @property {string} query - The query associated with the memory.
 * @property {any} data - The data to be stored.
 * @property {string} roomId - The room identifier.
 * @property {number} [ttl] - Time-to-live in seconds (optional).
 */
export type CreateMemoryInput = {
  id?: string;
  data: any;
  embedding?: number[];
  roomId: string;
  ttl?: number;
};

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
export type BaseMemoryType = {
  id: string;
  data: any;
  embedding: number[] | null;
  roomId: string;
  createdAt: Date;
};

/* ======================== QUEUE ======================== */

/**
 * Represents a single parameter for a queued action.
 * @typedef {Object} QueueItemParameter
 * @property {string} name - Parameter name.
 * @property {string} value - Parameter value.
 */
export type QueueItemParameter = {
  name: string;
  value: string;
};

/**
 * Represents an action in the queue.
 * @typedef {Object} QueueItem
 * @property {string} name - Name of the action.
 * @property {QueueItemParameter[]} parameters - List of parameters.
 */
export type QueueItem = {
  name: string;
  parameters: QueueItemParameter[];
};

/**
 * Represents the result of a processed queue action.
 * @typedef {Object} QueueResult
 * @property {string} name - Action name.
 * @property {Record<string, string>} parameters - Executed parameters.
 * @property {any} result - The execution result.
 * @property {string | null} error - Error message if any.
 * @property {boolean} [cancelled] - Indicates if the action was cancelled.
 */
export type QueueResult = {
  name: string;
  parameters: Record<string, string>;
  result: any;
  error: string | null;
  cancelled?: boolean;
};

/**
 * Defines callback functions for queue execution events.
 * @typedef {Object} QueueCallbacks
 * @property {(action: QueueItem) => void} [onActionStart] - Triggered when an action starts.
 * @property {(result: QueueResult) => void} [onActionComplete] - Triggered when an action completes.
 * @property {(results: QueueResult[]) => void} [onQueueComplete] - Triggered when the queue is fully processed.
 * @property {(message: string) => Promise<boolean>} [onConfirmationRequired] - Triggered when confirmation is needed.
 */
export type QueueCallbacks = {
  onActionStart?: (action: QueueItem) => void;
  onActionComplete?: (result: QueueResult) => void;
  onQueueComplete?: (results: QueueResult[]) => void;
  onConfirmationRequired?: (message: string) => Promise<boolean>;
};

/* ======================== ACTION ======================== */

/**
 * Represents an executable action schema.
 * @typedef {Object} ActionSchema
 * @property {string} name - Action name.
 * @property {string} description - Action description.
 * @property {z.ZodObject<Record<string, z.ZodType>>} parameters - Schema for input parameters.
 * @property {(args: any) => Promise<any>} execute - Function to execute the action.
 * @property {Object[]} [examples] - Example usages of the action.
 * @property {Object} [confirmation] - Confirmation requirements.
 * @property {boolean} confirmation.requireConfirmation - Whether confirmation is needed.
 * @property {string} confirmation.message - The confirmation message.
 */
export type ActionSchema = {
  name: string;
  description: string;
  parameters: z.ZodObject<{ [key: string]: z.ZodType }>;
  execute: (args: any) => Promise<any>;
  examples?: {
    role: string;
    content: string;
    parameters?: Record<string, any>;
  }[];
  confirmation?: {
    requireConfirmation: boolean;
    message: string;
  };
};

/* ======================== SCHEDULING ======================== */

/**
 * Represents a scheduled action with optional recurrence.
 * @typedef {Object} ScheduledAction
 * @property {string} id - Unique identifier for the scheduled action.
 * @property {Object} action - The action details.
 * @property {string} action.name - The action name.
 * @property {QueueItemParameter[]} action.parameters - Action parameters.
 * @property {Date} scheduledTime - The scheduled execution time.
 * @property {string} userId - Associated user identifier.
 * @property {"pending" | "completed" | "failed"} status - The execution status.
 * @property {Object} [recurrence] - Recurrence details (optional).
 * @property {"daily" | "weekly" | "monthly"} recurrence.type - Recurrence type.
 * @property {number} recurrence.interval - Recurrence interval.
 */
export type ScheduledAction = {
  id: string;
  action: {
    name: string;
    parameters: QueueItemParameter[];
  };
  scheduledTime: Date;
  userId: string;
  status: "pending" | "completed" | "failed";
  recurrence?: {
    type: "daily" | "weekly" | "monthly";
    interval: number;
  };
};

/**
 * Represents a scheduled request.
 * @typedef {Object} ScheduledRequest
 * @property {string} id - Unique identifier for the scheduled request.
 * @property {string} originalRequest - The original request string.
 * @property {string} cronExpression - The cron expression for scheduling.
 * @property {boolean} isRecurring - Whether the request is recurring.
 * @property {Date} createdAt - The creation date.
 */
export type ScheduledRequest = {
  id: string;
  originalRequest: string;
  cronExpression: string;
  isRecurring: boolean;
  createdAt: Date;
};

/* ======================== GRAPH ======================== */

export type GraphContext<T extends ZodSchema> = z.infer<T>;

export type Node<T extends ZodSchema, P extends ZodSchema = ZodSchema> = {
  name: string;
  execute?: (context: GraphContext<T>) => Promise<void>;
  executeWithParams?: (
    context: GraphContext<T>,
    params: z.infer<P>
  ) => Promise<void>; // ✅ Nouvelle méthode
  next?: string[];
  condition?: (context: GraphContext<T>) => boolean;
  onError?: (error: Error) => void;
  events?: string[];
  schema?: T;
  parameters?: P; // ✅ Ajout d'un schéma spécifique aux paramètres du nœud
  retry?: {
    maxAttempts: number;
    delay: number;
  };
};

export type GraphConfig<T extends ZodSchema> = {
  name: string;
  nodes: Node<T>[];
  initialContext?: GraphContext<T>;
  validator?: T;
  globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;
};

export type GraphDefinition<T extends ZodSchema> = {
  name: string;
  nodes: Record<string, Node<T>>;
  entryNode: string;
};

/**
 * Defines a shared state context for execution graphs.
 * @typedef {Object} SharedState
 * @property {Partial<T>} context - The execution context.
 */
export type SharedState<T> = T;

/**
 * Defines a node relationship in an execution graph.
 * @typedef {Object} NodeRelationship
 * @property {string} name - Relationship name.
 * @property {string} [description] - Optional description.
 */
export type NodeRelationship = {
  name: string;
  description?: string;
};

/* ======================== SEARCH ======================== */

/**
 * Represents a document that can be indexed and searched.
 * @typedef {Object} SearchDocument
 * @property {string} [id] - Optional unique identifier of the document.
 * @property {string} content - The searchable text content.
 * @property {Record<string, any>} [metadata] - Additional metadata for context.
 */
export type SearchDocument = {
  id?: string;
  content: string;
  metadata?: Record<string, any>;
};

/**
 * Represents a search result with a similarity score.
 * @typedef {Object} SearchResult
 * @property {SearchDocument} document - The matched document.
 * @property {number} score - The similarity score.
 */
export type SearchResult = {
  document: SearchDocument;
  score: number;
};

/* ======================== MEILISEARCH ======================== */
export type MeilisearchConfig = {
  host: string;
  apiKey: string;
  searchableAttributes?: string[];
  sortableAttributes?: string[];
};

export type MeilisearchSettings = {
  searchableAttributes?: string[];
  sortableAttributes?: string[];
};

/* ======================== ACTIONS ======================== */

export type Action = {
  name: string;
  parameters: {
    name: string;
    value: string;
  }[];
};
