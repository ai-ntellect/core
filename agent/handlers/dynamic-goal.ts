import { z } from "zod";
import chalk from "chalk";
import { AgentContext } from "../../types/agent";
import { AgentLogger, LogLevel } from "../tools/logger";

const DEFAULT_DYNAMIC_GOAL_PROMPT = `Contexte actuel:
- Input utilisateur: {input}
- Actions déjà exécutées: {executedActions}
- Résultats disponibles: {results}
- Goal original: {originalGoal}

Réponds uniquement avec le format JSON: {"goal": "votre sous-goal en 1-2 phrases"}
Le sous-goal doit être la prochaine étape à accomplir.`;

export class DynamicGoalHandler {
  private enabled: boolean;
  private promptTemplate: string;
  private currentGoal: string;
  private llm: { generate: (messages: { system: string; user: string }, schema: any) => Promise<{ object: { goal: string } }> };
  private logger: AgentLogger;

  constructor(
    llm: { generate: (messages: { system: string; user: string }, schema: any) => Promise<{ object: { goal: string } }> },
    logger: AgentLogger,
    options: { enabled?: boolean; prompt?: string; initialGoal?: string } = {}
  ) {
    this.llm = llm;
    this.logger = logger;
    this.enabled = options.enabled ?? false;
    this.promptTemplate = options.prompt ?? DEFAULT_DYNAMIC_GOAL_PROMPT;
    this.currentGoal = options.initialGoal ?? "";
  }

  setEnabled(enabled: boolean, customPrompt?: string): void {
    this.enabled = enabled;
    if (customPrompt) this.promptTemplate = customPrompt;
  }

  getCurrentGoal(): string {
    return this.currentGoal;
  }

  async compute(context: AgentContext): Promise<string> {
    if (!this.enabled) return this.currentGoal;

    this.log("thinking", chalk.dim("Computing dynamic goal..."));

    const executedTools = context.executedActions.map(a => a.name);
    const results = context.executedActions
      .map(a => `${a.name}: ${JSON.stringify(a.result)}`)
      .join("\n");

    const prompt = this.promptTemplate
      .replace("{input}", context.input.raw)
      .replace("{executedActions}", executedTools.join(", ") || "Aucune")
      .replace("{results}", results || "Aucun résultat")
      .replace("{originalGoal}", this.currentGoal);

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

      const computedGoal = result.object?.goal || this.currentGoal;
      this.currentGoal = computedGoal;
      this.log("info", chalk.dim(`Dynamic goal: ${computedGoal}`));
      return computedGoal;
    } catch (error) {
      this.log("warning", chalk.yellow(`Failed to compute dynamic goal: ${error}, falling back to original`));
      return this.currentGoal;
    }
  }

  private log(type: "info" | "success" | "warning" | "error" | "thinking", message: string) {
    const levelMap: Record<string, LogLevel> = {
      info: "info", success: "info", warning: "warn", error: "error", thinking: "info",
    };
    this.logger.log(levelMap[type], "dynamic-goal", message);
  }
}
