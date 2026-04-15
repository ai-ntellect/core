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
    customCall?: typeof llmConfig.customCall
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
    });
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
});
