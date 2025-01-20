import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CacheMemory } from "../../memory/cache";
import { PersistentMemory } from "../../memory/persistent";
import { ActionSchema, MemoryScope, MemoryType, State } from "../../types";
import { injectActions } from "../../utils/inject-actions";
import { Interpreter } from "../interpreter";
import { evaluatorContext } from "./context";

export class Evaluator {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];
  private memory: {
    persistent: PersistentMemory;
    cache?: CacheMemory;
  };
  private interpreters: Interpreter[];

  constructor(
    tools: ActionSchema[],
    memory: {
      persistent: PersistentMemory;
      cache?: CacheMemory;
    },
    interpreters: Interpreter[]
  ) {
    this.tools = tools;
    this.memory = memory;
    this.interpreters = interpreters;
  }

  composeContext(state: State) {
    const { userRequest, results } = state;
    const { role, language, guidelines } = evaluatorContext.behavior;
    const { important, warnings } = guidelines;

    const context = `
      # ROLE: ${role}
      # LANGUAGE: ${language}
      # IMPORTANT: ${important.join("\n")}
      # NEVER: ${warnings.join("\n")}
      # USER_REQUEST: ${userRequest}
      # ACTIONS AVAILABLE: ${injectActions(this.tools)}
      # CURRENT_RESULTS: ${results}
      # INTERPRETERS: ${this.interpreters
        .map((interpreter) => interpreter.name)
        .join(", ")}
    `;
    return context;
  }

  async process(prompt: string, results: string): Promise<any> {
    try {
      const context = this.composeContext({
        userRequest: prompt,
        results: results,
      });
      console.log("\n🔍 Evaluator processing");
      console.log("Goal:", prompt);

      const response = await generateObject({
        model: this.model,
        schema: z.object({
          requestLanguage: z.string(),
          actionsAlreadyDone: z.array(z.string()),
          extraInformationsToStore: z.array(
            z.object({
              memoryType: z.enum(["episodic", "semantic", "procedural"]),
              queryForData: z.string(),
              data: z.string(),
              tags: z.array(z.string()),
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
          interpreter: z.string(),
        }),
        prompt: prompt,
        system: `${context}`,
        temperature: 0,
      });

      const validatedResponse = {
        ...response.object,
        nextActionsNeeded: response.object.nextActionsNeeded.map((action) => ({
          ...action,
          parameters: action.parameters || {},
        })),
      };

      if (validatedResponse.extraInformationsToStore.length > 0) {
        console.log(
          "\n💭 Processing important memories to store",
          validatedResponse
        );
        for (const item of validatedResponse.extraInformationsToStore) {
          console.log("\n📝 Processing memory item:");
          console.log("Type:", item.memoryType);
          console.log("Content:", item.queryForData);

          const memories = await this.memory.persistent.findRelevantDocuments(
            item.queryForData,
            {
              similarityThreshold: 70,
            }
          );

          if (memories.length > 0) {
            console.log("🔄 Similar memory already exists - skipping");
            continue;
          }

          console.log("✨ Storing new memory");
          await this.memory.persistent.createMemory({
            id: crypto.randomUUID(),
            purpose: item.memoryType,
            query: item.queryForData,
            data: item.data,
            scope: MemoryScope.GLOBAL,
            createdAt: new Date(),
          });
        }
      }

      // Storing workflow actions completed
      const cacheMemory = this.memory.cache;
      if (cacheMemory) {
        cacheMemory.createMemory({
          content: prompt,
          type: MemoryType.ACTION,
          data: validatedResponse.actionsAlreadyDone,
          scope: MemoryScope.GLOBAL,
        });
        console.log(
          "✅ Workflow actions completed stored in cache",
          prompt,
          validatedResponse.actionsAlreadyDone
        );
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
        if (error.value.extraInformationsToStore.length > 0) {
          for (const item of error.value.extraInformationsToStore) {
            // Check if the item is already in the memory
            const memories = await this.memory.persistent.findRelevantDocuments(
              item.content
            );
            if (memories.length === 0) {
              console.log("Adding to memory", {
                query: item.content,
                data: item.data,
              });
              await this.memory.persistent.createMemory({
                id: crypto.randomUUID(),
                purpose: "importantToRemember",
                query: item.content,
                data: item.data,
                scope: MemoryScope.GLOBAL,
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
