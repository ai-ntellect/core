import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, BaseLLM, MemoryScopeType } from "../../types";
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
        execute: async ({ query }: { query: string }) => {
          const memories = await this.memory.searchSimilarQueries(query, {
            similarityThreshold: 95,
          });

          return memories;
        },
      },
      {
        name: "save_memory",
        description: "Save relevant information in the internal knowledge base",
        parameters: z.object({
          query: z.string(),
          memoryType: z.string(),
          data: z.any(),
          scope: z.string().default("GLOBAL").describe("GLOBAL or USER"),
          userId: z.string(),
          whyStored: z.string(),
        }),
        execute: async ({
          query,
          purpose,
          data,
          scope,
          userId,
        }: {
          query: string;
          purpose: string;
          data: any;
          scope: MemoryScopeType;
          userId?: string;
        }) => {
          const memories = await this.memory.createMemory({
            query,
            purpose,
            data,
            scope,
            userId,
            createdAt: new Date(),
            id: crypto.randomUUID(),
          });
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
          actions: ActionSchema,
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
