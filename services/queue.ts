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
      console.log("\n📋 Adding actions to queue:");
      actions.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action.name}`);
      });
      this.queue.push(...actions);
    } else {
      console.log("\n📋 Adding single action to queue:", actions.name);
      this.queue.push(actions);
    }
  }

  async execute() {
    if (this.isProcessing) {
      console.log("\n⚠️  Queue is already being processed");
      return;
    }

    console.log("\n🔄 Starting queue processing");
    this.isProcessing = true;
    const actionPromises: Promise<QueueResult>[] = [];

    for (const action of this.queue) {
      const actionConfig = this.actions.find((a) => a.name === action.name);
      if (actionConfig?.confirmation?.requireConfirmation) {
        console.log("\n🔒 Action requires confirmation:", action.name);
        const shouldProceed = await this.callbacks.onConfirmationRequired?.(
          actionConfig.confirmation.message ||
            `Do you want to proceed with action: ${action.name}?`
        );

        if (!shouldProceed) {
          console.log("❌ Action cancelled by user:", action.name);
          this.results.push({
            name: action.name,
            parameters: this.formatArguments(action.parameters),
            result: null,
            error: "Action cancelled by user",
            cancelled: true,
          });
          continue;
        }
        console.log("✅ Action confirmed by user");
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
      console.log("\n⏳ Waiting for all actions to complete...");
      const results = await Promise.all(actionPromises);
      this.results.push(...results);
      this.queue = [];
      this.callbacks.onQueueComplete?.(this.results);
      this.isProcessing = false;
      console.log("\n✅ Queue processing completed successfully");
      return this.results;
    } catch (error) {
      this.isProcessing = false;
      console.error("\n❌ Unexpected error in queue processing:", error);
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
    console.log("\n🎯 Executing action:", action.name);
    this.callbacks.onActionStart?.(action);

    const actionConfig = this.actions.find((a) => a.name === action.name);
    if (!actionConfig) {
      console.error("❌ Action not found:", action.name);
      return {
        name: action.name,
        parameters: {},
        result: null,
        error: `Action '${action.name}' not found in actions list`,
      };
    }

    console.log(
      "📝 Action parameters:",
      JSON.stringify(action.parameters, null, 2)
    );
    const actionArgs = this.formatArguments(action.parameters);

    try {
      const result = await actionConfig.execute(actionArgs);
      const actionResult = {
        name: action.name,
        parameters: actionArgs,
        result,
        error: null,
      };
      console.log(`\n✨ Action "${action.name}" completed successfully`);
      return actionResult;
    } catch (error) {
      const actionResult = {
        name: action.name,
        parameters: actionArgs,
        result: null,
        error: (error as Error).message || "Unknown error occurred",
      };
      console.error(`\n❌ Action "${action.name}" failed:`, error);
      console.log(
        "Failed action details:",
        JSON.stringify(actionResult, null, 2)
      );
      return actionResult;
    }
  }
}
