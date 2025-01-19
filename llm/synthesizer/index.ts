import { openai } from "@ai-sdk/openai";
import { generateObject, StreamTextResult } from "ai";
import { z } from "zod";
import { State } from "../../agent";
import { QueueResult } from "../../types";
import { synthesizerContext } from "./context";

export class Synthesizer {
  private readonly model = openai("gpt-4-turbo");

  composeContext(state: Partial<State>) {
    const { behavior, userRequest, results, examplesMessages } = state;

    if (!behavior) {
      return "";
    }
    const { role, language, guidelines } = behavior;
    const { important, warnings, steps } = guidelines;

    const context = `
      # ROLE: ${role}
      # LANGUAGE: ${language}
      # IMPORTANT: ${important.join("\n")}
      # NEVER: ${warnings.join("\n")}
      # USER_REQUEST: ${userRequest}
      # CURRENT_RESULTS: ${results?.map((r) => r.result).join(", ") || ""}
      # STEPS: ${steps?.join("\n") || ""}
      # MESSAGES EXAMPLES: ${JSON.stringify(examplesMessages, null, 2)}
    `;

    return context;
  }

  async process(
    prompt: string,
    results: QueueResult[],
    onFinish?: (event: any) => void
  ): Promise<
    | {
        actionsCompleted: {
          name: string;
          reasoning: string;
        }[];
        response: string;
      }
    | StreamTextResult<Record<string, any>>
  > {
    console.log("\n🎨 Starting synthesis process");
    console.log("Prompt:", prompt);
    console.log("Results to synthesize:", JSON.stringify(results, null, 2));
    const context = this.composeContext({
      behavior: synthesizerContext.behavior,
      userRequest: prompt,
      results: results,
    });

    const result = await generateObject({
      model: this.model,
      schema: z.object({
        requestLanguage: z.string(),
        actionsCompleted: z.array(
          z.object({
            name: z.string(),
            reasoning: z.string(),
          })
        ),
        response: z.string(),
      }),
      prompt,
      system: context,
    });

    console.log("\n✅ Synthesis completed");
    console.log("─".repeat(50));
    console.log("Generated response:", result.object);

    if (result.object.actionsCompleted.length > 0) {
      console.log("\n📋 Suggested actions:");
      result.object.actionsCompleted.forEach((action, index) => {
        console.log(`\n${index + 1}. Action Details:`);
        console.log(`   Name: ${action.name}`);
        console.log(`   Reasoning: ${action.reasoning}`);
      });
    }

    if (onFinish) onFinish(result.object);
    return result.object;
  }

  async streamProcess(
    prompt: string,
    summaryData?: string,
    onFinish?: (event: any) => void
  ): Promise<any> {
    console.log("\n🎨 Starting streaming synthesis");
    console.log("Prompt:", prompt);
    // if (summaryData) {
    //   console.log(
    //     "Summary data:",
    //     JSON.stringify(JSON.parse(summaryData), null, 2)
    //   );
    // }

    // const result = await streamText({
    //   model: this.model,
    //   prompt: synthesizerContext.compose(prompt, summaryData || ""),
    //   onFinish: (event) => {
    //     console.log("\n✅ Streaming synthesis completed");
    //     if (onFinish) onFinish(event);
    //   },
    //   system: synthesizerContext.role,
    // });

    // return result;
  }
}
