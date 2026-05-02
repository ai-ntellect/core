import { Checkpoint, CheckpointConfig, GraphContext } from "@/types";
import { CheckpointAwaitApprovalError, CheckpointInterruptError, GraphFlow } from "../../graph/index";
import { ICheckpointAdapter } from "../../interfaces";
import {
  AgentConfig,
  AgentContext,
  AgentContextSchema,
} from "../../types/agent";
import { BaseAgent } from "./base";
import { GenericExecutor } from "./generic-executor";
import { AgentLogger } from "./tools/logger";

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
  private maxIterations: number;
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

    this.maxIterations = config.maxIterations || 5;
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

    this.workflow = this.setupWorkflow();
  }

  /**
   * Sets up the workflow for processing inputs and executing actions
   * @private
   * @returns {GraphFlow<typeof AgentContextSchema>} The configured workflow
   */
  private setupWorkflow(): GraphFlow<typeof AgentContextSchema> {
    let iteration = 0;

    const executor = this.executor as any;

    return new GraphFlow({
      name: "assistant",
      schema: AgentContextSchema,
      context: {
        input: { raw: "" },
        actions: [],
        response: "",
        executedActions: [],
      },
      nodes: [
        {
          name: "defineGoal",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            const agentContext = context as unknown as AgentContext;
            await this.executor.updateDynamicGoal(agentContext);
            executor.setCurrentState?.("defineGoal");
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            if (executor.dynamicNext) {
              return "think";
            }
            return ["think"];
          },
        },
        {
          name: "think",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            iteration++;
            if (iteration >= this.maxIterations) {
              context.response = context.response || "Max iterations reached.";
              this.logger.warn("agent", `Max iterations (${this.maxIterations}) reached`);
              return;
            }
            this.logger.info("think", `Iteration ${iteration}: Analyzing context...`);
            const agentContext = context as unknown as AgentContext;
            const decision = await this.executor.makeDecision(agentContext);
            context.actions = decision.actions;
            context.response = decision.response;
            this.logger.think("think", `Decision: ${decision.actions.length} actions`, decision.response);
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            if (executor.dynamicNext && context.actions.length > 0) {
              return "execute";
            }
            if (context.actions.length === 0 || iteration >= this.maxIterations) {
              return ["reply"];
            }
            return ["execute"];
          },
        },
        {
          name: "execute",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            const timestamp = new Date().toISOString();
            
            const executedKeys = new Set(
              (context.executedActions || []).map((a: any) => {
                const params = a.params || a.result;
                return `${a.name}:${JSON.stringify(params)}`;
              })
            );
            
            const paramsMap = new Map(
              (context.actions || []).map((a: any) => {
                const params = typeof a.parameters === 'object' && a.parameters !== null
                  ? Object.keys(a.parameters).length > 0 ? a.parameters : undefined
                  : undefined;
                return [`${a.name}:${JSON.stringify(params || a.parameters)}`, a];
              })
            );
            
            const newActions: any[] = [];
            for (const [key, action] of paramsMap.entries()) {
              const a = action as any;
              if (executedKeys.has(key)) {
                this.logger.info("dedup", `Skipping: ${a.name} (already executed)`);
              } else {
                newActions.push(a);
              }
            }
            
            if (newActions.length === 0) {
              context.actions = [];
              this.logger.info("execute", "No actions to execute");
              return;
            }
            
            this.logger.info("execute", `Executing ${newActions.length} tools...`);
            
            const results = (context.executedActions || []).map((a: any) => 
              `${a.name}: ${JSON.stringify(a.result)}`
            ).join('\n');
            context.knowledge = `Date: ${timestamp}\n${results}`;
            
            await this.executor.executeActions(
              newActions,
              context as unknown as AgentContext
            );
            
            context.actions = [];
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            if (context.actions.length > 0) {
              return ["execute"];
            }
            if (iteration >= this.maxIterations) {
              return ["reply"];
            }
            // Loop back to think so the agent can reflect on tool results
            return ["think"];
          },
        },
        {
          name: "plan",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            this.logger.info("plan", "Planning next steps...");
            context.response = context.response || "Je planifie les étapes suivantes...";
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            return ["think"];
          },
        },
        {
          name: "schedule",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            this.logger.info("schedule", "Scheduling a task...");
            
            const scheduledTask = (context as any).scheduledTask;
            if (scheduledTask?.cronExpression && scheduledTask?.request) {
              await executor.scheduleTask?.(scheduledTask.cronExpression, scheduledTask.request);
              context.response = "Tâche planifiée avec succès.";
            } else {
              context.response = "Pas de tâche à planifier.";
            }
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            return ["think"];
          },
        },
        {
          name: "reply",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            this.logger.info("reply", `Response: ${context.response?.substring(0, 50)}...`);
          },
          next: (): any => {
            return [];
          },
        },
        {
          name: "ask",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            this.logger.info("ask", "Asking clarification question...");
            context.response = context.response || "Avez-vous besoin de précisions ?";
          },
          next: (context: GraphContext<typeof AgentContextSchema>): any => {
            return ["think"];
          },
        },
      ],
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
