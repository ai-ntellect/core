import { AgentConfig } from "@/types/agent";
import { BaseMemoryType } from "../../../types";
import { Memory } from "../../memory";

/**
 * Base agent class that handles role, goal, and personality management
 * @class BaseAgent
 */
export class BaseAgent {
  private config: AgentConfig;
  private memory?: Memory;

  constructor(config: AgentConfig) {
    this.config = config;
    this.memory = config.memory;
  }

  async execute(context: any, inputs?: any): Promise<any> {
    // Log execution if verbose
    if (this.config.verbose) {
      console.log(`Agent ${this.config.role} executing...`);
      console.log("Context:", context);
      console.log("Inputs:", inputs);
    }

    // Store context in memory if available
    if (this.memory) {
      await this.storeInMemory({
        type: "execution",
        content: JSON.stringify({ context, inputs }),
        metadata: {
          role: this.config.role,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Execute tools if available
    if (this.config.tools) {
      for (const tool of this.config.tools) {
        try {
          const result = await tool.execute(context, inputs);
          context = { ...context, ...result };
        } catch (error) {
          console.error(`Tool execution failed:`, error);
        }
      }
    }

    return context;
  }

  private async storeInMemory(data: {
    type: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<BaseMemoryType | undefined> {
    if (!this.memory) return;

    return this.memory.createMemory({
      content: data.content,
      metadata: data.metadata,
      roomId: "default",
    });
  }

  public async recall(query: string): Promise<BaseMemoryType[]> {
    if (!this.memory) return [];

    return this.memory.getMemoryByIndex(query, {
      roomId: "default",
      limit: 10,
    });
  }

  /**
   * Get the agent's role - what function/job it performs
   * @returns {string} The agent's role
   */
  public getRole(): string {
    return this.config.role;
  }

  /**
   * Get the agent's goal - what it tries to achieve
   * @returns {string} The agent's goal
   */
  public getGoal(): string {
    return this.config.goal;
  }

  /**
   * Get the agent's backstory - its personality and behavioral traits
   * @returns {string} The agent's backstory
   */
  public getBackstory(): string {
    return this.config.backstory;
  }
}
