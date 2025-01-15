import { openai } from "@ai-sdk/openai";
import { generateObject, streamText, StreamTextResult } from "ai";
import { z } from "zod";
import { BaseLLM } from "../../types";
import { summarizerContext } from "./context";

export class Summarizer implements BaseLLM {
  private readonly model = openai("gpt-4-turbo");

  async process(
    prompt: string,
    onFinish?: (event: any) => void
  ): Promise<
    | {
        actions: { name: string; result: string; why: string }[];
        response: string;
      }
    | StreamTextResult<Record<string, any>>
  > {
    console.log("Summarizing results...");
    const result = await generateObject({
      model: this.model,
      schema: z.object({
        actions: z.array(
          z.object({
            name: z.string(),
            result: z.string(),
            why: z.string(),
          })
        ),
        response: z.string(),
      }),
      prompt: summarizerContext.compose(prompt),
      system: summarizerContext.role,
    });
    console.log("Summarized results:", result.object);
    if (onFinish) onFinish(result.object);
    return result.object;
  }

  async streamProcess(
    prompt: string,
    onFinish?: (event: any) => void
  ): Promise<StreamTextResult<Record<string, any>>> {
    const result = await streamText({
      model: this.model,
      prompt: summarizerContext.compose(prompt),
      onFinish: onFinish,
      system: summarizerContext.role,
    });
    return result;
  }
}
