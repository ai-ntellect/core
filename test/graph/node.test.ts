import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { EventEmitter } from "events";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { GraphEventManager } from "../../graph/event-manager";
import { GraphLogger } from "../../graph/logger";
import { GraphNode, NodeParams } from "../../graph/node";
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

    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

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
    await node.executeNode("test", { counter: 0, message: "Hello" }, null);
    expect(events.some((e) => e.type === "nodeStateChanged")).to.be.true;

    // Test avec condition fausse
    events = [];
    await node.executeNode("test", { counter: 5, message: "Hello" }, null);
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
      await node.executeNode(
        "test",
        { counter: 0, message: "Hello" },
        null,
        false
      );
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
    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

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
    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(1); // Seulement pour message
    expect(stateChanges[0].payload.property).to.equal("message");
  });

  it("should execute node with parameters", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext, inputs?: any) => {
        context.counter = inputs?.value ?? 0;
        context.message = inputs?.message ?? "Default";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode(
      "test",
      { counter: 0, message: "Hello" },
      { value: 5, message: "Custom" },
      false
    );

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[0].payload.newValue).to.equal(5);
    expect(stateChanges[1].payload.newValue).to.equal("Custom");
  });

  it("should use default values when no parameters provided", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (
        context: TestContext,
        _inputs: any,
        params?: NodeParams
      ) => {
        context.counter = params?.increment || 1;
        context.message = params?.message || "Default";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[0].payload.newValue).to.equal(1); // counter (default)
    expect(stateChanges[1].payload.newValue).to.equal("Default"); // message (default)
  });

  it("should properly handle node inputs", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      execute: async (context: TestContext, inputs: any) => {
        context.counter = inputs.value;
        context.message = inputs.message;
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    const testInputs = {
      value: 42,
      message: "Test Input",
    };

    await node.executeNode(
      "test",
      { counter: 0, message: "Hello" },
      testInputs
    );

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[0].payload.newValue).to.equal(42); // counter from input
    expect(stateChanges[1].payload.newValue).to.equal("Test Input"); // message from input
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

    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

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

  it("should validate node parameters with Zod schema", async () => {
    const paramSchema = z.object({
      increment: z.number().min(1),
      message: z.string().min(1),
    });

    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      params: paramSchema,
      execute: async (context: TestContext, params?: NodeParams) => {
        context.counter += params?.increment || 0;
        context.message = params?.message || "";
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    // Test avec des paramètres valides
    await node.executeNode(
      "test",
      { counter: 0, message: "Hello" },
      { increment: 5, message: "Valid" }
    );

    // Test avec des paramètres invalides
    await expect(
      node.executeNode(
        "test",
        { counter: 0, message: "Hello" },
        { increment: 0, message: "" }
      )
    ).to.be.rejected; // Enlever le .with() car le message d'erreur vient directement de Zod
  });

  it("should work without params schema", async () => {
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

    // Devrait fonctionner sans erreur même sans schema de params
    await node.executeNode("test", { counter: 0, message: "Hello" }, null);
  });

  it("should not require params when node has no params schema", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      // Pas de schéma de params défini
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

    await node.executeNode("test", { counter: 0, message: "Hello" }, null);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(1);
    expect(stateChanges[0].payload.newValue).to.equal(1);
  });

  it("should require params only when node has params schema", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      params: z.object({
        // Avec un schéma de params
        value: z.number(),
      }),
      execute: async (context: TestContext, params?: NodeParams) => {
        context.counter = params?.value || 0;
      },
    });

    node = new GraphNode(
      nodes,
      logger,
      eventManager,
      eventSubject,
      stateSubject
    );

    // Devrait échouer sans params
    await expect(
      node.executeNode("test", { counter: 0, message: "Hello" }, null)
    ).to.be.rejectedWith("Params required for node");
  });

  it("should execute node without params when no schema is defined (real world scenario)", async () => {
    const nodes = new Map();
    nodes.set("incrementCounter", {
      name: "incrementCounter",
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

    // Simuler l'appel comme dans examples/t2.ts
    await node.executeNode(
      "incrementCounter",
      { message: "Hello", counter: 0 },
      { test: "test" } // Passer des params même si non requis
    );

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(1);
    expect(stateChanges[0].payload.newValue).to.equal(1);
  });

  it("should handle optional params schema", async () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      params: z
        .object({
          test: z.string(),
        })
        .optional(),
      execute: async (context: TestContext, params?: NodeParams) => {
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

    // Devrait fonctionner avec ou sans params
    await node.executeNode(
      "test",
      { counter: 0, message: "Hello" },
      { test: "test" }
    );
    await node.executeNode("test", { counter: 1, message: "Hello" }, null);

    const stateChanges = events.filter((e) => e.type === "nodeStateChanged");
    expect(stateChanges).to.have.lengthOf(2);
    expect(stateChanges[1].payload.newValue).to.equal(2);
  });

  it("should wait for events before executing node", async () => {
    const nodes = new Map();
    nodes.set("waitForEventsNode", {
      name: "waitForEventsNode",
      waitForEvents: {
        events: ["event1", "event2"],
        timeout: 1000,
        strategy: "all",
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
      null
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
      waitForEvents: {
        events: ["event1", "event2"],
        timeout: 100,
        strategy: "all",
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
      node.executeNode("timeoutNode", { counter: 0, message: "Hello" }, null)
    ).to.be.rejectedWith("Timeout waiting for events");
  });

  it("should handle partial event reception", async () => {
    const nodes = new Map();
    nodes.set("partialEventsNode", {
      name: "partialEventsNode",
      waitForEvents: {
        events: ["event1", "event2"],
        timeout: 1000,
        strategy: "all",
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

    const execution = node.executeNode(
      "partialEventsNode",
      { counter: 0, message: "Hello" },
      null
    );

    // N'émettre qu'un seul événement
    setTimeout(() => {
      eventEmitter.emit("event1", { data: "test1" });
    }, 100);

    await expect(execution).to.be.rejectedWith("Timeout waiting for events");
  });

  it("should handle correlated events", (done) => {
    const nodes = new Map();
    nodes.set("correlatedEventsNode", {
      name: "correlatedEventsNode",
      correlateEvents: {
        events: ["payment", "stock"],
        timeout: 1000,
        correlation: (events: Array<{ type: string; payload?: any }>) => {
          const paymentEvent = events.find((e) => e.type === "payment");
          const stockEvent = events.find((e) => e.type === "stock");
          return paymentEvent?.payload?.id === stockEvent?.payload?.id;
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
      null
    );

    setTimeout(() => {
      eventEmitter.emit("payment", { id: "123", status: "completed" });
      eventEmitter.emit("stock", { id: "123", status: "available" });
    }, 100);
  });
});
