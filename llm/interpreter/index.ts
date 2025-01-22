import { deepseek } from "@ai-sdk/deepseek";
import { generateText, streamText, StreamTextResult } from "ai";
import { z } from "zod";
import { Behavior, State } from "../../types";
import { LLMHeaderBuilder } from "../helpers/header-builder";
import { SchemaGenerator } from "../helpers/schema-generator";

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

export class Interpreter {
  private readonly model = deepseek("deepseek-reasoner");
  public readonly name: string;

  constructor(name: string, private readonly behavior: Behavior) {
    this.name = name;
    this.behavior = behavior;
  }

  composeContext(state: State) {
    const { userRequest, results } = state;
    const { role, language, guidelines, examplesMessages } = this.behavior;
    const { important, warnings, steps } = guidelines;

    const { schema, instructions, outputExamples } = SchemaGenerator.generate({
      schema: interpreterSchema,
      outputExamples: [
        {
          input: "Hello, how are you?",
          output: `{
            "requestLanguage": "en",
            "actionsCompleted": [],
            "response": "Hello, I'm fine, thank you!"
          }`,
        },
      ],
    });

    const context = LLMHeaderBuilder.create()
      .addHeader("ROLE", role)
      .addHeader("LANGUAGE", language)
      .addHeader("IMPORTANT", important)
      .addHeader("NEVER", warnings)
      .addHeader("CURRENT_RESULTS", results)
      .addHeader("STEPS", steps)
      .addHeader("USER_REQUEST", userRequest)
      .addHeader("OUTPUT_SCHEMA", schema)
      .addHeader("OUTPUT_INSTRUCTIONS", instructions)
      .addHeader("OUTPUT_EXAMPLES", outputExamples)
      .build();
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

      const context = this.composeContext(state);

      const result = await generateText({
        model: this.model,
        prompt,
        system: context,
        temperature: 1.3,
      });
      console.log(result.text);
      const parsedSchema = JSON.parse(result.text);
      console.log("\n✅ Interpretation completed");
      console.log("─".repeat(50));
      console.log("Generated response:", parsedSchema);

      if (parsedSchema.actionsCompleted.length > 0) {
        console.log("\n📋 Suggested actions:");
        parsedSchema.actionsCompleted.forEach((action: any, index: any) => {
          console.log(`\n${index + 1}. Action Details:`);
          console.log(`   Name: ${action.name}`);
          console.log(`   Reasoning: ${action.reasoning}`);
        });
      }

      if (onFinish) onFinish(parsedSchema);
      return parsedSchema;
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

    const context = this.composeContext(state);

    const result = await streamText({
      model: this.model,
      onFinish: (event) => {
        console.log("\n✅ Streaming interpretation completed");
        if (onFinish) onFinish(event);
      },
      prompt,
      system: context,
      temperature: 1.3,
    });

    return result;
  }
}
