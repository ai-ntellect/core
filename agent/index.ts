import { Evaluator } from "../llm/evaluator";
import { Orchestrator } from "../llm/orchestrator";
import { Synthesizer } from "../llm/synthesizer";
import { MemoryCache } from "../memory";
import { ActionSchema, AgentEvent, MemoryScope, User } from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
import { ActionHandler } from "./handlers/ActionHandler";

export class Agent {
  private readonly SIMILARITY_THRESHOLD = 95;
  private readonly MAX_RESULTS = 1;
  private readonly actionHandler: ActionHandler;
  private readonly user: User;
  private readonly orchestrator: Orchestrator;
  private readonly memoryCache: MemoryCache | undefined;
  private readonly stream: boolean;
  private readonly maxEvaluatorIteration: number;
  private evaluatorIteration = 0;

  constructor({
    user,
    orchestrator,
    memoryCache,
    stream,
    maxEvaluatorIteration = 1,
  }: {
    user: User;
    orchestrator: Orchestrator;
    memoryCache?: MemoryCache;
    stream: boolean;
    maxEvaluatorIteration: number;
  }) {
    this.user = user;
    this.orchestrator = orchestrator;
    this.memoryCache = memoryCache;
    this.stream = stream;
    this.maxEvaluatorIteration = maxEvaluatorIteration;
    this.actionHandler = new ActionHandler();
  }

  async process(
    prompt: string,
    contextualizedPrompt: string,
    events: AgentEvent
  ): Promise<any> {
    const request = await this.orchestrator.process(contextualizedPrompt);

    events.onMessage?.(request);

    if (request.actions.length > 0) {
      return this.handleActions(
        {
          initialPrompt: prompt,
          contextualizedPrompt: contextualizedPrompt,
          actions: request.actions,
        },
        events
      );
    }
  }

  private async handleActions(
    {
      initialPrompt,
      contextualizedPrompt,
      actions,
    }: {
      initialPrompt: string;
      contextualizedPrompt: string;
      actions: ActionSchema[];
    },
    events: AgentEvent
  ): Promise<any> {
    const similarActions = await this.findSimilarActions(initialPrompt);
    const queueItems = this.transformActions(actions, similarActions);

    const actionsResult = await this.actionHandler.executeActions(
      queueItems,
      this.orchestrator.tools,
      {
        onQueueStart: events.onQueueStart,
        onActionStart: events.onActionStart,
        onActionComplete: events.onActionComplete,
        onQueueComplete: events.onQueueComplete,
        onConfirmationRequired: events.onConfirmationRequired,
      }
    );

    if (this.evaluatorIteration >= this.maxEvaluatorIteration) {
      return this.handleActionResults({ ...actionsResult, initialPrompt });
    }

    const evaluator = new Evaluator(this.orchestrator.tools);
    const evaluation = await evaluator.process(
      initialPrompt,
      contextualizedPrompt,
      JSON.stringify(actionsResult.data)
    );

    events.onMessage?.(evaluation);

    if (evaluation.nextActions.length > 0) {
      this.evaluatorIteration++;
      return this.handleActions(
        {
          initialPrompt: contextualizedPrompt,
          contextualizedPrompt: initialPrompt,
          actions: evaluation.nextActions,
        },
        events
      );
    }

    if (!this.actionHandler.hasNonPrepareActions(actionsResult.data)) {
      return {
        data: actionsResult.data,
        initialPrompt,
      };
    }

    return this.handleActionResults({ ...actionsResult, initialPrompt });
  }

  private async handleActionResults(actionsResult: {
    data: any;
    initialPrompt: string;
  }) {
    const synthesizer = new Synthesizer();
    const summaryData = JSON.stringify({
      result: actionsResult.data,
      initialPrompt: actionsResult.initialPrompt,
    });

    return this.stream
      ? (await synthesizer.streamProcess(summaryData)).toDataStreamResponse()
      : await synthesizer.process(summaryData);
  }

  private async findSimilarActions(prompt: string) {
    if (!this.memoryCache) {
      return [];
    }

    return this.memoryCache.findBestMatches(prompt, {
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
}
