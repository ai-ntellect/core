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
          isRemindNeeded: z.boolean(),
          extraInformationsToRemember: z.array(
            z.object({
              memoryType: z.string(),
              content: z.string(),
              data: z.string(),
            })
          ),
          response: z.string(),
          isNextActionNeeded: z.boolean(),
          nextActionsNeeded: ActionSchema,
          why: z.string(),
        }),
        prompt: prompt,
        system: evaluatorContext.compose(goal, results, this.tools),
      });

      const validatedResponse = {
        ...response.object,
        nextActions: response.object.nextActionsNeeded.map((action) => ({
          ...action,
          parameters: action.parameters || {},
        })),
      };

      if (validatedResponse.isRemindNeeded) {
        for (const item of validatedResponse.extraInformationsToRemember) {
          // Check if the item is already in the memory
          const memories = await this.memory.searchSimilarQueries(
            item.content,
            {
              similarityThreshold: 95,
            }
          );
          if (memories.length > 0) {
            console.log("Similar memorie found, no need to remember", {
              memories,
            });
            continue;
          }
          if (memories.length === 0) {
            console.log("Adding to memory", {
              query: item.content,
              data: item.data,
            });
            await this.memory.createMemory({
              id: crypto.randomUUID(),
              purpose: item.memoryType,
              query: item.content,
              data: item.data,
              scope: MemoryScope.GLOBAL,
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
        if (error.value.extraInformationsToRemember.length > 0) {
          for (const item of error.value.extraInformationsToRemember) {
            // Check if the item is already in the memory
            const memories = await this.memory.searchSimilarQueries(
              item.content
            );
            if (memories.length === 0) {
              console.log("Adding to memory", {
                query: item.content,
                data: item.data,
              });
              await this.memory.createMemory({
                id: crypto.randomUUID(),
                purpose: "importantToRemember",
                query: item.content,
                data: item.data,
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
