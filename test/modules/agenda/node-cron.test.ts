import { expect } from "chai";
import sinon from "sinon";
import { Agenda } from "../../../modules/agenda";
import { NodeCronAdapter } from "../../../modules/agenda/adapters/cron/node-cron";
import { InMemoryAdapter } from "../../../modules/memory/adapters/in-memory";

before(function () {
  this.timeout(10000);
});

describe("Agenda Service", () => {
  let agenda: Agenda;
  const scheduledIds: string[] = []; // Track all scheduled request IDs

  beforeEach(() => {
    const cronService = new NodeCronAdapter();
    const jobStorage = new InMemoryAdapter();
    agenda = new Agenda(cronService, jobStorage);
  });

  afterEach(async () => {
    // Cancel all scheduled requests by their IDs
    scheduledIds.forEach((id) => agenda.cancelScheduledRequest(id));
    scheduledIds.length = 0; // Clear the array

    // Ensure all tasks are stopped
    await agenda.stop();

    await agenda.cancel({});

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("Request Scheduling", () => {
    it("should schedule a new request and return an id", async () => {
      const request = {
        originalRequest: "test request",
        cronExpression: "0 0 * * *",
      };

      const id = await agenda.scheduleRequest(request);
      scheduledIds.push(id); // Track the ID

      expect(id).to.be.a("string");
      expect(agenda.getScheduledRequests()).to.have.lengthOf(1);

      const scheduledRequest = agenda.getScheduledRequests()[0];
      expect(scheduledRequest.originalRequest).to.equal(
        request.originalRequest
      );
      expect(scheduledRequest.cronExpression).to.equal(request.cronExpression);
      expect(scheduledRequest.isRecurring).to.be.false;

      agenda.cancelScheduledRequest(id);
    });

    it("should execute callbacks when scheduling and executing", async function () {
      this.timeout(5000);

      const onScheduledSpy = sinon.spy();
      const onExecutedSpy = sinon.spy();

      const request = {
        originalRequest: "test request",
        cronExpression: `${(new Date().getSeconds() + 1) % 60} * * * * *`,
      };

      const id = await agenda.scheduleRequest(request, {
        onScheduled: onScheduledSpy,
        onExecuted: onExecutedSpy,
      });
      scheduledIds.push(id);

      expect(onScheduledSpy.calledOnce).to.be.true;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Callback execution timeout"));
        }, 4000);

        const checkExecution = () => {
          if (onExecutedSpy.calledOnce) {
            clearTimeout(timeout);
            agenda.cancelScheduledRequest(id);
            resolve();
            return;
          }
          setTimeout(checkExecution, 100);
        };
        checkExecution();
      });

      expect(onExecutedSpy.calledOnce).to.be.true;
    });
  });

  describe("Request Management", () => {
    it("should cancel a scheduled request", async () => {
      const request = {
        originalRequest: "test request",
        cronExpression: "*/1 * * * *",
      };

      const id = await agenda.scheduleRequest(request);
      scheduledIds.push(id);
      const requests = await agenda.getScheduledRequests();
      expect(requests).to.have.lengthOf(1);

      const cancelled = await agenda.cancelScheduledRequest(id);
      expect(cancelled).to.be.true;
      const remainingRequests = await agenda.getScheduledRequests();
      expect(remainingRequests).to.have.lengthOf(0);
    });

    it("should return false when cancelling non-existent request", async () => {
      const cancelled = await agenda.cancelScheduledRequest("non-existent-id");
      expect(cancelled).to.be.false;
    });

    it("should get all scheduled requests", async () => {
      const requests = [
        {
          originalRequest: "request 1",
          cronExpression: "*/1 * * * *",
        },
        {
          originalRequest: "request 2",
          cronExpression: "*/5 * * * *",
        },
      ];

      for (const request of requests) {
        const id = await agenda.scheduleRequest(request);
        scheduledIds.push(id);
      }

      const scheduledRequests = await agenda.getScheduledRequests();
      expect(scheduledRequests).to.have.lengthOf(2);
      expect(scheduledRequests[0].originalRequest).to.equal("request 1");
      expect(scheduledRequests[1].originalRequest).to.equal("request 2");
    });
  });

  describe("Global Management", () => {
    it("should stop all scheduled requests", async () => {
      const requests = [
        {
          originalRequest: "request 1",
          cronExpression: "*/1 * * * *",
        },
        {
          originalRequest: "request 2",
          cronExpression: "*/5 * * * *",
        },
      ];

      for (const request of requests) {
        await agenda.scheduleRequest(request);
      }

      const initialRequests = await agenda.getScheduledRequests();
      expect(initialRequests).to.have.lengthOf(2);

      await agenda.stopAll();
      const remainingRequests = await agenda.getScheduledRequests();
      expect(remainingRequests).to.have.lengthOf(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle execution errors gracefully", async () => {
      const consoleSpy = sinon.spy(console, "error");

      const request = {
        originalRequest: "error request",
        cronExpression: "0 0 * * *",
      };

      const id = await agenda.scheduleRequest(request);

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(consoleSpy.called).to.be.false;

      agenda.cancelScheduledRequest(id);
      consoleSpy.restore();
    });
  });

  describe("Request Execution", () => {
    it("should execute non-recurring requests only once", async function () {
      this.timeout(5000);
      const onExecutedSpy = sinon.spy();

      const request = {
        originalRequest: "single execution",
        cronExpression: `${new Date().getSeconds() + 1} * * * * *`,
      };

      const id = await agenda.scheduleRequest(request, {
        onExecuted: onExecutedSpy,
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Test timeout")),
            4000
          );
          const checkExecution = () => {
            if (onExecutedSpy.calledOnce) {
              clearTimeout(timeout);
              resolve();
              return;
            }
            setTimeout(checkExecution, 100);
          };
          checkExecution();
        });
      } finally {
        agenda.cancelScheduledRequest(id);
      }

      expect(onExecutedSpy.calledOnce).to.be.true;
      expect(agenda.getScheduledRequests()).to.have.lengthOf(0);
    });

    it("should log execution status", async function () {
      this.timeout(10000);
      const consoleLogSpy = sinon.spy(console, "log");

      const request = {
        originalRequest: "test request",
        cronExpression: `${new Date().getSeconds() + 1} * * * * *`,
      };

      const id = await agenda.scheduleRequest(request);

      await new Promise<void>((resolve) => {
        const checkExecution = () => {
          if (
            consoleLogSpy.calledWith(`🔄 Executing scheduled request: ${id}`) &&
            consoleLogSpy.calledWith(
              `✅ Scheduled request executed successfully: ${id}`
            )
          ) {
            agenda.cancelScheduledRequest(id);
            resolve();
            return;
          }
          setTimeout(checkExecution, 100);
        };
        checkExecution();
      });

      expect(consoleLogSpy.calledWith(`🔄 Executing scheduled request: ${id}`))
        .to.be.true;
      expect(
        consoleLogSpy.calledWith(
          `✅ Scheduled request executed successfully: ${id}`
        )
      ).to.be.true;

      consoleLogSpy.restore();
    });
  });
});

let globalAgenda: Agenda;
before(() => {
  const cronService = new NodeCronAdapter();
  const jobStorage = new InMemoryAdapter();
  globalAgenda = new Agenda(cronService, jobStorage);
});

after(async () => {
  if (globalAgenda) {
    globalAgenda.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await globalAgenda.stop();
  await globalAgenda.cancel({});
  await new Promise((resolve) => setTimeout(resolve, 100));
});
