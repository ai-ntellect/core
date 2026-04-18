import chalk from "chalk";
import { LLMConfig, LLMProvider, PromptInput } from "@/types/agent";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";

const GROQ_FALLBACK_MODELS = [
  "allam-2-7b",
  "groq/compound-mini", 
  "groq/compound",
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

const DEFAULT_FALLBACK_MODEL = "llama-3.1-8b-instant";

interface LLMInstance {
  generate: (prompt: string | PromptInput, schema: z.ZodType<any>) => Promise<any>;
}

function createOpenAICompatibleLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  providerName: string
): LLMInstance {
  return {
    generate: async (
      prompt: string | PromptInput,
      schema: z.ZodType<any>
    ) => {
      const userPrompt = typeof prompt === "string" ? prompt : prompt.user;
      const systemPrompt = typeof prompt === "string" ? undefined : prompt.system;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${providerName} API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "";

      try {
        const parsed = JSON.parse(content);
        const validated = schema.parse(parsed);
        return { object: validated };
      } catch (e: any) {
        console.log(chalk.yellow(`[WARN] ${providerName} JSON parse error: ${e.message}`));
        return { object: { actions: [], response: content.substring(0, 200) } };
      }
    },
  };
}

function createLLMWithFallback(
  baseUrl: string,
  apiKey: string,
  primaryModel: string,
  fallbackModels: string[],
  providerName: string
): LLMInstance {
  const allModels = [primaryModel, ...fallbackModels];
  let currentModelIndex = 0;

  return {
    generate: async (prompt: string | PromptInput, schema: z.ZodType<any>) => {
      let lastError: Error | null = null;

      for (const model of allModels.slice(currentModelIndex)) {
        try {
          console.log(chalk.blue(`[INFO] Trying ${providerName} model: ${model}`));
          const llm = createOpenAICompatibleLLM(baseUrl, apiKey, model, providerName);
          const result = await llm.generate(prompt, schema);
          
          if (result?.object) {
            currentModelIndex = allModels.indexOf(model);
            return result;
          }
        } catch (error: any) {
          lastError = error;
          
          const isRateLimit = error.message?.includes("429") || 
                           error.message?.includes("rate limit");
          
          if (isRateLimit) {
            console.log(chalk.yellow(`[WARN] Rate limit for ${model}, trying fallback...`));
            continue;
          }
          
          console.log(chalk.yellow(`[WARN] ${providerName} error: ${error.message}`));
          
          if (error.message?.includes("500") || error.message?.includes("502") || error.message?.includes("503")) {
            continue;
          }
          
          throw error;
        }
      }

      throw lastError || new Error(`All ${providerName} models failed`);
    },
  };
}

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
      case "groq":
        return createLLMWithFallback(
          "https://api.groq.com/openai/v1",
          config.apiKey || "",
          config.model || DEFAULT_GROQ_MODEL,
          GROQ_FALLBACK_MODELS,
          "Groq"
        );
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
