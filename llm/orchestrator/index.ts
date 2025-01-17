import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, BaseLLM } from "../../types";
import { orchestratorContext } from "./context";

export class Orchestrator implements BaseLLM {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];
  private memory: PersistentMemory;
  constructor(tools: ActionSchema[], memory: PersistentMemory) {
    this.memory = memory;
    this.tools = [
      ...tools,
      {
        name: "search_memory",
        description:
          "Search for relevant information in the internal knowledge base",
        parameters: z.object({
          query: z.string(),
        }),
        execute: async (params) => {
          const memories = await this.memory.searchSimilarQueries(params.value);
          return memories;
        },
      },
    ];
  }

  async process(prompt: string): Promise<any> {
    try {
      const response = await generateObject({
        model: this.model,
        schema: z.object({
          actions: z.array(
            z.object({
              name: z.string(),
              parameters: z.object({
                name: z.string(),
                value: z.string(),
              }),
            })
          ),
          answer: z.string(),
        }),
        prompt: prompt,
        system: orchestratorContext.compose(this.tools),
      });

      const validatedResponse = {
        ...response.object,
        actions: response.object.actions.map((action) => ({
          ...action,
          parameters: action.parameters || {},
        })),
      };
      console.log("Orchestrator response");
      console.dir(validatedResponse, { depth: null });

      return validatedResponse;
    } catch (error: any) {
      if (error) {
        console.log("Orchestrator response");
        console.dir(error.value, { depth: null });
        console.error(error.message);
        return {
          ...error.value,
        };
      }
      // throw error;
    }
  }
}
