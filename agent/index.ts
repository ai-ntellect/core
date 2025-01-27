import { LanguageModel } from "ai";
import WebSocket from "ws";
import { createMainGraph } from "../graphs/index";
import { Interpreter } from "../llm/interpreter";
import { MemoryManager } from "../llm/memory-manager";
import { Orchestrator } from "../llm/orchestrator";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { Agenda } from "../services/agenda";
import { CacheConfig, RedisCache } from "../services/cache";
import { Graph } from "../services/graph";
import {
  ActionSchema,
  AgentEvent,
  MyContext,
  QueueCallbacks,
  SharedState,
} from "../types";

export class Agent {
  public readonly orchestrator: Orchestrator;
  public readonly memoryManager: MemoryManager;
  public readonly cache: RedisCache;
  public agenda: Agenda;

  private listeners: Map<
    string,
    { socket: WebSocket; callback: (data: any) => Promise<void> }
  > = new Map();
  public readonly config: {
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
    this.orchestrator = new Orchestrator(
      config.orchestrator.model,
      config.orchestrator.tools,
      config.interpreters,
      config.memoryManager.memory
    );
    this.memoryManager = new MemoryManager({
      model: config.memoryManager.model,
      memory: {
        cache: config.memoryManager.memory?.cache ?? undefined,
        persistent: config.memoryManager.memory?.persistent ?? undefined,
      },
    });
    this.config.maxIterations = 3;
    this.agenda = new Agenda(this.orchestrator, this.cache);
  }

  public async process(prompt: string, callbacks?: AgentEvent): Promise<any> {
    console.log("🔄 Processing state:");
    const agent = this;
    const recentMessages = await this.cache.getRecentMessages();
    const previousActions = await this.cache.getRecentPreviousActions(1);

    const initialState: SharedState<MyContext> = {
      messages: [...recentMessages, { role: "user", content: prompt }],
      context: {
        prompt,
        processing: {
          stop: false,
        },
        results: previousActions,
      },
    };

    const mainGraphDefinition = createMainGraph(agent, prompt, callbacks);
    const runtime = new Graph<MyContext>(mainGraphDefinition);
    const hasCycles = runtime.checkForCycles();

    const mermaidDiagram = runtime.generateMermaidDiagram("Agent");
    console.log(mermaidDiagram);
    if (hasCycles) {
      console.error("Cycle detected in the graph");
      throw new Error("Cycle detected in the graph");
    }
    await runtime.execute(
      initialState,
      mainGraphDefinition.entryNode,
      async (state) => {
        callbacks?.onMessage && (await callbacks.onMessage(state));
      }
    );
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
