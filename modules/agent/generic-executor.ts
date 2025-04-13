import chalk from "chalk";
import { z } from "zod";
import { GraphFlow } from "../../graph/index";
import {
  ActionSchema,
  AgentContext,
  DecisionOutput,
  ExecutorConfig,
} from "../../types/agent";
import { BaseAgent } from "./base";
import { AgentExecutor } from "./base/executor";
import { LLMFactory } from "./llm-factory";
import { PromptBuilder } from "./prompt-builder";

/**
 * Generic executor that handles the interaction between the agent and LLM
 * Uses a structured prompt format:
 * - ROLE: The function/job the agent performs
 * - GOAL: The specific objective to achieve
 * - BACKSTORY: The personality and behavior traits
 * - CONTEXT: Current knowledge and state
 * - AVAILABLE ACTIONS: What the agent can do
 * - INSTRUCTIONS: How to process and respond
 * @class GenericExecutor
 * @extends {AgentExecutor}
 */
export class GenericExecutor extends AgentExecutor {
  private verbose: boolean;
  private llm: ReturnType<typeof LLMFactory.createLLM>;

  /**
   * Creates an instance of GenericExecutor
   * @param {BaseAgent} agent - The agent instance this executor is tied to
   * @param {GraphFlow<any>[]} graphs - Array of available graph flows
   * @param {ExecutorConfig} config - Configuration for the executor
   */
  constructor(
    agent: BaseAgent,
    graphs: GraphFlow<any>[],
    config: ExecutorConfig
  ) {
    super(agent, graphs);
    this.verbose = config.verbose ?? true;
    this.llm = LLMFactory.createLLM(config.llmConfig);
  }

  /**
   * Logs a message with a specific type if verbose mode is enabled
   * @private
   * @param {"info" | "success" | "warning" | "error" | "thinking"} type - The type of log message
   * @param {string} message - The message to log
   */
  private log(
    type: "info" | "success" | "warning" | "error" | "thinking",
    message: string
  ) {
    if (!this.verbose) return;

    const prefix = {
      info: chalk.blue("ℹ"),
      success: chalk.green("✓"),
      warning: chalk.yellow("⚠"),
      error: chalk.red("✖"),
      thinking: chalk.magenta("🤔"),
    }[type];

    console.log(`${prefix} ${message}`);
  }

  /**
   * Generates a string representation of the available action schemas
   * @private
   * @returns {string} Formatted string containing all available actions and their parameters
   */
  protected generateActionSchema(): string {
    return Array.from(this.availableGraphs.values())
      .map((graph) => {
        const schema = graph.getSchema();
        const schemaDescription = Object.entries(schema.shape)
          .map(([key, value]) => {
            const zodValue = value as z.ZodTypeAny;
            return `    - ${key}: ${
              zodValue.description || zodValue._def.typeName
            }`;
          })
          .join("\n");

        return `${graph.name}:
  Parameters:
${schemaDescription}
  Available Operations:
${graph
  .getNodes()
  .map((n) => `    - ${n.name}`)
  .join("\n")}`;
      })
      .join("\n\n");
  }

  private async buildSystemPrompt(context: AgentContext): Promise<string> {
    return new PromptBuilder()
      .addSection("ROLE", this.agent.getRole())
      .addSection("GOAL", this.agent.getGoal())
      .addSection("BACKSTORY", this.agent.getBackstory())
      .addSection(
        "RECENT ACTIONS (check this before deciding what to do)",
        context.knowledge || "None"
      )
      .addSection(
        "AVAILABLE ACTIONS (only if you need)",
        this.generateActionSchema()
      )
      .addSection(
        "INSTRUCTIONS",
        `
- Never take actions if an recent action matches the user's input
- If you need to take actions, structure parameters according to the action's schema
- If goal is achieved, explain that you achieved for examples:
  - "I have achieved the goal"
  - "I have done what I needed to do"
  - "I have completed the task"
      `
      )
      .build(context);
  }

  /**
   * Makes a decision based on the current context using the LLM
   * @param {AgentContext} context - The context to base the decision on
   * @returns {Promise<DecisionOutput>} The decision output containing actions and response
   */
  async makeDecision(context: AgentContext): Promise<DecisionOutput> {
    this.log(
      "thinking",
      chalk.dim("Analyzing context and available actions...")
    );

    const systemPrompt = await this.buildSystemPrompt(context);

    console.log({ systemPrompt });
    this.log("info", chalk.dim("Generating response..."));

    const result = await this.llm.generate(
      {
        system: systemPrompt,
        user: `User sent you this message at ${new Date().toISOString()}\n${
          context.input.raw
        }`,
      },
      z.object({
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.array(
              z.object({
                name: z.string(),
                value: z.any(),
              })
            ),
          })
        ),
        response: z.string(),
      })
    );
    if (result.object.actions.length > 0) {
      this.log("success", chalk.green("Decided to take actions:"));
      result.object.actions.forEach(
        (action: {
          name: string;
          parameters: Array<{ name: string; value: any }>;
        }) => {
          this.log("info", chalk.cyan(`Action: ${action.name}`));
          action.parameters.forEach((param: { name: string; value: any }) => {
            this.log(
              "info",
              chalk.dim(`  - ${param.name}: ${JSON.stringify(param.value)}`)
            );
          });
        }
      );
    } else {
      this.log("info", chalk.yellow("No actions needed"));
    }

    this.log("success", chalk.green(`Response: ${result.object.response}`));

    return {
      actions: result.object.actions as unknown as ActionSchema[],
      response: result.object.response,
    };
  }

  /**
   * Executes multiple workflows with their respective inputs
   * @protected
   * @param {GraphFlow<any>[]} workflows - Array of workflows to execute
   * @param {string[]} startNodes - Array of starting node names for each workflow
   * @param {any[]} inputs - Array of inputs for each workflow
   * @param {AgentContext} context - The context in which to execute the workflows
   * @returns {Promise<void>}
   */
  protected async executeWorkflows(
    workflows: GraphFlow<any>[],
    startNodes: string[],
    inputs: any[],
    context: AgentContext
  ): Promise<void> {
    this.log("info", chalk.cyan("Executing workflows:"));

    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      const startNode = startNodes[i];
      const input = inputs[i];

      this.log(
        "info",
        chalk.dim(
          `Executing workflow ${workflow.name} starting at node ${startNode}`
        )
      );
      this.log(
        "info",
        chalk.dim(`Input parameters: ${JSON.stringify(input, null, 2)}`)
      );

      // Initialize workflow context with input
      const workflowContext = {
        ...workflow.getContext(),
        ...input,
      };

      // Execute with merged context
      const result = await workflow.execute(
        startNode,

        workflowContext
      );

      this.log("success", chalk.green(`Workflow ${workflow.name} completed`));
      this.log("info", chalk.dim(`Result: ${JSON.stringify(result, null, 2)}`));

      if (context.executedActions) {
        context.executedActions.push({
          name: workflow.name,
          result: result,
          timestamp: new Date().toISOString(),
          isExecuted: true,
        });
      }
    }
  }
}
