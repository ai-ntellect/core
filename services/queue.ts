import {
  ActionSchema,
  QueueCallbacks,
  QueueItem,
  QueueItemParameter,
  QueueResult,
} from "../types";

export class ActionQueueManager {
  private queue: QueueItem[] = [];
  private results: QueueResult[] = [];
  private callbacks: QueueCallbacks;
  private actions: ActionSchema[];
  private isProcessing: boolean = false;

  constructor(actions: ActionSchema[], callbacks: QueueCallbacks = {}) {
    this.actions = actions;
    this.callbacks = callbacks;
  }

  addToQueue(actions: QueueItem | QueueItem[]) {
    if (Array.isArray(actions)) {
      console.log(
        "Adding actions to queue:",
        actions.map((a) => a.name).join(", ")
      );
      this.queue.push(...actions);
    } else {
      console.log("Adding action to queue:", actions.name);
      this.queue.push(actions);
    }
  }

  async processQueue() {
    if (this.isProcessing) {
      console.warn("Queue is already being processed");
      return;
    }

    this.isProcessing = true;
    const actionPromises = [];

    for (const action of this.queue) {
      const actionConfig = this.actions.find((a) => a.name === action.name);

      if (actionConfig?.confirmation?.requireConfirmation) {
        // Wait for user confirmation before executing this action
        const shouldProceed = await this.callbacks.onConfirmationRequired?.(
          actionConfig.confirmation.message ||
            `Do you want to proceed with action: ${action.name}?`
        );

        if (!shouldProceed) {
          // Skip this action and add a cancelled result
          this.results.push({
            name: action.name,
            parameters: this.formatArguments(action.parameters),
            result: null,
            error: "Action cancelled by user",
            cancelled: true,
          });
          continue;
        }
      }

      actionPromises.push(
        this.executeAction(action)
          .then((result) => {
            this.callbacks.onActionComplete?.(result);
            return result;
          })
          .catch((error) => {
            const result = {
              name: action.name,
              parameters: this.formatArguments(action.parameters),
              result: null,
              error: error.message || "Unknown error occurred",
            };
            this.callbacks.onActionComplete?.(result);
            return result;
          })
      );
    }

    try {
      const results = await Promise.all(actionPromises);
      this.results.push(...results);
      this.queue = [];
      this.callbacks.onQueueComplete?.(this.results);
      this.isProcessing = false;
      return this.results;
    } catch (error) {
      this.isProcessing = false;
      console.error("Unexpected error in queue processing:", error);
      throw error;
    }
  }

  private formatArguments(args: QueueItemParameter[]): Record<string, string> {
    return args.reduce<Record<string, string>>((acc, arg) => {
      acc[arg.name] = arg.value;
      return acc;
    }, {});
  }

  private async executeAction(action: QueueItem): Promise<QueueResult> {
    // Call onActionStart callback
    this.callbacks.onActionStart?.(action);
    const actionConfig = this.actions.find((a) => a.name === action.name);
    if (!actionConfig) {
      return {
        name: action.name,
        parameters: {},
        result: null,
        error: `Action '${action.name}' not found in actions list`,
      };
    }

    const actionArgs = action.parameters.reduce<Record<string, string>>(
      (acc: Record<string, string>, arg: QueueItemParameter) => {
        acc[arg.name] = arg.value;
        return acc;
      },
      {}
    );

    console.log(`Executing ${action.name} with args:`, actionArgs);

    try {
      const result = await actionConfig.execute(actionArgs);
      return {
        name: action.name,
        parameters: actionArgs,
        result,
        error: null,
      };
    } catch (error) {
      console.error(`Error executing action ${action.name}:`, error);
      return {
        name: action.name,
        parameters: actionArgs,
        result: null,
        error: (error as Error).message || "Unknown error occurred",
      };
    }
  }
}
