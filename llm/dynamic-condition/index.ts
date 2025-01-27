import { generateText, LanguageModel } from "ai";
import { z } from "zod";
import { LLMHeaderBuilder } from "../../utils/header-builder";

// Define the schema for condition validation
const conditionSchema = z.object({
  function: z.string().describe("The generated dynamic condition function"),
  testResult: z
    .boolean()
    .optional()
    .describe("The test result if test data provided"),
});

export interface DynamicConditionConfig {
  functionName?: string;
  testData?: Record<string, any>;
}

export class DynamicConditionGenerator {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  /** Generate a JavaScript function named dynamicCondition that takes an object matching this schema and returns true following the prompt.
The function must name 'dynamicCondition(data)' dynamically adapt to this schema. If fields are missing or do not match the schema, it should return false.
Only return one JavaScript function code.

BAD EXAMPLE:
\`\`\`javascript
function dynamicCondition(data) {
  return data.amount > 0.1 && data.status === "completed";
}
\`\`\`

GOOD EXAMPLE:
function dynamicCondition(data) {
  return data.amount > 0.1 && data.status === "completed";
}

OUTPUT ONLY THE FUNCTION CODE, NO 'TRIPLE QUOTES' OR ANY OTHER TEXT. ONLY THE FUNCTION CODE. */
  private buildContext(schema: string, config: DynamicConditionConfig) {
    const context = LLMHeaderBuilder.create()
      .addHeader(
        "ROLE",
        "Generate a JavaScript function named 'dynamicCondition(data)' that takes an object matching this schema and returns true following the prompt."
      )
      .addHeader("IMPORTANT", [
        "The function must name 'dynamicCondition(data)'",
        "If fields are missing or do not match the schema, it should return false.",
        "Only return one JavaScript function code.",
        "OUTPUT ONLY THE FUNCTION CODE, NO 'TRIPLE QUOTES' OR ANY OTHER TEXT. ONLY THE FUNCTION CODE.",
      ])
      .addHeader(
        "BAD EXAMPLE",
        `\`\`\`javascript
function dynamicCondition(data) {
  return data.amount > 0.1 && data.status === 'completed';
}
\`\`\``
      )
      .addHeader(
        "GOOD EXAMPLE",
        `
function dynamicCondition(data) {
  return data.amount > 0.1 && data.status === 'completed';
}`
      )
      .addHeader("SCHEMA", schema)
      .addHeader("FUNCTION_NAME", config.functionName || "dynamicCondition");

    return context.toString();
  }

  async generateCondition(
    schema: string,
    condition: string,
    config: DynamicConditionConfig = {}
  ) {
    try {
      const context = this.buildContext(schema, config);

      const result = await generateText({
        model: this.model,
        system: context.toString(),
        prompt: `Generate a function that validates this condition: ${condition}`,
        temperature: 0,
      });

      // Test the generated function if test data is provided
      if (config.testData) {
        try {
          const functionEval = eval(`(${result.text})`);
          const testResult = functionEval(config.testData);
          console.log("Test result:", testResult);
        } catch (error) {
          console.error("Error testing function:", error);
        }
      }

      return result.text;
    } catch (error) {
      console.error("Error generating condition:", error);
      throw error;
    }
  }
}
