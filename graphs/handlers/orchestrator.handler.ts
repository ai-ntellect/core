import { Agent } from "../../agent";
import { AgentEvent, MyContext, SharedState } from "../../types";

export const handleOrchestrator = async (
  prompt: string,
  sharedState: SharedState<MyContext>,
  agent: Agent,
  callbacks?: AgentEvent
) => {
  try {
    console.log("🔄 Start handler");
    const result = await agent.orchestrator.process(sharedState);

    const updatedSharedState = {
      ...sharedState,
      context: {
        ...result,
      },
    };

    return updatedSharedState;
  } catch (error) {
    console.error("🔄 Start handler error:", error);
    throw error;
  }
};
