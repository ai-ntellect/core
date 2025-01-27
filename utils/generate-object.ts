import { CoreMessage, LanguageModelV1, generateText } from "ai";
import { z } from "zod";

export const describeZodSchema = (schema: z.ZodType): string => {
  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape);
    const fields = entries.map(([key, value]) => {
      const description = (value as any)._def.description || "";
      const fieldSchema = describeZodSchema(value as z.ZodType);
      return description
        ? `${key}: ${fieldSchema} // ${description}`
        : `${key}: ${fieldSchema}`;
    });
    return `z.object({${fields.join(", ")}})`;
  }

  if (schema instanceof z.ZodArray) {
    return `z.array(${describeZodSchema(schema.element)})`;
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

  if (schema instanceof z.ZodOptional) {
    return `z.optional(${describeZodSchema(schema._def.innerType)})`;
  }

  if (schema instanceof z.ZodUnion) {
    return `z.union([${schema._def.options
      .map((option: z.ZodType) => describeZodSchema(option))
      .join(", ")}])`;
  }

  if (schema instanceof z.ZodEnum) {
    return `z.enum(${JSON.stringify(schema._def.values)})`;
  }

  if (schema instanceof z.ZodLiteral) {
    return `z.literal(${JSON.stringify(schema._def.value)})`;
  }

  return "z.unknown()"; // Fallback for unknown types
};

export const generateObject = async <T>(config: {
  model: LanguageModelV1;
  schema: z.ZodSchema;
  system: string;
  temperature: number;
  prompt?: string;
  messages?: CoreMessage[];
}): Promise<{ object: T }> => {
  // Generate a detailed description of the schema
  const schemaDescription = describeZodSchema(config.schema);

  const baseContext = `
  ${config.system}
  EXPECTED SCHEMA:
  ${schemaDescription}
  
  BAD EXAMPLE:
  \`\`\`json
  {
    "key": "value"
  }
  \`\`\`

  GOOD EXAMPLE:
  {
    "key": "value"
  }

  OUTPUT ONLY THE JSON SCHEMA, NO 'TRIPLE QUOTES'JSON OR ANY OTHER TEXT. ONLY THE JSON SCHEMA.
  `;

  console.log("🔍 Generating object with context:");
  console.log(`${config.prompt}\n${baseContext}\n`);
  const response = await generateText({
    model: config.model,
    messages: !config.prompt
      ? [
          {
            role: "system",
            content: baseContext,
          },
          ...(config.messages ?? []),
        ]
      : undefined,
    system: config.system,
    temperature: config.temperature,
    prompt: !config.prompt ? undefined : `${config.prompt}\n\n${baseContext}`,
  });

  try {
    // Clean the response text from any markdown or code block markers
    const cleanText = response.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    const parsedResponse = JSON.parse(cleanText);
    const validatedResponse = config.schema.parse(parsedResponse);
    return { object: validatedResponse as T };
  } catch (error) {
    console.error("Error parsing or validating JSON response:", error);
    throw new Error("Failed to generate valid JSON response");
  }
};
