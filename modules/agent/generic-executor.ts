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

const DEFAULT_DYNAMIC_GOAL_PROMPT = `Contexte actuel:
- Input utilisateur: {input}
- Actions déjà exécutées: {executedActions}
- Résultats disponibles: {results}
- Goal original: {originalGoal}

Réponds uniquement avec le format JSON: {"goal": "votre sous-goal en 1-2 phrases"}
Le sous-goal doit être la prochaine étape à accomplir.`;

const DEFAULT_DYNAMIC_NEXT_PROMPT = `Contexte actuel:
- État actuel: {currentState}
- Input utilisateur: {input}
- Goal: {goal}
- Actions exécutées: {executedActions}
- Résultats disponibles: {results}
- Nombre d'itérations: {iteration}

Nodes cognitifs disponibles:
- defineGoal: Déterminer le goal dynamique
- think: Analyser le contexte et décider des actions
- execute: Exécuter les outils/actions
- plan: Planifier les étapes suivantes
- schedule: Planifier une tâche pour plus tard (utilise le module Agenda)
- reply: Répondre à l'utilisateur
- ask: Poser une question clarificatrice
- end: Terminer le workflow

Choisis le prochain node le plus approprié.
Réponds uniquement: {"next": "nom_du_node", "reason": "explication courte"}`;

const COGNITIVE_NODES = ["defineGoal", "think", "execute", "plan", "schedule", "reply", "ask", "end"];

export class GenericExecutor extends AgentExecutor {
  private verbose: boolean;
  private llm: ReturnType<typeof LLMFactory.createLLM>;
  private logger: AgentLogger;
  private dynamicGoal: boolean;
  private dynamicGoalPrompt: string;
  private currentDynamicGoal: string;
  private dynamicNext: boolean;
  private dynamicNextPrompt: string;
  private currentState: string;
  private enableSchedule: boolean;
  private agenda: any;

  constructor(
    agent: BaseAgent,
    graphs: GraphFlow<any>[],
    config: ExecutorConfig,
    logger?: AgentLogger,
    options?: { 
      dynamicGoal?: boolean; 
      dynamicGoalPrompt?: string;
      dynamicNext?: boolean;
      dynamicNextPrompt?: string;
      enableSchedule?: boolean;
      agenda?: any;
    }
  ) {
    super(agent, graphs);
    this.verbose = config.verbose ?? true;
    this.llm = LLMFactory.createLLM(config.llmConfig);
    this.logger = logger || new AgentLogger(this.verbose);
    this.dynamicGoal = options?.dynamicGoal ?? false;
    this.dynamicGoalPrompt = options?.dynamicGoalPrompt ?? DEFAULT_DYNAMIC_GOAL_PROMPT;
    this.currentDynamicGoal = agent.getGoal();
    this.dynamicNext = options?.dynamicNext ?? false;
    this.dynamicNextPrompt = options?.dynamicNextPrompt ?? DEFAULT_DYNAMIC_NEXT_PROMPT;
    this.currentState = "defineGoal";
    this.enableSchedule = options?.enableSchedule ?? false;
    this.agenda = options?.agenda;
  }

  setDynamicGoal(enabled: boolean, customPrompt?: string) {
    this.dynamicGoal = enabled;
    if (customPrompt) {
      this.dynamicGoalPrompt = customPrompt;
    }
  }

  getCurrentGoal(): string {
    return this.currentDynamicGoal;
  }

  getCurrentState(): string {
    return this.currentState;
  }

  setCurrentState(state: string) {
    if (COGNITIVE_NODES.includes(state)) {
      this.currentState = state;
    }
  }

  getAvailableNodes(): string[] {
    return COGNITIVE_NODES;
  }

  setLogger(logger: AgentLogger) {
    this.logger = logger;
  }

