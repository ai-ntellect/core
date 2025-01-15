import EventEmitter from "events";
import { IEventHandler, QueueItem, QueueResult } from "../../types";

export class EventHandler implements IEventHandler {
  constructor(private readonly eventEmitter: EventEmitter) {}

  emitQueueStart(actions: QueueItem[]) {
    this.eventEmitter.emit("orchestrator-update", {
      type: "queue-start",
      actions,
    });
  }

  emitActionStart(action: QueueItem) {
    this.eventEmitter.emit("orchestrator-update", {
      type: "action-start",
      action: action.name,
      args: action.parameters,
    });
  }

  emitActionComplete(action: QueueResult) {
    this.eventEmitter.emit("orchestrator-update", {
      type: "action-complete",
      action: action.name,
      result: action.result,
    });
  }

  emitQueueComplete() {
    this.eventEmitter.emit("orchestrator-update", {
      type: "queue-complete",
    });
  }
}
