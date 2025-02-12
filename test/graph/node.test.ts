import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { EventEmitter } from "events";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { GraphEventManager } from "../../graph/event-manager";
import { GraphLogger } from "../../graph/logger";
import { GraphNode } from "../../graph/node";
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
      execute: async (_context: TestContext) => {
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
      await node.executeNode("test", { counter: 0, message: "Hello" }, null);
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).to.equal("Test error");
      const errorEvents = events.filter((e) => e.type === "nodeError");
      expect(errorEvents).to.have.lengthOf(1);
      expect(errorEvents[0].payload.error.message).to.equal("Test error");
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
      execute: async (context: TestContext) => {
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
});
