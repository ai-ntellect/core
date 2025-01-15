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
    const response = await generateObject({
      model: this.model,
      schema: z.object({
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.record(z.string(), z.any()),
          })
        ),
        answer: z.string(),
      }),
      prompt: prompt,
      system: orchestratorContext.compose(this.tools),
    });

    return response.object;
  }
}
