import { CoreMessage } from "ai";
import { Agent } from "../../agent";
import { MyContext, SharedState } from "../../types";

export const handleScheduler = async (
  prompt: string,
  sharedState: SharedState<MyContext>,
  agent: Agent
) => {
  console.log("🔄 Checking for scheduled actions");
  // Handle scheduled actions

  for (const action of sharedState.context.actions ?? []) {
    if (action.scheduler?.isScheduled && action.scheduler?.cronExpression) {
      await agent.agenda.scheduleRequest(
        {
          originalRequest: prompt,
          cronExpression: action.scheduler.cronExpression,
        },
        {
          onScheduled: (id) => {
            console.log("🔄 Scheduled action:", id);
          },
          onExecuted: async (id, originalRequest) => {
            console.log("🔄 Executed action:", id);

            // Add context about when this request was scheduled
            const contextualRequest = `You are a scheduler. 
    You were asked to execute this request: ${originalRequest}\n 
    Date of the request: ${new Date().toISOString()}\n
    Act like if you know the request was scheduled.
    Don't reschedule the same action. 
    Just execute it.`;

            const updatedSharedState = {
              ...sharedState,
              messages: [
                {
                  role: "user",
                  content: contextualRequest,
                },
                ...sharedState.messages,
              ] as CoreMessage[],
              context: {
                ...sharedState.context,
                originalRequest,
              },
            };

            // Process the request as if it was just received
            const result = await agent.orchestrator.process(updatedSharedState);

            // Store the new actions in cache
            if (result.actions.length > 0) {
              await agent.cache.storePreviousActions(id, result.actions);
            }
          },
        }
      );
    }
  }

  return sharedState;
};