  /**
   * Computes the next cognitive state using LLM
   * @param context - Current agent context
   * @param currentState - Current cognitive state
   * @param iteration - Current iteration number
   * @returns The next state or fallback
   */
  async computeNextState(context: AgentContext, currentState: string, iteration: number): Promise<string> {
    if (!this.dynamicNext) {
      return this.getDefaultNextState(currentState, context);
    }

    this.log("thinking", chalk.dim(`Computing next state from "${currentState}"...`));

    const executedTools = context.executedActions.map(a => a.name);
    const results = context.executedActions
      .map(a => `${a.name}: ${JSON.stringify(a.result)}`)
      .join("\n");

    const prompt = this.dynamicNextPrompt
      .replace("{currentState}", currentState)
      .replace("{input}", context.input.raw)
      .replace("{goal}", this.currentDynamicGoal)
      .replace("{executedActions}", executedTools.join(", ") || "Aucune")
      .replace("{results}", results || "Aucun résultat")
      .replace("{iteration}", String(iteration));

    try {
      const result = await this.llm.generate(
        {
          system: "Tu es un assistant qui détermine le prochain état cognitif. Réponds uniquement en JSON.",
          user: prompt,
        },
        z.object({
          next: z.string(),
          reason: z.string().optional(),
        }).transform(v => ({ 
          next: COGNITIVE_NODES.includes(v.next) ? v.next : "think",
          reason: v.reason 
        }))
      );

      const nextState = result.object.next;
      this.currentState = nextState;
      this.log("info", chalk.dim(`Next state: ${nextState}${result.object.reason ? ` (${result.object.reason})` : ''}`));
      return nextState;
    } catch (error) {
      this.log("warning", chalk.yellow(`Failed to compute next state: ${error}, using default`));
      return this.getDefaultNextState(currentState, context);
    }
  }

  /**
   * Returns default next state based on current state and context
   */
  private getDefaultNextState(currentState: string, context: AgentContext): string {
    switch (currentState) {
      case "defineGoal":
        return "think";
      case "think":
        return context.actions && context.actions.length > 0 ? "execute" : "reply";
      case "execute":
        return context.executedActions && context.executedActions.length > 0 ? "think" : "reply";
      case "plan":
        return "think";
      case "schedule":
        return "think";
      case "reply":
        return "end";
      case "ask":
        return "think";
      default:
        return "think";
    }
  }

