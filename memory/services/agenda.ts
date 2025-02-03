import { ScheduledRequest } from "@/types";
import cron from "node-cron";

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
    const cronJob = cron.schedule(request.cronExpression, () => {
      console.log(`🔄 Executing scheduled request: ${id}`);

      if (callbacks?.onExecuted) {
        callbacks.onExecuted(id, scheduledRequest.originalRequest);
      }

      console.log(`✅ Scheduled request executed successfully: ${id}`);

      // Auto-stop pour les tâches non récurrentes
      if (!scheduledRequest.isRecurring) {
        this.cancelScheduledRequest(id);
      }
    });

    // Démarrer le job en mode non-running
    cronJob.stop();

    // Store request and job
    this.scheduledRequests.set(id, scheduledRequest);
    this.cronJobs.set(id, cronJob);

    if (callbacks?.onScheduled) callbacks.onScheduled(id);

    // Démarrer le job après l'avoir stocké
    cronJob.start();

    return id;
  }

  /**
   * Cancel a scheduled request
   */
  cancelScheduledRequest(requestId: string): boolean {
    const cronJob = this.cronJobs.get(requestId);
    if (cronJob) {
      try {
        cronJob.stop();
        this.cronJobs.delete(requestId);
        this.scheduledRequests.delete(requestId);
        return true;
      } catch (error) {
        console.error(`Failed to stop cron job ${requestId}:`, error);
        return false;
      }
    }
    return false;
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
    const ids = Array.from(this.cronJobs.keys());

    // Arrêter tous les jobs de manière synchrone
    for (const id of ids) {
      const job = this.cronJobs.get(id);
      if (job) {
        job.stop();
        this.cronJobs.delete(id);
        this.scheduledRequests.delete(id);
      }
    }

    // Double vérification
    this.cronJobs.clear();
    this.scheduledRequests.clear();
  }

  public async stop(): Promise<void> {
    this.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  public async cancel(query: {}): Promise<void> {
    this.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
