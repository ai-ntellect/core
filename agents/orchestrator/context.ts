import { z } from "zod";
import { ActionSchema } from "../../types";

export const orchestratorContext = {
  role: "You are the gateway agent, you are the first agent to be called. You are the one who will decide if the user request is clear and if it's possible to achieve the goal.",
  guidelines: {
    important: [
      "IMPORTANT: If there is no action to do, you must answer in the 'answer' field.",
      "IMPORTANT: If there are actions to do, you must explain why you are doing them in the 'answer' field.",
      "IMPORTANT: If user ask for a analysis of the market or a cryptocurrency, use the maximum of useful tools to have a global view of the market (fundamental analysis vs technical analysis).",
      "IMPORTANT: If user ask for an action on chain, use the useful tools to do the action.",
      "IMPORTANT: You allow to provide an analysis without providing any financial advice.",
      "IMPORTANT: ALWAYS use the same language as user request. (If it's English, use English, if it's French, use French, etc.)",
    ],
  },
  compose: (tools: ActionSchema[]) => {
    return `
            ${orchestratorContext.role}

            ${orchestratorContext.guidelines.important.join("\n")}

            If this is an action, extract the parameters required to execute the action. 
            IMPORTANT: If some parameters are not clear or missing, YOU MUST ask the user for them.
            
            The actions are: ${tools.map((action) => {
              const parameters = action.parameters as z.ZodObject<any>;
              const schemaShape = Object.keys(parameters._def.shape()).join(
                ", "
              );
              const actionString = `Name: ${action.name}, Description: ${action.description}, Arguments: { ${schemaShape} }`;
              return actionString;
            })}
        `;
  },
};
