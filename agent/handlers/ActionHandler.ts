import { ActionQueueManager } from "../../services/queue";
import {
  ActionSchema,
  ProcessPromptCallbacks,
  QueueItem,
  QueueResult,
} from "../../types";

export class ActionHandler {
  async executeActions(
    predefinedActions: QueueItem[],
    tools: ActionSchema[],
    callbacks?: ProcessPromptCallbacks
  ) {
    try {
      const queueManager = new ActionQueueManager(tools, {
        onActionStart: callbacks?.onActionStart,
        onActionComplete: callbacks?.onActionComplete,
        onQueueComplete: callbacks?.onQueueComplete,
        onConfirmationRequired: async (message: any) => {
          if (callbacks?.onConfirmationRequired) {
            return await callbacks.onConfirmationRequired(message);
          }
          return false;
        },
      });

      queueManager.addToQueue(predefinedActions);

      if (callbacks?.onQueueStart) {
        callbacks.onQueueStart(predefinedActions);
      }

      const results = await queueManager.processQueue();
      return { type: "success", data: results || [] };
    } catch (error) {
      console.error("Error processing prompt:", error);
      throw error;
    }
  }

  hasNonPrepareActions(actions: QueueResult[]): boolean {
    return (
      Array.isArray(actions) &&
      actions.some((action) => action.name?.split("-")[0] !== "prepare")
    );
  }
}
