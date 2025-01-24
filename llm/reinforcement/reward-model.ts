import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionQueueManager } from "../../services/queue";
import {
  checkHoneypot,
  fetchMarkPrice,
  getChainsTVL,
  getRssNews,
} from "../../test";
import { ActionData, ActionSchema, MemoryScope } from "../../types";
import { LLMHeaderBuilder } from "../../utils/header-builder";
import { injectActions } from "../../utils/inject-actions";
import { QueueItemTransformer } from "../../utils/queue-item-transformer";
import { Interpreter } from "../interpreter";
import {
  generalInterpreterContext,
  marketInterpreterContext,
  securityInterpreterContext,
} from "../interpreter/context";
import { Action, State } from "./types";

export class LLMRewardModel {
  private readonly model = openai("gpt-4");
  private readonly tools: ActionSchema[];
  private readonly queueManager: ActionQueueManager;
  private readonly interpreters: Interpreter[];
  private memory: {
    persistent: PersistentMemory;
    cache: CacheMemory;
  };

  constructor(
    tools: ActionSchema[],
    interpreters: Interpreter[],
    memory: {
      persistent: PersistentMemory;
      cache: CacheMemory;
    },
    config: {
      successThreshold?: number;
      maxEpisodicMemories?: number;
      maxSemanticMemories?: number;
    } = {}
  ) {
    this.tools = tools;
    this.queueManager = new ActionQueueManager(tools);
    this.interpreters = interpreters;
    this.memory = memory;
  }

  private getInterpreter(interpreters: Interpreter[], name: string) {
    console.log({ interpreters, name });
    return interpreters.find((interpreter) => interpreter.name === name);
  }

  private async buildContext(state: State, nextState?: State): Promise<string> {
    console.log("🧠 Building context with RAG and CAG...");
    const context = LLMHeaderBuilder.create();

    // Add tools to context
    context.addHeader("TOOLS", injectActions(this.tools));

    // Add current request
    context.addHeader("USER_REQUEST", state.currentContext);

    // Add previous actions if any
    if (nextState?.previousActions?.length) {
      context.addHeader(
        "PREVIOUS_ACTIONS",
        JSON.stringify(nextState.previousActions)
      );
    }

    // Add results if any
    if (nextState?.results) {
      context.addHeader("RESULTS", nextState.results);
    }

    // Get recent similar actions (CAG)
    const cacheMemories = await this.memory.cache.findSimilarActions(
      state.currentContext,
      {
        similarityThreshold: 80,
        maxResults: 3,
        scope: MemoryScope.GLOBAL,
      }
    );

    // Get relevant knowledge (RAG)
    const persistentMemory = await this.memory.persistent.findRelevantDocuments(
      state.currentContext,
      {
        similarityThreshold: 80,
      }
    );

    if (cacheMemories.length > 0) {
      context.addHeader("RECENT_ACTIONS", JSON.stringify(cacheMemories));
    }

    if (persistentMemory.length > 0) {
      context.addHeader("RELEVANT_KNOWLEDGE", JSON.stringify(persistentMemory));
    }

    // Add available interpreters
    context.addHeader(
      "INTERPRETERS",
      this.interpreters.map((i) => i.name)
    );

    console.log("Context built with memories", context.toString());
    return context.toString();
  }

  async process(
    state: State,
    action?: Action,
    nextState?: State
  ): Promise<{
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
    if (nextState?.previousActions?.length) {
      console.log(
        "📊 Previous actions:",
        nextState.previousActions
          .map((a) => (typeof a === "string" ? a : a.name))
          .join(", ")
      );
    }

    const context = await this.buildContext(state, nextState);

    console.log("\n🧠 Generating response from LLM...");
    const response = await generateObject({
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
      prompt: `
        Evaluate the current state and determine next actions:
        1. Continue executing actions until ALL necessary goals are achieved
        2. Only stop when you have a complete picture of the goal
        3. Social responses can be partial while gathering more data (always use the same language as user request)
        4. Set shouldContinue to false if no more actions are needed
        
        IMPORTANT: If no actions are planned, shouldContinue MUST be false
        
        Use the memory tools to check for relevant information before executing new actions.
      `,
      system: context,
      temperature: 0,
    });

    console.log("\n✨ LLM Response:");
    console.log("🔄 Should continue:", response.object.shouldContinue);
    console.log("🎯 Planned actions:", response.object.actions.length);

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

    // Execute actions if needed
    if (response.object.actions?.length > 0 && response.object.shouldContinue) {
      console.log("\n📋 Processing action queue");
      const queueItems = QueueItemTransformer.transformActionsToQueueItems(
        response.object.actions as ActionData[]
      );
      if (!queueItems) {
        throw new Error("No queue items found");
      }

      console.log(
        "📋 Actions to execute:",
        queueItems
          .map((item) => (typeof item === "string" ? item : item.name))
          .join(", ")
      );

      this.queueManager.addToQueue(queueItems);
      console.log("\n⚡ Executing actions...");
      const results = await this.queueManager.processQueue();
      console.log("✅ Execution results:", results);

      const updatedNextState: State = {
        ...nextState,
        currentContext: nextState?.currentContext || state.currentContext,
        previousActions: [...(state.previousActions || []), ...(results || [])],
      };

      console.log("\n🔁 Recursively processing with updated state");
      return this.process(state, action, updatedNextState);
    }

    // Handle final interpretation
    if (
      !response.object.shouldContinue &&
      nextState?.previousActions?.length &&
      response.object.interpreter
    ) {
      console.log("\n🏁 Analysis complete - generating final interpretation");
      const interpreter = this.getInterpreter(
        this.interpreters,
        response.object.interpreter
      );
      console.log("🎭 Selected Interpreter:", interpreter?.name);
      console.dir(state, { depth: null });
      const interpretationResult = (await interpreter?.process(
        "Interpret the analysis results",
        {
          ...state,
          results: JSON.stringify(nextState.previousActions),
          userRequest: state.currentContext,
        }
      )) as { response: string };

      console.log("\n📊 Final Analysis:", interpretationResult.response);

      const finalState: State = {
        ...nextState,
        results: interpretationResult.response,
      };

      console.log("🔄 Final state:", finalState);
    }

    // Return the final response at the end of the function
    const validatedActions = response.object.actions.map((action) => ({
      ...action,
      parameters: action.parameters.map((param) => ({
        ...param,
        value: param.value ?? null, // Set a default value if undefined
      })),
    }));

    return {
      ...response.object,
      actions: validatedActions,
      results: nextState?.results || undefined,
    };
  }
}

