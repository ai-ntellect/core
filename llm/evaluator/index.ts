import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { ActionSchema } from "../../types";
import { evaluatorContext } from "./context";

export class Evaluator {
  private readonly model = openai("gpt-4o");
  public tools: ActionSchema[];

  constructor(tools: ActionSchema[]) {
    this.tools = tools;
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

      console.log("Evaluator response");
      console.dir(validatedResponse, { depth: null });
      return validatedResponse;
    } catch (error: any) {
      if (error) {
        console.log("Evaluator error");
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
