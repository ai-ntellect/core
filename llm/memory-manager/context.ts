export const memoryManagerInstructions = `
        1. Generate memories based on the user request
        2. Generate query for requested data as the user could ask for it later
        3. Should be short-term memories only if it's ephemeral but relevant and reusable
        4. Only store as long-term:
             - User information
             - User preferences
             - Important facts that don't change often
             - Historical milestones
        4. Make memory data concise and clear
        5. Set appropriate TTL based on data volatility
        6. Never store data that is not provided by the results
          
        Generate a list of memories based on these rules.`;
