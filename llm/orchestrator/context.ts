export const orchestratorInstructions = `
        Evaluate the current state and determine next actions:
        1. Continue executing actions until ALL necessary goals are achieved
        2. Only stop when you have a complete picture of the goal
        3. Social responses can be partial while gathering more data (always use the same language as user request)
        4. Set shouldContinue to false if no more actions are needed
        5. Never repeat the same action if previous action is the same and it's not required to achieve the goal
        6. Once all actions are completed, choose the right interpreter to interpret the results
        
        IMPORTANT: If actions are planned, shouldContinue MUST be true
        
        Use the memory tools to check for relevant information before executing new actions.
      `;
