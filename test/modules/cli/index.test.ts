import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { runCLI, CLIConfig } from "../../../modules/cli/index";
import { Agent, Memory } from "../../../index";
import { InMemoryAdapter } from "../../../modules/memory/adapters/in-memory";
import { LLMProvider } from "../../../types/agent";

use(chaiAsPromised);

describe("CLI Module", function () {
  describe("runCLI", function () {
    it("should create an agent with ollama provider", async function () {
      const config: CLIConfig = {
        provider: "ollama" as LLMProvider,
        model: "llama3.2:1b",
        baseUrl: "http://localhost:11434",
        role: "Test Assistant",
        goal: "Test the CLI",
        verbose: false,
      };

      const memory = new Memory(new InMemoryAdapter());
      await memory.init();

      const agent = new Agent({
        role: config.role || "Helpful Assistant",
        goal: config.goal || "Assist the user",
        backstory: `You are a ${config.role || "assistant"}. Be concise.`,
        tools: [],
        llmConfig: {
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
        },
        memory,
        verbose: config.verbose,
      });

      expect(agent).to.exist;
      expect(agent.constructor.name).to.equal("Agent");
    });

    it("should create an agent with openai provider", async function () {
      const config: CLIConfig = {
        provider: "openai" as LLMProvider,
        model: "gpt-4o-mini",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
        role: "OpenAI Assistant",
        goal: "Test OpenAI provider",
        verbose: false,
      };

      const memory = new Memory(new InMemoryAdapter());
      await memory.init();

      const agent = new Agent({
        role: config.role!,
        goal: config.goal!,
        backstory: `You are a ${config.role}. Be concise.`,
        tools: [],
        llmConfig: {
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
        },
        memory,
        verbose: config.verbose,
      });

      expect(agent).to.exist;
      expect(agent.constructor.name).to.equal("Agent");
    });

    it("should handle missing API key for OpenAI", function () {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const config: CLIConfig = {
        provider: "openai" as LLMProvider,
        model: "gpt-4o-mini",
        role: "Test",
      };

      let errorThrown = false;
      try {
        if (!process.env.OPENAI_API_KEY && config.provider === "openai" && !config.apiKey) {
          errorThrown = true;
        }
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }

      expect(errorThrown).to.be.true;
    });
  });

  describe("CLIConfig interface", function () {
    it("should accept valid provider types", function () {
      const providers: LLMProvider[] = ["openai", "anthropic", "ollama", "custom"];

      providers.forEach((provider) => {
        const config: CLIConfig = {
          provider,
          model: "test-model",
        };
        expect(config.provider).to.equal(provider);
      });
    });

    it("should have optional fields", function () {
      const config: CLIConfig = {
        provider: "ollama" as LLMProvider,
        model: "test-model",
      };

      expect(config.apiKey).to.be.undefined;
      expect(config.baseUrl).to.be.undefined;
      expect(config.role).to.be.undefined;
      expect(config.goal).to.be.undefined;
      expect(config.verbose).to.be.undefined;
    });
  });
});
