import { z } from "zod";
import { ActionSchema } from "../types";

export const injectActions = (actions: ActionSchema[]) => {
  return actions.map((action) => {
    const parameters = action.parameters as z.ZodObject<any>;
    const schemaShape = Object.keys(parameters._def.shape()).join(", ");
    const actionString = `Name: ${action.name}, Description: ${
      action.description
    }, Arguments (STRICTLY REQUIRED): { ${schemaShape} } ${
      action.examples
        ? `Examples: ${action.examples
            .map((e: any) => {
              return `Role: ${e.role}, Content: ${
                e.content
              }, Parameters: { ${Object.keys(e.parameters).join(", ")} }`;
            })
            .join("\n")}`
        : ""
    }`;
    return actionString;
  });
};
