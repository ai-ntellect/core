import { ICronService, IMemoryAdapter } from "../../interfaces";
import { ScheduledRequest } from "../../types";

/**
 * @module Agenda
 * @description A module for scheduling and managing cron-based tasks.
 * Provides functionality for scheduling requests, managing their lifecycle,
 * and handling recurring and one-time tasks.
 */
export class Agenda {
  /**
   * Creates an instance of Agenda
   * @param {ICronService} cronService - The cron service implementation
   * @param {IMemoryAdapter} storage - The storage service for jobs and requests
   */
  constructor(
    private readonly cronService: ICronService,
    private readonly storage: IMemoryAdapter &
      Required<
        Pick<
          IMemoryAdapter,
          | "saveJob"
          | "saveRequest"
          | "getJob"
          | "getRequest"
          | "deleteJob"
          | "deleteRequest"
          | "getAllRequests"
          | "clear"
        >
      >
  ) {}

  /**
   * Schedule a new request to be processed later
   * @param {Object} request - The request configuration
   * @param {string} request.originalRequest - The original request to be executed
   * @param {string} request.cronExpression - The cron expression for scheduling
   * @param {Object} [callbacks] - Optional callback functions
   * @param {Function} [callbacks.onScheduled] - Called when request is scheduled
   * @param {Function} [callbacks.onExecuted] - Called when request is executed
   * @returns {Promise<string>} The ID of the scheduled request
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

    // Create cron job using the injected service
    const cronJob = this.cronService.schedule(
      request.cronExpression,
      async () => {
        console.log(`🔄 Executing scheduled request: ${id}`);

        if (callbacks?.onExecuted) {
          callbacks.onExecuted(id, scheduledRequest.originalRequest);
        }

        console.log(`✅ Scheduled request executed successfully: ${id}`);

        // Auto-stop for non-recurring tasks
        if (!scheduledRequest.isRecurring) {
          await this.cancelScheduledRequest(id);
        }
      }
    );

    // Start job in non-running mode
    cronJob.stop();

    // Store request and job using storage service
    await this.storage.saveRequest(id, scheduledRequest);
    await this.storage.saveJob(id, cronJob);

    if (callbacks?.onScheduled) callbacks.onScheduled(id);

    // Start the job after storing
    cronJob.start();

    return id;
  }

  /**
   * Cancels a scheduled request by its ID
   * @param {string} requestId - The ID of the request to cancel
   * @returns {Promise<boolean>} True if the request was found and cancelled, false otherwise
   */
  async cancelScheduledRequest(requestId: string): Promise<boolean> {
    const cronJob = await this.storage.getJob(requestId);
    if (cronJob) {
      try {
        cronJob.stop();
        await this.storage.deleteJob(requestId);
        await this.storage.deleteRequest(requestId);
        return true;
      } catch (error) {
        console.error(`Failed to stop cron job ${requestId}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Retrieves all scheduled requests
   * @returns {Promise<ScheduledRequest[]>} Array of all scheduled requests
   */
  async getScheduledRequests(): Promise<ScheduledRequest[]> {
    return this.storage.getAllRequests();
  }

  /**
   * Stops all scheduled jobs
   * @returns {Promise<void>}
   */
  async stopAll(): Promise<void> {
    const requests = await this.getScheduledRequests();

    for (const request of requests) {
      await this.cancelScheduledRequest(request.id);
    }

    await this.storage.clear();
  }

  /**
   * Stops the agenda service
   * @returns {Promise<void>}
   */
  public async stop(): Promise<void> {
    await this.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Cancels requests matching the query
   * @param {Object} query - Query to match requests against
   * @returns {Promise<void>}
   */
  public async cancel(query: {}): Promise<void> {
    await this.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
