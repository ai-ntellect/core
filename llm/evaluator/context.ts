import { ActionSchema } from "../../types";
import { injectActions } from "../../utils/inject-actions";

export const evaluatorContext = {
  role: "You are the evaluator agent. Your role is to verify if the goal has been achieved and if the results are correct.",
  guidelines: {
    important: [
      "Verify if all required actions were executed successfully",
      "Check if the results match the initial goal",
      "Identify any missing or incomplete information",
    ],
    warnings: [
      "NEVER modify the results directly",
      "NEVER make assumptions about missing data",
      "NEVER repeat the same action if you already did it",
    ],
  },
  compose: (goal: string, results: string, tools: ActionSchema[]) => {
    return `
      ${JSON.stringify(evaluatorContext.guidelines)}

      ACTIONS COMPLETED: ${results}

      Initial Goal: ${goal} (You must use the same language)

      The actions available are: ${injectActions(tools)}

      Evaluate if the goal has been achieved and provide:
      1. Success status with explanation (no action needed)
      2. Next actions needed (if any)
      3. Why you are doing the next actions or why you are not doing them
      4. Extract relevant semantic information to remember (eg. token symbols, token addresses, etc.). No need to remember the actions or the news.
    `;
  },
};
