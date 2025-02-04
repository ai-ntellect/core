import {
  ActionSchema,
  QueueCallbacks,
  QueueItem,
  QueueItemParameter,
  QueueResult,
} from "../types";

export class Queue {
  private queue: QueueItem[] = [];
  private results: QueueResult[] = [];
  private callbacks: QueueCallbacks;
  private actions: ActionSchema[];
  private isProcessing: boolean = false;

  constructor(actions: ActionSchema[], callbacks: QueueCallbacks = {}) {
    this.actions = actions;
    this.callbacks = callbacks;
  }

  add(actions: QueueItem | QueueItem[]) {
    if (Array.isArray(actions)) {
      this.queue.push(...actions);
    } else {
      this.queue.push(actions);
    }
  }

  async execute() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const actionPromises: Promise<QueueResult>[] = [];

    for (const action of this.queue) {
      const actionConfig = this.actions.find((a) => a.name === action.name);
      if (actionConfig?.confirmation?.requireConfirmation) {
        const shouldProceed = await this.callbacks.onConfirmationRequired?.(
          actionConfig.confirmation.message ||
            `Do you want to proceed with action: ${action.name}?`
        );

        if (!shouldProceed) {
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
      const parameters = this.formatArguments(action.parameters);

      actionPromises.push(
        this.executeAction(action)
          .then((result) => {
            this.callbacks.onActionComplete?.(result);
            return result;
          })
          .catch((error) => {
            const result = {
              name: action.name,
              parameters,
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
      throw error;
    }
  }

  private formatArguments(args: QueueItemParameter[]): Record<string, string> {
    return args.reduce<Record<string, string>>((acc, arg) => {
      try {
        // Parse the JSON string if the value is a stringified JSON object
        const parsedValue = JSON.parse(arg.value);
        if (
          parsedValue &&
          typeof parsedValue === "object" &&
          "value" in parsedValue
        ) {
          acc[parsedValue.name] = parsedValue.value;
        } else {
          // Fallback to original value if not in expected format
          acc[arg.name] = arg.value;
        }
      } catch {
        // If JSON parsing fails, use the original value
        acc[arg.name] = arg.value;
      }
      return acc;
    }, {});
  }

  private async executeAction(action: QueueItem): Promise<QueueResult> {
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

    const actionArgs = this.formatArguments(action.parameters);

    try {
      const result = await actionConfig.execute(actionArgs);
      return {
        name: action.name,
        parameters: actionArgs,
        result,
        error: null,
      };
    } catch (error) {
      return {
        name: action.name,
        parameters: actionArgs,
        result: null,
        error: (error as Error).message || "Unknown error occurred",
      };
    }
  }
}
