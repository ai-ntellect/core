import { Checkpoint, CheckpointConfig } from "@/types";
import { GraphFlow } from "../execution/index";
import { ICheckpointAdapter } from "../interfaces";
import {
  AgentConfig,
  AgentContext,
  AgentContextSchema,
} from "../types/agent";
import { BaseAgent } from "./base";
import { GenericExecutor } from "./generic-executor";
import { AgentLogger } from "./tools/logger";
import { buildAgentWorkflow } from "./agent-workflow";

/**
 * A generic assistant that can be configured with different roles, goals, and personalities
 * @class Agent
 * @example
 * const assistant = new Agent({
 *   role: "Email Assistant",
 *   goal: "Help users send emails efficiently",
 *   backstory: "I am a professional and friendly assistant who specializes in email communication",
 *   llmConfig: { provider: "openai", model: "gpt-4" }
 *   tools: []
 * });
 */
export class Agent {
  private executor: GenericExecutor;
  private workflow: GraphFlow<typeof AgentContextSchema>;
  public logger: AgentLogger;

  constructor(config: AgentConfig) {
    const agent = new BaseAgent({
      role: config.role,
      goal: config.goal,
      backstory: config.backstory,
      tools: config.tools,
      memory: config.memory,
      llmConfig: config.llmConfig,
    });

    const maxIterations = config.maxIterations || 5;
    this.logger = new AgentLogger(config.verbose ?? true);

    this.executor = new GenericExecutor(agent, config.tools, {
      llmConfig: config.llmConfig,
      verbose: config.verbose,
    }, this.logger, {
      dynamicGoal: config.dynamicGoal,
      dynamicGoalPrompt: config.dynamicGoalPrompt,
      dynamicNext: config.dynamicNext,
      dynamicNextPrompt: config.dynamicNextPrompt,
      enableSchedule: config.enableSchedule,
      agenda: config.agenda,
    });
    this.executor.setLogger(this.logger);

    this.workflow = buildAgentWorkflow({
      executor: this.executor,
      logger: this.logger,
      maxIterations,
    });
  }

  /**
   * Processes an input string through the agent's workflow
   * @param {string} input - The input string to process
   * @returns {Promise<AgentContext>} The resulting context after processing
   */
  public async process(input: string): Promise<AgentContext> {
    await this.workflow.execute("defineGoal", {
      input: { raw: input },
      cwd: process.cwd(),
      actions: [],
      response: "",
    });

    return this.workflow.getContext() as unknown as AgentContext;
  }

  public getWorkflow(): GraphFlow<typeof AgentContextSchema> {
    return this.workflow;
  }

  public async processWithCheckpoint(
    input: string,
    adapter: ICheckpointAdapter,
    config: CheckpointConfig = {}
  ): Promise<{ context: AgentContext; checkpointId: string }> {
    const result = await this.workflow.executeWithCheckpoint(
      "defineGoal",
      adapter,
      {
        ...config,
        breakpoints: config.breakpoints || ["think"],
      }
    );
    return {
      context: result.context as unknown as AgentContext,
      checkpointId: result.checkpointId,
    };
  }

  public async resumeFromCheckpoint(
    checkpointId: string,
    adapter: ICheckpointAdapter,
    contextModifications?: Record<string, any>
  ): Promise<AgentContext> {
    const result = await this.workflow.resumeFromCheckpoint(
      checkpointId,
      adapter,
      contextModifications
    );
    return result as unknown as AgentContext;
  }

  public async listCheckpoints(
    adapter: ICheckpointAdapter
  ): Promise<Checkpoint<typeof AgentContextSchema>[]> {
    return this.workflow.listCheckpoints(adapter);
  }

  public async getCheckpointHistory(
    runId: string,
    adapter: ICheckpointAdapter
  ): Promise<Checkpoint<typeof AgentContextSchema>[]> {
    return this.workflow.getCheckpointHistory(runId, adapter);
  }
}
