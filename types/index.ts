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

/* ======================== SCHEDULING ======================== */

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
