import { GraphFlow } from "@/graph";
import { z } from "zod";

/**
 * Represents an action that has been executed by the agent
 * @interface ExecutedAction
 * @property {string} name - The name of the executed action
 * @property {boolean} isExecuted - Whether the action was successfully executed
 * @property {string | null} [error] - Optional error message if the action failed
 * @property {any} result - The result of the action execution
 * @property {string} timestamp - When the action was executed
 */
export type ExecutedAction = {
  name: string;
  isExecuted: boolean;
  error?: string | null;
  result: any;
  timestamp: string;
};

/**
 * Represents the context in which an agent operates
 * @interface AgentContext
 * @property {Object} input - The input provided to the agent
 * @property {string} input.raw - The raw input text
 * @property {number[]} [input.embedding] - Optional vector embedding of the input
 * @property {ActionSchema[]} actions - List of actions available to the agent
 * @property {string} response - The agent's response
 * @property {string} [knowledge] - Optional knowledge base or context
 * @property {ExecutedAction[]} executedActions - History of executed actions
 */
export type AgentContext = {
  input: {
    raw: string;
    embedding?: number[];
  };
  actions: ActionSchema[];
  response: string;
  knowledge?: string;
  executedActions: ExecutedAction[];
};

export const AgentContextSchema = z.object({
  input: z.object({
    raw: z.string(),
    embedding: z.array(z.number()).optional(),
  }),
  actions: z.array(
    z.object({
      name: z.string(),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.any(),
        })
      ),
      isExecuted: z.boolean().optional(),
      result: z.any().optional(),
    })
  ),
  knowledge: z.string().optional(),
  response: z.string(),
  executedActions: z
    .array(
      z.object({
        name: z.string(),
        result: z.any(),
        timestamp: z.string(),
      })
    )
    .optional(),
});

/**
 * Represents a section of the prompt with a title and content
 * @interface PromptSection
 * @property {string} title - The title of the prompt section
 * @property {string | ((context: AgentContext) => string | Promise<string>)} content - The content or a function to generate content
 */
export type PromptSection = {
  title: string;
  content: string | ((context: AgentContext) => string | Promise<string>);
};

/**
 * Supported LLM providers
 */
export type LLMProvider = "openai" | "anthropic" | "custom";

/**
 * Supported LLM models
 */
export type LLMModel = "gpt-4" | "gpt-3.5-turbo" | "claude-2" | string;

export type ExecutorConfig = {
  llmConfig: LLMConfig;
  verbose?: boolean;
};

/**
 * Configuration for the Agent
 * @type AssistantConfig
 * @extends {Omit<ExecutorConfig, "verbose">}
 * @property {string} role - The function/job of the assistant (e.g., "Email Assistant")
 * @property {string} goal - The specific objective the assistant tries to achieve
 * @property {string} backstory - The personality and behavioral traits of the assistant
 * @property {any[]} [tools] - Optional tools the assistant can use
 * @property {any} [memory] - Optional memory system
 * @property {boolean} [verbose] - Whether to log detailed information
 */
export type AgentConfig = {
  role: string;
  goal: string;
  backstory: string;
  tools: GraphFlow<any>[];
  memory?: any;
  verbose?: boolean;
  llmConfig: ExecutorConfig["llmConfig"];
};

/**
 * Represents the schema of an action that can be performed by the agent
 * @interface ActionSchema
 * @property {string} name - The name of the action
 * @property {Array<{name: string, value: any}>} parameters - The parameters required for the action
 */
export type ActionSchema = {
  name: string;
  parameters: Array<{ name: string; value: any }>;
};

/**
 * Represents the output of the agent's decision-making process
 * @interface DecisionOutput
 * @property {ActionSchema[]} actions - The actions to be executed
 * @property {string} response - The agent's response message
 */
export type DecisionOutput = {
  actions: ActionSchema[];
  response: string;
};

/**
 * Configuration for the Language Model
 * @interface LLMConfig
 * @property {LLMProvider} provider - The LLM provider to use
 * @property {string} apiKey - API key for the provider
 * @property {LLMModel} model - The specific model to use
 * @property {number} [temperature] - Optional temperature parameter for response randomness
 * @property {number} [maxTokens] - Optional maximum tokens for the response
 * @property {Function} [customCall] - Optional custom implementation for API calls
 */
export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: LLMModel;
  temperature?: number;
  maxTokens?: number;
  customCall?: (
    prompt: string | PromptInput,
    schema: z.ZodType<any>
  ) => Promise<any>;
};

/**
 * Structure for prompt input to the LLM
 * @interface PromptInput
 * @property {string} system - The system message/context
 * @property {string} user - The user's input message
 */
export type PromptInput = {
  system: string;
  user: string;
};
