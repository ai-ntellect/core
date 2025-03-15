import { LLMConfig, PromptInput } from "@/types/agent";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Factory class for creating Language Model instances based on configuration
 * @class LLMFactory
 */
export class LLMFactory {
  /**
   * Creates an LLM instance based on the provided configuration
   * @static
   * @param {LLMConfig} config - Configuration for the LLM
   * @returns {Object} An object with a generate method for interacting with the LLM
   * @throws {Error} When an unsupported provider is specified or custom provider lacks required function
   */
  static createLLM(config: LLMConfig) {
    switch (config.provider) {
      case "openai":
        return {
          generate: async (
            prompt: string | PromptInput,
            schema: z.ZodType<any>
          ) => {
            return generateObject({
              model: openai(config.model),
              temperature: config.temperature ?? 0.7,
              maxTokens: config.maxTokens,
              prompt: typeof prompt === "string" ? prompt : prompt.user,
              system: typeof prompt === "string" ? undefined : prompt.system,
              schema,
            });
          },
        };
      case "custom":
        if (!config.customCall) {
          throw new Error("Custom LLM provider requires a customCall function");
        }
        return {
          generate: config.customCall,
        };
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
}
