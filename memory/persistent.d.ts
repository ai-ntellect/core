import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Index, MeiliSearch } from "meilisearch";
import {
  MatchOptions,
  MatchResult,
  Memory,
  MemoryChunk,
  MemoryScopeType,
} from "../types";

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
