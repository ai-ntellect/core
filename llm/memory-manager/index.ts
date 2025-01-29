import { LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { MyContext, SharedState } from "../../types";
import { generateObject } from "../../utils/generate-object";
import { LLMHeaderBuilder } from "../../utils/header-builder";
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
  public readonly memory?: {
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

  buildContext() {
    const context = LLMHeaderBuilder.create()
      .addHeader("ROLE", memoryManagerInstructions.role)
      .addHeader("LANGUAGE", memoryManagerInstructions.language)
      .addHeader("IMPORTANT", memoryManagerInstructions.guidelines.important)
      .addHeader("WARNINGS", memoryManagerInstructions.guidelines.warnings);
    return context.toString();
  }

  async process(
    state: SharedState<MyContext>,
    callbacks?: {
      onMemoriesGenerated?: (event: any) => void;
    }
  ) {
    const context = this.buildContext();
    let prompt = LLMHeaderBuilder.create();
    if (state.context.messages) {
      prompt.addHeader(
        "REQUEST",
        state.context.messages[
          state.context.messages.length - 2
        ].content.toString()
      );
    }
    if (state.context.messages && state.context.messages.length > 0) {
      prompt.addHeader(
        "RECENT_MESSAGES",
        JSON.stringify(state.context.messages)
      );
    }

    if (state.context.actions) {
      prompt.addHeader(
        "PREVIOUS_ACTIONS",
        JSON.stringify(state.context.actions)
      );
    }

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
      system: context.toString(),
      temperature: 1,
      prompt: prompt.toString(),
    });

    if (!this.memory) {
      return;
    }

    if (callbacks?.onMemoriesGenerated)
      callbacks.onMemoriesGenerated(memories.object);

    return memories.object;
  }
}
