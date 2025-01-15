import EventEmitter from "events";
import { Orchestrator } from "../agents/orchestrator";
import { Summarizer } from "../agents/synthesizer";
import { MemoryCache } from "../memory";
import { ActionQueueManager } from "../services/queue";
import {
  ActionSchema,
  MemoryScope,
  MemoryType,
  ProcessPromptCallbacks,
  QueueItem,
  QueueResult,
  User,
} from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";

export class Workflow {
  private readonly CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly SIMILARITY_THRESHOLD = 95;
  private readonly MAX_RESULTS = 1;

  constructor(
    private readonly user: User,
    private readonly dependencies: {
      orchestrator: Orchestrator;
      memoryCache: MemoryCache;
      eventEmitter: EventEmitter;
    }
  ) {}

  async start(prompt: string, contextualizedPrompt: string): Promise<any> {
    const request = await this.dependencies.orchestrator.process(
      contextualizedPrompt
    );

    this.dependencies.eventEmitter.emit("orchestrator-update", {
      type: "on-message",
      data: request,
    });

    if (request.actions.length > 0) {
      return this.handleActions({
        initialPrompt: prompt,
        actions: request.actions,
      });
    }
  }

  private async handleActions({
    initialPrompt,
    actions,
  }: {
    initialPrompt: string;
    actions: ActionSchema[];
  }) {
    let predefinedActions: any[] = actions;
    console.log("\n🔍 Predefined actions:", predefinedActions);
    const similarActions = await this.dependencies.memoryCache.findBestMatches(
      initialPrompt,
      {
        similarityThreshold: this.SIMILARITY_THRESHOLD,
        maxResults: this.MAX_RESULTS,
        userId: this.user.id,
        scope: MemoryScope.USER,
      }
    );

    console.log("\n🔍 Similar actions:", similarActions);

    predefinedActions =
      QueueItemTransformer.transformActionsToQueueItems(predefinedActions) ||
      [];
    console.log("\n🔍 Transformed predefined actions:", predefinedActions);
    if (similarActions && similarActions.length > 0) {
      predefinedActions =
        QueueItemTransformer.transformFromSimilarActions(similarActions) || [];
      console.log("\n🔍 Transformed similar actions:", predefinedActions);
    }
    console.log("\n🔍 Final actions:", predefinedActions);
    const callbacks = this.createCallbacks(initialPrompt, similarActions);

    console.log("\n🔍 Queue prepared");
    const actionsResult = await this.executeActions(
      predefinedActions,
      this.dependencies.orchestrator.tools,
      callbacks
    );

    console.log("\n🔍 Actions result:", actionsResult);
    return this.handleActionResults({
      ...actionsResult,
      initialPrompt,
    });
  }

  private async executeActions(
    predefinedActions: QueueItem[],
    tools: ActionSchema[],
    callbacks?: ProcessPromptCallbacks
  ) {
    try {
      const queueManager = new ActionQueueManager(tools, {
        onActionStart: callbacks?.onActionStart,
        onActionComplete: callbacks?.onActionComplete,
        onQueueComplete: callbacks?.onQueueComplete,
        onConfirmationRequired: async (message) => {
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

      console.log("Processing queue...");
      const results = await queueManager.processQueue();

      console.log("Queue completed:");
      console.dir(results, { depth: null });

      return {
        type: "success",
        data: results || [],
      };
    } catch (error) {
      console.error("Error processing prompt:", error);
      throw error;
    }
  }

  private createCallbacks(
    prompt: string,
    similarActions: any[]
  ): ProcessPromptCallbacks {
    return {
      onQueueStart: async (actions: QueueItem[]) => {
        console.dir(actions, { depth: null });
        this.dependencies.eventEmitter.emit("orchestrator-update", {
          type: "queue-start",
          actions,
        });
      },
      onActionStart: (action: QueueItem) => {
        this.dependencies.eventEmitter.emit("orchestrator-update", {
          type: "action-start",
          action: action.name,
          args: action.parameters,
        });
      },
      onActionComplete: (action: QueueResult) => {
        this.dependencies.eventEmitter.emit("orchestrator-update", {
          type: "action-complete",
          action: action.name,
          result: action.result,
        });
      },
      onQueueComplete: async (actions: QueueResult[]) => {
        if (!similarActions.length) {
          await this.saveToMemory(prompt, actions);
        }
        this.dependencies.eventEmitter.emit("orchestrator-update", {
          type: "queue-complete",
        });
      },
      onConfirmationRequired: this.handleConfirmationRequest.bind(this),
    };
  }

  private async handleConfirmationRequest(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmationId = Date.now().toString();

      const handleConfirmation = (data: any) => {
        if (data.confirmationId === confirmationId) {
          this.dependencies.eventEmitter.removeListener(
            "confirmation-response",
            handleConfirmation
          );
          resolve(data.confirmed);
        }
      };

      this.dependencies.eventEmitter.once(
        "confirmation-response",
        handleConfirmation
      );

      this.dependencies.eventEmitter.emit("orchestrator-update", {
        type: "confirmation-required",
        id: confirmationId,
        message,
      });

      setTimeout(() => {
        this.dependencies.eventEmitter.removeListener(
          "confirmation-response",
          handleConfirmation
        );
        resolve(false);
      }, this.CONFIRMATION_TIMEOUT);
    });
  }

  private async saveToMemory(
    prompt: string,
    actions: QueueResult[]
  ): Promise<void> {
    console.log("\n🔍 Creating memory...");
    await this.dependencies.memoryCache.createMemory({
      content: prompt,
      userId: this.user.id,
      scope: MemoryScope.USER,
      type: MemoryType.ACTION,
      data: actions,
    });
  }

  private async handleActionResults(
    actionsResult: {
      data: any;
      initialPrompt: string;
    },
    stream: boolean = true
  ) {
    if (!this.hasNonPrepareActions(actionsResult.data)) {
      return;
    }

    const summarizer = new Summarizer();
    const summaryData = JSON.stringify({
      result: actionsResult.data,
      initialPrompt: actionsResult.initialPrompt,
    });

    return stream
      ? (await summarizer.streamProcess(summaryData)).toDataStreamResponse()
      : await summarizer.process(summaryData);
  }

  private hasNonPrepareActions(actions: QueueResult[]): boolean {
    return (
      Array.isArray(actions) &&
      actions.some(
        (action: QueueResult) => action.name?.split("-")[0] !== "prepare"
      )
    );
  }
}
