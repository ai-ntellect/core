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
      case "ollama":
        return {
          generate: async (
            prompt: string | PromptInput,
            schema: z.ZodType<any>
          ) => {
            const baseUrl = config.baseUrl || "http://localhost:11434";
            const userPrompt = typeof prompt === "string" ? prompt : prompt.user;
            const systemPrompt = typeof prompt === "string" ? undefined : prompt.system;

            const response = await fetch(`${baseUrl}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: config.model,
                messages: [
                  ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                  { role: "user", content: userPrompt + "\n\nImportant: Respond ONLY with valid JSON matching the required schema." },
                ],
                stream: false,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            let content = data.message?.content || "";

            let parsed: any;
            try {
              parsed = JSON.parse(content);
            } catch {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  parsed = JSON.parse(jsonMatch[0]);
                } catch {
                  throw new Error(`Failed to parse JSON from LLM response: ${content.substring(0, 200)}`);
                }
              } else {
                throw new Error(`No JSON found in LLM response: ${content.substring(0, 200)}`);
              }
            }

            const validated = schema.parse(parsed);
            return { object: validated };
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
