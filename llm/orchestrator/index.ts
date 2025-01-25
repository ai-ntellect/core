import { LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionQueueManager } from "../../services/queue";
import {
  ActionSchema,
  GenerateObjectResponse,
  MemoryScope,
  QueueCallbacks,
} from "../../types";
import { generateObject } from "../../utils/generate-object";
import { LLMHeaderBuilder } from "../../utils/header-builder";
import { injectActions } from "../../utils/inject-actions";
import { Interpreter } from "../interpreter";
import { orchestratorInstructions } from "./context";
import { State } from "./types";

export class AgentRuntime {
  private readonly model: LanguageModelV1;
  private readonly tools: ActionSchema[];
  private readonly interpreters: Interpreter[];
  private readonly queueManager: ActionQueueManager;
  private memory?: {
    persistent?: PersistentMemory;
    cache?: CacheMemory;
  };

  constructor(
    model: LanguageModelV1,
    tools: ActionSchema[],
    interpreters: Interpreter[],
    memory?: {
      persistent?: PersistentMemory;
      cache?: CacheMemory;
    },
    callbacks?: QueueCallbacks
  ) {
    this.model = model;
    this.tools = tools;
    this.interpreters = interpreters;
    this.queueManager = new ActionQueueManager(tools, callbacks);
    this.memory = memory;
  }

  private async buildContext(state: State): Promise<string> {
    console.log("🧠 Building context with RAG and CAG...");
    const context = LLMHeaderBuilder.create();

    // Add tools to context
    context.addHeader("TOOLS", injectActions(this.tools));

    // Add current request
    context.addHeader("USER_REQUEST", state.currentContext);

    // Add previous actions if any
    if (state.previousActions?.length) {
      context.addHeader(
        "PREVIOUS_ACTIONS",
        JSON.stringify(state.previousActions)
      );
    }

    // Get recent similar actions (CAG)
    if (this.memory?.cache) {
      const cacheMemories = await this.memory.cache.findSimilarActions(
        state.currentContext,
        {
          similarityThreshold: 80,
          maxResults: 3,
          scope: MemoryScope.GLOBAL,
        }
      );

      if (cacheMemories.length > 0) {
        context.addHeader("RECENT_ACTIONS", JSON.stringify(cacheMemories));
      }
    }

    // Get relevant knowledge (RAG)
    if (this.memory?.persistent) {
      const persistentMemory =
        await this.memory.persistent.findRelevantDocuments(
          state.currentContext,
          {
            similarityThreshold: 80,
          }
        );

      if (persistentMemory.length > 0) {
        context.addHeader(
          "RELEVANT_KNOWLEDGE",
          JSON.stringify(persistentMemory)
        );
      }
    }

    // Add available interpreters
    context.addHeader(
      "AVAILABLE_INTERPRETERS",
      JSON.stringify(this.interpreters.map((i) => i.name))
    );
    console.log("Context built with memories", context.toString());
    return context.toString();
  }

  async process(state: State): Promise<{
    shouldContinue: boolean;
    actions: Array<{
      name: string;
      parameters: Array<{
        name: string;
        value: any;
      }>;
    }>;
    socialResponse?: {
      shouldRespond: boolean;
      response?: string;
      isPartialResponse?: boolean;
    };
    interpreter?: string;
    results?: string;
  }> {
    console.log("\n🔄 Starting new processing cycle");
    console.log("📝 Current context:", state.currentContext);
    if (state.previousActions?.length) {
      console.log(
        "📊 Previous actions:",
        state.previousActions
          .map((a) => (typeof a === "string" ? a : a.name))
          .join(", ")
      );
    }

    const context = await this.buildContext(state);

    console.log("\n🧠 Generating response from LLM...");
    const response = await generateObject<GenerateObjectResponse>({
      model: this.model,
      schema: z.object({
        shouldContinue: z.boolean(),
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.array(
              z.object({
                name: z.string(),
                value: z.any(),
              })
            ),
          })
        ),
        socialResponse: z
          .object({
            shouldRespond: z.boolean(),
            response: z.string().optional(),
            isPartialResponse: z.boolean().optional(),
          })
          .optional(),
        interpreter: z.string().optional(),
      }),
      prompt: context,
      system: orchestratorInstructions,
      temperature: 0,
    });
    console.log("🔄 Orchestrator response:", response.object);

    // Force shouldContinue to false if no actions are planned
    if (response.object.actions.length === 0) {
      response.object.shouldContinue = false;
      console.log("⚠️ No actions planned, forcing shouldContinue to false");
    }

    // Handle social interactions and actions in a single block
    if (response.object.socialResponse?.shouldRespond) {
      console.log("\n💬 Processing social response");
      if (response.object.socialResponse.response) {
        console.log("📢 Response:", response.object.socialResponse.response);
        // Ensure all parameters have a value property
      }
    }
    return response.object;
  }
}
