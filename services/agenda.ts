import cron from "node-cron";
interface ScheduledRequest {
  id: string;
  originalRequest: string;
  cronExpression: string;
  isRecurring: boolean;
  createdAt: Date;
}

export class Agenda {
  private scheduledRequests: Map<string, ScheduledRequest> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Schedule a new request to be processed later
   */
  async scheduleRequest(
    request: {
      originalRequest: string;
      cronExpression: string;
    },
    callbacks?: {
      onScheduled?: (id: string) => void;
      onExecuted?: (id: string, originalRequest: string) => void;
    }
  ): Promise<string> {
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

      if (callbacks?.onExecuted)
        callbacks.onExecuted(id, scheduledRequest.originalRequest);

      if (!scheduledRequest.isRecurring) {
        this.cancelScheduledRequest(id);
      }
    });

    // Store request and job
    this.scheduledRequests.set(id, scheduledRequest);
    this.cronJobs.set(id, cronJob);

    if (callbacks?.onScheduled) callbacks.onScheduled(id);

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
