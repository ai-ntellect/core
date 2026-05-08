import { expect } from "chai";
import { z } from "zod";
import { LLMFactory } from "../../agent/llm-factory";

describe("LLMFactory", () => {
  it("throws for unsupported provider", () => {
    expect(() =>
      LLMFactory.createLLM({
        provider: "anthropic",
        model: "claude-2",
        apiKey: "x",
      })
    ).to.throw("Unsupported LLM provider");
  });

  it("throws when custom provider has no customCall", () => {
    expect(() =>
      LLMFactory.createLLM({
        provider: "custom",
        model: "mock",
        apiKey: "unused",
      })
    ).to.throw("Custom LLM provider requires a customCall function");
  });

  it("custom provider uses customCall and returns structured object", async () => {
    const schema = z.object({ answer: z.string() });
    const llm = LLMFactory.createLLM({
      provider: "custom",
      model: "mock",
      apiKey: "unused",
      customCall: async (_prompt, _schema) => ({
        object: { answer: "yes" },
      }),
    });

    const result = await llm.generate("ignored", schema);
    expect(result.object.answer).to.equal("yes");
  });
});
