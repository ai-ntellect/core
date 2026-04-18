import { GraphContext } from "@/types";
import { GraphFlow } from "../../graph/index";
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
    }, this.logger);
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
          next: (context: GraphContext<typeof AgentContextSchema>) => {
            if (context.actions.length === 0 || iteration >= this.maxIterations) {
              return [];
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
          next: (context: GraphContext<typeof AgentContextSchema>) => {
            if (context.actions.length > 0) {
              return ["execute"];
            }
            if (iteration < this.maxIterations) {
              return ["think"];
            }
            return [];
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
    await this.workflow.execute("think", {
      input: { raw: input },
      cwd: process.cwd(),
      actions: [],
      response: "",
    });

    return this.workflow.getContext() as unknown as AgentContext;
  }
}
