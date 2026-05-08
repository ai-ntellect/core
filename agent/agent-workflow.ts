import { GraphFlow } from "../execution/index";
import { GraphContext } from "../types";
import { AgentContext, AgentContextSchema } from "../types/agent";
import { AgentLogger } from "./tools/logger";

export interface CognitiveNodeContext {
  executor: {
    makeDecision: (context: AgentContext) => Promise<{ actions: any[]; response: string }>;
    executeActions: (actions: any[], context: AgentContext) => Promise<void>;
    updateDynamicGoal: (context: AgentContext) => Promise<string>;
    scheduleTask?: (cron: string, request: string) => Promise<string | null>;
  };
  logger: AgentLogger;
  maxIterations: number;
}

export function buildAgentWorkflow(ctx: CognitiveNodeContext): GraphFlow<typeof AgentContextSchema> {
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
        name: "defineGoal",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          const agentContext = context as unknown as AgentContext;
          await ctx.executor.updateDynamicGoal(agentContext);
          ctx.logger.info("workflow", "Goal defined");
        },
        next: ["think"],
      },
      {
        name: "think",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          iteration++;
          if (iteration >= ctx.maxIterations) {
            context.response = context.response || "Max iterations reached.";
            ctx.logger.warn("workflow", `Max iterations (${ctx.maxIterations}) reached`);
            return;
          }
          ctx.logger.info("think", `Iteration ${iteration}: Analyzing context...`);
          const agentContext = context as unknown as AgentContext;
          const decision = await ctx.executor.makeDecision(agentContext);
          context.actions = decision.actions;
          context.response = decision.response;
          ctx.logger.think("think", `Decision: ${decision.actions.length} actions`, decision.response);
        },
        next: (context: GraphContext<typeof AgentContextSchema>): any => {
          const agentContext = context as unknown as AgentContext;
          if (agentContext.actions.length === 0 || iteration >= ctx.maxIterations) {
            return ["reply"];
          }
          return ["execute"];
        },
      },
      {
        name: "execute",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          const timestamp = new Date().toISOString();
          const agentContext = context as unknown as AgentContext;

          const executedKeys = new Set(
            (agentContext.executedActions || []).map((a: any) => {
              const params = a.params || a.result;
              return `${a.name}:${JSON.stringify(params)}`;
            })
          );

          const paramsMap = new Map(
            (agentContext.actions || []).map((a: any) => {
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
              ctx.logger.info("dedup", `Skipping: ${a.name} (already executed)`);
            } else {
              newActions.push(a);
            }
          }

          if (newActions.length === 0) {
            agentContext.actions = [];
            ctx.logger.info("execute", "No actions to execute");
            return;
          }

          ctx.logger.info("execute", `Executing ${newActions.length} tools...`);

          const results = (agentContext.executedActions || []).map((a: any) =>
            `${a.name}: ${JSON.stringify(a.result)}`
          ).join('\n');
          agentContext.knowledge = `Date: ${timestamp}\n${results}`;

          await ctx.executor.executeActions(newActions, agentContext);

          agentContext.actions = [];
        },
        next: (context: GraphContext<typeof AgentContextSchema>): any => {
          const agentContext = context as unknown as AgentContext;
          if (iteration >= ctx.maxIterations) {
            return ["reply"];
          }
          return ["think"];
        },
      },
      {
        name: "plan",
        execute: async () => {
          ctx.logger.info("plan", "Planning next steps...");
        },
        next: ["think"],
      },
      {
        name: "schedule",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          ctx.logger.info("schedule", "Scheduling a task...");
          const scheduledTask = (context as any).scheduledTask;
          if (scheduledTask?.cronExpression && scheduledTask?.request && ctx.executor.scheduleTask) {
            await ctx.executor.scheduleTask(scheduledTask.cronExpression, scheduledTask.request);
            context.response = "Tâche planifiée avec succès.";
          } else {
            context.response = "Pas de tâche à planifier.";
          }
        },
        next: ["think"],
      },
      {
        name: "reply",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          ctx.logger.info("reply", `Response: ${context.response?.substring(0, 50)}...`);
        },
        next: [],
      },
      {
        name: "ask",
        execute: async (context: GraphContext<typeof AgentContextSchema>) => {
          ctx.logger.info("ask", "Asking clarification question...");
          context.response = context.response || "Avez-vous besoin de précisions ?";
        },
        next: ["think"],
      },
    ],
  });
}
