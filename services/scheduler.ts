import { Orchestrator } from "../llm/orchestrator";
import { ActionSchema, ScheduledAction, ScheduledActionEvents } from "../types";
import { ActionQueueManager } from "./queue";

export class ActionScheduler {
  private scheduledActions: Map<string, NodeJS.Timeout> = new Map();
  private storage: ScheduledActionStorage;
  private events: ScheduledActionEvents;

  constructor(
    private actionQueueManager: ActionQueueManager,
    private orchestrator: Orchestrator,
    events: ScheduledActionEvents = {}
  ) {
    this.storage = new ScheduledActionStorage();
    this.events = events;
    this.initializeScheduledActions();
  }

  async scheduleAction(
    action: ActionSchema,
    scheduledTime: Date,
    userId: string,
    recurrence?: ScheduledAction["recurrence"]
  ): Promise<string> {
    const scheduledAction: ScheduledAction = {
      id: crypto.randomUUID(),
      action: {
        name: action.name,
        parameters: [],
      },
      scheduledTime,
      userId,
      status: "pending",
      recurrence,
    };

    await this.storage.saveScheduledAction(scheduledAction);
    this.scheduleExecution(scheduledAction);
    this.events.onActionScheduled?.(scheduledAction);

    return scheduledAction.id;
  }

  private async initializeScheduledActions() {
    const pendingActions = await this.storage.getPendingActions();
    pendingActions.forEach((action) => this.scheduleExecution(action));
  }

  private scheduleExecution(scheduledAction: ScheduledAction) {
    const now = new Date();
    const delay = scheduledAction.scheduledTime.getTime() - now.getTime();

    if (delay < 0) return;

    const timeout = setTimeout(async () => {
      try {
        await this.executeScheduledAction(scheduledAction);

        if (scheduledAction.recurrence) {
          const nextExecutionTime = this.calculateNextExecutionTime(
            scheduledAction.scheduledTime,
            scheduledAction.recurrence
          );
          const actionSchema = this.orchestrator.tools.find(
            (tool: ActionSchema) => tool.name === scheduledAction.action.name
          );
          if (actionSchema) {
            await this.scheduleAction(
              actionSchema,
              nextExecutionTime,
              scheduledAction.userId,
              scheduledAction.recurrence
            );
          }
        }
      } catch (error) {
        console.error(
          `Failed to execute scheduled action ${scheduledAction.id}:`,
          error
        );
        await this.storage.updateActionStatus(scheduledAction.id, "failed");
      }
    }, delay);

    this.scheduledActions.set(scheduledAction.id, timeout);
  }

  private async executeScheduledAction(scheduledAction: ScheduledAction) {
    try {
      this.events.onActionStart?.(scheduledAction);

      this.actionQueueManager.addToQueue({
        name: scheduledAction.action.name,
        parameters: scheduledAction.action.parameters,
      });

      const result = await this.actionQueueManager.processQueue();
      await this.storage.updateActionStatus(scheduledAction.id, "completed");

      this.events.onActionComplete?.(scheduledAction, result);
    } catch (error) {
      await this.storage.updateActionStatus(scheduledAction.id, "failed");
      this.events.onActionFailed?.(scheduledAction, error as Error);
      throw error;
    }
  }

  private calculateNextExecutionTime(
    currentTime: Date,
    recurrence: NonNullable<ScheduledAction["recurrence"]>
  ): Date {
    const nextTime = new Date(currentTime);

    switch (recurrence.type) {
      case "daily":
        nextTime.setDate(nextTime.getDate() + recurrence.interval);
        break;
      case "weekly":
        nextTime.setDate(nextTime.getDate() + 7 * recurrence.interval);
        break;
      case "monthly":
        nextTime.setMonth(nextTime.getMonth() + recurrence.interval);
        break;
    }

    return nextTime;
  }

  async cancelScheduledAction(actionId: string): Promise<boolean> {
    const timeout = this.scheduledActions.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      this.scheduledActions.delete(actionId);
      await this.storage.deleteScheduledAction(actionId);
      this.events.onActionCancelled?.(actionId);
      return true;
    }
    return false;
  }
}

class ScheduledActionStorage {
  private actions: ScheduledAction[] = [];

  async saveScheduledAction(action: ScheduledAction): Promise<void> {
    this.actions.push(action);
  }

  async getPendingActions(): Promise<ScheduledAction[]> {
    return this.actions.filter((action) => action.status === "pending");
  }

  async updateActionStatus(
    actionId: string,
    status: ScheduledAction["status"]
  ): Promise<void> {
    const action = this.actions.find((a) => a.id === actionId);
    if (action) {
      action.status = status;
    }
  }

  async deleteScheduledAction(actionId: string): Promise<void> {
    this.actions = this.actions.filter((a) => a.id !== actionId);
  }
}
