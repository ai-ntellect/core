import { expect } from "chai";
import sinon from "sinon";
import { z } from "zod";
import { Graph } from "../../graph";
import { GraphContext, GraphDefinition, Node } from "../../types";

/**
 * ✅ Define a valid schema using Zod.
 */
const TestSchema = z.object({
  value: z.number(),
});

/**
 * ✅ Define the schema type for TypeScript inference.
 */
type TestSchemaType = z.infer<typeof TestSchema>;

describe("Graph", function () {
  let graph: Graph<typeof TestSchema>;

  beforeEach(() => {
    graph = new Graph("TestGraph", {
      name: "TestGraph",
      nodes: [],
      initialContext: { value: 0 } as GraphContext<typeof TestSchema>,
      validator: TestSchema,
    });
  });

  /**
   * ✅ Ensure a simple node executes and updates the context correctly.
   */
  it("should execute a simple node and update the context", async function () {
    const simpleNode: Node<typeof TestSchema> = {
      name: "simpleNode",
      execute: async (context: any) => {
        context.value += 1;
      },
      next: [],
    };

    graph.addNode(simpleNode);
    await graph.execute("simpleNode");

    const context = graph.getContext();
    expect(context.value).to.equal(1);
  });

  /**
   * ✅ Verify that `nodeStarted` and `nodeCompleted` events are triggered.
   */
  it("should trigger `nodeStarted` and `nodeCompleted` events", async function () {
    const nodeStartedSpy = sinon.spy();
    const nodeCompletedSpy = sinon.spy();

    graph.on("nodeStarted", nodeStartedSpy);
    graph.on("nodeCompleted", nodeCompletedSpy);

    const testNode: Node<typeof TestSchema> = {
      name: "testNode",
      execute: async (context: any) => {
        context.value += 1;
      },
      next: [],
    };

    graph.addNode(testNode);
    await graph.execute("testNode");

    expect(nodeStartedSpy.calledOnce).to.be.true;
    expect(nodeCompletedSpy.calledOnce).to.be.true;
  });

  /**
   * ✅ Ensure an error is thrown when a node fails and `nodeError` event is triggered.
   */
  it("should handle errors and trigger `nodeError` event", async function () {
    const errorNode: Node<typeof TestSchema> = {
      name: "errorNode",
      execute: async () => {
        throw new Error("Test error");
      },
      next: [],
    };

    graph.addNode(errorNode);
    const nodeErrorSpy = sinon.spy();
    graph.on("nodeError", nodeErrorSpy);

    try {
      await graph.execute("errorNode");
    } catch (error: any) {
      expect(error.message).to.equal("Test error");
    }

    expect(nodeErrorSpy.calledOnce).to.be.true;
  });

  /**
   * ✅ Ensure a node requiring user confirmation waits before execution.
   */
  it("should execute a node requiring user confirmation", async function () {
    const confirmationNode: Node<typeof TestSchema> = {
      name: "waitUserConfirmation",
      execute: async (context: any) => {
        return new Promise<void>((resolve) => {
          graph.on("userConfirmed", () => {
            context.value += 1;
            resolve();
          });
        });
      },
      next: [],
    };

    graph.addNode(confirmationNode);
    graph.addNode({
      name: "simpleNode",
      execute: async (context: any) => {
        context.value += 1;
      },
      next: [],
    });

    const executionPromise = graph.execute("waitUserConfirmation");

    setTimeout(() => {
      graph.emit("userConfirmed");
    }, 100);

    await executionPromise;
    const context = graph.getContext();
    expect(context.value).to.equal(1);
  });

  /**
   * ✅ Ensure that context validation using Zod works correctly.
   */
  it("should validate context with Zod", async function () {
    const invalidContext = { value: "invalid_string" };

    try {
      const simpleNode: Node<typeof TestSchema> = {
        name: "simpleNode",
        execute: async (context: GraphContext<typeof TestSchema>) => {
          context.value += 1;
        },
        next: [],
      };

      graph.addNode(simpleNode);
      await graph.execute("simpleNode", invalidContext as any);
    } catch (error: any) {
      expect(error.errors[0].message).to.include("Expected number");
    }
  });

  /**
   * ✅ Ensure a node with validated parameters executes correctly.
   */
  it("should execute a node with validated parameters", async function () {
    const paramNode: Node<typeof TestSchema> = {
      name: "paramNode",
      parameters: z.object({
        increment: z.number(),
      }),
      executeWithParams: async (
        context: any,
        params: { increment: number }
      ) => {
        context.value += params.increment;
      },
      next: [],
    };

    graph.addNode(paramNode);
    await graph.execute("paramNode", {}, { increment: 5 });

    const context = graph.getContext();
    expect(context.value).to.equal(5);
  });

  /**
   * ✅ Ensure a node does not execute if a condition is not met.
   */
  it("should not execute a node when condition is false", async function () {
    const conditionalNode: Node<typeof TestSchema> = {
      name: "conditionalNode",
      condition: (context: any) => context.value > 0,
      execute: async (context: any) => {
        context.value += 10;
      },
      next: [],
    };

    graph.addNode(conditionalNode);
    await graph.execute("conditionalNode");

    const context = graph.getContext();
    expect(context.value).to.equal(0);
  });

  /**
   * ✅ Ensure that a node retries execution when it fails.
   */
  it("should retry a node execution when it fails", async function () {
    let attemptCount = 0;
    const retryNode: Node<typeof TestSchema> = {
      name: "retryNode",
      retry: { maxAttempts: 3, delay: 0 },
      execute: async (context: any) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Temporary failure");
        }
        context.value += 1;
      },
      next: [],
    };

    graph.addNode(retryNode);
    await graph.execute("retryNode");

    const context = graph.getContext();
    expect(context.value).to.equal(1);
    expect(attemptCount).to.equal(3);
  });

  /**
   * ✅ Ensure dynamic event-based execution works via `emit`.
   */
  it("should trigger a node execution from an event", async function () {
    this.timeout(5000); // Ensure we have enough time to complete the test

    const eventNode: Node<typeof TestSchema> = {
      name: "eventNode",
      events: ["customEvent"],
      execute: async (context: any) => {
        context.value += 1;
      },
      next: [],
    };

    graph.addNode(eventNode);

    // Use a promise to ensure the event is properly handled
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Event did not trigger")),
        1500
      );

      graph.on("nodeCompleted", ({ name }) => {
        if (name === "eventNode") {
          clearTimeout(timeout);
          resolve();
        }
      });

      graph.emit("customEvent").catch(reject);
    });

    const context = graph.getContext();
    expect(context.value).to.equal(1);
  });

  /**
   * ✅ Ensure that removing a node works correctly.
   */
  it("should remove a node from the graph", function () {
    const testNode: Node<typeof TestSchema> = {
      name: "testNode",
      execute: async () => {},
    };
    graph.addNode(testNode);
    graph.removeNode("testNode");

    expect(graph.getNodes().length).to.equal(0);
  });

  it("should clear and reload the graph using `loadDefinition`", function () {
    const nodeA: Node<typeof TestSchema> = {
      name: "A",
      execute: async () => {},
    };
    const nodeB: Node<typeof TestSchema> = {
      name: "B",
      execute: async () => {},
    };

    const newDefinition: GraphDefinition<typeof TestSchema> = {
      name: "TestGraph",
      entryNode: "A",
      nodes: { A: nodeA, B: nodeB },
    };

    graph.loadDefinition(newDefinition);
    expect(graph.getNodes().length).to.equal(2);
    expect(graph.getNodes().map((n) => n.name)).to.include.members(["A", "B"]);
  });
});
