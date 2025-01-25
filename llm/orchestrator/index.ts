import { LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionQueueManager } from "../../services/queue";
import { CacheConfig, RedisCache } from "../../services/redis-cache";
import { TaskScheduler } from "../../services/scheduler";
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
  private readonly scheduler: TaskScheduler;
  private readonly cache: RedisCache;
  private memory?: {
    persistent?: PersistentMemory;
    cache?: CacheMemory;
  };

  constructor(
    model: LanguageModelV1,
    tools: ActionSchema[],
    interpreters: Interpreter[],
    redisConfig: CacheConfig,
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
    this.cache = new RedisCache(redisConfig);
    this.scheduler = new TaskScheduler(this, this.cache);
  }

  private async buildContext(state: State): Promise<string> {
    console.log("🧠 Building context with RAG and CAG...");
    const context = LLMHeaderBuilder.create();

    // Add orchestrator instructions
    context.addHeader("ROLE", orchestratorInstructions.role);
    context.addHeader("LANGUAGE", orchestratorInstructions.language);
    context.addHeader(
      "IMPORTANT",
      orchestratorInstructions.guidelines.important
    );
    context.addHeader("WARNINGS", orchestratorInstructions.guidelines.warnings);
    // Add tools to context
    context.addHeader("TOOLS", injectActions(this.tools));

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
      scheduler?: {
        isScheduled: boolean;
        scheduledAtInC?: string;
        interval?: string;
        reason?: string;
      };
    }>;
    socialResponse?: {
      shouldRespond: boolean;
      response?: string;
      isPartialResponse?: boolean;
    };
    interpreter?: string;
    results?: string;
  }> {
    console.log("🔄 Processing state:");
    console.dir(state, { depth: null });
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
            scheduler: z
              .object({
                isScheduled: z.boolean(),
                cronExpression: z.string().optional(),
                reason: z.string().optional(),
              })
              .optional(),
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
      prompt: state.currentContext,
      system: context.toString(),
      temperature: 0,
    });
    console.log("🔄 Orchestrator response:");
    console.dir(response.object, { depth: null });

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

    // Handle scheduled actions
    for (const action of response.object.actions) {
      if (action.scheduler?.isScheduled) {
        await this.scheduler.scheduleRequest({
          originalRequest: state.currentContext,
          cronExpression: action.scheduler.cronExpression,
        });
      }
    }

    // Store actions in Redis cache
    if (response.object.actions.length > 0) {
      const requestId = crypto.randomUUID();
      await this.cache.storePreviousActions(requestId, response.object.actions);
    }

    // Store message in recent messages
    await this.cache.storeRecentMessage(state.currentContext, {
      socialResponse: response.object.socialResponse,
    });

    return response.object;
  }
}
