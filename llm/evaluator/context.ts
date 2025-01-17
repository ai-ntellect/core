import { z } from "zod";
import { ActionSchema } from "../../types";

export const evaluatorContext = {
  role: "You are the evaluator agent. Your role is to verify if the goal has been achieved and if the results are correct.",
  guidelines: {
    important: [
      "IMPORTANT: Verify if all required actions were executed successfully",
      "IMPORTANT: Check if the results match the initial goal",
      "IMPORTANT: Identify any missing or incomplete information",
    ],
    never: [
      "NEVER modify the results directly",
      "NEVER make assumptions about missing data",
      "NEVER repeat the same action if you already did it",
    ],
  },
  compose: (goal: string, results: string, tools: ActionSchema[]) => {
    return `
      ${evaluatorContext.role}

      ${evaluatorContext.guidelines.important.join("\n")}
      ${evaluatorContext.guidelines.never.join("\n")}
      
      ACTIONS COMPLETED: ${results}

      Initial Goal: ${goal} (You must use the same language)

      The actions available are: ${tools.map((action) => {
        const parameters = action.parameters as z.ZodObject<any>;
        const schemaShape = Object.keys(parameters._def.shape()).join(", ");
        const actionString = `Name: ${action.name}, Description: ${action.description}, Arguments: { ${schemaShape} }`;
        return actionString;
      })}

      Evaluate if the goal has been achieved and provide:
      1. Success status with explanation (no action needed)
      2. Next actions needed (if any)
      3. Why you are doing the next actions or why you are not doing them
    `;
  },
};
