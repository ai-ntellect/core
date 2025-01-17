import { Embedding, StreamTextResult } from "ai";
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

export interface ActionSchema {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: any) => Promise<any>;
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
  cacheTTL?: number;
  redisUrl?: string;
  cachePrefix?: string;
}

export interface CreateMemoryInput {
  content: any;
  type: MemoryType;
  data: ActionSchema[];
  userId?: string;
  scope?: MemoryScope;
}

export interface CacheMemoryType {
  id: string;
  type: MemoryType;
  data: any;
  purpose: string;
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

export interface Memory {
  id: string;
  query: string;
  purpose: string;
  data: any;
  scope: MemoryScopeType;
  userId?: string;
  createdAt: Date;
  chunks?: MemoryChunk[];
}

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
