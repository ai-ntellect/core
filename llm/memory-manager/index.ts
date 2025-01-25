import { LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { MemoryScope } from "../../types";
import { generateObject } from "../../utils/generate-object";
import { LLMHeaderBuilder } from "../../utils/header-builder";
import { State } from "../orchestrator/types";
import { memoryManagerInstructions } from "./context";

interface MemoryResponse {
  memories: Array<{
    data: string;
    type: "short-term" | "long-term";
    category:
      | "user_information"
      | "user_preference"
      | "task"
      | "current_goal"
      | "news"
      | "fact"
      | "other";
    queryForMemory: string;
    tags: string[];
    ttl: number;
  }>;
}
export class MemoryManager {
  private readonly model: LanguageModelV1;
  private readonly memory?: {
    cache?: CacheMemory;
    persistent?: PersistentMemory;
  };

  constructor(config: {
    model: LanguageModelV1;
    memory?: {
      cache?: CacheMemory;
      persistent?: PersistentMemory;
    };
  }) {
    this.model = config.model;
    this.memory = config.memory;
  }

  buildContext(state: State) {
    const context = LLMHeaderBuilder.create()
      .addHeader("ROLE", memoryManagerInstructions.role)
      .addHeader("LANGUAGE", memoryManagerInstructions.language)
      .addHeader("IMPORTANT", memoryManagerInstructions.guidelines.important)
      .addHeader("WARNINGS", memoryManagerInstructions.guidelines.warnings)
      .addHeader("CURRENT_CONTEXT", state.currentContext)
      .addHeader("RESULTS", JSON.stringify(state.results));
    return context.toString();
  }

  async process(state: State, result: string) {
    const context = this.buildContext(state);

    const memories = await generateObject<MemoryResponse>({
      model: this.model,
      schema: z.object({
        memories: z.array(
          z.object({
            data: z.string(),
            type: z.enum(["short-term", "long-term"]),
            category: z.enum([
              "user_information",
              "user_preference",
              "task",
              "current_goal",
              "news",
              "fact",
              "other",
            ]),
            queryForData: z.string(),
            tags: z.array(z.string()),
            ttl: z.number(),
          })
        ),
      }),
      prompt: state.currentContext,
      system: context.toString(),
      temperature: 1,
    });

    console.log("Memories:", memories.object.memories);

    if (!this.memory) {
      return;
    }

    // Store memories after all processing is complete
    await Promise.all([
      // Store short-term memories in cache
      ...memories.object.memories
        .filter((m: any) => m.type === "short-term")
        .map(async (memoryItem: any) => {
          if (!this.memory?.cache) {
            return;
          }

          const existingCacheMemories =
            await this.memory.cache.findSimilarActions(memoryItem.data, {
              similarityThreshold: 85,
              maxResults: 3,
              scope: MemoryScope.GLOBAL,
            });

          if (existingCacheMemories.length > 0) {
            console.log(
              "⚠️ Similar memory already exists in cache:",
              memoryItem.data
            );
            return;
          }

          await this.memory.cache.createMemory({
            query: memoryItem.queryForMemory,
            data: memoryItem.data,
            ttl: memoryItem.ttl, // Use TTL from LLM
          });
          console.log("✅ Memory stored in cache:", memoryItem.data);
        }),

      // Store long-term memories in persistent storage
      ...memories.object.memories
        .filter((m) => m.type === "long-term")
        .map(async (memoryItem) => {
          if (!this.memory?.persistent) {
            return;
          }

          const existingPersistentMemories =
            await this.memory.persistent.findRelevantDocuments(
              memoryItem.data,
              {
                similarityThreshold: 85,
              }
            );

          if (existingPersistentMemories.length > 0) {
            console.log(
              "⚠️ Similar memory already exists in persistent storage:",
              memoryItem.data
            );
            return;
          }

          await this.memory.persistent.createMemory({
            query: memoryItem.queryForMemory,
            data: memoryItem.data,
            category: memoryItem.category,
            tags: memoryItem.tags,
            roomId: "global",
            createdAt: new Date(),
            id: crypto.randomUUID(),
          });
          console.log("✅ Memory stored in persistent storage:", memoryItem);
        }),
    ]);
  }
}
