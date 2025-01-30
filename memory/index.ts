import { BaseMemoryService } from "@/interfaces";
import { BaseMemoryType, CreateMemoryInput } from "@/types";

export abstract class BaseMemory {
  constructor(protected readonly cacheService: BaseMemoryService) {}

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
}
