import { Evaluator } from "../llm/evaluator";
import { Orchestrator } from "../llm/orchestrator";
import { Synthesizer } from "../llm/synthesizer";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { ActionSchema, AgentEvent, QueueResult, User } from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
import { ResultSanitizer } from "../utils/sanitize-results";
import { ActionHandler } from "./handlers/ActionHandler";

export class Agent {
  private readonly actionHandler: ActionHandler;
  private readonly orchestrator: Orchestrator;
  private readonly persistentMemory: PersistentMemory;
  private readonly cacheMemory: CacheMemory | undefined;
  private readonly stream: boolean;
  private readonly maxEvaluatorIteration: number;
  private evaluatorIteration = 0;
  private accumulatedResults: string = "";

  constructor({
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
    this.orchestrator = orchestrator;
    this.cacheMemory = cacheMemory;
    this.persistentMemory = persistentMemory;
    this.stream = stream;
    this.maxEvaluatorIteration = maxEvaluatorIteration;
    this.actionHandler = new ActionHandler();
    this.accumulatedResults = "";
  }

  async process(prompt: string, events: AgentEvent): Promise<any> {
    this.accumulatedResults = "";
    this.evaluatorIteration = 0;
    console.log("Requesting orchestrator for actions..");
    const request = await this.orchestrator.process(
      prompt,
      this.accumulatedResults
    );
    events.onMessage?.(request);

    return request.actions.length > 0
      ? this.handleActions(
          {
            initialPrompt: prompt,
            actions: request.actions,
          },
          events
        )
      : undefined;
  }

  private async handleActions(
    {
      initialPrompt,
      actions,
    }: {
      initialPrompt: string;
      actions: {
        name: string;
        type: string;
        parameters: {
          name: string;
          value: any;
        }[];
      }[];
    },
    events: AgentEvent
  ): Promise<any> {
    const queueItems = this.transformActions(actions as any);

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

    this.accumulatedResults += this.formatResults(actionsResult.data);

    const isOnChainAction = actions.some(
      (action) => action.type === "on-chain"
    );

    if (isOnChainAction) {
      return {
        data: this.accumulatedResults,
        initialPrompt,
      };
    }

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

    // const sanitizedResults = ResultSanitizer.sanitize(this.accumulatedResults);
    const evaluation = await evaluator.process(
      initialPrompt,
      this.accumulatedResults
    );

    events.onMessage?.(evaluation);

    if (evaluation.isNextActionNeeded) {
      this.evaluatorIteration++;
      return this.handleActions(
        {
          initialPrompt: initialPrompt,
          actions: evaluation.nextActionsNeeded,
        },
        events
      );
    }

    return this.handleActionResults({
      data: this.accumulatedResults,
      initialPrompt,
    });
  }

  private async handleActionResults(actionsResult: {
    data: string;
    initialPrompt: string;
  }) {
    const synthesizer = new Synthesizer();

    return this.stream
      ? (
          await synthesizer.streamProcess(
            actionsResult.initialPrompt,
            actionsResult.data
          )
        ).toDataStreamResponse()
      : await synthesizer.process(
          actionsResult.initialPrompt,
          actionsResult.data
        );
  }

  private transformActions(actions: ActionSchema[]) {
    let predefinedActions =
      QueueItemTransformer.transformActionsToQueueItems(actions) || [];

    return predefinedActions;
  }

  private formatResults(results: QueueResult[]): string {
    const formattedResults = results.map((result) => ({
      ...result,
      result:
        typeof result.result === "object"
          ? JSON.stringify(result.result)
          : result.result,
    }));
    const sanitizedResults = ResultSanitizer.sanitize(formattedResults);
    return sanitizedResults;
  }
}
