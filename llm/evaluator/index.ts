import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, MemoryScope } from "../../types";
import { evaluatorContext } from "./context";

export class Evaluator {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];
  private memory: PersistentMemory;

  constructor(tools: ActionSchema[], memory: PersistentMemory) {
    this.tools = tools;
    this.memory = memory;
  }

  async process(prompt: string, goal: string, results: string): Promise<any> {
    try {
      const response = await generateObject({
        model: this.model,
        schema: z.object({
          nextActions: z.array(
            z.object({
              name: z.string(),
              parameters: z.object({
                name: z.string(),
                value: z.string(),
              }),
            })
          ),
          why: z.string(),
          importantToRemembers: z.array(
            z.object({
              hypotheticalQuery: z.string(),
              result: z.string(),
            })
          ),
        }),
        prompt: prompt,
        system: evaluatorContext.compose(goal, results, this.tools),
      });

      const validatedResponse = {
        ...response.object,
        nextActions: response.object.nextActions.map((action) => ({
          ...action,
          parameters: action.parameters || {},
        })),
      };

      if (validatedResponse.importantToRemembers.length > 0) {
        for (const item of validatedResponse.importantToRemembers) {
          // Check if the item is already in the memory
          const memories = await this.memory.findBestMatches(
            item.hypotheticalQuery
          );
          if (memories.length === 0) {
            console.log("Adding to memory", {
              query: item.hypotheticalQuery,
              data: item.result,
            });
            await this.memory.storeMemory({
              id: crypto.randomUUID(),
              purpose: "importantToRemember",
              query: item.hypotheticalQuery,
              data: item.result,
              scope: MemoryScope.USER,
              createdAt: new Date(),
            });
          }
        }
      }

      console.log("Evaluator response");
      console.dir(validatedResponse, { depth: null });
      return validatedResponse;
    } catch (error: any) {
      if (error) {
        console.log("Evaluator error");
        console.dir(error.value, { depth: null });
        console.error(error.message);
        if (error.value.importantToRemembers.length > 0) {
          for (const item of error.value.importantToRemembers) {
            // Check if the item is already in the memory
            const memories = await this.memory.findBestMatches(
              item.hypotheticalQuery
            );
            if (memories.length === 0) {
              console.log("Adding to memory", {
                query: item.hypotheticalQuery,
                data: item.result,
              });
              await this.memory.storeMemory({
                id: crypto.randomUUID(),
                purpose: "importantToRemember",
                query: item.hypotheticalQuery,
                data: item.result,
                scope: MemoryScope.USER,
                createdAt: new Date(),
              });
            }
          }
        }

        return {
          ...error.value,
        };
      }
      // throw error;
    }
  }
}
