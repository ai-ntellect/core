import { Evaluator } from "../llm/evaluator";
import { Orchestrator } from "../llm/orchestrator";
import { Synthesizer } from "../llm/synthesizer";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import {
  ActionSchema,
  AgentEvent,
  MemoryScope,
  MemoryType,
  QueueResult,
  TransformedQueueItem,
  User,
} from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
import { ResultSanitizer } from "../utils/sanitize-results";
import { ActionHandler } from "./handlers/ActionHandler";

export class Agent {
  private readonly SIMILARITY_THRESHOLD = 95;
  private readonly MAX_RESULTS = 1;
  private readonly actionHandler: ActionHandler;
  private readonly user: User;
  private readonly orchestrator: Orchestrator;
  private readonly persistentMemory: PersistentMemory;
  private readonly cacheMemory: CacheMemory | undefined;
  private readonly stream: boolean;
  private readonly maxEvaluatorIteration: number;
  private evaluatorIteration = 0;
  private accumulatedResults: QueueResult[] = [];

  constructor({
    user,
    orchestrator,
    persistentMemory,
    cacheMemory,
    stream,
    maxEvaluatorIteration = 1,
  }: {
    user: User;
    orchestrator: Orchestrator;
    persistentMemory: PersistentMemory;
    cacheMemory?: CacheMemory;
    stream: boolean;
    maxEvaluatorIteration: number;
  }) {
    this.user = user;
    this.orchestrator = orchestrator;
    this.cacheMemory = cacheMemory;
    this.persistentMemory = persistentMemory;
    this.stream = stream;
    this.maxEvaluatorIteration = maxEvaluatorIteration;
    this.actionHandler = new ActionHandler();
    this.accumulatedResults = [];
  }

  async process(
    prompt: string,
    contextualizedPrompt: string,
    events: AgentEvent
  ): Promise<any> {
    let actions: ActionSchema[] | TransformedQueueItem[] | undefined =
      undefined;
    let isSimilar: boolean = false;

    if (this.cacheMemory) {
      const similarActions = await this.cacheMemory.findSimilarQueries(prompt, {
        similarityThreshold: this.SIMILARITY_THRESHOLD,
        maxResults: this.MAX_RESULTS,
        userId: this.user.id,
        scope: MemoryScope.GLOBAL,
      });

      if (similarActions.length > 0) {
        actions = QueueItemTransformer.transformActionsToQueueItems(
          similarActions[0].data
        );
        isSimilar = true;
      }
    }

    if (!actions?.length && !isSimilar) {
      console.log("No similar actions found in cache for query: ", prompt);
      console.log("Requesting orchestrator for actions..");
      const request = await this.orchestrator.process(contextualizedPrompt);
      events.onMessage?.(request);
      actions = request.actions;
    }

    return actions && actions.length > 0
      ? this.handleActions(
          {
            initialPrompt: prompt,
            contextualizedPrompt: contextualizedPrompt,
            actions: actions as ActionSchema[],
          },
          events
        )
      : undefined;
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
    const queueItems = this.transformActions(actions);

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

    this.accumulatedResults = [
      ...this.accumulatedResults,
      ...actionsResult.data,
    ];

    if (this.evaluatorIteration >= this.maxEvaluatorIteration) {
      return this.handleActionResults({
        data: this.accumulatedResults,
        initialPrompt,
      });
    }

    const evaluator = new Evaluator(
      this.orchestrator.tools,
      this.persistentMemory
    );
    console.log("Accumulated results:");
    console.dir(this.accumulatedResults, { depth: null });

    const sanitizedResults = ResultSanitizer.sanitize(this.accumulatedResults);
    const evaluation = await evaluator.process(
      initialPrompt,
      contextualizedPrompt,
      sanitizedResults
    );

    events.onMessage?.(evaluation);

    if (evaluation.isNextActionNeeded) {
      this.evaluatorIteration++;
      return this.handleActions(
        {
          initialPrompt: contextualizedPrompt,
          contextualizedPrompt: initialPrompt,
          actions: evaluation.nextActionsNeeded,
        },
        events
      );
    }

    if (!this.actionHandler.hasNonPrepareActions(this.accumulatedResults)) {
      return {
        data: this.accumulatedResults,
        initialPrompt,
      };
    }

    return this.handleActionResults({
      data: this.accumulatedResults,
      initialPrompt,
    });
  }

  private async handleActionResults(actionsResult: {
    data: QueueResult[];
    initialPrompt: string;
  }) {
    const synthesizer = new Synthesizer();
    const sanitizedResults = ResultSanitizer.sanitize(this.accumulatedResults);
    const summaryData = JSON.stringify({
      result: sanitizedResults,
      initialPrompt: actionsResult.initialPrompt,
    });

    this.accumulatedResults = [];
    this.evaluatorIteration = 0;

    await this.cacheMemory?.createMemory({
      content: actionsResult.initialPrompt,
      data: actionsResult.data,
      scope: MemoryScope.GLOBAL,
      type: MemoryType.ACTION,
    });

    return this.stream
      ? (await synthesizer.streamProcess(summaryData)).toDataStreamResponse()
      : await synthesizer.process(summaryData);
  }

  private transformActions(actions: ActionSchema[]) {
    let predefinedActions =
      QueueItemTransformer.transformActionsToQueueItems(actions) || [];

    return predefinedActions;
  }
}
