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
  User,
} from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
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
  }

  async process(
    prompt: string,
    contextualizedPrompt: string,
    events: AgentEvent
  ): Promise<any> {
    let actions: ActionSchema[] = [];

    if (this.cacheMemory) {
      const similarActions = await this.cacheMemory.findSimilarQueries(prompt, {
        similarityThreshold: this.SIMILARITY_THRESHOLD,
        maxResults: this.MAX_RESULTS,
        userId: this.user.id,
        scope: MemoryScope.GLOBAL,
      });
      if (similarActions.length > 0) {
        actions = similarActions[0].data;
        console.log("Similar actions found for query: ", prompt);
        console.dir(actions, { depth: null });
      }
    }

    if (!actions.length) {
      console.log("No similar actions found for query: ", prompt);
      console.log("Requesting orchestrator for actions");
      const request = await this.orchestrator.process(contextualizedPrompt);
      events.onMessage?.(request);
      actions = request.actions;
    }

    return actions.length > 0
      ? this.handleActions(
          {
            initialPrompt: prompt,
            contextualizedPrompt: contextualizedPrompt,
            actions: actions,
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

    if (this.evaluatorIteration >= this.maxEvaluatorIteration) {
      return this.handleActionResults({ ...actionsResult, initialPrompt });
    }

    const evaluator = new Evaluator(
      this.orchestrator.tools,
      this.persistentMemory
    );

    const evaluation = await evaluator.process(
      initialPrompt,
      contextualizedPrompt,
      JSON.stringify(actionsResult.data)
    );

    events.onMessage?.(evaluation);

    await this.cacheMemory?.createMemory({
      content: initialPrompt,
      data: actions,
      scope: MemoryScope.GLOBAL,
      type: MemoryType.ACTION,
    });

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

  private transformActions(actions: ActionSchema[]) {
    let predefinedActions =
      QueueItemTransformer.transformActionsToQueueItems(actions) || [];

    return predefinedActions;
  }
}
