import cron from "node-cron";
import { ICronJob, ICronService } from "../../../../interfaces";

/**
 * @module NodeCronAdapter
 * @description Adapter implementation for node-cron service.
 * Provides a bridge between the application's scheduling interface and the node-cron library.
 * @implements {ICronService}
 */
export class NodeCronAdapter implements ICronService {
  /**
   * Schedules a new cron job
   * @param {string} expression - Cron expression defining the schedule
   * @param {Function} callback - Function to be executed when the schedule triggers
   * @returns {ICronJob} Interface for controlling the scheduled job
   */
  schedule(expression: string, callback: () => void): ICronJob {
    const job = cron.schedule(expression, callback);

    return {
      start: () => job.start(),
      stop: () => job.stop(),
    };
  }
}
