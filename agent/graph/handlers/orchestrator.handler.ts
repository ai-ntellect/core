import { Agent } from "../..";
import { AgentEvent, MyContext } from "../../../types";
import { SharedState } from "../../../types";

export const handleOrchestrator = async (
  agent: Agent,
  callbacks?: AgentEvent
): Promise<SharedState<MyContext>> => {
  try {
    const currentState = agent.graph.getState();
    console.log("🔄 Orchestrator handler current State:");
    console.dir(currentState, { depth: null });
    const prompt = currentState.context.messages?.[
      currentState.context.messages.length - 1
    ].content as string;
    console.log("🔄 Orchestrator handler prompt:", prompt);
    const previousActions =
      await agent.memoryManager.memory?.cache?.findSimilarActions(prompt, {
        similarityThreshold: 95,
      });
    console.log("🔄 Orchestrator handler previous actions:", previousActions);
    const result = await agent.orchestrator.process(currentState);

    return agent.graph.updateState({
      context: {
        ...result,
        results: previousActions,
        score: result.score ?? 0,
      },
    });
  } catch (error) {
    console.error("🎨 Orchestrator handler error:", error);
    throw error;
  }
};
