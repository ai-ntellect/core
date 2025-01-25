import { LanguageModel, streamText, StreamTextResult } from "ai";
import { z } from "zod";
import { Behavior, State } from "../../types";
import { generateObject } from "../../utils/generate-object";
import { LLMHeaderBuilder } from "../../utils/header-builder";

const interpreterSchema = z.object({
  requestLanguage: z
    .string()
    .describe("The language of the user's request (fr, en, es, etc.)"),
  actionsCompleted: z
    .array(
      z.object({
        name: z.string(),
        reasoning: z.string(),
      })
    )
    .describe("The actions done and why."),
  response: z.string().describe("The response to the user's request."),
});

interface InterpretationResult {
  actionsCompleted: {
    name: string;
    reasoning: string;
  }[];
  response: string;
}

export class Interpreter {
  public readonly model: LanguageModel;
  public readonly name: string;
  public readonly character: Behavior;

  constructor({
    name,
    model,
    character,
  }: {
    name: string;
    model: LanguageModel;
    character: Behavior;
  }) {
    this.name = name;
    this.model = model;
    this.character = character;
  }

  private buildContext(state: State) {
    const { userRequest, results } = state;
    const { role, language, guidelines } = this.character;
    const { important, warnings, steps } = guidelines;

    const context = LLMHeaderBuilder.create();

    if (role) {
      context.addHeader("ROLE", role);
    }

    if (language) {
      context.addHeader("LANGUAGE", language);
    }

    if (important.length > 0) {
      context.addHeader("IMPORTANT", important);
    }

    if (warnings.length > 0) {
      context.addHeader("NEVER", warnings);
    }

    context.addHeader("CURRENT_RESULTS", results);
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
    try {
      console.log("\n🎨 Starting interpretation process");
      console.log("Prompt:", prompt);
      console.log("Results to interpret:", JSON.stringify(state, null, 2));

      const context = this.buildContext(state);
      console.log("Context:", context.toString());
      const result = await generateObject<InterpretationResult>({
        model: this.model,
        prompt,
        system: context.toString(),
        temperature: 1.3,
        schema: interpreterSchema,
      });

      if (onFinish) onFinish(result.object);
      return result.object;
    } catch (error) {
      console.error("Error parsing schema:", error);
      throw error;
    }
  }

  async streamProcess(
    prompt: string,
    state: State,
    onFinish?: (event: any) => void
  ): Promise<any> {
    console.log("\n🎨 Starting streaming interpretation");
    console.log("Prompt:", prompt);

    const context = this.buildContext(state);

    const result = await streamText({
      model: this.model,
      onFinish: (event) => {
        console.log("\n✅ Streaming interpretation completed");
        if (onFinish) onFinish(event);
      },
      prompt,
      system: context.toString(),
      temperature: 1.3,
    });

    return result;
  }
}
