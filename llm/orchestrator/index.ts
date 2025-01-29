import { generateObject, LanguageModelV1 } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { Graph } from "../../services/graph";
import {
  GraphDefinition,
  MemoryScope,
  MyContext,
  SharedState,
} from "../../types";
import { LLMHeaderBuilder } from "../../utils/header-builder";
import { Interpreter } from "../interpreter";
import { orchestratorInstructions } from "./context";

export class Orchestrator {
  private readonly model: LanguageModelV1;
  public readonly tools: GraphDefinition<any>[];
  public readonly interpreters: Interpreter[];
  private memory?: {
    persistent?: PersistentMemory;
    cache?: CacheMemory;
  };

  constructor(
    model: LanguageModelV1,
    tools: GraphDefinition<any>[],
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
    const toolsContext = this.tools.map((workflow) => {
      const workflowInstance = new Graph(workflow);
      return {
        name: workflow.name,
        description: workflow.nodes[workflow.entryNode]?.description || "",
        schema:
          workflow.schema instanceof z.ZodObject
            ? {
                parameters: Object.entries(workflow.schema.shape)
                  .filter(([key]) => key !== "parameters")
                  .map(([key, type]) => ({
                    name: key,
                    type: workflowInstance.describeZodType(type as z.ZodType),
                  })),
              }
            : null,
      };
    });
    context.addHeader("TOOLS", JSON.stringify(toolsContext, null, 2));

    // Get recent similar actions (CAG)
    if (this.memory?.cache && state.messages) {
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
    if (this.memory?.persistent && state.messages) {
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

    console.log("🧠 Context:", context.toString());
    return context.toString();
  }

  private async shouldContinueProcessing(
    state: SharedState<MyContext>
  ): Promise<boolean> {
    const stateScore = state.context?.stateScore;

    // If no score exists, continue processing
    if (!stateScore) return true;

    // If score is too low, force continue
    if (stateScore.value < 30) return true;

    // If score is very high, consider stopping
    if (stateScore.value > 80 && stateScore.confidence > 0.8) return false;

    // Default behavior based on current processing state
    return !state.context?.processing?.stop;
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
    score?: number;
  }> {
    if (callbacks?.onStart) callbacks.onStart();

    // Check if we should continue based on state score
    const shouldContinue = await this.shouldContinueProcessing(state);
    if (!shouldContinue) {
      return {
        processing: {
          stop: true,
          stopReason: "State score indicates sufficient completion",
        },
        actions: [],
        response: "Processing completed based on state score evaluation",
        interpreter: null,
      };
    }

    const context = await this.buildContext(state);
    let prompt = LLMHeaderBuilder.create();
    if (state.context.messages) {
      prompt.addHeader(
        "REQUEST",
        state.context.messages[
          state.context.messages.length - 1
        ].content.toString()
      );

      if (state.context.messages.length > 1) {
        prompt.addHeader("RECENT_MESSAGES", JSON.stringify(state.messages));
      }
    }
    if (state.context?.results) {
      prompt.addHeader("ACTIONS_DONE", JSON.stringify(state.context.results));
    }
    console.log("🔄 Prompt:", prompt.toString());

    console.log("\n🧠 Generating response from Orchestrator...");
    const response = await generateObject({
      model: this.model,
      schema: z.object({
        processing: z.object({
          stop: z.boolean(),
          reason: z.string(),
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
      mode: "json",
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
