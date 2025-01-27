import { Agent } from "../../agent";
import { StateManager } from "../../agent/utils/state.utils";
import { Queue } from "../../services/queue";
import { ActionData, AgentEvent, MyContext, SharedState } from "../../types";
import { QueueItemTransformer } from "../../utils/queue-item-transformer";

export const handleQueue = async (
  sharedState: SharedState<MyContext>,
  agent: Agent,
  callbacks?: AgentEvent
) => {
  console.log("🔄 Queue actions:", sharedState.context.actions);
  const queue = new Queue(agent.config.orchestrator.tools, callbacks);
  const queueItems = QueueItemTransformer.transformActionsToQueueItems(
    sharedState.context.actions as ActionData[]
  );
  if (!queueItems) {
    throw new Error("No queue items found");
  }
  queue.add(queueItems);
  const results = await queue.execute();
  if (results) {
    await agent.cache.storePreviousActions(crypto.randomUUID(), results);
  }

  return StateManager.updateState(sharedState, {
    context: {
      results,
      processing: {
        stop: false,
      },
    },
  });
};
