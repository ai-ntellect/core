import { z } from "zod";

export interface SchemaConfig {
  schema: z.ZodType;
  instructions?: string;
  outputExamples?: {
    input: string;
    output: string;
  }[];
}

export class SchemaGenerator {
  static generate(config: SchemaConfig): {
    schema: string;
    instructions: string;
    outputExamples: string;
  } {
    const {
      schema,
      instructions = "Output only the JSON schema, no 'triple quotes'json or any other text. Only the JSON schema.",
      outputExamples = [],
    } = config;

    const getSchemaString = (schema: z.ZodType): string => {
      if (schema instanceof z.ZodObject) {
        const entries = Object.entries(schema.shape);
        const fields = entries.map(([key, value]) => {
          const description = (value as any)._def.description;
          const schemaStr = getSchemaString(value as z.ZodType);
          return description
            ? `${key}: ${schemaStr} // ${description}`
            : `${key}: ${schemaStr}`;
        });
        return `z.object({${fields.join(", ")}})`;
      }

      if (schema instanceof z.ZodArray) {
        return `z.array(${getSchemaString(schema.element)})`;
      }

      if (schema instanceof z.ZodString) {
        return "z.string()";
      }

      if (schema instanceof z.ZodNumber) {
        return "z.number()";
      }

      if (schema instanceof z.ZodBoolean) {
        return "z.boolean()";
      }

      // Fallback for other Zod types
      return `z.unknown()`;
    };

    const schemaString = getSchemaString(schema);

    return {
      schema: schemaString,
      instructions,
      outputExamples: outputExamples
        .map(
          (example) =>
            `Input: ${JSON.stringify(example.input)}, Output: ${JSON.stringify(
              example.output
            )}`
        )
        .join("\n")
        .trim(),
    };
  }
}
