import cron from "node-cron";
import { AgentRuntime } from "../llm/orchestrator";
import { RedisCache } from "./redis-cache";

interface ScheduledRequest {
  id: string;
  originalRequest: string;
  cronExpression: string;
  isRecurring: boolean;
  createdAt: Date;
}

export class TaskScheduler {
  private scheduledRequests: Map<string, ScheduledRequest> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private readonly agentRuntime: AgentRuntime;
  private readonly cache: RedisCache;

  constructor(agentRuntime: AgentRuntime, cache: RedisCache) {
    this.agentRuntime = agentRuntime;
    this.cache = cache;
  }

  /**
   * Schedule a new request to be processed later
   */
  async scheduleRequest(request: {
    originalRequest: string;
    cronExpression: string;
  }): Promise<string> {
    const id = crypto.randomUUID();

    const scheduledRequest: ScheduledRequest = {
      id,
      originalRequest: request.originalRequest,
      cronExpression: request.cronExpression,
      isRecurring: false,
      createdAt: new Date(),
    };

    // Create cron job
    const cronJob = cron.schedule(request.cronExpression, async () => {
      await this.executeScheduledRequest(scheduledRequest);

      if (!scheduledRequest.isRecurring) {
        this.cancelScheduledRequest(id);
      }
    });

    // Store request and job
    this.scheduledRequests.set(id, scheduledRequest);
    this.cronJobs.set(id, cronJob);

    console.log(
      `✅ Request scheduled with cron expression: ${request.cronExpression}`
    );

    return id;
  }

  /**
   * Execute a scheduled request by launching a new process
   */
  private async executeScheduledRequest(
    request: ScheduledRequest
  ): Promise<void> {
    try {
      console.log(`🔄 Executing scheduled request from ${request.createdAt}`);

      // Récupérer les actions précédentes du cache
      const previousActions = await this.cache.getPreviousActions(request.id);

      // Add context about when this request was scheduled
      const contextualRequest = `You are a scheduler. 
        You were asked to execute this request: ${request.originalRequest}\n 
        Date of the request: ${request.createdAt.toISOString()}\n
        Act like if you know the request was scheduled.
        Don't reschedule the same action. 
        Just execute it.`;

      // Process the request as if it was just received
      const result = await this.agentRuntime.process({
        currentContext: contextualRequest,
        previousActions,
      });

      // Store the new actions in cache
      if (result.actions.length > 0) {
        await this.cache.storePreviousActions(request.id, result.actions);
      }

      console.log(`✅ Scheduled request executed successfully`);
    } catch (error) {
      console.error(`❌ Failed to execute scheduled request:`, error);
    }
  }

  /**
   * Cancel a scheduled request
   */
  cancelScheduledRequest(requestId: string): boolean {
    const cronJob = this.cronJobs.get(requestId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(requestId);
    }
    return this.scheduledRequests.delete(requestId);
  }

  /**
   * Get all scheduled requests
   */
  getScheduledRequests(): ScheduledRequest[] {
    return Array.from(this.scheduledRequests.values());
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    for (const [id, cronJob] of this.cronJobs) {
      cronJob.stop();
      this.cronJobs.delete(id);
      this.scheduledRequests.delete(id);
    }
    console.log("All scheduled requests stopped");
  }
}
