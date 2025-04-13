import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { EventEmitter } from "events";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { GraphEventManager } from "../../graph/event-manager";
import { GraphLogger } from "../../graph/logger";
import { GraphNode } from "../../graph/node";
import { IEventEmitter } from "../../interfaces";
import { GraphContext } from "../../types";

use(chaiAsPromised);

describe("GraphNode", () => {
  const TestSchema = z.object({
    counter: z.number(),
    message: z.string(),
  });

  type TestContext = GraphContext<typeof TestSchema>;

  let node: GraphNode<typeof TestSchema>;
  let eventManager: GraphEventManager<typeof TestSchema>;
  let logger: GraphLogger;
  let eventEmitter: EventEmitter;
  let eventSubject: Subject<any>;
  let stateSubject: BehaviorSubject<any>;
  let events: any[] = [];

  beforeEach(() => {
    events = [];
    eventEmitter = new EventEmitter();
    eventSubject = new Subject();
    stateSubject = new BehaviorSubject({ counter: 0, message: "Hello" });
    logger = new GraphLogger("test", false);
    eventManager = new GraphEventManager(eventEmitter, new Map(), "test", {
      counter: 0,
      message: "Hello",
    });

    // Capture des événements
    eventSubject.subscribe((event) => events.push(event));

    node = new GraphNode(
      new Map(),
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );
  });

  it("should execute a simple node", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext) => {
        context.counter++;
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);

    // Vérifier les événements émis
    expect(events).to.have.lengthOf(3); // nodeStarted, nodeStateChanged, nodeCompleted
    expect(events[0].type).to.equal("nodeStarted");
    expect(events[1].type).to.equal("nodeStateChanged");
    expect(events[2].type).to.equal("nodeCompleted");
  });

  it("should handle node condition", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      condition: (context: TestContext) => context.counter < 5,
      execute: async (context: TestContext) => {
        context.counter++;
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    // Test avec condition vraie
    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);
    expect(events.some((e) => e.type === "nodeStateChanged")).to.be.true;

    // Test avec condition fausse
    events = [];
    await node.executeNode("test", { counter: 5, message: "Hello" }, undefined);
    expect(events.some((e) => e.type === "nodeStateChanged")).to.be.false;
  });

  it("should handle errors", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async () => {
        throw new Error("Test error");
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    try {
      await node.executeNode("test", { counter: 0, message: "Hello" }, false);
      expect.fail("Test error");
    } catch (error: any) {
      expect(error.message).to.equal("Test error");
      const errorEvents = events.filter((e) => e.type === "nodeError");
      expect(errorEvents).to.have.lengthOf(1);
    }
  });

  it("should emit events exactly once per state change", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext) => {
        context.counter++;
        context.message = "Updated";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );
    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);

    // Compter les occurrences de chaque type d'événement
    const eventCounts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(eventCounts).to.deep.equal({
      nodeStarted: 1,
      nodeStateChanged: 2, // Un pour counter, un pour message
      nodeCompleted: 1,
    });

    // Vérifier l'ordre des événements
    expect(events.map((e) => e.type)).to.deep.equal([
      "nodeStarted",
      "nodeStateChanged", // counter
      "nodeStateChanged", // message
      "nodeCompleted",
    ]);
  });

  it("should emit nodeStateChanged only for actual changes", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext, inputs?: any) => {
        context.counter = context.counter; // Même valeur
        context.message = "New"; // Nouvelle valeur
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );
    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(1); // Seulement pour message
    expect(stateChanges[0].payload.property).to.equal("message");
  });

  it("should execute node with parameters", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext) => {
        context.counter = 42;
        context.message = "Custom";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, false);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[0].payload.newValue).to.equal(42);
    expect(stateChanges[1].payload.newValue).to.equal("Custom");
  });

  it("should properly handle node inputs", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext) => {
        context.counter = 42;
        context.message = "Test Input";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, false);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[0].payload.newValue).to.equal(42);
    expect(stateChanges[1].payload.newValue).to.equal("Test Input");
  });

  it("should not emit duplicate state changes", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext) => {
        context.counter = 1; // Valeur fixe au lieu d'incrémentations
        context.counter = 1; // Même valeur
        context.message = "New";
        context.message = "New"; // Même valeur
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);

    // Vérifier qu'il n'y a pas de doublons dans les événements
    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    const uniqueChanges = new Set(
      stateChanges.map(
        (e) =>
          `${e.payload.property}-${e.payload.oldValue}-${e.payload.newValue}`
      )
    );

    expect(stateChanges.length).to.equal(uniqueChanges.size);
    expect(stateChanges).to.have.lengthOf(2); // Un pour counter, un pour message
  });

  it("should handle node execution without params", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (
        context: TestContext,
        tools?: { eventEmitter: IEventEmitter }
      ) => {
        context.counter++;
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, undefined);
    await node.executeNode("test", { counter: 1, message: "Hello" }, undefined);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[1].payload.newValue).to.equal(2);
  });

  it("should wait for events before executing node", async () => {
    const nodes = new Map();
    nodes.set("waitForEventsNode", {
      name: "waitForEventsNode",
      when: {
        events: ["event1", "event2"],
        timeout: 1000,
        strategy: { type: "all" },
      },
      execute: async (context: TestContext) => {
        context.message = "Events received";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    // Lancer l'exécution du nœud
    const execution = node.executeNode(
      "waitForEventsNode",
      { counter: 0, message: "Hello" },
      undefined
    );

    // Simuler les événements après un court délai
    setTimeout(() => {
      eventEmitter.emit("event1", { data: "test1" });
      eventEmitter.emit("event2", { data: "test2" });
    }, 100);

    await execution;

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(1);
    expect(stateChanges[0].payload.newValue).to.equal("Events received");
  });

  it("should timeout if events are not received", async () => {
    const nodes = new Map();
    nodes.set("timeoutNode", {
      name: "timeoutNode",
      when: {
        events: ["event1", "event2"],
        timeout: 100,
        strategy: { type: "all" },
      },
      execute: async (context: TestContext) => {
        context.message = "Should not execute";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );
    await expect(
      node.executeNode(
        "timeoutNode",
        { counter: 0, message: "Hello" },
        undefined
      )
    ).to.be.rejectedWith("Timeout waiting for events");
  });

  it("should handle partial event reception", async () => {
    const nodes = new Map();
    nodes.set("partialEventsNode", {
      name: "partialEventsNode",
      when: {
        events: ["event1", "event2"],
        timeout: 1000,
        strategy: { type: "all" },
      },
      execute: async (context: TestContext) => {
        context.message = "All events received";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );
    const execution = node.executeNode("partialEventsNode", {
      counter: 0,
      message: "Hello",
    });

    setTimeout(() => {
      eventEmitter.emit("event1", { data: "test1" });
    }, 100);

    await expect(execution).to.be.rejectedWith("Timeout waiting for events");
  });

  it("should handle correlated events", (done) => {
    const nodes = new Map();
    nodes.set("correlatedEventsNode", {
      name: "correlatedEventsNode",
      when: {
        events: ["payment", "stock"],
        timeout: 1000,
        strategy: {
          type: "correlate",
          correlation: (events: Array<{ type: string; payload?: any }>) => {
            const paymentEvent = events.find(
              (e: { type: string }) => e.type === "payment"
            );
            const stockEvent = events.find(
              (e: { type: string }) => e.type === "stock"
            );
            return paymentEvent?.payload?.id === stockEvent?.payload?.id;
          },
        },
      },
      execute: (context: TestContext) => {
        context.message = "Correlated events received";
        done();
        return Promise.resolve();
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    node.executeNode(
      "correlatedEventsNode",
      { counter: 0, message: "Hello" },
      undefined
    );

    setTimeout(() => {
      eventEmitter.emit("payment", { id: "123", status: "completed" });
      eventEmitter.emit("stock", { id: "123", status: "available" });
    }, 100);
  });
});
