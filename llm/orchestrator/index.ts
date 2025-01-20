import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, State } from "../../types";
import { injectActions } from "../../utils/inject-actions";
import { orchestratorContext } from "./context";

export class Orchestrator {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];
  private memory: {
    persistent: PersistentMemory;
    cache: CacheMemory;
  };
  private id: string;

  constructor({
    id,
    tools,
    memory,
  }: {
    id: string;
    tools: ActionSchema[];
    memory: {
      persistent: PersistentMemory;
      cache: CacheMemory;
    };
  }) {
    this.id = id;
    this.memory = memory;
    this.tools = [
      ...tools,
      {
        name: "search_internal_knowledge_base",
        description:
          "Search for relevant information in the internal knowledge base",
        parameters: z.object({
          query: z.string(),
        }),
        execute: async ({ query }: { query: string }) => {
          const persistentMemories =
            await this.memory.persistent.findRelevantDocuments(query, {
              similarityThreshold: 70,
            });
          return `# LONG_TERM_MEMORY: ${JSON.stringify(persistentMemories)}`;
        },
      },
    ];
  }

  composeContext(state: State) {
    const { userRequest, results } = state;
    const { role, language, guidelines } = orchestratorContext.behavior;
    const { important, warnings } = guidelines;

    const context = `
      # ROLE: ${role}
      # LANGUAGE: ${language}
      # IMPORTANT: ${important.join("\n")}
      # USER_REQUEST: ${userRequest}
      # ACTIONS_AVAILABLES: ${injectActions(this.tools)} (NEVER REPEAT ACTIONS)
      # CURRENT_RESULTS: ${results}
    `.trim();

    return context;
  }

  async process(
    prompt: string,
    results: string
  ): Promise<{
    actions: {
      name: string;
      type: string;
      parameters: {
        name: string;
        value: any;
      }[];
    }[];
    answer: string;
  }> {
    const state = this.composeContext({
      userRequest: prompt,
      results: results,
    });
    try {
      console.log("\n🎭 Orchestrator processing");
      console.log("Prompt:", prompt);

      const response = await generateObject({
        model: this.model,
        schema: z.object({
          actions: z.array(
            z.object({
              name: z.string(),
              type: z.enum(["on-chain", "off-chain", "question", "analysis"]),
              parameters: z.array(
                z.object({
                  name: z.string(),
                  value: z.any(),
                })
              ),
            })
          ),
          answer: z.string(),
        }),
        prompt: prompt,
        system: state,
        temperature: 0,
      });

      const validatedResponse = {
        ...response.object,
        actions: response.object.actions.map((action) => ({
          ...action,
          parameters: Array.isArray(action.parameters)
            ? action.parameters.map((param) => ({
                name: param.name,
                value: param.value ?? null,
              }))
            : Object.entries(action.parameters || {}).map(([name, value]) => ({
                name,
                value: value ?? null,
              })),
        })),
      };

      console.log("\n✅ Orchestration completed");
      console.log("─".repeat(50));
      console.log(
        "Actions determined:",
        validatedResponse.actions.map((a) => {
          return `${a.name} (${a.type})`;
        })
      );
      if (validatedResponse.answer) {
        console.log("Response:", validatedResponse.answer);
      }

      return validatedResponse;
    } catch (error: any) {
      console.error("\n❌ Orchestrator error:", error.message);
      if (error?.value) {
        console.log("Partial response:", JSON.stringify(error.value, null, 2));
        return { ...error.value };
      }
      throw error;
    }
  }
}
