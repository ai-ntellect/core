import { CoreMessage, Embedding, EmbeddingModel, StreamTextResult } from "ai";
import { z } from "zod";

export interface BaseLLM {
  process: (prompt: string) => Promise<string | object>;
  streamProcess?: (
    prompt: string
  ) => Promise<StreamTextResult<Record<string, any>>>;
}

export type User = {
  id: string;
};

export interface QueueItem {
  name: string;
  parameters: QueueItemParameter[];
}

export interface IEventHandler {
  emitQueueStart(actions: QueueItem[]): void;
  emitActionStart(action: QueueItem): void;
  emitActionComplete(action: QueueResult): void;
  emitQueueComplete(): void;
}

export type AgentEvent = {
  onMessage?: (data: any) => void;
  onQueueStart?: (actions: QueueItem[]) => void;
  onActionStart?: (action: QueueItem) => void;
  onActionComplete?: (action: QueueResult) => void;
  onQueueComplete?: (actions: QueueResult[]) => void;
  onConfirmationRequired?: (message: string) => Promise<boolean>;
};

export interface QueueResult {
  name: string;
  parameters: Record<string, string>;
  result: any;
  error: string | null;
  cancelled?: boolean;
}

export interface QueueCallbacks {
  onActionStart?: (action: QueueItem) => void;
  onActionComplete?: (result: QueueResult) => void;
  onQueueComplete?: (results: QueueResult[]) => void;
  onConfirmationRequired?: (message: string) => Promise<boolean>;
}

export interface ProcessPromptCallbacks {
  onQueueStart?: (actions: QueueItem[]) => void | Promise<void>;
  onActionStart?: (action: QueueItem) => void | Promise<void>;
  onActionComplete?: (action: QueueResult) => void | Promise<void>;
  onQueueComplete?: (actions: QueueResult[]) => void | Promise<void>;
  onConfirmationRequired?: (message: string) => Promise<boolean>;
}

export type Behavior = {
  role: string;
  language: string;
  guidelines: {
    important: string[];
    warnings: string[];
    steps?: string[];
  };
  examplesMessages?: {
    role: string;
    content: string;
  }[];
};

export interface ActionSchema {
  name: string;
  description: string;
  parameters: z.ZodObject<{
    [key: string]: z.ZodType;
  }>;
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
}

export type ProcessPromptResult = {
  type: "success" | "clarification" | "confirmation";
  data:
    | QueueResult[]
    | {
        validationErrors: string[];
        prompt: string;
      }
    | {
        actions: QueueItem[];
      };
  initialPrompt: string;
};

export interface ActionPattern {
  id: string;
  actions: QueueResult[];
  embeddings: number[][];
  queries: string[];
  purpose: string;
}

export interface MatchOptions {
  similarityThreshold?: number;
  maxResults?: number;
}

export interface MatchResult {
  data: any;
  similarityPercentage: number;
  purpose: string;
  name?: string;
  parameters?: Record<string, any>;
}

export interface SummarizerAgent {
  process: (
    results: object,
    onFinish?: (event: any) => void
  ) => Promise<
    | {
        actions: { name: string; reasoning: string }[];
        response: string;
      }
    | StreamTextResult<Record<string, any>>
  >;
  streamProcess: (
    results: object,
    onFinish?: (event: any) => void
  ) => Promise<StreamTextResult<Record<string, any>>>;
}

export interface CacheMemoryOptions {
  embeddingModel: EmbeddingModel<string>;
  cacheTTL?: number;
  redisUrl?: string;
  cachePrefix?: string;
}

export type GenerateObjectResponse = {
  processing: {
    stop: boolean;
    stopReason?: string;
  };
  actions: Array<{
    name: string;
    parameters: Array<{
      name: string;
      value: any;
    }>;
    scheduler?: {
      isScheduled: boolean;
      cronExpression: string;
      reason?: string;
    };
  }>;
  response: string;
  interpreter?: string;
};

export interface CreateMemoryInput {
  query: string;
  data: any;
  userId?: string;
  scope?: MemoryScope;
  ttl?: number;
}

export interface CacheMemoryType {
  id: string;
  data: any;
  query: string;
  embedding: Embedding;
  userId?: string;
  scope: MemoryScope;
  createdAt: Date;
}

export interface PersistentMemoryOptions {
  host: string;
  apiKey: string;
  indexPrefix?: string;
}

export interface MemoryChunk {
  content: string;
  embedding: number[];
}

export type MemoryScopeType = (typeof MemoryScope)[keyof typeof MemoryScope];

export interface LongTermMemory {
  id: string;
  query: string;
  category: string;
  data: any;
  roomId: string;
  createdAt: Date;
  chunks?: MemoryChunk[];
  tags: string[];
}

export const ActionSchema = z.array(
  z.object({
    name: z.string(),
    parameters: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
  })
);

export enum MemoryType {
  ACTION = "action",
  CONVERSATION = "conversation",
  KNOWLEDGE = "knowledge",
}

export enum MemoryScope {
  GLOBAL = "global",
  USER = "user",
}

export interface ActionData {
  name?: string;
  parameters?: Record<string, any>;
}

export interface QueueItemParameter {
  name: string;
  value: string;
}

export interface TransformedQueueItem {
  name: string;
  parameters: QueueItemParameter[];
}

export interface ScheduledAction {
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
}

export interface ScheduledActionEvents {
  onActionStart?: (action: ScheduledAction) => void;
  onActionComplete?: (action: ScheduledAction, result: any) => void;
  onActionFailed?: (action: ScheduledAction, error: Error) => void;
  onActionScheduled?: (action: ScheduledAction) => void;
  onActionCancelled?: (actionId: string) => void;
}

export interface WorkflowPattern {
  query: string;
  actions: Array<{
    done: boolean;
    name: string;
    result: string;
  }>;
  success: boolean;
}

// État partagé
export type MyContext = {
  prompt?: string;
  processing: {
    stop: boolean;
    reason?: string;
  };
  actions?: {
    name: string;
    parameters: Record<string, any>;
    result?: any;
    error?: any;
    scheduler?: {
      isScheduled: boolean;
      cronExpression?: string;
      reason?: string;
    };
  }[];
  interpreter?: string | null;
  results?: any;
};

export interface SharedState<T> {
  messages: CoreMessage[]; // Historique des interactions
  context: T;
}

export function mergeState<T>(
  current: SharedState<T>,
  updates: Partial<SharedState<T>>
): SharedState<T> {
  const uniqueMessages = new Map(
    [...current.messages, ...(updates.messages || [])].map((msg) => [
      JSON.stringify(msg),
      msg,
    ])
  );
  return {
    ...current,
    context: { ...current.context, ...updates.context },
    messages: Array.from(uniqueMessages.values()), // Messages uniques
  };
}
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  shouldRetry?: (error: Error) => boolean;
}

export interface Node<T> {
  name: string;
  execute: (state: SharedState<T>) => Promise<Partial<SharedState<T>>>;
  condition?: (state: SharedState<T>) => boolean;
  next?: string[];
  events?: string[];
  retry?: RetryConfig;
}

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

export interface RealTimeNotifier {
  notify(event: string, data: any): void;
}
