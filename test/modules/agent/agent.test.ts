import { expect } from "chai";
import { z } from "zod";
import { GraphFlow } from "../../../graph/index";
import { Agent } from "../../../modules/agent/agent";

describe("Agent", () => {
  it("process completes when LLM returns no actions", async () => {
    const agent = new Agent({
      role: "Echo",
      goal: "Reply only",
      backstory: "Minimal",
      tools: [],
      verbose: false,
      llmConfig: {
        provider: "custom",
        model: "mock",
        apiKey: "unused",
        customCall: async () => ({
          object: { actions: [], response: "Hello back." },
        }),
      },
    });

    const ctx = await agent.process("hi");
    expect(ctx.response).to.equal("Hello back.");
    expect(ctx.actions).to.be.an("array").that.is.empty;
  });

  it("process runs tool graph when LLM requests an action", async () => {
    const ToolSchema = z.object({
      message: z.string(),
    });

    const tool = new GraphFlow({
      name: "setMessage",
      schema: ToolSchema,
      context: { message: "" },
      nodes: [
        {
          name: "write",
          execute: async (c) => {
            c.message = "from-tool";
          },
          next: [],
        },
      ],
    });

    let callCount = 0;
    const agent = new Agent({
      role: "Writer",
      goal: "Use tool",
      backstory: "Test",
      tools: [tool],
      verbose: false,
      maxIterations: 3,
      llmConfig: {
        provider: "custom",
        model: "mock",
        apiKey: "unused",
        customCall: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              object: {
                actions: [
                  {
                    name: "setMessage",
                    parameters: { message: "ignored" },
                  },
                ],
                response: "Used tool.",
              },
            };
          }
          return {
            object: {
              actions: [],
              response: "Done.",
            },
          };
        },
      },
    });

    const ctx = await agent.process("run tool");
    expect(ctx.response).to.equal("Done.");
    expect(ctx.knowledge).to.be.a("string");
    expect(ctx.executedActions).to.have.length(1);
    expect(ctx.executedActions[0].name).to.equal("setMessage");
  });
});
