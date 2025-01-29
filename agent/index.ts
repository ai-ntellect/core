import { LanguageModel } from "ai";
import WebSocket from "ws";
import { Interpreter } from "../llm/interpreter";
import { MemoryManager } from "../llm/memory-manager";
import { Orchestrator } from "../llm/orchestrator";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { Graph } from "../services/graph";
import { AgentEvent, MyContext, QueueCallbacks, SharedState } from "../types";
import { createMainGraph } from "./graph";

export class Agent {
  public readonly memoryManager: MemoryManager;
  public readonly orchestrator: Orchestrator;
  public graph!: Graph<MyContext>;

  private listeners: Map<
    string,
    { socket: WebSocket; callback: (data: any) => Promise<void> }
  > = new Map();
  public readonly config: {
    orchestrator: Orchestrator;
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
    orchestrator: Orchestrator;
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
    this.config = config;
    this.memoryManager = new MemoryManager({
      model: config.memoryManager.model,
      memory: {
        cache: config.memoryManager.memory?.cache ?? undefined,
        persistent: config.memoryManager.memory?.persistent ?? undefined,
      },
    });
    this.orchestrator = config.orchestrator;
    this.config.maxIterations = 3;
  }

  public async process(
    prompt: string,
    callbacks?: AgentEvent
  ): Promise<SharedState<MyContext>> {
    const recentMessages =
      await this.memoryManager.memory?.cache?.getRecentMessages();
    const previousActions =
      await this.memoryManager.memory?.cache?.findSimilarActions(prompt);

    const initialState: SharedState<MyContext> = {
      context: {
        messages: [
          ...(recentMessages || []),
          { role: "user", content: prompt },
        ],
        prompt,
        processing: {
          stop: false,
        },
        results: previousActions,
      },
    };
    console.log("🔄 Initial state:", initialState);

    const mainGraph = createMainGraph(this, prompt, callbacks);
    this.graph = new Graph<MyContext>(mainGraph);
    this.graph.updateState(initialState);

    await this.graph.execute(
      initialState,
      mainGraph.entryNode,
      async (state) => {
        callbacks?.onMessage && (await callbacks.onMessage(state));
      }
    );

    return this.graph.getState();
  }

  public getInterpreter(interpreters: Interpreter[], name: string) {
    return interpreters.find((interpreter) => interpreter.name === name);
  }

  public addListener({
    id,
    url,
    onSubscribe,
    onMessage,
  }: {
    id: string;
    url: string;
    onSubscribe: () => string;
    onMessage: (data: any, agentContext: Agent) => Promise<void>;
  }): void {
    if (this.listeners.has(id)) {
      console.warn(`WebSocket with ID ${id} already exists.`);
      return;
    }

    const socket = new WebSocket(url);

    const wrappedOnMessage = async (data: any) => {
      await onMessage(data, this);
    };

    socket.on("open", () => {
      console.log(`🔗 WebSocket connected for ID: ${id}`);

      // Envoie le message d'abonnement si une factory est fournie
      if (onSubscribe) {
        const subscriptionMessage = onSubscribe();
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
        await wrappedOnMessage(data);
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

    this.listeners.set(id, { socket, callback: wrappedOnMessage });
  }
}
