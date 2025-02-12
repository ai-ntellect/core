import { expect } from "chai";
import EventEmitter from "events";
import sinon from "sinon";
import { z } from "zod";
import { GraphController } from "../../graph/controller";
import { GraphFlow } from "../../graph/index";
import { GraphContext, GraphDefinition, Node } from "../../types";

/**
 * Test schema definition using Zod for graph context validation
 * Defines a schema with:
 * - value: numeric value for tracking state changes
 * - eventPayload: optional object containing transaction metadata
 */
const TestSchema = z.object({
  value: z.number().default(0),
  eventPayload: z
    .object({
      transactionId: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

type TestSchema = typeof TestSchema;

/**
 * Test suite for the Graph Flow implementation
 * This suite validates the core functionality of the graph-based workflow system:
 * - Node execution and state management through context
 * - Event handling (emission, correlation, waiting)
 * - Error handling and retry mechanisms
 * - Input/Output validation using Zod schemas
 * - Complex workflows with multiple branches and conditions
 * - Parallel and sequential execution patterns
 *
 * The tests use a simple numeric value-based context to demonstrate state changes
 * and a transaction-based event payload for testing event correlation.
 */
describe("GraphFlow", function () {
  let graph: GraphFlow<TestSchema>;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    graph = new GraphFlow("TestGraph", {
      name: "TestGraph",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
      eventEmitter: eventEmitter,
    });
  });

  /**
   * Tests basic node execution and context update functionality
   * Validates that:
   * - A node can be added to the graph
   * - The node's execute function is called
   * - The context is properly updated
   * - The updated context is accessible after execution
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
   * Tests event emission for node lifecycle events
   * Validates that the graph properly emits events for:
   * - Node execution start (nodeStarted)
   * - Node execution completion (nodeCompleted)
   * This is crucial for monitoring and debugging workflow execution
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
   * Tests error handling and error event emission
   * Validates that:
   * - Errors in node execution are properly caught
   * - The nodeError event is emitted
   * - The error message is preserved
   * This ensures robust error handling in the workflow
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
   * Tests context validation using Zod schema
   * Validates that:
   * - Invalid context values are rejected
   * - Proper error messages are generated
   * - Type safety is maintained during execution
   * This ensures data integrity throughout the workflow
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
   * Tests node execution with input/output validation
   * Demonstrates:
   * - Input parameter validation
   * - Output state validation
   * - Integration between node execution and validation
   * Ensures type safety and data consistency in node interactions
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
      execute: async (context, inputs?: { increment: number }) => {
        if (!inputs) throw new Error("Inputs required");
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
   * Tests conditional node execution
   * Validates that:
   * - Nodes can have conditional execution logic
   * - Conditions are evaluated against current context
   * - Nodes are skipped when conditions are not met
   * This enables dynamic workflow paths based on state
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
   * Tests node retry functionality
   * Validates the retry mechanism:
   * - Maximum attempt limits
   * - Retry delays
   * - Success after retry
   * - Context preservation between attempts
   * Essential for handling transient failures in workflows
   */
  it("should retry a node execution when it fails", async () => {
    let attempts = 0;
    const retryNode: Node<TestSchema> = {
      name: "retryNode",
      execute: async (context) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        context.value = 42;
      },
      retry: {
        maxAttempts: 3,
        delay: 100,
      },
    };

    const graph = new GraphFlow("test", {
      name: "test",
      schema: TestSchema,
      context: { value: 0 },
      nodes: [retryNode],
    });

    await graph.execute("retryNode");
    expect(attempts).to.equal(3);
    expect(graph.getContext().value).to.equal(42);
  });

  /**
   * Tests node removal functionality
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

  /**
   * Tests graph reloading functionality
   */
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
   * Tests input validation error handling
   */
  it("should throw error when node input validation fails", async () => {
    const node: Node<TestSchema> = {
      name: "test",
      inputs: z.object({
        value: z.number().min(0),
      }),
      execute: async (context, inputs) => {
        if (!inputs) throw new Error("Inputs required");
        context.value = inputs.value;
      },
    };

    const graph = new GraphFlow("test", {
      name: "test",
      schema: TestSchema,
      context: { value: 0 },
      nodes: [node],
    });

    try {
      await graph.execute("test", { value: -1 });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).to.include("Number must be greater than or equal");
    }
  });

  /**
   * Tests output validation error handling
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
   * Tests successful input/output validation flow
   */
  it("should successfully validate both inputs and outputs", async function () {
    const graph = new GraphFlow("test", {
      name: "test",
      schema: TestSchema,
      context: { value: 0 },
      nodes: [],
    });

    const validatedNode: Node<TestSchema, { increment: number }> = {
      name: "validatedNode",
      inputs: z.object({
        increment: z.number().min(0).max(5),
      }),
      outputs: z.object({
        value: z.number().min(0).max(10),
      }),
      execute: async (context, inputs?: { increment: number }) => {
        if (!inputs) throw new Error("Inputs required");
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
   * Tests handling of missing required inputs
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
   * Tests complex workflow execution with multiple branches
   * Demonstrates:
   * - Multiple execution paths
   * - Node chaining
   * - Parallel branch execution
   * - Context accumulation across branches
   * This validates the graph's ability to handle complex business processes
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
   * Tests conditional branching in workflows
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
   * Tests parallel workflow execution using GraphController
   * Validates:
   * - Multiple graph execution in parallel
   * - Independent context maintenance
   * - Proper result aggregation
   * - Concurrency control
   * Essential for scaling workflow processing
   */
  it("should handle parallel workflows using GraphController", async function () {
    // Graph 1
    const graph1 = new GraphFlow("Graph1", {
      name: "Graph1",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
    });

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
    const graph2 = new GraphFlow("Graph2", {
      name: "Graph2",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
    });

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
   * Tests sequential workflow execution using GraphController
   */
  it("should handle sequential workflows using GraphController", async function () {
    // Graph 1
    const graph1 = new GraphFlow("Graph1", {
      name: "Graph1",
      nodes: [],
      context: { value: 1 },
      schema: TestSchema,
    });

    const startNode1: Node<TestSchema> = {
      name: "start1",
      execute: async (context) => {
        context.value = (context.value ?? 0) * 2;
      },
    };

    // Graph 2
    const graph2 = new GraphFlow("Graph2", {
      name: "Graph2",
      nodes: [],
      context: { value: 3 },
      schema: TestSchema,
    });

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

  /**
   * Tests event correlation functionality
   * Demonstrates:
   * - Event correlation based on transaction ID
   * - Timeout handling
   * - Multiple event synchronization
   * - Context updates after correlation
   * Critical for integrating with external event sources
   */
  it("should handle correlated events correctly", async function () {
    this.timeout(10000);
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
      eventEmitter: new EventEmitter(),
    });

    let eventsReceived = 0;
    const node = {
      name: "testNode",
      waitForEvents: {
        events: ["eventA", "eventB"],
        timeout: 5000,
        strategy: "all" as const,
      },
      execute: async (context: GraphContext<typeof TestSchema>) => {
        eventsReceived = 2;
        context.value = 42;
      },
    };

    graph.addNode(node);

    graph.execute("testNode");

    await new Promise((resolve) => setTimeout(resolve, 500));

    await graph.emit("eventA", { eventPayload: { status: "A" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await graph.emit("eventB", { eventPayload: { status: "B" } });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(eventsReceived).to.equal(2);
    expect(graph.getContext().value).to.equal(42);
  });

  /**
   * Tests multiple event waiting functionality
   */
  it("should wait for multiple events before continuing", async function () {
    this.timeout(10000);
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
      eventEmitter: new EventEmitter(),
    });

    const node = {
      name: "testNode",
      waitForEvents: {
        events: ["event1", "event2"],
        timeout: 5000,
        strategy: "all" as const,
      },
      execute: async (context: GraphContext<typeof TestSchema>) => {
        context.value = 42; // Ajouter une modification du contexte
      },
    };

    graph.addNode(node);
    graph.execute("testNode");

    await new Promise((resolve) => setTimeout(resolve, 500));
    await graph.emit("event1", { eventPayload: { status: "1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await graph.emit("event2", { eventPayload: { status: "2" } });
    expect(graph.getContext().value).to.equal(42);
  });

  /**
   * Tests single event waiting functionality
   */
  it("should wait for a single event before continuing", async function () {
    this.timeout(5000);

    const waitingNode: Node<TestSchema> = {
      name: "waitingNode",
      execute: async (context: GraphContext<typeof TestSchema>) => {
        context.value = 1;
      },
      waitForEvent: true,
      next: ["finalNode"],
    };

    const finalNode: Node<TestSchema> = {
      name: "finalNode",
      execute: async (context: GraphContext<typeof TestSchema>) => {
        context.value = (context.value ?? 0) + 5;
      },
    };

    [waitingNode, finalNode].forEach((node) => graph.addNode(node));

    const resultPromise = graph.execute("waitingNode");

    // Wait a bit to ensure the node is ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Emit the event
    await graph.emit("someEvent");

    const result = await resultPromise;
    expect(result.value).to.equal(6); // 1 (waitingNode) + 5 (finalNode)
  });
});
