import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { z } from "zod";
import { InMemoryCheckpointAdapter } from "../../graph/adapters/in-memory-checkpoint";
import { CheckpointAwaitApprovalError, CheckpointInterruptError, GraphFlow } from "../../graph/index";
import { GraphNodeConfig } from "../../types";

use(chaiAsPromised);

const TestSchema = z.object({
  value: z.number().min(0).default(0),
  counter: z.number().default(0),
  message: z.string().default(""),
});

type TestSchema = typeof TestSchema;

describe("InMemoryCheckpointAdapter", () => {
  let adapter: InMemoryCheckpointAdapter;

  beforeEach(() => {
    adapter = new InMemoryCheckpointAdapter();
  });

  it("should save and load a checkpoint", async () => {
    const cp = {
      id: "cp1",
      graphName: "TestGraph",
      nodeName: "nodeA",
      nextNodes: ["nodeB"],
      context: { value: 10 },
      metadata: { createdAt: Date.now() },
    };

    await adapter.save(cp);
    const loaded = await adapter.load("cp1");

    expect(loaded).to.not.be.null;
    expect(loaded!.id).to.equal("cp1");
    expect(loaded!.context.value).to.equal(10);
  });

  it("should return null for non-existent checkpoint", async () => {
    const loaded = await adapter.load("nonexistent");
    expect(loaded).to.be.null;
  });

  it("should list checkpoints by graph name sorted by date", async () => {
    await adapter.save({
      id: "cp1",
      graphName: "GraphA",
      nodeName: "n1",
      nextNodes: [],
      context: {},
      metadata: { createdAt: 1000 },
    });
    await adapter.save({
      id: "cp2",
      graphName: "GraphA",
      nodeName: "n2",
      nextNodes: [],
      context: {},
      metadata: { createdAt: 2000 },
    });
    await adapter.save({
      id: "cp3",
      graphName: "GraphB",
      nodeName: "n3",
      nextNodes: [],
      context: {},
      metadata: { createdAt: 3000 },
    });

    const listA = await adapter.list("GraphA");
    expect(listA.length).to.equal(2);
    expect(listA[0].id).to.equal("cp2");
    expect(listA[1].id).to.equal("cp1");

    const listB = await adapter.list("GraphB");
    expect(listB.length).to.equal(1);
  });

  it("should delete a checkpoint", async () => {
    await adapter.save({
      id: "cp1",
      graphName: "TestGraph",
      nodeName: "n1",
      nextNodes: [],
      context: {},
      metadata: { createdAt: Date.now() },
    });

    await adapter.delete("cp1");
    const loaded = await adapter.load("cp1");
    expect(loaded).to.be.null;
  });

  it("should clear checkpoints by graph name", async () => {
    await adapter.save({
      id: "cp1",
      graphName: "GraphA",
      nodeName: "n1",
      nextNodes: [],
      context: {},
      metadata: { createdAt: Date.now() },
    });
    await adapter.save({
      id: "cp2",
      graphName: "GraphB",
      nodeName: "n2",
      nextNodes: [],
      context: {},
      metadata: { createdAt: Date.now() },
    });

    await adapter.clear("GraphA");
    expect(await adapter.list("GraphA")).to.have.length(0);
    expect(await adapter.list("GraphB")).to.have.length(1);
  });

  it("should clear all checkpoints", async () => {
    await adapter.save({
      id: "cp1",
      graphName: "GraphA",
      nodeName: "n1",
      nextNodes: [],
      context: {},
      metadata: { createdAt: Date.now() },
    });
    await adapter.save({
      id: "cp2",
      graphName: "GraphB",
      nodeName: "n2",
      nextNodes: [],
      context: {},
      metadata: { createdAt: Date.now() },
    });

    await adapter.clear();
    expect(await adapter.list("GraphA")).to.have.length(0);
    expect(await adapter.list("GraphB")).to.have.length(0);
  });

  it("should return a deep clone on load (no mutation)", async () => {
    const original = {
      id: "cp1",
      graphName: "TestGraph",
      nodeName: "n1",
      nextNodes: [],
      context: { value: 10 },
      metadata: { createdAt: Date.now() },
    };
    await adapter.save(original);

    const loaded = await adapter.load("cp1");
    loaded!.context.value = 999;

    const reloaded = await adapter.load("cp1");
    expect(reloaded!.context.value).to.equal(10);
  });
});

