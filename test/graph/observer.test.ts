import { expect } from "chai";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { GraphFlow } from "../../graph";
import { GraphObserver } from "../../graph/observer";
import { GraphContext, GraphEvent, GraphNodeConfig } from "../../types";

/**
 * Test schema definition for observer tests
 * Defines a schema with:
 * - value: numeric value for tracking state changes
 * - status: enum representing node execution status
 */
const TestSchema = z.object({
  value: z.number().default(0),
  status: z.enum(["pending", "completed", "failed"]).optional(),
});

/**
 * Test suite for the GraphObserver implementation
 * This suite validates the reactive observation capabilities:
 * - State observation (global and node-specific)
 * - Property observation (single and multiple)
 * - Event observation and correlation
 * - Workflow monitoring
 * - Node execution triggers
 */
describe("GraphObserver", () => {
  let graph: GraphFlow<typeof TestSchema>;
  let eventSubject: Subject<GraphEvent<typeof TestSchema>>;
  let stateSubject: BehaviorSubject<GraphContext<typeof TestSchema>>;
  let destroySubject: Subject<void>;
  let observer: GraphObserver<typeof TestSchema>;

  beforeEach(() => {
    graph = new GraphFlow("TestGraph", {
      name: "TestGraph",
      nodes: [],
      context: { value: 0 },
      schema: TestSchema,
    });

    // Initialize subjects
    eventSubject = new Subject();
    stateSubject = new BehaviorSubject(graph.getContext());
    destroySubject = new Subject();

    // Create observer instance
    observer = new GraphObserver(
      graph,
      eventSubject,
      stateSubject,
      destroySubject
    );
  });

  /**
   * Test suite for state observation functionality
   * Validates the ability to track and react to state changes
   * in the graph context
   */
  describe("State Observation", () => {
    /**
     * Tests sequential state change observation
     * Validates that:
     * - All state changes are captured in order
     * - Multiple state changes in a single node are tracked
     * - Initial state is included in observations
     */
    it("should observe state changes", async () => {
      const states: any[] = [];
      const testNode: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.value = 1;
          context.value = 2;
          context.value = 3;
        },
      };

      graph.addNode(testNode);
      const subscription = graph
        .observe()
        .state()
        .subscribe((state) => {
          if (state.value !== undefined) {
            states.push(state.value);
          }
        });

      await graph.execute("testNode");
      await new Promise((resolve) => setTimeout(resolve, 50));
      subscription.unsubscribe();

      expect(states).to.deep.equal([0, 1, 2, 3]);
    });

    /**
     * Tests node-specific state observation
     * Validates that:
     * - State changes for specific nodes are tracked
     * - Status transitions are captured correctly
     * - Async state changes are properly observed
     */
    it("should observe specific node state changes", async () => {
      const states: any[] = [];
      const testNode: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.status = "pending";
          await new Promise((resolve) => setTimeout(resolve, 10));
          context.status = "completed";
        },
      };

      graph.addNode(testNode);
      const subscription = graph
        .observe()
        .node("testNode")
        .subscribe((state) => state.status && states.push(state.status));

      await graph.execute("testNode");
      await new Promise((resolve) => setTimeout(resolve, 50));
      subscription.unsubscribe();

      expect(states).to.deep.equal(["pending", "completed"]);
    });

    /**
     * Tests multi-node state observation
     * Validates that:
     * - Multiple nodes can be observed simultaneously
     * - State changes are correctly attributed to nodes
     * - Sequential execution is properly tracked
     */
    it("should observe multiple nodes", async () => {
      const states: any[] = [];
      const node1: GraphNodeConfig<typeof TestSchema> = {
        name: "node1",
        execute: async (context) => {
          context.value = 1;
        },
      };
      const node2: GraphNodeConfig<typeof TestSchema> = {
        name: "node2",
        execute: async (context) => {
          context.value = 2;
        },
      };

      graph.addNode(node1);
      graph.addNode(node2);

      const subscription = graph
        .observe()
        .nodes(["node1", "node2"])
        .subscribe((state) => state.value && states.push(state.value));

      await graph.execute("node1");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await graph.execute("node2");
      await new Promise((resolve) => setTimeout(resolve, 50));
      subscription.unsubscribe();

      expect(states).to.deep.equal([1, 2]);
    });
  });

  /**
   * Test suite for property observation functionality
   * Validates the ability to track specific properties
   * of the graph context
   */
  describe("Property Observation", () => {
    /**
     * Tests single property observation
     * Validates that:
     * - Individual property changes are tracked
     * - Initial property value is captured
     * - Property updates trigger observations
     */
    it("should observe single property", async () => {
      const values: any[] = [];
      const testNode: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.value = 42;
        },
      };

      graph.addNode(testNode);
      const subscription = graph
        .observe()
        .property("value")
        .subscribe((state) => values.push(state.value));

      await graph.execute("testNode");
      subscription.unsubscribe();

      expect(values).to.deep.equal([0, 42]);
    });

    /**
     * Tests multiple property observation
     * Validates that:
     * - Multiple properties can be tracked simultaneously
     * - Changes to any observed property trigger updates
     * - Final state contains all tracked properties
     */
    it("should observe multiple properties", async () => {
      const values: any[] = [];
      const testNode: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.value = 42;
          context.status = "completed";
        },
      };

      graph.addNode(testNode);
      const subscription = graph
        .observe()
        .property(["value", "status"])
        .subscribe((change) => {
          const { name, ...rest } = change;
          values.push(rest);
        });

      await graph.execute("testNode");
      await new Promise((resolve) => setTimeout(resolve, 50));
      subscription.unsubscribe();

      expect(values[values.length - 1]).to.deep.equal({
        value: 42,
        status: "completed",
      });
    });

    /**
     * Tests condition-based observation
     * Validates that:
     * - Multiple conditions can be combined
     * - Observation completes when conditions are met
     * - State reflects all required changes
     */
    it("should wait for multiple conditions", async () => {
      const testNode: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.value = 42;
          context.status = "completed";
        },
      };

      graph.addNode(testNode);
      const promise = graph
        .observe()
        .until(
          graph.observe().property(["value", "status"]),
          (state) => state.value === 42 && state.status === "completed"
        );

      await graph.execute("testNode");
      await promise;

      const context = graph.getContext();
      expect(context.value).to.equal(42);
      expect(context.status).to.equal("completed");
    });
  });

  /**
   * Test suite for event observation functionality
   * Validates the handling of events and event correlation
   */
  describe("Event Observation", () => {
    /**
     * Tests specific event observation
     */
    it("should observe specific events", async () => {
      const events: GraphEvent<typeof TestSchema>[] = [];
      const subscription = graph
        .observe()
        .event("testEvent")
        .subscribe((e) => events.push(e));

      await graph.emit("testEvent", { value: 1 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      subscription.unsubscribe();

      expect(events.length).to.equal(1);
      expect(events[0].type).to.equal("testEvent");
    });

    /**
     * Tests debounced event handling
     */
    it("should handle debounced events", async () => {
      const events: GraphEvent<typeof TestSchema>[] = [];
      const subscription = graph
        .observe()
        .event("event1")
        .subscribe((e) => events.push(e));

      await graph.emit("event1", { value: 1 });
      await graph.emit("event1", { value: 2 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      subscription.unsubscribe();

      expect(events.length).to.equal(2);
    });

    /**
     * Tests event correlation functionality
     * Validates that:
     * - Multiple events can be correlated
     * - Correlation conditions are properly evaluated
     * - Timeout handling works correctly
     * - Events are captured in correct order
     */
    it("should wait for correlated events", async () => {
      // Create test events
      const eventA = {
        type: "eventA",
        payload: { eventPayload: { status: "success" } },
        timestamp: Date.now(),
      } as GraphEvent<typeof TestSchema>;

      const eventB = {
        type: "eventB",
        payload: { eventPayload: { status: "success" } },
        timestamp: Date.now(),
      } as GraphEvent<typeof TestSchema>;

      // Emit events after a short delay
      setTimeout(() => {
        eventSubject.next(eventA);
        eventSubject.next(eventB);
      }, 100);

      const events = await observer.waitForCorrelatedEvents(
        ["eventA", "eventB"],
        2000,
        (events) =>
          events.every((e) => e.payload.eventPayload?.status === "success")
      );

      expect(events.length).to.equal(2);
      expect(events[0].type).to.equal("eventA");
      expect(events[1].type).to.equal("eventB");
    });

    afterEach(() => {
      destroySubject.next();
      destroySubject.complete();
      eventSubject.complete();
      stateSubject.complete();
    });
  });

  /**
   * Test suite for workflow observation functionality
   * Validates the ability to monitor complete workflow execution
   */
  describe("Workflow Observation", () => {
    /**
     * Tests complete workflow observation
     * Validates that:
     * - Entire workflow execution is tracked
     * - State transitions are captured
     * - Final state reflects completed workflow
     */
    it("should observe complete workflow", async () => {
      const states: any[] = [];
      const node: GraphNodeConfig<typeof TestSchema> = {
        name: "testNode",
        execute: async (context) => {
          context.status = "pending";
          await new Promise((resolve) => setTimeout(resolve, 10));
          context.status = "completed";
        },
      };

      graph.addNode(node);
      const subscription = graph
        .observe()
        .node("testNode")
        .subscribe((state) => states.push(state));

      await graph.execute("testNode");
      await new Promise((resolve) => setTimeout(resolve, 50));
      subscription.unsubscribe();

      expect(states.length).to.be.greaterThan(0);
      expect(states[states.length - 1].status).to.equal("completed");
    });
  });
});
