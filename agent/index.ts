import EventEmitter from "events";
import { Orchestrator } from "../llm/orchestrator";
import { Summarizer } from "../llm/synthesizer";
import { MemoryCache } from "../memory";
import { ActionSchema, AgentEvent, MemoryScope, User } from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
import { ActionHandler } from "./handlers/ActionHandler";

export class Agent {
  private readonly SIMILARITY_THRESHOLD = 95;
  private readonly MAX_RESULTS = 1;
  private readonly actionHandler: ActionHandler;

  constructor(
    private readonly user: User,
    private readonly dependencies: {
      orchestrator: Orchestrator;
      memoryCache: MemoryCache;
      eventEmitter: EventEmitter;
    },
    private readonly stream: boolean = true
  ) {
    this.actionHandler = new ActionHandler();
  }

  async start(
    prompt: string,
    contextualizedPrompt: string,
    events: AgentEvent
  ): Promise<any> {
    const request = await this.dependencies.orchestrator.process(
      contextualizedPrompt
    );

    events.onMessage?.(request);

    if (request.actions.length > 0) {
      return this.handleActions(
        {
          initialPrompt: prompt,
          actions: request.actions,
        },
        events
      );
    }
  }

  private async handleActions(
    {
      initialPrompt,
      actions,
    }: {
      initialPrompt: string;
      actions: ActionSchema[];
    },
    events: AgentEvent
  ) {
    const similarActions = await this.findSimilarActions(initialPrompt);
    const predefinedActions = this.transformActions(actions, similarActions);
    const callbacks = {
      onQueueStart: events.onQueueStart,
      onActionStart: events.onActionStart,
      onActionComplete: events.onActionComplete,
      onQueueComplete: events.onQueueComplete,
      onConfirmationRequired: events.onConfirmationRequired,
    };

    const actionsResult = await this.actionHandler.executeActions(
      predefinedActions,
      this.dependencies.orchestrator.tools,
      callbacks
    );

    if (!this.actionHandler.hasNonPrepareActions(actionsResult.data)) {
      return {
        data: actionsResult.data,
        initialPrompt,
      };
    }

    return this.handleActionResults({ ...actionsResult, initialPrompt });
  }

  private async findSimilarActions(prompt: string) {
    return this.dependencies.memoryCache.findBestMatches(prompt, {
      similarityThreshold: this.SIMILARITY_THRESHOLD,
      maxResults: this.MAX_RESULTS,
      userId: this.user.id,
      scope: MemoryScope.USER,
    });
  }

  private transformActions(actions: ActionSchema[], similarActions: any[]) {
    let predefinedActions =
      QueueItemTransformer.transformActionsToQueueItems(actions) || [];

    if (similarActions?.length > 0) {
      predefinedActions =
        QueueItemTransformer.transformFromSimilarActions(similarActions) || [];
    }

    return predefinedActions;
  }

  private async handleActionResults(actionsResult: {
    data: any;
    initialPrompt: string;
  }) {
    const summarizer = new Summarizer();
    const summaryData = JSON.stringify({
      result: actionsResult.data,
      initialPrompt: actionsResult.initialPrompt,
    });

    return this.stream
      ? (await summarizer.streamProcess(summaryData)).toDataStreamResponse()
      : await summarizer.process(summaryData);
  }
}
