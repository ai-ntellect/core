import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Index, MeiliSearch } from "meilisearch";

export interface PersistentMemoryOptions {
  host: string;
  apiKey: string;
  indexPrefix?: string;
}

export interface MemoryChunk {
  content: string;
  embedding: number[];
}

export interface MatchResult {
  data: any;
  purpose: string;
  chunk: string;
  similarityPercentage: number;
}

export const MemoryScope: {
  GLOBAL: "global";
  USER: "user";
};

export type MemoryScopeType = (typeof MemoryScope)[keyof typeof MemoryScope];

export interface MatchOptions {
  userId?: string;
  scope?: MemoryScopeType;
  similarityThreshold?: number;
  maxResults?: number;
}

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

export class PersistentMemory {
  private client: MeiliSearch;
  private readonly INDEX_PREFIX: string;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(options: PersistentMemoryOptions);

  private _getIndexName(scope: MemoryScopeType, userId?: string): string;
  private _getOrCreateIndex(indexName: string): Promise<Index>;
  private _processContent(content: string): Promise<MemoryChunk[]>;

  storeMemory(memory: Memory): Promise<void>;
  findBestMatches(
    query: string,
    options?: MatchOptions
  ): Promise<MatchResult[]>;
  deleteMemories(scope: MemoryScopeType, userId?: string): Promise<void>;
}
