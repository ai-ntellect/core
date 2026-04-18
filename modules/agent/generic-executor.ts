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
import { AgentLogger, LogLevel } from "./tools/logger";

export class GenericExecutor extends AgentExecutor {
  private verbose: boolean;
  private llm: ReturnType<typeof LLMFactory.createLLM>;
  private logger: AgentLogger;

  constructor(
    agent: BaseAgent,
    graphs: GraphFlow<any>[],
    config: ExecutorConfig,
    logger?: AgentLogger
  ) {
    super(agent, graphs);
    this.verbose = config.verbose ?? true;
    this.llm = LLMFactory.createLLM(config.llmConfig);
    this.logger = logger || new AgentLogger(this.verbose);
  }

  setLogger(logger: AgentLogger) {
    this.logger = logger;
  }

  private log(
    type: "info" | "success" | "warning" | "error" | "thinking",
    message: string
  ) {
    if (!this.verbose) return;

    const levelMap: Record<string, LogLevel> = {
      info: "info",
      success: "info",
      warning: "warn",
      error: "error",
      thinking: "info",
    };

    const prefix = {
      info: chalk.blue("ℹ"),
      success: chalk.green("✓"),
      warning: chalk.yellow("⚠"),
      error: chalk.red("✖"),
      thinking: chalk.magenta("🤔"),
    }[type];

    this.logger.log(levelMap[type], "executor", message);
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
          .filter(([key, value]) => {
            const zodValue = value as z.ZodTypeAny;
            return !key.endsWith("_result") && !key.includes("Result");
          })
          .map(([key, value]) => {
            const zodValue = value as z.ZodTypeAny;
            let desc = zodValue.description || "";
            if (zodValue._def.typeName === "ZodEnum") {
              const options = (zodValue as z.ZodEnum<any>)._def.values;
              desc = desc ? `${desc} (Options: ${options.join(", ")})` : `Options: ${options.join(", ")}`;
            }
            return `    - ${key}: ${desc || zodValue._def.typeName}`;
          })
          .join("\n");

        return `${graph.name}:
  Parameters (INPUT only):
${schemaDescription}
  Output: stored as \$${graph.name}_result`;
      })
      .join("\n\n");
  }

  private async buildSystemPrompt(context: AgentContext): Promise<string> {
    const executedTools = context.executedActions.map(a => a.name);
    const alreadyExecuted = executedTools.length > 0 
      ? `ALREADY DONE: ${executedTools.join(", ")}`
      : "No tools executed yet.";
    
    const availableToolNames = Array.from(this.availableGraphs.keys()).join(", ");
    const cwd = (context as any).cwd || process.cwd();
    
    let variables = "";
    if (executedTools.length > 0) {
      variables = "Use these exact variable names:\n";
      for (const action of context.executedActions) {
        const resultVal = typeof action.result === 'object' && action.result !== null
          ? JSON.stringify(action.result)
          : String(action.result);
        variables += `  \$${action.name}_result = ${resultVal}\n`;
      }
    } else {
      variables = "No variables yet. Execute a tool first.";
    }
    
    return new PromptBuilder()
      .addSection("ROLE", this.agent.getRole())
      .addSection("GOAL", this.agent.getGoal())
      .addSection("BACKSTORY", this.agent.getBackstory())
      .addSection("ENVIRONMENT", `Current directory: ${cwd}`)
      .addSection("TOOLS", availableToolNames)
      .addSection("SCHEMAS", this.generateActionSchema())
      .addSection("VARIABLES", variables)
      .addSection("STATUS", alreadyExecuted)
      .addSection(
        "RULES",
        `JSON format: {"actions":[{"name":"TOOL_NAME","parameters":{...}}],"response":"text"}

1. If you need a previous result, use the EXACT variable name from VARIABLES section
2. If ALL needed tools have been executed, set actions to [] and respond
3. NEVER call a tool listed in STATUS as "ALREADY DONE"`
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

    this.log("info", chalk.dim("Generating response..."));

    const result = await this.llm.generate(
      {
        system: systemPrompt,
        user: `User message: ${context.input.raw}`,
      },
      z.object({
        actions: z.array(
          z.object({
            name: z.string().optional().catch(() => ""),
            parameters: z.union([
              z.array(
                z.object({
                  name: z.string(),
                  value: z.any(),
                })
              ),
              z.record(z.any()),
            ]).optional().catch(() => ({})),
          }).passthrough().catch(() => ({ name: "", parameters: {} }))
        ).default([]),
        response: z.any().transform(v => {
          if (typeof v === 'string') return v;
          if (v && typeof v === 'object') {
            if (v.message) return String(v.message);
            if (v.text) return String(v.text);
            return JSON.stringify(v);
          }
          return String(v);
        }),
      })
    );
    
    const validActions = result.object.actions.filter(
      (a: any) => a && a.name && typeof a.name === 'string' && a.name.length > 0
    );
    
    if (validActions.length > 0) {
      this.log("success", chalk.green("Decided to take actions:"));
      validActions.forEach(
        (action: {
          name: string;
          parameters: Array<{ name: string; value: any }> | Record<string, any>;
        }) => {
          this.log("info", chalk.cyan(`Action: ${action.name}`));
          const params = action.parameters || {};
          if (Array.isArray(params)) {
            params.forEach((param: { name: string; value: any }) => {
              this.log(
                "info",
                chalk.dim(`  - ${param.name}: ${JSON.stringify(param.value)}`)
              );
            });
          } else {
            Object.entries(params).forEach(([key, value]) => {
              this.log(
                "info",
                chalk.dim(`  - ${key}: ${JSON.stringify(value)}`)
              );
            });
          }
        }
      );
    } else {
      this.log("info", chalk.yellow("No actions needed"));
    }

    this.log("success", chalk.green(`Response: ${result.object.response}`));

    return {
      actions: validActions as unknown as ActionSchema[],
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
      
      const resolvedInput: Record<string, any> = {};
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          let varPath = value.substring(1);
          let varValue: any = undefined;
          
          if (varPath.includes('.')) {
            const [varName, ...rest] = varPath.split('.');
            varValue = (context as any)[varName];
            if (varValue !== undefined) {
              for (const prop of rest) {
                varValue = varValue?.[prop];
              }
            } else {
              const fallback = context.executedActions.find(a => `${a.name}_result` === varName);
              if (fallback) {
                varValue = fallback.result;
                for (const prop of rest) {
                  varValue = varValue?.[prop];
                }
              }
            }
          } else {
            varValue = (context as any)[varPath];
            if (varValue === undefined) {
              const fallback = context.executedActions.find(a => `${a.name}_result` === varPath);
              if (fallback) varValue = fallback.result;
            }
          }
          
          if (varValue !== undefined) {
            const extracted = varValue?.result !== undefined && !varPath.includes('.result') ? varValue.result : varValue;
            this.log("info", chalk.dim(`  Resolved \$${varPath} = ${JSON.stringify(extracted)}`));
            resolvedInput[key] = extracted;
            continue;
          }
        }
        resolvedInput[key] = value;
      }

      this.log(
        "info",
        chalk.dim(`Input parameters: ${JSON.stringify(resolvedInput, null, 2)}`)
      );

      const coercedInput: Record<string, any> = {};
      const schema = workflow.getSchema();
      for (const [key, value] of Object.entries(resolvedInput)) {
        const fieldSchema = schema.shape[key];
        if (fieldSchema) {
          const typeName = fieldSchema._def.typeName;
          if (typeName === 'ZodOptional') {
            const inner = (fieldSchema as any)._def.innerType;
            const innerType = inner?._def?.typeName;
            if (innerType === 'ZodNumber') {
              coercedInput[key] = typeof value === 'string' ? parseFloat(value) : value;
              continue;
            }
            if (innerType === 'ZodString') {
              coercedInput[key] = String(value);
              continue;
            }
          }
          if (typeName === 'ZodNumber') {
            coercedInput[key] = typeof value === 'string' ? parseFloat(value) : value;
            continue;
          }
          if (typeName === 'ZodString') {
            coercedInput[key] = String(value);
            continue;
          }
        }
        coercedInput[key] = value;
      }

      const workflowContext = {
        ...workflow.getContext(),
        ...coercedInput,
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

      const resultVarName = `${workflow.name}_result`;
      (context as any)[resultVarName] = result;
    }
  }
}
