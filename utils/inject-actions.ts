import { z } from "zod";
import { ActionSchema } from "../types";

export const injectActions = (actions: ActionSchema[]) => {
  return actions.map((action) => {
    const parameters = action.parameters as z.ZodObject<any>;
    const schemaShape = Object.keys(parameters._def.shape()).join(", ");
    const actionString = `* ${action.name}( { ${schemaShape} }) (${
      action.description
    }) ${
      action.examples
        ? `Eg: ${action.examples.map((example: any) => {
            return JSON.stringify(example);
          })}`
        : ""
    }`;
    return actionString;
  });
};