  /**
   * Schedule a task using the Agenda module
   */
  async scheduleTask(cronExpression: string, request: string): Promise<string | null> {
    if (!this.enableSchedule || !this.agenda) {
      this.log("warning", chalk.yellow("Schedule not enabled or Agenda not configured"));
      return null;
    }

    try {
      const id = await this.agenda.scheduleRequest({
        originalRequest: request,
        cronExpression,
      });
      this.log("success", chalk.green(`Scheduled task: ${id} (${cronExpression})`));
      return id;
    } catch (error) {
      this.log("error", chalk.red(`Failed to schedule task: ${error}`));
      return null;
    }
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

    this.logger.log(levelMap[type], "executor", message);
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
      ? `ALREADY DONE (DO NOT RE-EXECUTE THESE): ${executedTools.join(", ")}`
      : "No tools executed yet.";
    
    const availableToolNames = Array.from(this.availableGraphs.keys()).join(", ");
    const cwd = (context as any).cwd || process.cwd();
    
    let variables = "";
    if (executedTools.length > 0) {
      variables = "IMPORTANT - Use these exact variable names for READ-ONLY reference:\n";
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
      .addSection("GOAL", this.currentDynamicGoal)
      .addSection("BACKSTORY", this.agent.getBackstory())
      .addSection("ENVIRONMENT", `Current directory: ${cwd}`)
      .addSection("TOOLS", availableToolNames)
      .addSection("SCHEMAS", this.generateActionSchema())
      .addSection("VARIABLES", variables)
      .addSection("STATUS", alreadyExecuted)
      .addSection(
        "RULES",
        `JSON format EXACT: {"actions":[{"name":"TOOL_NAME","parameters":{"param1":"value1"}}],"response":"votre réponse"}

TRES IMPORTANT - Pas de reasoning, pas de texte supplémentaire. Sortie JSON uniquement:
- "actions": tableau d'actions à exécuter (chaque tool une seule fois)
- "response": texte court (1-2 phrases max) décrivant ce qui sera fait

NE PAS inclure de reasoning, commentaires, ou texte hors JSON.`
      )
      .build(context);
  }

  /**
   * Computes a dynamic goal using the LLM as a meta-agent
   * @param {AgentContext} context - The current context
   * @returns {Promise<string>} The dynamic goal
   */
  private async computeDynamicGoal(context: AgentContext): Promise<string> {
    if (!this.dynamicGoal) {
      return this.agent.getGoal();
    }

    this.log("thinking", chalk.dim("Computing dynamic goal..."));

    const executedTools = context.executedActions.map(a => a.name);
    const results = context.executedActions
      .map(a => `${a.name}: ${JSON.stringify(a.result)}`)
      .join("\n");

    const prompt = this.dynamicGoalPrompt
      .replace("{input}", context.input.raw)
      .replace("{executedActions}", executedTools.join(", ") || "Aucune")
      .replace("{results}", results || "Aucun résultat")
      .replace("{originalGoal}", this.agent.getGoal());

    try {
      const result = await this.llm.generate(
        {
          system: "Tu dois répondre au format JSON exact: {\"goal\": \"votre texte\"}. Sois concis.",
          user: prompt,
        },
        z.object({
          goal: z.string(),
        }).transform(v => ({ goal: v.goal || "Accomplir la tâche" }))
      );

      const computedGoal = result.object?.goal || this.agent.getGoal();
      this.currentDynamicGoal = computedGoal;
      this.log("info", chalk.dim(`Dynamic goal: ${computedGoal}`));
      return computedGoal;
    } catch (error) {
      this.log("warning", chalk.yellow(`Failed to compute dynamic goal: ${error}, falling back to original`));
      return this.agent.getGoal();
    }
  }

  /**
   * Computes and updates the dynamic goal for the current iteration
   * Can be called from the workflow before makeDecision
   * @param {AgentContext} context - The current context
   * @returns {Promise<string>} The computed dynamic goal
   */
  async updateDynamicGoal(context: AgentContext): Promise<string> {
    const goal = await this.computeDynamicGoal(context);
    return goal;
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
        response: z.string().default("Action complétée"),
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
          const params = action.parameters || {};
          if (Array.isArray(params)) {
            params.forEach((param: { name: string; value: any }) => {
              this.log("info", chalk.cyan(`  → ${action.name}(${param.name}=${JSON.stringify(param.value)})`));
            });
          } else {
            Object.entries(params).forEach(([key, value]) => {
              this.log("info", chalk.cyan(`  → ${action.name}(${key}=${JSON.stringify(value)})`));
            });
          }
        }
      );
    } else {
      this.log("info", chalk.yellow("No actions needed"));
    }

    this.log("info", chalk.dim(`LLM Response: ${result.object.response}`));

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
            if (varValue === undefined) {
              const lastResult = context.executedActions[context.executedActions.length - 1]?.result;
              if (lastResult !== undefined) varValue = lastResult;
            }
          }
          
          if (varValue !== undefined) {
            const extracted = typeof varValue === 'object' && varValue?.result !== undefined && !varPath.includes('.result') 
              ? varValue.result 
              : varValue;
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
              if (typeof value === 'object' && value !== null) {
                coercedInput[key] = JSON.stringify(value);
              } else {
                coercedInput[key] = String(value);
              }
              continue;
            }
            if (innerType === 'ZodEnum') {
              const options = inner._def.values || [];
              const lowerOptions = options.map((o: string) => o.toLowerCase());
              const matchIdx = lowerOptions.indexOf(String(value).toLowerCase());
              coercedInput[key] = matchIdx >= 0 ? options[matchIdx] : value;
              continue;
            }
          }
          if (typeName === 'ZodNumber') {
            coercedInput[key] = typeof value === 'string' ? parseFloat(value) : value;
            continue;
          }
          if (typeName === 'ZodString') {
            if (typeof value === 'object' && value !== null) {
              coercedInput[key] = JSON.stringify(value);
            } else {
              coercedInput[key] = String(value);
            }
            continue;
          }
          if (typeName === 'ZodBoolean') {
            if (typeof value === 'string') {
              coercedInput[key] = value.toLowerCase() === 'true' || value === '1' || value === 'yes';
            } else {
              coercedInput[key] = Boolean(value) && value !== null && value !== undefined;
            }
            continue;
          }
          if (typeName === 'ZodEnum') {
            const options = (fieldSchema as any)._def.values || [];
            const lowerOptions = options.map((o: string) => o.toLowerCase());
            const matchIdx = lowerOptions.indexOf(String(value).toLowerCase());
            coercedInput[key] = matchIdx >= 0 ? options[matchIdx] : value;
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
