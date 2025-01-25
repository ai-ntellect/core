import { LanguageModel } from "ai";
import WebSocket from "ws";
import { Interpreter } from "../llm/interpreter";
import { MemoryManager } from "../llm/memory-manager";
import { AgentRuntime } from "../llm/orchestrator";
import { State } from "../llm/orchestrator/types";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { ActionQueueManager } from "../services/queue";
import { CacheConfig, RedisCache } from "../services/redis-cache";
import { ActionData, ActionSchema, QueueCallbacks } from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";
export class Agent {
  private readonly agent: AgentRuntime;
  private readonly memoryManager: MemoryManager;
  private readonly cache: RedisCache;

  private webSocketClients: Map<
    string,
    { socket: WebSocket; callback: (data: any) => Promise<void> }
  > = new Map();
  private readonly config: {
    orchestrator: {
      model: LanguageModel;
      tools: ActionSchema[];
      memory?: {
        cache?: CacheMemory;
        persistent?: PersistentMemory;
      };
    };
    interpreters: Interpreter[];
    memoryManager: {
      model: LanguageModel;
      memory?: {
        cache?: CacheMemory;
        persistent?: PersistentMemory;
      };
    };
    maxIterations: number;
  };

  constructor(config: {
    cache: CacheConfig;
    orchestrator: {
      model: LanguageModel;
      tools: ActionSchema[];
      memory?: {
        cache?: CacheMemory;
        persistent?: PersistentMemory;
      };
    };
    interpreters: Interpreter[];
    memoryManager: {
      model: LanguageModel;
      memory?: {
        cache?: CacheMemory;
        persistent?: PersistentMemory;
      };
    };
    callbacks?: QueueCallbacks;
    maxIterations: number;
  }) {
    this.cache = new RedisCache(config.cache);
    this.config = config;
    this.agent = new AgentRuntime(
      config.orchestrator.model,
      config.orchestrator.tools,
      config.interpreters,
      config.cache,
      config.orchestrator.memory
    );
    this.memoryManager = new MemoryManager({
      model: config.memoryManager.model,
      memory: {
        cache: config.memoryManager.memory?.cache ?? undefined,
        persistent: config.memoryManager.memory?.persistent ?? undefined,
      },
    });
    this.config.maxIterations = 3;
  }

  public async process(state: State, callbacks?: QueueCallbacks): Promise<any> {
    console.log("🔄 Processing state:");
    console.dir(state, { depth: null });
    let countIterations = 0;
    const response = await this.agent.process(state);

    const unscheduledActions = response.actions.filter(
      (action) => !action.scheduler?.isScheduled
    );
    // Execute actions if needed
    if (unscheduledActions?.length > 0 && response.shouldContinue) {
      console.log("\n📋 Processing action queue");
      const queueManager = new ActionQueueManager(
        this.config.orchestrator.tools,
        callbacks
      );
      const queueItems = QueueItemTransformer.transformActionsToQueueItems(
        response.actions as ActionData[]
      );
      if (!queueItems) {
        throw new Error("No queue items found");
      }

      console.log(
        "📋 Actions to execute:",
        queueItems
          .map((item) => (typeof item === "string" ? item : item.name))
          .join(", ")
      );

      queueManager.addToQueue(queueItems);
      console.log("\n⚡ Executing actions...");
      const results = await queueManager.processQueue();
      console.log("✅ Execution results:", results);

      const updatedNextState: State = {
        ...state,
        currentContext: state.currentContext,
        previousActions: [...(state.previousActions || []), ...(results || [])],
      };

      console.log("\n🔁 Recursively processing with updated state");
      countIterations++;
      if (countIterations < this.config.maxIterations) {
        return this.process(updatedNextState);
      }
    }

    if (countIterations >= this.config.maxIterations) {
      console.log("Max iterations reached");
      response.shouldContinue = false;
      console.log("Forcing stop");
    }

    // Handle final interpretation
    if (
      !response.shouldContinue &&
      state.previousActions?.length &&
      response.interpreter
    ) {
      console.log("\n🏁 Analysis complete - generating final interpretation");
      const interpreter = this.getInterpreter(
        this.config.interpreters,
        response.interpreter
      );
      console.log("🎭 Selected Interpreter:", interpreter?.name);
      console.dir(state, { depth: null });
      const interpretationResult = (await interpreter?.process(
        "Interpret the analysis results",
        {
          ...state,
          results: JSON.stringify(state.previousActions),
          userRequest: state.currentContext,
        }
      )) as { response: string };

      console.log("\n📊 Final Analysis:", interpretationResult.response);

      const finalState: State = {
        ...state,
        results: interpretationResult.response,
      };

      console.log("🔄 Final state:", finalState);
    }

    // Return the final response at the end of the function
    const validatedActions = response.actions.map((action) => ({
      ...action,
      parameters: action.parameters.map((param) => ({
        ...param,
        value: param.value ?? null, // Set a default value if undefined
      })),
    }));

    const result = {
      ...response,
      actions: validatedActions,
      results: JSON.stringify(state.previousActions),
    };
    if (!result.shouldContinue) {
      await this.memoryManager.process(state, JSON.stringify(result));
    }
    return result;
  }

  private getInterpreter(interpreters: Interpreter[], name: string) {
    return interpreters.find((interpreter) => interpreter.name === name);
  }

  public addListener(
    id: string,
    url: string,
    subscriptionMessageFactory: () => string,
    callback: (data: any, agentContext: Agent) => Promise<void>
  ): void {
    if (this.webSocketClients.has(id)) {
      console.warn(`WebSocket with ID ${id} already exists.`);
      return;
    }

    const socket = new WebSocket(url);

    const wrappedCallback = async (data: any) => {
      await callback(data, this);
    };

    socket.on("open", () => {
      console.log(`🔗 WebSocket connected for ID: ${id}`);

      // Envoie le message d'abonnement si une factory est fournie
      if (subscriptionMessageFactory) {
        const subscriptionMessage = subscriptionMessageFactory();
        socket.send(subscriptionMessage);
        console.log(
          `📡 Sent subscription message for ID ${id}:`,
          subscriptionMessage
        );
      }
    });

    socket.on("message", async (message: string) => {
      console.log(`📨 Message received for WebSocket ID ${id}:`, message);
      try {
        const data = JSON.parse(message);
        await wrappedCallback(data);
      } catch (error) {
        console.error(`❌ Error in callback for WebSocket ID ${id}:`, error);
      }
    });

    socket.on("error", (error) => {
      console.error(`❌ WebSocket error for ID ${id}:`, error);
    });

    socket.on("close", () => {
      console.log(`🔌 WebSocket closed for ID: ${id}`);
    });

    this.webSocketClients.set(id, { socket, callback: wrappedCallback });
  }
}
