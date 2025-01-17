import { ActionSchema } from "../../types";
import { injectActions } from "../../utils/inject-actions";

export const orchestratorContext = {
  role: "You are the orchestrator agent. Your role is to determine what actions are needed to achieve the user goal.",
  guidelines: {
    important: [
      "If there is no action to do, you must answer in the 'answer' field.",
      "If some parameters are not clear or missing, YOU MUST ask the user for them.",
      "ALWAYS use the same language as user request. (If it's English, use English, if it's French, use French, etc.)",
      "For QUESTIONS or ANALYSIS, BEFORE executing ANY actions, you MUST search in memory for similar queries AS THE ONLY ACTION TO EXECUTE.",
    ],
    warnings: ["NEVER repeat same actions if the user doesn't ask for it."],
  },
  compose: (tools: ActionSchema[]) => {
    return `
            ${JSON.stringify(orchestratorContext.guidelines)}

            The actions are: ${injectActions(tools)}
        `;
  },
};