describe("CheckpointInterruptError", () => {
  it("should have correct name and checkpointId", () => {
    const err = new CheckpointInterruptError("test", "cp123");
    expect(err.name).to.equal("CheckpointInterruptError");
    expect(err.checkpointId).to.equal("cp123");
    expect(err.message).to.equal("test");
  });
});

describe("GraphFlow with Checkpoints", () => {
  let graph: GraphFlow<TestSchema>;
  let adapter: InMemoryCheckpointAdapter;

  beforeEach(() => {
    adapter = new InMemoryCheckpointAdapter();
    graph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: [],
      context: { value: 0, counter: 0, message: "" },
    });
  });

  it("should save checkpoint after each node", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = 2;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = 3;
      },
    });

    const result = await graph.executeWithCheckpoint("nodeA", adapter);

    const checkpoints = await adapter.list("TestGraph");
    const nodeCheckpoints = checkpoints.filter(
      (c) => !c.nodeName.startsWith("__")
    );
    expect(nodeCheckpoints.length).to.be.greaterThanOrEqual(2);
  });

  it("should save final checkpoint on complete", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 42;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      saveOnComplete: true,
    });

    const checkpoints = await adapter.list("TestGraph");
    const final = checkpoints.find((c) => c.nodeName === "__completed__");
    expect(final).to.not.be.undefined;
    expect(final!.context.value).to.equal(42);
  });

  it("should resume from checkpoint and continue execution", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 10;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 20;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 30;
      },
    });

    const cpId = "resume-test";
    await graph.executeWithCheckpoint("nodeA", adapter, { checkpointId: cpId });

    const checkpoints = await adapter.list("TestGraph");
    const beforeB = checkpoints.find(
      (c) => c.nodeName === "nodeA" && c.nextNodes.includes("nodeB")
    );
    expect(beforeB).to.not.be.undefined;

    const freshGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await freshGraph.resumeFromCheckpoint(
      beforeB!.id,
      adapter
    );
    expect(result.value).to.equal(60);
  });

  it("should interrupt execution and save checkpoint", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 2;
        graph.interrupt();
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 3;
      },
    });

    const cpId = "interrupt-test";

    try {
      await graph.executeWithCheckpoint("nodeA", adapter, {
        checkpointId: cpId,
      });
      expect.fail("Should have thrown CheckpointInterruptError");
    } catch (error) {
      expect(error).to.be.instanceOf(CheckpointInterruptError);
      const cpError = error as CheckpointInterruptError;
      expect(cpError.checkpointId.startsWith(cpId)).to.be.true;
    }

    const checkpoints = await adapter.list("TestGraph");
    const interrupted = checkpoints.find((c) => c.metadata.interrupted);
    expect(interrupted).to.not.be.undefined;
    expect(interrupted!.context.value).to.equal(3);
    expect(interrupted!.nextNodes).to.include("nodeC");
  });

  it("should resume after interrupt and complete execution", async () => {
    const executeSteps: string[] = [];

    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        executeSteps.push("A");
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        executeSteps.push("B");
        ctx.value = (ctx.value ?? 0) + 2;
        graph.interrupt();
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        executeSteps.push("C");
        ctx.value = (ctx.value ?? 0) + 3;
      },
    });

    const cpId = "interrupt-resume-test";

    try {
      await graph.executeWithCheckpoint("nodeA", adapter, { checkpointId: cpId });
    } catch (e) {
      if (!(e instanceof CheckpointInterruptError)) throw e;
    }

    const checkpoints = await adapter.list("TestGraph");
    const interrupted = checkpoints.find((c) => c.metadata.interrupted);
    expect(interrupted).to.not.be.undefined;
    expect(interrupted!.context.value).to.equal(3);

    const resumedGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await resumedGraph.resumeFromCheckpoint(interrupted!.id, adapter);
    expect(result.value).to.equal(6);
    expect(executeSteps).to.deep.equal(["A", "B", "C"]);
  });

  it("should save error checkpoint on failure", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 5;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async () => {
        throw new Error("boom");
      },
    });

    const cpId = "error-test";

    try {
      await graph.executeWithCheckpoint("nodeA", adapter, { checkpointId: cpId });
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).to.equal("boom");
    }

    const checkpoints = await adapter.list("TestGraph");
    const errorCp = checkpoints.find((c) => c.metadata.error);
    expect(errorCp).to.not.be.undefined;
    expect(errorCp!.metadata.error).to.equal("boom");
  });

  it("should support custom checkpoint ID prefix", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      checkpointId: "my-custom-id",
    });

    const checkpoints = await adapter.list("TestGraph");
    const custom = checkpoints.find((c) => c.id.startsWith("my-custom-id"));
    expect(custom).to.not.be.null;
  });

  it("should not save checkpoints when saveEveryNode is false", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = 2;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      saveEveryNode: false,
      saveOnComplete: true,
    });

    const checkpoints = await adapter.list("TestGraph");
    const nodeCheckpoints = checkpoints.filter(
      (c) => !c.nodeName.startsWith("__")
    );
    expect(nodeCheckpoints).to.have.length(0);
  });

  it("should not save final checkpoint when saveOnComplete is false", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      saveOnComplete: false,
    });

    const checkpoints = await adapter.list("TestGraph");
    const final = checkpoints.find((c) => c.nodeName === "__completed__");
    expect(final).to.be.undefined;
  });

  it("should throw when resuming from non-existent checkpoint", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async () => {},
    });

    await expect(
      graph.resumeFromCheckpoint("does-not-exist", adapter)
    ).to.be.rejectedWith('Checkpoint "does-not-exist" not found');
  });

  it("should return context immediately when resuming from completed checkpoint", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 99;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      checkpointId: "done-cp",
    });

    const checkpoints = await adapter.list("TestGraph");
    const completed = checkpoints.find((c) => c.nodeName === "__completed__");

    const freshGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await freshGraph.resumeFromCheckpoint(completed!.id, adapter);
    expect(result.value).to.equal(99);
  });

  it("should list checkpoints for the graph", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = 2;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      checkpointId: "list-cp",
    });

    const list = await graph.listCheckpoints(adapter);
    expect(list.length).to.be.greaterThan(0);
    expect(list.every((c) => c.graphName === "TestGraph")).to.be.true;
  });

  it("should handle branching workflow with checkpoints", async () => {
    graph.addNode({
      name: "start",
      execute: async (ctx) => {
        ctx.value = 5;
      },
      next: ["branchA", "branchB"],
    });
    graph.addNode({
      name: "branchA",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) * 2;
      },
    });
    graph.addNode({
      name: "branchB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 10;
      },
    });

    await graph.executeWithCheckpoint("start", adapter);
    expect(graph.getContext().value).to.equal(20);

    const checkpoints = await adapter.list("TestGraph");
    const startCp = checkpoints.find((c) => c.nodeName === "start");
    expect(startCp).to.not.be.undefined;
    expect(startCp!.nextNodes).to.include.members(["branchA", "branchB"]);
  });

  it("should pause at breakpoint and await approval", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 2;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 3;
      },
    });

    try {
      await graph.executeWithCheckpoint("nodeA", adapter, {
        breakpoints: ["nodeB"],
      });
      expect.fail("Should have thrown CheckpointAwaitApprovalError");
    } catch (error) {
      expect(error).to.be.instanceOf(CheckpointAwaitApprovalError);
    }

    const checkpoints = await adapter.list("TestGraph");
    const approvalCp = checkpoints.find((c) => c.metadata.awaitingApproval);
    expect(approvalCp).to.not.be.undefined;
    expect(approvalCp!.nodeName).to.equal("nodeB");
    expect(approvalCp!.context.value).to.equal(1);
  });

  it("should resume from breakpoint with context modifications", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 10;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 20;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 30;
      },
    });

    try {
      await graph.executeWithCheckpoint("nodeA", adapter, {
        breakpoints: ["nodeB"],
      });
    } catch (error) {
      if (!(error instanceof CheckpointAwaitApprovalError)) throw error;
    }

    const checkpoints = await adapter.list("TestGraph");
    const approvalCp = checkpoints.find((c) => c.metadata.awaitingApproval);

    const freshGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await freshGraph.resumeFromCheckpoint(
      approvalCp!.id,
      adapter,
      { value: 100 }
    );
    expect(result.value).to.equal(150);
  });

  it("should track checkpoints by runId", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 2;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, {
      runId: "run-123",
    });

    const checkpoints = await adapter.list("TestGraph");
    const runCheckpoints = checkpoints.filter((c) => c.runId === "run-123");
    expect(runCheckpoints.length).to.be.greaterThan(0);
  });

  it("should time travel: resume from any checkpoint in history", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 10;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 20;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 30;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, { runId: "travel-run" });

    const allCheckpoints = await adapter.list("TestGraph");
    const runCheckpoints = allCheckpoints.filter(
      (c) => c.runId === "travel-run" && !c.nodeName.startsWith("__")
    );
    expect(runCheckpoints.length).to.be.greaterThanOrEqual(1);

    const firstCp = runCheckpoints.find((c) => c.nodeName === "nodeA");
    expect(firstCp).to.not.be.undefined;
    expect(firstCp!.context.value).to.equal(10);

    const travelGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await travelGraph.resumeFromCheckpoint(firstCp!.id, adapter);
    expect(result.value).to.equal(60);
  });

  it("should time travel: rewind and modify state", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.message = "started";
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) + 5;
      },
      next: ["nodeC"],
    });
    graph.addNode({
      name: "nodeC",
      execute: async (ctx) => {
        ctx.value = (ctx.value ?? 0) * 2;
        ctx.message = "done";
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, { runId: "rewind-run" });

    const allCheckpoints = await adapter.list("TestGraph");
    const rewindCheckpoints = allCheckpoints.filter(
      (c) => c.runId === "rewind-run" && !c.nodeName.startsWith("__")
    );

    const nodeACp = rewindCheckpoints.find((c) => c.nodeName === "nodeA");
    expect(nodeACp).to.not.be.undefined;

    const rewindGraph = new GraphFlow({
      name: "TestGraph",
      schema: TestSchema,
      nodes: graph.getNodes(),
      context: { value: 0, counter: 0, message: "" },
    });

    const result = await rewindGraph.resumeFromCheckpoint(
      nodeACp!.id,
      adapter,
      { value: 100 }
    );
    expect(result.value).to.equal(210);
    expect(result.message).to.equal("done");
  });

  it("should get checkpoint history by runId", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = 2;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, { runId: "history-1" });
    await graph.executeWithCheckpoint("nodeA", adapter, { runId: "history-2" });

    const allCheckpoints = await adapter.list("TestGraph");
    const history1 = allCheckpoints.filter((c) => c.runId === "history-1");
    const history2 = allCheckpoints.filter((c) => c.runId === "history-2");

    expect(history1.length).to.be.greaterThan(0);
    expect(history2.length).to.be.greaterThan(0);
    expect(history1.every((c) => c.runId === "history-1")).to.be.true;
    expect(history2.every((c) => c.runId === "history-2")).to.be.true;
  });

  it("should get checkpoint history via getCheckpointHistory method", async () => {
    graph.addNode({
      name: "nodeA",
      execute: async (ctx) => {
        ctx.value = 1;
      },
      next: ["nodeB"],
    });
    graph.addNode({
      name: "nodeB",
      execute: async (ctx) => {
        ctx.value = 2;
      },
    });

    await graph.executeWithCheckpoint("nodeA", adapter, { runId: "method-run" });

    const history = await graph.getCheckpointHistory("method-run", adapter);
    expect(history.length).to.be.greaterThan(0);
    expect(history.every((c) => c.runId === "method-run")).to.be.true;
  });
});
