import { QueueItem, QueueItemParameter, QueueResult } from "../types";

export class QueueItemTransformer {
  static transformActionToQueueItem(action: {
    name: string;
    parameters: Record<string, any>;
  }): QueueItem {
    return {
      name: action.name || "",
      parameters: QueueItemTransformer.transformParameters(
        action.parameters || {}
      ),
    };
  }

  static transformFromSimilarActions(
    similarActions: QueueResult[]
  ): QueueItem[] | undefined {
    return similarActions?.map((action: QueueResult) =>
      QueueItemTransformer.transformActionToQueueItem(action)
    );
  }

  private static transformParameters(
    parameters: Record<string, any>
  ): QueueItemParameter[] {
    return Object.entries(parameters).map(([name, value]) => ({
      name,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
  }

  static transformActionsToQueueItems(
    actions: { name: string; parameters: Record<string, any> }[] | undefined
  ): QueueItem[] | undefined {
    return actions?.map((action) => this.transformActionToQueueItem(action));
  }
}
