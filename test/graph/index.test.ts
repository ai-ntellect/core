import { expect } from "chai";
import EventEmitter from "events";
import sinon from "sinon";
import { z } from "zod";
import { GraphController } from "../../graph/controller";
import { GraphFlow } from "../../graph/index";
import { GraphDefinition, Node } from "../../types";

/**
 * ✅ Define a valid schema using Zod.
 */
const TestSchema = z.object({
  value: z.number().default(0),
});

/**
 * ✅ Define the schema type for TypeScript inference.
 */
type TestSchema = typeof TestSchema;

describe("Graph", function () {
  let graph: GraphFlow<TestSchema>;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    graph = new GraphFlow(
      "TestGraph",
      {
        name: "TestGraph",
        nodes: [],
        context: { value: 0 },
        schema: TestSchema,
        eventEmitter: eventEmitter,
      },
      { verbose: true }
    );
  });

  /**
   * ✅ Ensure a simple node executes and updates the context correctly.
   */
  it("should execute a simple node and update the context", async function () {
    const simpleNode: Node<TestSchema> = {
      name: "simpleNode",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 1;
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

    const testNode: Node<TestSchema> = {
      name: "testNode",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 1;
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
    const errorNode: Node<TestSchema> = {
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
    } catch (error) {
      expect((error as Error).message).to.equal("Test error");
    }

    expect(nodeErrorSpy.calledOnce).to.be.true;
  });

  /**
   * ✅ Ensure that context validation using Zod works correctly.
   */
  it("should validate context with Zod", async function () {
    const invalidContext = { value: "invalid_string" };

    try {
      const simpleNode: Node<TestSchema> = {
        name: "simpleNode",
        execute: async (context) => {
          context.value = (context.value ?? 0) + 1;
        },
        next: [],
      };

      graph.addNode(simpleNode);
      await graph.execute("simpleNode", invalidContext as any);
    } catch (error) {
      expect((error as Error & { errors: any[] }).errors[0].message).to.include(
        "Expected number"
      );
    }
  });

  /**
   * ✅ Ensure a node with validated inputs and outputs executes correctly.
   */
  it("should execute a node with validated inputs and outputs", async function () {
    const paramNode: Node<TestSchema, { increment: number }> = {
      name: "paramNode",
      inputs: z.object({
        increment: z.number(),
      }),
      outputs: z.object({
        value: z.number().min(5),
      }),
      execute: async (context, inputs: { increment: number }) => {
        context.value = (context.value ?? 0) + inputs.increment;
      },
      next: [],
    };

    graph.addNode(paramNode);
    await graph.execute("paramNode", { increment: 5 });

    const context = graph.getContext();
    expect(context.value).to.equal(5);
  });

  /**
   * ✅ Ensure a node does not execute if a condition is not met.
   */
  it("should not execute a node when condition is false", async function () {
    const conditionalNode: Node<TestSchema> = {
      name: "conditionalNode",
      condition: (context) => (context.value ?? 0) > 0,
      execute: async (context) => {
        context.value = (context.value ?? 0) + 10;
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
    const retryNode: Node<TestSchema> = {
      name: "retryNode",
      retry: { maxAttempts: 3, delay: 0 },
      execute: async (context) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Temporary failure");
        }
        context.value = (context.value ?? 0) + 1;
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

    const eventNode: Node<TestSchema> = {
      name: "eventNode",
      events: ["customEvent"],
      execute: async (context) => {
        context.value = (context.value ?? 0) + 1;
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
    const testNode: Node<TestSchema> = {
      name: "testNode",
      execute: async () => {},
    };
    graph.addNode(testNode);
    graph.removeNode("testNode");

    expect(graph.getNodes().length).to.equal(0);
  });

  it("should clear and reload the graph using `load`", function () {
    const nodeA: Node<TestSchema> = {
      name: "A",
      execute: async () => {},
    };
    const nodeB: Node<TestSchema> = {
      name: "B",
      execute: async () => {},
    };

    const newDefinition: GraphDefinition<TestSchema> = {
      name: "TestGraph",
      entryNode: "A",
      nodes: [nodeA, nodeB],
      context: { value: 0 },
      schema: TestSchema,
    };

    graph.load(newDefinition);
    expect(graph.getNodes().length).to.equal(2);
    expect(graph.getNodes().map((n) => n.name)).to.include.members(["A", "B"]);
  });

  /**
   * ✅ Test input validation failure
   */
  it("should throw error when node input validation fails", async function () {
    const nodeWithInput: Node<TestSchema, { amount: number }> = {
      name: "inputNode",
      inputs: z.object({
        amount: z.number().min(0),
      }),
      execute: async (context, inputs: { amount: number }) => {
        context.value = (context.value ?? 0) + inputs.amount;
      },
      next: [],
    };

    graph.addNode(nodeWithInput);

    try {
      await graph.execute("inputNode", { amount: -1 });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).to.include(
        "Number must be greater than or equal to 0"
      );
    }
  });

  /**
   * ✅ Test output validation failure
   */
  it("should throw error when node output validation fails", async function () {
    const nodeWithOutput: Node<TestSchema> = {
      name: "outputNode",
      outputs: z.object({
        value: z.number().max(10),
      }),
      execute: async (context) => {
        context.value = 20; // This will fail output validation
      },
      next: [],
    };

    graph.addNode(nodeWithOutput);

    try {
      await graph.execute("outputNode");
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).to.include(
        "Number must be less than or equal to 10"
      );
    }
  });

  /**
   * ✅ Test successful input and output validation
   */
  it("should successfully validate both inputs and outputs", async function () {
    const validatedNode: Node<TestSchema, { increment: number }> = {
      name: "validatedNode",
      inputs: z.object({
        increment: z.number().min(0).max(5),
      }),
      outputs: z.object({
        value: z.number().min(0).max(10),
      }),
      execute: async (context, inputs: { increment: number }) => {
        context.value = (context.value ?? 0) + inputs.increment;
      },
      next: [],
    };

    graph.addNode(validatedNode);

    // Test with valid input that produces valid output
    await graph.execute("validatedNode", { increment: 3 });
    expect(graph.getContext().value).to.equal(3);

    // Test with valid input that would produce invalid output
    try {
      await graph.execute("validatedNode", { increment: 5 }, { value: 7 });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).to.include(
        "Number must be less than or equal to 10"
      );
    }
  });

  /**
   * ✅ Test missing required inputs
   */
  it("should throw error when required inputs are missing", async function () {
    const nodeWithRequiredInput: Node<TestSchema, { required: string }> = {
      name: "requiredInputNode",
      inputs: z.object({
        required: z.string(),
      }),
      execute: async () => {},
      next: [],
    };

    graph.addNode(nodeWithRequiredInput);

    try {
      await graph.execute("requiredInputNode");
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).to.include("Inputs required for node");
    }
  });

  /**
   * ✅ Test complex workflow with multiple branches
   */
  it("should execute a complex workflow with multiple nodes and accumulate the value", async function () {
    const nodeA: Node<TestSchema> = {
      name: "nodeA",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 1;
      },
      next: ["nodeB1", "nodeB2"],
    };

    const nodeB1: Node<TestSchema> = {
      name: "nodeB1",
      execute: async (context) => {
        context.value = (context.value ?? 0) * 2;
      },
      next: ["nodeC"],
    };

    const nodeB2: Node<TestSchema> = {
      name: "nodeB2",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 3;
      },
      next: ["nodeC"],
    };

    const nodeC: Node<TestSchema> = {
      name: "nodeC",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 5;
      },
    };

    [nodeA, nodeB1, nodeB2, nodeC].forEach((node) => graph.addNode(node));

    await graph.execute("nodeA");
    expect(graph.getContext().value).to.equal(15);
  });

  /**
   * ✅ Test conditional workflow branching
   */
  it("should execute different branches based on conditions", async function () {
    const startNode: Node<TestSchema> = {
      name: "start",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 5;
      },
      next: ["end"],
    };

    const endNode: Node<TestSchema> = {
      name: "end",
      execute: async (context) => {
        if ((context.value ?? 0) < 10) {
          context.value = (context.value ?? 0) * 2;
        } else {
          context.value = (context.value ?? 0) + 1;
        }
      },
    };

    [startNode, endNode].forEach((node) => graph.addNode(node));

    await graph.execute("start");
    expect(graph.getContext().value).to.equal(10);
  });

  /**
   * ✅ Test parallel workflow using GraphController
   */
  it("should handle parallel workflows using GraphController", async function () {
    // Graph 1
    const graph1 = new GraphFlow(
      "Graph1",
      {
        name: "Graph1",
        nodes: [],
        context: { value: 0 },
        schema: TestSchema,
      },
      { verbose: true }
    );

    const processNode1: Node<TestSchema> = {
      name: "process1",
      execute: async (context) => {
        context.value = 1;
      },
      next: ["finalize1"],
    };

    const finalizeNode1: Node<TestSchema> = {
      name: "finalize1",
      execute: async (context) => {
        context.value = (context.value ?? 0) * 2;
      },
    };

    // Graph 2
    const graph2 = new GraphFlow(
      "Graph2",
      {
        name: "Graph2",
        nodes: [],
        context: { value: 0 },
        schema: TestSchema,
      },
      { verbose: true }
    );

    const processNode2: Node<TestSchema> = {
      name: "process2",
      execute: async (context) => {
        context.value = 2;
      },
      next: ["finalize2"],
    };

    const finalizeNode2: Node<TestSchema> = {
      name: "finalize2",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 3;
      },
    };

    graph1.addNode(processNode1);
    graph1.addNode(finalizeNode1);
    graph2.addNode(processNode2);
    graph2.addNode(finalizeNode2);

    const results = await GraphController.executeParallel(
      [graph1, graph2],
      ["process1", "process2"],
      2,
      [{}, {}]
    );

    expect(results[0].value).to.equal(2); // Graph1: 1 * 2
    expect(results[1].value).to.equal(5); // Graph2: 2 + 3
  });

  /**
   * ✅ Test sequential workflow using GraphController
   */
  it("should handle sequential workflows using GraphController", async function () {
    // Graph 1
    const graph1 = new GraphFlow(
      "Graph1",
      {
        name: "Graph1",
        nodes: [],
        context: { value: 1 },
        schema: TestSchema,
      },
      { verbose: true }
    );

    const startNode1: Node<TestSchema> = {
      name: "start1",
      execute: async (context) => {
        context.value = (context.value ?? 0) * 2;
      },
    };

    // Graph 2
    const graph2 = new GraphFlow(
      "Graph2",
      {
        name: "Graph2",
        nodes: [],
        context: { value: 3 },
        schema: TestSchema,
      },
      { verbose: true }
    );

    const startNode2: Node<TestSchema> = {
      name: "start2",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 2;
      },
    };

    graph1.addNode(startNode1);
    graph2.addNode(startNode2);

    const results = await GraphController.executeSequential(
      [graph1, graph2],
      ["start1", "start2"],
      [{}, {}]
    );

    expect(results[0].value).to.equal(2); // Graph1: 1 * 2
    expect(results[1].value).to.equal(5); // Graph2: 3 + 2
  });
});
