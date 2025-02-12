import { expect } from "chai";
import { EventEmitter } from "events";
import { z } from "zod";
import { GraphEventManager } from "../../graph/event-manager";

describe("GraphEventManager", () => {
  const TestSchema = z.object({
    counter: z.number(),
    message: z.string(),
  });

  let eventManager: GraphEventManager<typeof TestSchema>;
  let eventEmitter: EventEmitter;
  let events: any[] = [];

  beforeEach(() => {
    events = [];
    eventEmitter = new EventEmitter();
    eventManager = new GraphEventManager(eventEmitter, new Map(), "test", {
      counter: 0,
      message: "Hello",
    });
  });

  it("should emit events without duplication", () => {
    const emittedEvents: any[] = [];
    eventEmitter.on("test", (event) => emittedEvents.push(event));

    eventManager.emitEvent("test", { data: "test" });

    expect(emittedEvents).to.have.lengthOf(1);
    expect(emittedEvents[0]).to.deep.equal({ data: "test" });
  });

  it("should handle nodeStateChanged events correctly", () => {
    const stateChanges: any[] = [];
    eventEmitter.on("nodeStateChanged", (event) => stateChanges.push(event));

    eventManager.emitEvent("nodeStateChanged", {
      nodeName: "test",
      property: "counter",
      oldValue: 0,
      newValue: 1,
      context: { counter: 1, message: "Hello" },
    });

    expect(stateChanges).to.have.lengthOf(1);
    expect(stateChanges[0].nodeName).to.equal("test");
    expect(stateChanges[0].context.counter).to.equal(1);
  });

  it("should setup and cleanup event listeners", () => {
    const nodes = new Map();
    nodes.set("test", {
      name: "test",
      events: ["customEvent"],
      execute: async () => {},
    });

    eventManager = new GraphEventManager(eventEmitter, nodes, "test", {
      counter: 0,
      message: "Hello",
    });

    eventManager.setupEventListeners();
    expect(eventEmitter.listenerCount("customEvent")).to.equal(1);

    // Réinitialiser les listeners
    eventManager.setupEventListeners();
    expect(eventEmitter.listenerCount("customEvent")).to.equal(1);
  });
});
