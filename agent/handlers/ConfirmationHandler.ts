import EventEmitter from "events";

export class ConfirmationHandler {
  private readonly CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly eventEmitter: EventEmitter) {}

  async handleConfirmationRequest(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmationId = Date.now().toString();
      const handleConfirmation = (data: any) => {
        if (data.confirmationId === confirmationId) {
          this.eventEmitter.removeListener(
            "confirmation-response",
            handleConfirmation
          );
          resolve(data.confirmed);
        }
      };

      this.eventEmitter.once("confirmation-response", handleConfirmation);
      this.eventEmitter.emit("orchestrator-update", {
        type: "confirmation-required",
        id: confirmationId,
        message,
      });

      setTimeout(() => {
        this.eventEmitter.removeListener(
          "confirmation-response",
          handleConfirmation
        );
        resolve(false);
      }, this.CONFIRMATION_TIMEOUT);
    });
  }
}
