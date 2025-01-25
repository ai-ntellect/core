import { deepseek } from "@ai-sdk/deepseek";
import { LanguageModel } from "ai";
import { Interpreter } from "../llm/interpreter";
import {
  generalInterpreterCharacter,
  marketInterpreterCharacter,
  securityInterpreterCharacter,
} from "../llm/interpreter/context";
import { MemoryManager } from "../llm/memory-manager";
import { AgentRuntime } from "../llm/orchestrator";
import { State } from "../llm/orchestrator/types";
import { CacheMemory } from "../memory/cache";
import { PersistentMemory } from "../memory/persistent";
import { ActionQueueManager } from "../services/queue";
import {
  checkHoneypot,
  fetchMarkPrice,
  getChainsTVL,
  getRssNews,
} from "../test";
import { ActionData, ActionSchema, QueueCallbacks } from "../types";
import { QueueItemTransformer } from "../utils/queue-item-transformer";

export class Agent {
  private readonly agent: AgentRuntime;
  private readonly memoryManager: MemoryManager;
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
  };

  constructor(config: {
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
    maxIterations?: number;
  }) {
    this.config = config;
    this.agent = new AgentRuntime(
      config.orchestrator.model,
      config.orchestrator.tools,
      config.interpreters,
      config.orchestrator.memory
    );
    this.memoryManager = new MemoryManager({
      model: config.memoryManager.model,
      memory: {
        cache: config.memoryManager.memory?.cache ?? undefined,
        persistent: config.memoryManager.memory?.persistent ?? undefined,
      },
    });
  }

  public async process(state: State, callbacks?: QueueCallbacks): Promise<any> {
    console.log("🔄 Processing state:", state);
    const response = await this.agent.process(state);

    // Execute actions if needed
    if (response.actions?.length > 0 && response.shouldContinue) {
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

      console.log(
        "\n🔁 Recursively processing with updated state",
        updatedNextState
      );
      return this.process(updatedNextState);
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
}

(async () => {
  const model = deepseek("deepseek-reasoner");

  const securityInterpreter = new Interpreter({
    name: "security",
    model,
    character: securityInterpreterCharacter,
  });
  const marketInterpreter = new Interpreter({
    name: "market",
    model,
    character: marketInterpreterCharacter,
  });
  const generalInterpreter = new Interpreter({
    name: "general",
    model,
    character: generalInterpreterCharacter,
  });

  const agent = new Agent({
    orchestrator: {
      model,
      tools: [checkHoneypot, fetchMarkPrice, getChainsTVL, getRssNews],
    },
    interpreters: [securityInterpreter, marketInterpreter, generalInterpreter],
    memoryManager: {
      model,
    },
  });

  const state = {
    currentContext: "tu pourrais analyser xrp/usd",
    previousActions: [],
  };

  const result = await agent.process(state);

  console.log("Result:", result);
})();
