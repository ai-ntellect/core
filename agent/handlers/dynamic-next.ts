import { z } from "zod";
import chalk from "chalk";
import { AgentContext } from "../../types/agent";
import { AgentLogger, LogLevel } from "../tools/logger";

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

export const COGNITIVE_NODES = ["defineGoal", "think", "execute", "plan", "schedule", "reply", "ask", "end"];

export class DynamicNextHandler {
  private enabled: boolean;
  private promptTemplate: string;
  private currentState: string;
  private llm: { generate: (messages: { system: string; user: string }, schema: any) => Promise<{ object: { next: string; reason?: string } }> };
  private logger: AgentLogger;

  constructor(
    llm: { generate: (messages: { system: string; user: string }, schema: any) => Promise<{ object: { next: string; reason?: string } }> },
    logger: AgentLogger,
    options: { enabled?: boolean; prompt?: string } = {}
  ) {
    this.llm = llm;
    this.logger = logger;
    this.enabled = options.enabled ?? false;
    this.promptTemplate = options.prompt ?? DEFAULT_DYNAMIC_NEXT_PROMPT;
    this.currentState = "defineGoal";
  }

  setEnabled(enabled: boolean, customPrompt?: string): void {
    this.enabled = enabled;
    if (customPrompt) this.promptTemplate = customPrompt;
  }

  getCurrentState(): string {
    return this.currentState;
  }

  setCurrentState(state: string): void {
    if (COGNITIVE_NODES.includes(state)) {
      this.currentState = state;
    }
  }

  getAvailableNodes(): string[] {
    return COGNITIVE_NODES;
  }

  async compute(context: AgentContext, currentState: string, iteration: number, currentGoal: string): Promise<string> {
    if (!this.enabled) {
      return this.getDefaultNextState(currentState, context);
    }

    this.log("thinking", chalk.dim(`Computing next state from "${currentState}"...`));

    const executedTools = context.executedActions.map(a => a.name);
    const results = context.executedActions
      .map(a => `${a.name}: ${JSON.stringify(a.result)}`)
      .join("\n");

    const prompt = this.promptTemplate
      .replace("{currentState}", currentState)
      .replace("{input}", context.input.raw)
      .replace("{goal}", currentGoal)
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

  private getDefaultNextState(currentState: string, context: AgentContext): string {
    switch (currentState) {
      case "defineGoal": return "think";
      case "think": return context.actions && context.actions.length > 0 ? "execute" : "reply";
      case "execute": return context.executedActions && context.executedActions.length > 0 ? "think" : "reply";
      case "plan": return "think";
      case "schedule": return "think";
      case "reply": return "end";
      case "ask": return "think";
      default: return "think";
    }
  }

  private log(type: "info" | "success" | "warning" | "error" | "thinking", message: string) {
    const levelMap: Record<string, LogLevel> = {
      info: "info", success: "info", warning: "warn", error: "error", thinking: "info",
    };
    this.logger.log(levelMap[type], "dynamic-next", message);
  }
}
