import { expect } from "chai";
import { z } from "zod";
import { GraphFlow } from "../../../graph/index";
import { BaseAgent } from "../../../modules/agent/base";
import { GenericExecutor } from "../../../modules/agent/generic-executor";
import { AgentContext } from "../../../types/agent";

describe("GenericExecutor", () => {
  const llmConfig = {
    provider: "custom" as const,
    model: "mock",
    apiKey: "unused",
    customCall: async () => ({
      object: {
        actions: [] as { name: string; parameters: { name: string; value: unknown }[] }[],
        response: "Done.",
      },
    }),
  };

  function createExecutor(
    tools: GraphFlow<any>[] = [],
    customCall?: typeof llmConfig.customCall,
    options?: { dynamicGoal?: boolean; dynamicGoalPrompt?: string }
  ) {
    const agent = new BaseAgent({
      role: "Tester",
      goal: "Run tests",
      backstory: "Concise",
      tools,
      llmConfig: customCall
        ? { ...llmConfig, customCall }
        : llmConfig,
    });
    return new GenericExecutor(agent, tools, {
      llmConfig: customCall ? { ...llmConfig, customCall } : llmConfig,
      verbose: false,
    }, undefined, options);
  }

  it("makeDecision returns response and actions from customCall", async () => {
    const executor = createExecutor([], async () => ({
      object: {
        actions: [
          {
            name: "noop",
            parameters: [{ name: "x", value: 1 }],
          },
        ],
        response: "Taking action.",
      },
    }));

    const context: AgentContext = {
      input: { raw: "hello" },
      actions: [],
      response: "",
      executedActions: [],
    };

    const out = await executor.makeDecision(context);
    expect(out.response).to.equal("Taking action.");
    expect(out.actions).to.have.lengthOf(1);
    expect(out.actions[0].name).to.equal("noop");
  });

  it("executeActions runs matching GraphFlow tool", async () => {
    const ToolSchema = z.object({
      counter: z.number(),
    });

    const toolGraph = new GraphFlow({
      name: "counterTool",
      schema: ToolSchema,
      context: { counter: 0 },
      nodes: [
        {
          name: "bump",
          execute: async (ctx) => {
            ctx.counter = (ctx.counter ?? 0) + 1;
          },
          next: [],
        },
      ],
    });

    const executor = createExecutor([toolGraph], async () => ({
      object: {
        actions: [
          {
            name: "counterTool",
            parameters: [{ name: "counter", value: 5 }],
          },
        ],
        response: "Incrementing.",
      },
    }));

    const context: AgentContext = {
      input: { raw: "go" },
      actions: [],
      response: "",
      executedActions: [],
    };

    await executor.executeActions(
      [
        {
          name: "counterTool",
          parameters: [{ name: "counter", value: 5 }],
        },
      ],
      context
    );

    expect(context.executedActions).to.have.lengthOf(1);
    expect(context.executedActions[0].name).to.equal("counterTool");
  });

  describe("Dynamic Goal", () => {
    it("should use static goal when dynamicGoal is disabled", async () => {
      const executor = createExecutor([], undefined, { dynamicGoal: false });
      
      const context: AgentContext = {
        input: { raw: "test input" },
        actions: [],
        response: "",
        executedActions: [],
      };

      const goal = executor.getCurrentGoal();
      expect(goal).to.equal("Run tests");
    });

    it("should update dynamic goal via updateDynamicGoal method", async () => {
      let goalCallCount = 0;
      const goalLlmConfig = {
        provider: "custom" as const,
        model: "mock",
        apiKey: "unused",
        customCall: async () => {
          goalCallCount++;
          return {
            object: {
              goal: goalCallCount === 1 ? "Step 1: Initialize" : "Step 2: Execute",
            },
          };
        },
      };

      const agent = new BaseAgent({
        role: "Tester",
        goal: "Run tests",
        backstory: "Concise",
        tools: [],
        llmConfig: goalLlmConfig,
      });

      const executor = new GenericExecutor(agent, [], {
        llmConfig: goalLlmConfig,
        verbose: false,
      }, undefined, { dynamicGoal: true });

      const context1: AgentContext = {
        input: { raw: "test input" },
        actions: [],
        response: "",
        executedActions: [],
      };

      await executor.updateDynamicGoal(context1);
      expect(executor.getCurrentGoal()).to.equal("Step 1: Initialize");

      const context2: AgentContext = {
        input: { raw: "test input" },
        actions: [],
        response: "",
        executedActions: [{ name: "tool1", result: { success: true }, isExecuted: true, timestamp: new Date().toISOString() }],
      };

      await executor.updateDynamicGoal(context2);
      expect(executor.getCurrentGoal()).to.equal("Step 2: Execute");
    });

    it("should call LLM when dynamicGoal is enabled", async () => {
      let callCount = 0;

      const sharedLlmConfig = {
        provider: "custom" as const,
        model: "mock",
        apiKey: "unused",
        customCall: async () => {
          callCount++;
          return {
            object: {
              goal: `Dynamic goal`,
              actions: [],
              response: `Agent response`,
            },
          };
        },
      };

      const agent = new BaseAgent({
        role: "Tester",
        goal: "Run tests",
        backstory: "Concise",
        tools: [],
        llmConfig: sharedLlmConfig,
      });

      const executor = new GenericExecutor(agent, [], {
        llmConfig: sharedLlmConfig,
        verbose: false,
      }, undefined, { dynamicGoal: true });

      const context: AgentContext = {
        input: { raw: "test input" },
        actions: [],
        response: "",
        executedActions: [],
      };

      await executor.updateDynamicGoal(context);
      await executor.makeDecision(context);
      
      expect(callCount).to.equal(2);
    });
  });
});
