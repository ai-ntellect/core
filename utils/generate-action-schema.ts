import { z } from "zod";
import { Node } from "../types";

export const generateActionSchema = (nodes: Node<any>[]) => {
  return nodes
    .map((node) => {
      const schemaStr = node.inputs
        ? getSchemaString(node.inputs)
        : "No parameters";
      return `Workflow: ${node.name}\nParameters: ${schemaStr}`;
    })
    .join("\n\n");
};

export const getSchemaString = (schema: z.ZodType): string => {
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

  return `z.unknown()`;
};
