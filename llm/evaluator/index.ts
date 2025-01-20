import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, MemoryScope, QueueResult, State } from "../../types";
import { injectActions } from "../../utils/inject-actions";
import { evaluatorContext } from "./context";

export class Evaluator {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];
  private memory: PersistentMemory;

  constructor(tools: ActionSchema[], memory: PersistentMemory) {
    this.tools = tools;
    this.memory = memory;
  }

  composeContext(state: State) {
    const { behavior, userRequest, actions, results } = state;
    const { role, language, guidelines } = behavior;
    const { important, warnings, steps } = guidelines;

    const context = `
      # ROLE: ${role}
      # LANGUAGE: ${language}
      # IMPORTANT: ${important.join("\n")}
      # NEVER: ${warnings.join("\n")}
      # USER_REQUEST: ${userRequest}
      # ACTIONS AVAILABLE: ${injectActions(actions)}
      # CURRENT_RESULTS: ${results.map((r) => r.result).join(", ")}
      # STEPS: ${steps?.join("\n") || ""}
    `;
    return context;
  }

  async process(prompt: string, results: QueueResult[]): Promise<any> {
    try {
      const context = this.composeContext({
        behavior: evaluatorContext.behavior,
        userRequest: prompt,
        actions: this.tools,
        results: results,
      });
      console.log("\n🔍 Evaluator processing");
      console.log("Goal:", prompt);

      const response = await generateObject({
        model: this.model,
        schema: z.object({
          actionsCompleted: z.array(z.string()),
          actionsFailed: z.array(z.string()),
          isRemindNeeded: z.boolean(),
          importantToRemembers: z.array(
            z.object({
              memoryType: z.string(),
              content: z.string(),
              data: z.string(),
            })
          ),
          response: z.string(),
          isNextActionNeeded: z.boolean(),
          nextActionsNeeded: z.array(
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
          why: z.string(),
        }),
        prompt: prompt,
        system: context,
        temperature: 0,
      });

      const validatedResponse = {
        ...response.object,
        nextActionsNeeded: response.object.nextActionsNeeded.map((action) => ({
          ...action,
          parameters: action.parameters || {},
        })),
      };

      if (validatedResponse.isRemindNeeded) {
        console.log(
          "\n💭 Processing important memories to store",
          validatedResponse
        );
        for (const item of validatedResponse.importantToRemembers) {
          console.log("\n📝 Processing memory item:");
          console.log("Type:", item.memoryType);
          console.log("Content:", item.content);

          const memories = await this.memory.searchSimilarQueries(
            item.content,
            {
              similarityThreshold: 95,
            }
          );

          if (memories.length > 0) {
            console.log("🔄 Similar memory already exists - skipping");
            continue;
          }

          console.log("✨ Storing new memory");
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

      console.log("\n✅ Evaluation completed");
      console.log("─".repeat(50));
      console.log("Results:", JSON.stringify(validatedResponse, null, 2));

      return validatedResponse;
    } catch (error: any) {
      console.error("\n❌ Evaluator error:", error.message);
      if (error) {
        console.log("Evaluator error");
        console.dir(error.value, { depth: null });
        console.error(error.message);
        if (error.value.importantToRemembers.length > 0) {
          for (const item of error.value.importantToRemembers) {
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
