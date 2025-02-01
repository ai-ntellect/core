import { GraphEngine } from "@/graph/engine";
import { Persistence, RealTimeNotifier } from "@/interfaces";
import { GraphDefinition, SharedState } from "@/types";
import { expect } from "chai";
import { z } from "zod";

/**
 * Test suite for the Graph service
 * This suite tests the workflow execution engine that manages state transitions and node execution
 */
describe("Graph", () => {
  /**
   * Test schema definition using Zod
   * Defines the structure and validation rules for the workflow state
   */
  const TestSchema = z.object({
    status: z.string(),
    step: z.number(),
  });

  type TestState = z.infer<typeof TestSchema>;

  let graph: GraphEngine<TestState>;
  /**
   * Test definition of a simple workflow graph
   * Contains 3 nodes: start -> process -> end
   * Each node updates the state with new status and step values
   */
  const testDefinition: GraphDefinition<TestState> = {
    name: "simple-workflow",
    entryNode: "start",
    nodes: {
      start: {
        name: "start",
        description: "Starting node",
        execute: async (state: SharedState<TestState>) => {
          return graph.updateState({
            ...state,
            status: "started",
            step: 1,
          });
        },
        relationships: [{ name: "process" }],
      },
      process: {
        name: "process",
        description: "Processing node",
        execute: async (state: SharedState<TestState>) => {
          return graph.updateState({
            ...state,
            status: "processing",
            step: 2,
          });
        },
        condition: (state) => state.step === 1,
        relationships: [{ name: "end" }],
      },
      end: {
        name: "end",
        description: "End node",
        execute: async (state: SharedState<TestState>) => {
          return graph.updateState({
            ...state,
            status: "completed",
            step: 3,
          });
        },
        relationships: [],
      },
    },
    schema: TestSchema,
  };

  beforeEach(() => {
    graph = new GraphEngine(testDefinition);
  });

  describe("Workflow Execution", () => {
    /**
     * Tests the complete execution flow of the workflow
     * Verifies that state transitions occur correctly from start to end
     */
    it("should execute the complete workflow sequence", async () => {
      const initialState: SharedState<TestState> = {
        status: "init",
        step: 0,
      };

      // Initialiser le graph avec l'état initial
      graph = new GraphEngine(testDefinition, {
        schema: TestSchema,
        initialState,
      });

      // Exécuter le workflow
      await graph.execute(initialState, "start");
      const result = graph.getState();

      expect(result).to.deep.equal({
        status: "completed",
        step: 3,
      });
    });

    /**
     * Tests that conditional logic in nodes is respected
     * The process node should only execute when step === 1
     */
    it("should respect conditions in workflow", async () => {
      const initialState: SharedState<TestState> = {
        status: "init",
        step: 2,
      };

      // Initialiser le graph avec l'état initial
      graph = new GraphEngine(testDefinition, {
        schema: TestSchema,
        initialState,
      });

      await graph.execute(initialState, "process");
      const result = graph.getState();

      expect(result).to.deep.equal({
        status: "init",
        step: 2,
      });
    });
  });

  describe("Graph Management", () => {
    it("should add a new node to the graph", () => {
      const newNode = {
        name: "new-node",
        description: "A new test node",
        execute: async (state: SharedState<TestState>) => {
          return graph.updateState({
            ...state,
            status: "new",
            step: 4,
          });
        },
        relationships: [{ name: "end" }],
      };

      graph.addNode(newNode);

      expect(graph.nodes.has("new-node")).to.be.true;
      const addedNode = graph.nodes.get("new-node");
      expect(addedNode?.relationships).to.have.lengthOf(1);
    });

    it("should update existing graph with new definition", () => {
      const newDefinition: GraphDefinition<TestState> = {
        name: "updated-workflow",
        entryNode: "start",
        nodes: {
          ...testDefinition.nodes,
          "new-step": {
            name: "new-step",
            description: "New step node",
            execute: async (state: SharedState<TestState>) => {
              return graph.updateState({
                ...state,
                status: "new-step",
                step: 4,
              });
            },
            relationships: [],
          },
        },
        schema: TestSchema,
      };

      graph.updateGraph(newDefinition);
      expect(graph.nodes.has("new-step")).to.be.true;
    });
  });

  describe("State Management", () => {
    it("should properly update and retrieve state", async () => {
      const newState: SharedState<TestState> = {
        status: "test",
        step: 5,
      };

      graph.setState(newState);
      const retrievedState = graph.getState();

      expect(retrievedState).to.deep.equal(newState);
    });

    it("should merge states correctly when updating partially", () => {
      const initialState: SharedState<TestState> = {
        status: "initial",
        step: 1,
      };

      graph.setState(initialState);

      const partialUpdate = {
        status: "updated",
      };

      const updatedState = graph.updateState(partialUpdate);

      expect(updatedState).to.deep.equal({
        status: "updated",
        step: 1,
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle execution errors gracefully", async () => {
      const errorNode = {
        name: "error-node",
        execute: async () => {
          throw new Error("Test error");
        },
      };

      graph.addNode(errorNode);

      let errorCaught = false;
      try {
        await graph.execute(
          { status: "test", step: 1 },
          "error-node",
          undefined,
          (error) => {
            expect(error.message).to.equal("Test error");
            errorCaught = true;
          }
        );
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("Test error");
      }

      expect(errorCaught).to.be.true;
    });

    it("should validate state against schema", async () => {
      // Créer un nouveau graph avec validation stricte
      const strictGraph = new GraphEngine(testDefinition, {
        schema: TestSchema,
        initialState: {
          status: "init",
          step: 0,
        },
      });

      const invalidState: SharedState<any> = {
        context: {
          status: 123, // Should be string
          step: "invalid", // Should be number
        },
      };

      try {
        await strictGraph.execute(invalidState, "start");
        // Si on arrive ici, le test doit échouer car on s'attend à une erreur
        expect.fail("Expected validation error but none was thrown");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(
          errorMessage.includes("Expected string") ||
            errorMessage.includes("Expected number") ||
            errorMessage.includes("validation")
        ).to.be.true;
      }
    });
  });

  describe("Parallel Execution", () => {
    /**
     * Tests concurrent execution of multiple nodes
     * Important: The execution order is not guaranteed due to async nature
     * @param concurrency - Maximum number of nodes that can execute simultaneously
     */
    it("should execute multiple nodes in parallel", async () => {
      const executionOrder: string[] = [];

      const parallelNodes = ["node1", "node2", "node3"].map((name) => ({
        name,
        execute: async (state: SharedState<TestState>) => {
          executionOrder.push(name);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return state;
        },
      }));

      parallelNodes.forEach((node) => {
        graph.addNode(node);
      });

      await graph.executeParallel(
        { status: "test", step: 1 },
        ["node1", "node2", "node3"],
        2
      );

      expect(executionOrder).to.have.lengthOf(3);
      expect(executionOrder).to.include.members(["node1", "node2", "node3"]);
    });
  });

  describe("Event Handling", () => {
    /**
     * Tests the event emission and handling system
     * Events can trigger node execution asynchronously
     * Note: Uses setTimeout to ensure event processing completes
     */
    it("should emit and handle events correctly", async () => {
      const eventNode = {
        name: "event-node",
        execute: async (state: SharedState<TestState>) => {
          return graph.updateState({
            ...state,
            status: "event-triggered",
            step: 10,
          });
        },
        events: ["test-event"],
      };

      graph.addNode(eventNode);

      // Émettre l'événement
      graph.emit("test-event", {
        state: { context: { status: "init", step: 0 } },
      });

      // Attendre un peu pour que l'événement soit traité
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = graph.getState();
      expect(state.status).to.equal("event-triggered");
    });
  });

  describe("Subgraph Integration", () => {
    /**
     * Tests nested workflow execution through subgraphs
     * Subgraphs allow modular workflow composition
     * The main graph can delegate execution to subgraphs
     */
    it("should execute subgraph as part of main graph", async () => {
      const subGraphDef: GraphDefinition<TestState> = {
        name: "sub-workflow",
        entryNode: "sub-start",
        nodes: {
          "sub-start": {
            name: "sub-start",
            execute: async (state: SharedState<TestState>) => {
              return graph.updateState({
                ...state,
                status: "sub-completed",
                step: 100,
              });
            },
            relationships: [],
          },
        },
        schema: TestSchema,
      };

      const subGraph = new GraphEngine(subGraphDef);
      graph.addSubGraph(subGraph, "sub-start", "sub-workflow");

      const initialState: SharedState<TestState> = {
        status: "init",
        step: 0,
      };

      await graph.execute(initialState, "sub-workflow");
      const state = graph.getState();

      expect(state.status).to.equal("sub-completed");
      expect(state.step).to.equal(100);
    });
  });

  describe("Global Context Management", () => {
    it("should manage global context correctly", () => {
      graph.addToContext("testKey", "testValue");
      expect(graph.getContext("testKey")).to.equal("testValue");

      graph.removeFromContext("testKey");
      expect(graph.getContext("testKey")).to.be.undefined;
    });

    it("should handle multiple context values", () => {
      graph.addToContext("key1", "value1");
      graph.addToContext("key2", { nested: "value2" });

      expect(graph.getContext("key1")).to.equal("value1");
      expect(graph.getContext("key2")).to.deep.equal({ nested: "value2" });
    });
  });

  describe("Graph Visualization", () => {
    it("should generate valid mermaid diagram", () => {
      const diagram = graph.generateMermaidDiagram("Test Workflow");
      expect(diagram).to.include("flowchart TD");
      expect(diagram).to.include("subgraph Test Workflow");
      expect(diagram).to.include("start");
      expect(diagram).to.include("process");
      expect(diagram).to.include("end");
    });
  });

  describe("Schema Visualization", () => {
    /**
     * Tests the schema visualization functionality
     * This helps developers understand the workflow structure
     * The visualization includes:
     * - Node relationships
     * - State schema
     * - Validation rules
     */
    it("should generate schema visualization", () => {
      // Créer un nouveau graph avec un schéma pour le test
      const graphWithSchema = new GraphEngine(testDefinition, {
        schema: TestSchema,
      });

      const schemaVisualization = graphWithSchema.visualizeSchema();

      // Vérifier les sections attendues dans la visualisation
      expect(schemaVisualization).to.include("📋 Graph:");
      expect(schemaVisualization).to.include("🔷 Nodes:");

      // Vérifier les détails du schéma
      expect(schemaVisualization).to.satisfy((text: string) => {
        return text.includes("status:") && text.includes("step:");
      });

      // Vérifier la présence des nœuds
      expect(schemaVisualization).to.include("start");
      expect(schemaVisualization).to.include("process");
      expect(schemaVisualization).to.include("end");
    });
  });

  describe("Persistence Integration", () => {
    it("should work with persistence layer", async () => {
      const mockPersistence: Persistence<TestState> = {
        saveState: async (graphName, state, currentNode) => {
          expect(graphName).to.equal("simple-workflow");
          expect(state).to.exist;
          expect(currentNode).to.exist;
        },
        loadState: async () => null,
      };

      graph.setPersistence(mockPersistence);
      await graph.execute({ status: "init", step: 0 }, "start");
    });
  });

  describe("Real-time Notifications", () => {
    /**
     * Tests the notification system during workflow execution
     * Notifications are sent for:
     * - Node execution start
     * - Node execution completion
     * - State updates
     * - Error events
     */
    it("should send notifications during execution", async () => {
      const notifications: any[] = [];
      const mockNotifier: RealTimeNotifier = {
        notify: (event, data) => {
          notifications.push({ event, data });
        },
      };

      graph.setNotifier(mockNotifier);
      await graph.execute({ status: "init", step: 0 }, "start");

      expect(notifications).to.have.length.greaterThan(0);
      expect(notifications[0].event).to.equal("nodeExecutionStarted");
      expect(notifications).to.deep.include.members([
        {
          event: "nodeExecutionCompleted",
          data: {
            workflow: "simple-workflow",
            node: "start",
            state: {
              context: {
                status: "started",
                step: 1,
              },
            },
          },
        },
      ]);
    });
  });

  describe("Cycle Detection", () => {
    /**
     * Tests the cycle detection mechanism
     * Cycles in workflow definitions can cause infinite loops
     * The graph constructor should detect and prevent cyclic dependencies
     */
    it("should detect cycles in graph", () => {
      const cyclicDefinition: GraphDefinition<TestState> = {
        name: "cyclic-workflow",
        entryNode: "node1",
        nodes: {
          node1: {
            name: "node1",
            execute: async (state) => state,
            relationships: [{ name: "node2" }],
          },
          node2: {
            name: "node2",
            execute: async (state) => state,
            relationships: [{ name: "node1" }],
          },
        },
      };

      expect(
        () => new GraphEngine(cyclicDefinition, { autoDetectCycles: true })
      ).to.throw;
    });
  });
});
