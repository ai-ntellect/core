import { Queue } from "../../services/queue";
import { ActionSchema, QueueCallbacks, QueueItem } from "../../types";
import { expect } from "chai";
import { z } from "zod";

describe("Queue", () => {
  // Test actions setup
  const testActions: ActionSchema[] = [
    {
      name: "action1",
      description: "Test action 1",
      parameters: z.object({}),
      execute: async (params) => ({ success: true, params }),
    },
    {
      name: "action2",
      description: "Test action 2",
      parameters: z.object({}),
      execute: async (params) => ({ success: true, params }),
      confirmation: {
        requireConfirmation: true,
        message: "Confirm action2?",
      },
    },
    {
      name: "actionWithError",
      description: "Test error action",
      parameters: z.object({}),
      execute: async () => {
        throw new Error("Test error");
      },
    },
  ];

  let queue: Queue;
  let callbacks: QueueCallbacks;

  beforeEach(() => {
    // Reset callbacks for each test
    callbacks = {
      onActionStart: () => {},
      onActionComplete: () => {},
      onQueueComplete: () => {},
      onConfirmationRequired: async () => true,
    };
    queue = new Queue(testActions, callbacks);
  });

  describe("Queue Management", () => {
    it("should add a single action to the queue", () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [{ name: "param1", value: "value1" }],
      };

      queue.add(action);
      expect(queue["queue"]).to.have.lengthOf(1);
      expect(queue["queue"][0]).to.deep.equal(action);
    });

    it("should add multiple actions to the queue", () => {
      const actions: QueueItem[] = [
        {
          name: "action1",
          parameters: [{ name: "param1", value: "value1" }],
        },
        {
          name: "action2",
          parameters: [{ name: "param2", value: "value2" }],
        },
      ];

      queue.add(actions);
      expect(queue["queue"]).to.have.lengthOf(2);
      expect(queue["queue"]).to.deep.equal(actions);
    });
  });

  describe("Action Execution", () => {
    it("should execute a single action successfully", async () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [{ name: "param1", value: "value1" }],
      };

      queue.add(action);
      const results = await queue.execute();
      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(results).to.have.lengthOf(1);
      expect(results[0].name).to.equal("action1");
      expect(results[0].error).to.be.null;
      expect(results[0].result).to.deep.include({ success: true });
    });

    it("should handle action execution errors", async () => {
      const action: QueueItem = {
        name: "actionWithError",
        parameters: [],
      };

      queue.add(action);
      const results = await queue.execute();
      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(results).to.have.lengthOf(1);
      expect(results[0].name).to.equal("actionWithError");
      expect(results[0].error).to.equal("Test error");
      expect(results[0].result).to.be.null;
    });

    it("should respect confirmation requirements", async () => {
      let confirmationCalled = false;
      callbacks.onConfirmationRequired = async () => {
        confirmationCalled = true;
        return false; // Reject the confirmation
      };

      queue = new Queue(testActions, callbacks);
      const action: QueueItem = {
        name: "action2", // Action requiring confirmation
        parameters: [],
      };

      queue.add(action);
      const results = await queue.execute();
      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(confirmationCalled).to.be.true;
      expect(results[0].cancelled).to.be.true;
      expect(results[0].error).to.equal("Action cancelled by user");
    });
  });

  describe("Parameter Handling", () => {
    it("should correctly format simple parameters", async () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [
          { name: "param1", value: "value1" },
          { name: "param2", value: "value2" },
        ],
      };

      queue.add(action);
      const results = await queue.execute();
      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(results[0].parameters).to.deep.equal({
        param1: "value1",
        param2: "value2",
      });
    });

    it("should handle JSON stringified parameters", async () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [
          {
            name: "jsonParam",
            value: JSON.stringify({ name: "test", value: "value" }),
          },
        ],
      };

      queue.add(action);
      const results = await queue.execute();
      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(results[0].parameters).to.deep.equal({
        test: "value",
      });
    });
  });

  describe("Queue Processing State", () => {
    it("should prevent concurrent queue processing", async () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [],
      };

      queue.add(action);

      // Start first execution
      const firstExecution = queue.execute();
      // Try to execute again while first execution is running
      const secondExecution = queue.execute();

      const [firstResults, secondResults] = await Promise.all([
        firstExecution,
        secondExecution,
      ]);

      expect(firstResults).to.not.be.undefined;
      expect(firstResults).to.have.lengthOf(1);
      expect(secondResults).to.be.undefined;
    });

    it("should reset processing state after completion", async () => {
      const action: QueueItem = {
        name: "action1",
        parameters: [],
      };

      queue.add(action);
      const results = await queue.execute();

      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.have.lengthOf(1);

      // Verify that isProcessing is reset
      expect(queue["isProcessing"]).to.be.false;

      // Clear both queue and results before adding new action
      queue["queue"] = [];
      queue["results"] = [];

      // Should be able to execute again
      queue.add(action);
      const secondResults = await queue.execute();

      if (!secondResults) {
        throw new Error("Second results are undefined");
      }
      expect(secondResults).to.have.lengthOf(1);
    });
  });

  describe("Callback Handling", () => {
    it("should trigger all callbacks in correct order", async () => {
      const callbackOrder: string[] = [];

      callbacks = {
        onActionStart: () => callbackOrder.push("start"),
        onActionComplete: () => callbackOrder.push("complete"),
        onQueueComplete: () => callbackOrder.push("queueComplete"),
      };

      queue = new Queue(testActions, callbacks);
      const action: QueueItem = {
        name: "action1",
        parameters: [],
      };

      queue.add(action);
      await queue.execute();

      expect(callbackOrder).to.deep.equal([
        "start",
        "complete",
        "queueComplete",
      ]);
    });

    it("should handle missing callbacks gracefully", async () => {
      queue = new Queue(testActions, {}); // No callbacks provided
      const action: QueueItem = {
        name: "action1",
        parameters: [],
      };

      queue.add(action);
      const results = await queue.execute();

      if (!results) {
        throw new Error("Results are undefined");
      }
      expect(results).to.not.be.undefined;
      expect(results).to.have.lengthOf(1);
      expect(results[0].error).to.be.null;
    });
  });
});
