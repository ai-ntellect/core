import { openai } from "@ai-sdk/openai";
import { generateObject, streamText, StreamTextResult } from "ai";
import { z } from "zod";
import { BaseLLM } from "../../types";
import { synthesizerContext } from "./context";

export class Synthesizer implements BaseLLM {
  private readonly model = openai("gpt-4-turbo");

  async process(
    prompt: string,
    summaryData?: string,
    onFinish?: (event: any) => void
  ): Promise<
    | {
        actions: {
          name: string;
          reasoning: string;
        }[];
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
            reasoning: z.string(),
          })
        ),
        response: z.string(),
      }),
      prompt: synthesizerContext.compose(prompt, summaryData || ""),
      system: synthesizerContext.role,
    });
    console.log("Synthesizer");
    console.dir(result.object, { depth: null });
    if (onFinish) onFinish(result.object);
    return result.object;
  }

  async streamProcess(
    prompt: string,
    summaryData?: string,
    onFinish?: (event: any) => void
  ): Promise<StreamTextResult<Record<string, any>>> {
    const result = await streamText({
      model: this.model,
      prompt: synthesizerContext.compose(prompt, summaryData || ""),
      onFinish: onFinish,
      system: synthesizerContext.role,
    });
    return result;
  }
}
