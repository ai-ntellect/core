import { generateObject, LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, MemoryScope, MyContext, SharedState } from "../../types";
import { LLMHeaderBuilder } from "../../utils/header-builder";
import { injectActions } from "../../utils/inject-actions";
import { Interpreter } from "../interpreter";
import { orchestratorInstructions } from "./context";

export class Orchestrator {
  private readonly model: LanguageModelV1;
  private readonly tools: ActionSchema[];
  private readonly interpreters: Interpreter[];
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
    }
  ) {
    this.model = model;
    this.tools = tools;
    this.interpreters = interpreters;
    this.memory = memory;
  }

  private async buildContext(state: SharedState<MyContext>): Promise<string> {
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

    // Get recent similar actions (CAG)
    if (this.memory?.cache) {
      const cacheMemories = await this.memory.cache.findSimilarActions(
        state.messages[state.messages.length - 1].content.toString(),
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
          state.messages[state.messages.length - 1].content.toString(),
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
      "INTERPRETERS (choose one)",
      JSON.stringify(this.interpreters.map((i) => i.name))
        .replace("[", "")
        .replace("]", "")
    );
    return context.toString();
  }

  async process(
    state: SharedState<MyContext>,
    callbacks?: {
      onStart?: () => void;
      onFinish?: (event: any) => void;
    }
  ): Promise<{
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
        cronExpression?: string;
        reason?: string;
      };
    }>;
    response: string;
    interpreter?: string | null;
    results?: string;
  }> {
    if (callbacks?.onStart) callbacks.onStart();

    const context = await this.buildContext(state);
    let prompt = LLMHeaderBuilder.create();
    prompt.addHeader(
      "REQUEST",
      state.messages[state.messages.length - 1].content.toString()
    );

    if (state.messages.length > 1) {
      prompt.addHeader("RECENT_MESSAGES", JSON.stringify(state.messages));
    }

    if (state.context.results) {
      prompt.addHeader("ACTIONS_DONE", JSON.stringify(state.context.results));
    }

    console.log("\n🧠 Generating response from Orchestrator...");
    const response = await generateObject({
      model: this.model,
      schema: z.object({
        processing: z.object({
          stop: z.boolean(),
          stopReason: z.string(),
        }),
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.array(
              z.object({
                name: z.string(),
                value: z.any(),
              })
            ),
            scheduler: z.object({
              isScheduled: z.boolean(),
              cronExpression: z.string(),
              reason: z.string(),
            }),
          })
        ),
        response: z.string(),
        interpreter: z.string().or(z.null()),
      }),
      system: context.toString(),
      temperature: 0,
      prompt: prompt.toString(),
    });
    console.log("🔄 Orchestrator response:");
    console.dir(response.object, { depth: null });

    // Force shouldContinue to false if no actions are planned
    if (response.object.actions.length === 0) {
      response.object.processing.stop = true;
      console.log("⚠️ No actions planned, forcing isProcessing to false");
    }

    // Handle social interactions and actions in a single block
    if (response.object.response) {
      console.log("\n💬 Processing social response");
      if (response.object.response) {
        console.log("📢 Response:", response.object.response);
        // Ensure all parameters have a value property
      }
    }

    if (callbacks?.onFinish) callbacks.onFinish(response.object);

    return response.object as any;
  }
}
