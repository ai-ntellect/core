import { Agent } from "../..";
import { Runner } from "../../../services/runner";
import { MyContext, SharedState } from "../../../types";

export const handleQueue = async (
  state: SharedState<any>,
  agent: Agent,
  callbacks?: any
) => {
  const currentState = agent.graph.getState();
  const actions = currentState.context?.actions;
  if (!actions) {
    return state;
  }

  const runner = new Runner<MyContext>();
  const updatedState = await runner.run(actions, agent.orchestrator.tools);

  if (updatedState?.context && Object.keys(updatedState.context).length > 0) {
    const prompt = currentState.context.messages?.[
      currentState.context.messages.length - 1
    ].content as string;

    await agent.memoryManager.memory?.cache?.createMemory({
      query: prompt,
      data: updatedState.context.results,
    });
  }
  await agent.memoryManager.memory?.cache?.storeAction(actions);

  return agent.graph.updateState({
    context: {
      results: updatedState?.context.results,
    },
  });
};
