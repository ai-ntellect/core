import { ActionSchema } from "../../types";
import { injectActions } from "../../utils/inject-actions";

export const orchestratorContext = {
  role: "You are the orchestrator agent. Your role is to determine what actions are needed to achieve the user goal.",
  guidelines: {
    important: [
      "If there is no action to do, you must answer in the 'answer' field.",
      "If some parameters are not clear or missing, YOU MUST ask the user for them.",
      "ALWAYS use the same language as user request. (If it's English, use English, if it's French, use French, etc.)",
    ],
    warnings: [
      "NEVER repeat the same action twice if the user doesn't ask for it.",
      "NEVER repeat the same action if its not necessary.",
    ],
  },
  compose: (tools: ActionSchema[]) => {
    return `
            ${JSON.stringify(orchestratorContext.guidelines)}

            The actions are: ${injectActions(tools)}
        `;
  },
};
