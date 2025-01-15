import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { ActionSchema, Agent } from "../../types";
import { orchestratorContext } from "./context";

export class Orchestrator implements Agent {
  private readonly model = openai("gpt-4o-mini");
  public tools: ActionSchema[];

  constructor(tools: ActionSchema[]) {
    this.tools = tools;
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

      console.dir(validatedResponse, { depth: null });

      return validatedResponse;
    } catch (error: any) {
      if (error) {
        console.log("Error in Orchestrator", error.message);
        console.dir(error.value, { depth: null });
        return {
          ...error.value,
        };
      }
      // throw error;
    }
  }
}