const securityInterpreter = new Interpreter(
  "security",
  securityInterpreterContext
);
const marketInterpreter = new Interpreter("market", marketInterpreterContext);
const generalInterpreter = new Interpreter(
  "general",
  generalInterpreterContext
);

// TEST
const memory = {
  persistent: new PersistentMemory({
    host: "http://localhost:7700",
    apiKey: "aSampleMasterKey",
    indexPrefix: "global",
  }),
  cache: new CacheMemory(),
};

const rewardModel = new LLMRewardModel(
  [checkHoneypot, getRssNews, fetchMarkPrice, getChainsTVL],
  [securityInterpreter, marketInterpreter, generalInterpreter],
  memory,
  { successThreshold: 0.7 }
);

const state: State = {
  currentContext: "analyse bitcoin",
  previousActions: [],
};

(async () => {
  const result = await rewardModel.process(state);
  console.log("🤖 LLMRewardModel process completed");
  console.log("Finished result:", result);

  // Generate and store memories only after all actions are completed
  if (!result.shouldContinue) {
    console.log("🧠 Generating memories...");
    const memories = await generateObject({
      model: openai("gpt-4"),
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
            queryForMemory: z.string(),
            tags: z.array(z.string()),
            ttl: z.number().describe(`
              Time-to-live in seconds:
              - Very short (1 hour): 3600
              - Short (1 day): 86400
              - Medium (1 week): 604800
              - Long (1 month): 2592000
              - Very long (1 year): 31536000
              Choose based on data volatility and relevance
            `),
          })
        ),
      }),
      prompt: `
        User request: ${state.currentContext}
        Result: ${JSON.stringify(result)}
        
        Instructions:
        1. Generate memories based on the user request
        2. Should be short-term memories only if it's ephemeral but relevant and reusable
        3. Only store as long-term:
           - User information
           - User preferences
           - Important facts that don't change often
           - Historical milestones
        4. Make memory data concise and clear
        5. Set appropriate TTL based on data volatility
        
        Generate a list of memories based on these rules.
      `,
      system: `You are a memory curator. Your role is to extract and format memories from interactions.
        - Always match the language of the initial request
        - Be concise and clear
        - Properly categorize between short and long term based on the data volatility
      `,
      temperature: 1,
    });

    console.log("Memories:", memories.object.memories);

    // Store memories after all processing is complete
    await Promise.all([
      // Store short-term memories in cache
      ...memories.object.memories
        .filter((m) => m.type === "short-term")
        .map(async (memoryItem) => {
          const existingCacheMemories = await memory.cache.findSimilarActions(
            memoryItem.data,
            {
              similarityThreshold: 85,
              maxResults: 3,
              scope: MemoryScope.GLOBAL,
            }
          );

          if (existingCacheMemories.length > 0) {
            console.log(
              "⚠️ Similar memory already exists in cache:",
              memoryItem.data
            );
            return;
          }

          await memory.cache.createMemory({
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
          const existingPersistentMemories =
            await memory.persistent.findRelevantDocuments(memoryItem.data, {
              similarityThreshold: 85,
            });

          if (existingPersistentMemories.length > 0) {
            console.log(
              "⚠️ Similar memory already exists in persistent storage:",
              memoryItem.data
            );
            return;
          }

          await memory.persistent.createMemory({
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
})();
