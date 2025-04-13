import { GraphContext } from "@/types";
import { GraphFlow } from "../../graph/index";
import {
  AgentConfig,
  AgentContext,
  AgentContextSchema,
} from "../../types/agent";
import { BaseAgent } from "./base";
import { GenericExecutor } from "./generic-executor";

/**
 * A generic assistant that can be configured with different roles, goals, and personalities
 * @class Agent
 * @example
 * const assistant = new Agent({
 *   role: "Email Assistant",
 *   goal: "Help users send emails efficiently",
 *   backstory: "I am a professional and friendly assistant who specializes in email communication",
 *   llmConfig: { provider: "openai", model: "gpt-4" }
 * });
 */
export class Agent {
  private executor: GenericExecutor;
  private workflow: GraphFlow<typeof AgentContextSchema>;

  constructor(config: AgentConfig) {
    const agent = new BaseAgent({
      role: config.role,
      goal: config.goal,
      backstory: config.backstory,
      tools: config.tools,
      memory: config.memory,
      llmConfig: config.llmConfig,
    });

    this.executor = new GenericExecutor(agent, config.tools, {
      llmConfig: config.llmConfig,
      verbose: config.verbose,
    });

    this.workflow = this.setupWorkflow();
  }

  private setupWorkflow(): GraphFlow<typeof AgentContextSchema> {
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
          name: "process",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            const agentContext = context as unknown as AgentContext;
            const decision = await this.executor.makeDecision(agentContext);
            context.actions = decision.actions;
            context.response = decision.response;
          },
          next: (context: GraphContext<typeof AgentContextSchema>) =>
            context.actions.length > 0 ? ["execute"] : [],
        },
        {
          name: "execute",
          execute: async (context: GraphContext<typeof AgentContextSchema>) => {
            console.log(`Executing actions:`);
            console.log(context.actions);

            await this.executor.executeActions(
              context.actions,
              context as unknown as AgentContext
            );
          },
          next: ["process"],
        },
      ],
    });
  }

  public async process(input: string): Promise<AgentContext> {
    await this.workflow.execute("process", {
      input: { raw: input },
      actions: [],
      response: "",
    });

    return this.workflow.getContext() as unknown as AgentContext;
  }
}
