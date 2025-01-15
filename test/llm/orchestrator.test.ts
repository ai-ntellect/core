import { expect } from "chai";
import { z } from "zod";
import { Orchestrator } from "../../llm/orchestrator";
import { ActionSchema } from "../../types";

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;

  const mockAction: ActionSchema = {
    name: "prepare-transaction",
    description: "Prepare a transfer transaction",
    parameters: z.object({
      walletAddress: z.string(),
      amount: z.string(),
      networkId: z.string(),
    }),
    execute: async ({ walletAddress, amount, networkId }) => {
      return { walletAddress, amount, networkId };
    },
  };

  beforeEach(() => {
    orchestrator = new Orchestrator([mockAction]);
  });

  it("should process a prompt and return just the answer", async function () {
    this.timeout(10000);

    const prompt = "Hello how are you?";
    const result = await orchestrator.process(prompt);

    expect(result).to.have.property("answer").that.is.a("string");
  });

  it("should process a prompt and return valid actions", async function () {
    this.timeout(10000);

    const prompt = "Send 0.1 ETH to 0x123...456 on ethereum";
    const result = await orchestrator.process(prompt);
    console.dir(result, { depth: null });
    expect(result).to.have.property("actions").that.is.an("array");
    expect(result).to.have.property("answer").that.is.a("string");
    expect(result.actions[0])
      .to.have.property("parameters")
      .that.is.an("object");
  });
});
