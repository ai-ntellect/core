import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import EventEmitter from "events";
import sinon from "sinon";
import { z } from "zod";
import { GraphController } from "../../graph/controller";
import { GraphFlow } from "../../graph/index";
import { NodeParams } from "../../graph/node";
import { GraphConfig, GraphContext, GraphNodeConfig } from "../../types";

use(chaiAsPromised);

/**
 * Test schema definition using Zod for graph context validation
 * Defines a schema with:
 * - value: numeric value for tracking state changes
 * - counter: numeric value for tracking state changes
 * - message: string for tracking state changes
 * - eventPayload: optional object containing transaction metadata
 */
const TestSchema = z.object({
  value: z.number().default(0),
  counter: z.number().default(0),
  message: z.string().default(""),
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
    const simpleNode: GraphNodeConfig<TestSchema> = {
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

    const testNode: GraphNodeConfig<TestSchema> = {
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
    const errorNode: GraphNodeConfig<TestSchema> = {
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
      const simpleNode: GraphNodeConfig<TestSchema> = {
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
  it("should execute a node with validated params and outputs", async function () {
    const paramNode: GraphNodeConfig<TestSchema, { increment: number }> = {
      name: "paramNode",
      params: z.object({
        increment: z.number(),
      }),
      execute: async (context, params?: { increment: number }) => {
        if (!params) throw new Error("params required");
        context.value = (context.value ?? 0) + params.increment;
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
    const conditionalNode: GraphNodeConfig<TestSchema> = {
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
    const retryNode: GraphNodeConfig<TestSchema> = {
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
    const testNode: GraphNodeConfig<TestSchema> = {
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
    const nodeA: GraphNodeConfig<TestSchema> = {
      name: "A",
      execute: async () => {},
    };
    const nodeB: GraphNodeConfig<TestSchema> = {
      name: "B",
      execute: async () => {},
    };

    const newDefinition: GraphConfig<TestSchema> = {
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
    const node: GraphNodeConfig<TestSchema> = {
      name: "test",
      params: z.object({
        value: z.number().min(0),
      }),
      execute: async (context, params) => {
        if (!params) throw new Error("params required");
        context.value = params.value;
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
   * Tests successful input/output validation flow
   */
  it("should successfully validate both params and outputs", async function () {
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [
        {
          name: "validatedNode",
          params: z.object({
            increment: z.number().min(0).max(5),
          }),
          execute: async (
            context: GraphContext<TestSchema>,
            params?: NodeParams
          ) => {
            if (!params) throw new Error("params required");
            context.value = (context.value ?? 0) + params.increment;
          },
        },
      ],
      schema: TestSchema,
      context: { value: 0, counter: 0, message: "" },
    });

    // Test avec valeur valide
    await graph.execute("validatedNode", { increment: 3 });
    expect(graph.getContext().value).to.equal(3);

    // Test avec valeur invalide
    await expect(
      graph.execute("validatedNode", { increment: 10 })
    ).to.be.rejectedWith("Number must be less than or equal to 5");
  });

  /**
   * Tests handling of missing required params
   */
  it("should throw error when required params are missing", async function () {
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [
        {
          name: "requiredInputNode",
          params: z.object({
            value: z.number(),
          }),
          execute: async (
            context: GraphContext<TestSchema>,
            params?: NodeParams
          ) => {
            context.counter = params?.value || 0;
          },
        },
      ],
      schema: TestSchema,
      context: { value: 0, counter: 0, message: "" },
    });

    await expect(graph.execute("requiredInputNode")).to.be.rejectedWith(
      "Params required for node"
    );
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
    const nodeA: GraphNodeConfig<TestSchema> = {
      name: "nodeA",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 1;
      },
      next: ["nodeB1", "nodeB2"],
    };

    const nodeB1: GraphNodeConfig<TestSchema> = {
      name: "nodeB1",
      execute: async (context) => {
        context.value = (context.value ?? 0) * 2;
      },
      next: ["nodeC"],
    };

    const nodeB2: GraphNodeConfig<TestSchema> = {
      name: "nodeB2",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 3;
      },
      next: ["nodeC"],
    };

    const nodeC: GraphNodeConfig<TestSchema> = {
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
    const startNode: GraphNodeConfig<TestSchema> = {
      name: "start",
      execute: async (context) => {
        context.value = (context.value ?? 0) + 5;
      },
      next: ["end"],
    };

    const endNode: GraphNodeConfig<TestSchema> = {
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

    const processNode1: GraphNodeConfig<TestSchema> = {
      name: "process1",
      execute: async (context) => {
        context.value = 1;
      },
      next: ["finalize1"],
    };

    const finalizeNode1: GraphNodeConfig<TestSchema> = {
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

    const processNode2: GraphNodeConfig<TestSchema> = {
      name: "process2",
      execute: async (context) => {
        context.value = 2;
      },
      next: ["finalize2"],
    };

    const finalizeNode2: GraphNodeConfig<TestSchema> = {
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

    expect(results[0].context.value).to.equal(2); // Graph1: 1 * 2
    expect(results[1].context.value).to.equal(5); // Graph2: 2 + 3
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

    const startNode1: GraphNodeConfig<TestSchema> = {
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

    const startNode2: GraphNodeConfig<TestSchema> = {
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

    expect(results[0].context.value).to.equal(2); // Graph1: 1 * 2
    expect(results[1].context.value).to.equal(5); // Graph2: 3 + 2
  });

  /**
   * Tests single event waiting functionality
   */
  it("should wait for a single event before continuing", async function () {
    const waitingNode: GraphNodeConfig<TestSchema> = {
      name: "waitingNode",
      execute: async (context: GraphContext<typeof TestSchema>) => {
        context.value = 1;
      },
      when: {
        events: ["someEvent"],
        timeout: 1000,
        strategy: { type: "single" },
      },
      next: ["finalNode"],
    };

    const finalNode: GraphNodeConfig<TestSchema> = {
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

  // Test de validation des paramètres
  it("should successfully validate params", async () => {
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [
        {
          name: "validationNode",
          params: z.object({
            value: z.number().max(10),
          }),
          execute: async (
            context: GraphContext<TestSchema>,
            params?: NodeParams
          ) => {
            context.counter = params?.value || 0;
          },
        },
      ],
      schema: TestSchema,
      context: { value: 0, counter: 0, message: "" },
    });

    // Test avec valeur invalide
    await expect(
      graph.execute("validationNode", { value: 20 })
    ).to.be.rejectedWith("Number must be less than or equal to 10");
  });

  // Test des paramètres requis
  it("should throw error when required params are missing", async () => {
    const graph = new GraphFlow("test", {
      name: "test",
      nodes: [
        {
          name: "requiredInputNode",
          params: z.object({
            value: z.number(),
          }),
          execute: async (
            context: GraphContext<TestSchema>,
            params?: NodeParams
          ) => {
            context.counter = params?.value || 0;
          },
        },
      ],
      schema: TestSchema,
      context: { value: 0, counter: 0, message: "" },
    });

    await expect(graph.execute("requiredInputNode")).to.be.rejectedWith(
      "Params required for node"
    );
  });
});
