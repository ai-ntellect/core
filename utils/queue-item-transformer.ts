import {
  ActionData,
  QueueItemParameter,
  QueueResult,
  TransformedQueueItem,
} from "../types";

export class QueueItemTransformer {
  static transformActionToQueueItem(action: ActionData): TransformedQueueItem {
    return {
      name: action.name || "",
      parameters: QueueItemTransformer.transformParameters(
        action.parameters || {}
      ),
    };
  }

  static transformFromSimilarActions(
    similarActions: QueueResult[]
  ): TransformedQueueItem[] | undefined {
    return similarActions?.map((action: ActionData) =>
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
    actions: ActionData[] | undefined
  ): TransformedQueueItem[] | undefined {
    return actions?.map((action) => this.transformActionToQueueItem(action));
  }
}
