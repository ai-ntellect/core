import { openai } from "@ai-sdk/openai";
import { generateObject, streamText, StreamTextResult } from "ai";
import { z } from "zod";
import { Behavior, State } from "../../types";

export class Interpreter {
  private readonly model = openai("gpt-4o");
  public readonly name: string;

  constructor(name: string, private readonly behavior: Behavior) {
    this.name = name;
    this.behavior = behavior;
  }

  composeContext(state: State) {
    const { userRequest, results } = state;
    const { role, language, guidelines, examplesMessages } = this.behavior;

    const { important, warnings, steps } = guidelines;

    const context = `
      # ROLE: ${role}
      # LANGUAGE: ${language}
      # IMPORTANT: ${important.join("\n")}
      # NEVER: ${warnings.join("\n")}
      # USER_REQUEST: ${userRequest}
      # CURRENT_RESULTS: ${results}
      # STEPS: ${steps?.join("\n") || ""}
      # MESSAGES EXAMPLES: ${JSON.stringify(examplesMessages, null, 2)}
    `;
    return context;
  }

  async process(
    prompt: string,
    state: State,
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
    console.log("\n🎨 Starting interpretation process");
    console.log("Prompt:", prompt);
    console.log("Results to interpret:", JSON.stringify(state, null, 2));

    const context = this.composeContext(state);

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

    console.log("\n✅ Interpretation completed");
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
    state: State,
    onFinish?: (event: any) => void
  ): Promise<any> {
    console.log("\n🎨 Starting streaming interpretation");
    console.log("Prompt:", prompt);

    const context = this.composeContext(state);

    const result = await streamText({
      model: this.model,
      onFinish: (event) => {
        console.log("\n✅ Streaming interpretation completed");
        if (onFinish) onFinish(event);
      },
      prompt,
      system: context,
    });

    return result;
  }
}
