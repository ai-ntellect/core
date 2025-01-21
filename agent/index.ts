import { Evaluator } from "../llm/evaluator";
import { Interpreter } from "../llm/interpreter";
import { Orchestrator } from "../llm/orchestrator";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { ActionQueueManager } from "../services/queue";
import { ActionScheduler } from "../services/scheduler";
import {
  ActionSchema,
  AgentEvent,
  MemoryScope,
  QueueResult,
  ScheduledAction,
} from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
import { ResultSanitizer } from "../utils/sanitize-results";
import { ActionHandler } from "./handlers/ActionHandler";

export class Agent {
  private readonly actionHandler: ActionHandler;
  private readonly orchestrator: Orchestrator;
  private readonly interpreters: Interpreter[];
  private readonly memory: {
    persistent: PersistentMemory;
    cache?: CacheMemory;
  };
  private readonly stream: boolean;
  private readonly maxEvaluatorIteration: number;
  private evaluatorIteration = 0;
  private accumulatedResults: string = "";
  private currentInterpreter: Interpreter | undefined;
  private readonly scheduler: ActionScheduler;

  constructor({
    orchestrator,
    interpreters,
    memory,
    stream,
    maxEvaluatorIteration = 1,
  }: {
    orchestrator: Orchestrator;
    interpreters: Interpreter[];
    memory: {
      persistent: PersistentMemory;
      cache?: CacheMemory;
    };
    stream: boolean;
    maxEvaluatorIteration: number;
  }) {
    this.orchestrator = orchestrator;
    this.interpreters = interpreters;
    this.memory = memory;
    this.stream = stream;
    this.maxEvaluatorIteration = maxEvaluatorIteration;
    this.actionHandler = new ActionHandler();
    this.accumulatedResults = "";
    this.scheduler = new ActionScheduler(
      new ActionQueueManager(this.orchestrator.tools),
      this.orchestrator
    );
  }

  async process(prompt: string, events: AgentEvent): Promise<any> {
    this.accumulatedResults = "";
    this.evaluatorIteration = 0;
    console.log("Requesting orchestrator for actions..");
    const parsedPrompt = JSON.parse(prompt);
    const promptOnly = parsedPrompt.userRequest;
    const cacheMemories = await this.memory.cache?.findSimilarActions(
      promptOnly,
      {
        similarityThreshold: 70,
        maxResults: 5,
        userId: "1",
        scope: MemoryScope.GLOBAL,
      }
    );
    console.log("✅ RECENT_ACTIONS: ", cacheMemories);

    const persistentMemory = await this.memory.persistent.findRelevantDocuments(
      prompt,
      {
        similarityThreshold: 80,
      }
    );
    console.log("✅ PERSISTENT_MEMORY: ", persistentMemory);
    const request = await this.orchestrator.process(
      prompt,
      `## RECENT_ACTIONS: ${JSON.stringify(
        cacheMemories
      )} ## PERSISTENT_MEMORY: ${JSON.stringify(
        persistentMemory
      )} ## CURRENT_RESULTS: ${this.accumulatedResults}`
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
      return this.interpreterResult({
        data: this.accumulatedResults,
        initialPrompt,
        interpreter: this.currentInterpreter,
      });
    }

    const evaluator = new Evaluator(
      this.orchestrator.tools,
      this.memory,
      this.interpreters
    );

    const evaluation = await evaluator.process(
      initialPrompt,
      this.accumulatedResults
    );

    this.currentInterpreter = this.getInterpreter(
      this.interpreters,
      evaluation.interpreter
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

    return this.interpreterResult({
      data: this.accumulatedResults,
      initialPrompt,
      interpreter: this.currentInterpreter,
    });
  }

  private getInterpreter(interpreters: Interpreter[], name: string) {
    console.log({ interpreters, name });
    return interpreters.find((interpreter) => interpreter.name === name);
  }

  private async interpreterResult(actionsResult: {
    data: string;
    initialPrompt: string;
    interpreter: Interpreter | undefined;
  }) {
    const { interpreter, initialPrompt, data } = actionsResult;
    if (!interpreter) {
      throw new Error("Interpreter not found");
    }
    console.log("✅ INTERPRETER: ", interpreter.name);
    return this.stream
      ? (
          await interpreter.streamProcess(initialPrompt, {
            userRequest: initialPrompt,
            results: data,
          })
        ).toDataStreamResponse()
      : await interpreter.process(initialPrompt, {
          userRequest: initialPrompt,
          results: data,
        });
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

  async scheduleAction(
    action: ActionSchema,
    scheduledTime: Date,
    userId: string,
    recurrence?: ScheduledAction["recurrence"]
  ): Promise<string> {
    return this.scheduler.scheduleAction(
      action,
      scheduledTime,
      userId,
      recurrence
    );
  }

  async cancelScheduledAction(actionId: string): Promise<boolean> {
    return this.scheduler.cancelScheduledAction(actionId);
  }
}
