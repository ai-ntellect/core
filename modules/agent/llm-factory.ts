import chalk from "chalk";
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
            
            if (data.message?.thinking) {
              console.log(chalk.cyan('\n[REASONING] ') + data.message.thinking.substring(0, 500) + '...\n');
            }

            let parsed: any;
            const firstBrace = content.indexOf('{');
            
            if (firstBrace !== -1) {
              let endBrace = -1;
              let braceCount = 0;
              for (let i = firstBrace; i < content.length; i++) {
                if (content[i] === '{') braceCount++;
                else if (content[i] === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    endBrace = i;
                    break;
                  }
                }
              }
              
              if (endBrace !== -1) {
                const jsonStr = content.substring(firstBrace, endBrace + 1);
                try {
                  parsed = JSON.parse(jsonStr);
                } catch (e: any) {
                  console.log(chalk.yellow('[WARN] Truncated JSON, attempting repair...'));
                  const repaired = jsonStr.replace(/,(\s*[}\]])/g, '$1').replace(/([}\]])(\s*[,\n])/g, '$1$2');
                  try {
                    parsed = JSON.parse(repaired);
                  } catch {
                    console.log(chalk.yellow('[WARN] Repair failed, extracting partial actions...'));
                    const actionMatches = jsonStr.matchAll(/"name"\s*:\s*"([^"]+)"/g);
                    const actions = [];
                    for (const match of actionMatches) {
                      actions.push({ name: match[1], parameters: {} });
                    }
                    if (actions.length > 0) {
                      parsed = { actions, response: "Partial response" };
                    } else {
                      return { object: { actions: [], response: content.substring(0, 200) } };
                    }
                  }
                }
              } else {
                console.log(chalk.yellow('[WARN] Incomplete JSON, returning empty response'));
                return { object: { actions: [], response: content.substring(0, 100) } };
              }
            } else {
              return { object: { actions: [], response: content.substring(0, 200) } };
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
