import { expect } from "chai";
import { GraphFlow } from "../../graph";
import { nodeRegistry } from "../../graph/registry";
import { ParallelNodeConfig } from "../../graph/types.parallel";
import { GraphContext } from "../../types";

describe("Fork-Join Parallelism", () => {
  beforeEach(() => {
    // Nettoyer le registry avant chaque test
    (nodeRegistry as any).executeFunctions.clear();
    (nodeRegistry as any).nodeConfigs.clear();
  });

  it("should execute branches in parallel with Promise.all", async () => {
    const executionTimes: number[] = [];
    const startTime = Date.now();

    const nodes: ParallelNodeConfig<any>[] = [
      {
        name: "A",
        execute: async (ctx: any) => {
          ctx.value = 1;
        },
        parallel: { enabled: true, joinNode: "C" },
        next: ["B1", "B2", "B3"],
      },
      {
        name: "B1",
        execute: async (ctx: any) => {
          const start = Date.now();
          await new Promise(r => setTimeout(r, 100));
          executionTimes.push(Date.now() - start);
          ctx.results = [...(ctx.results || []), "B1"];
        },
      },
      {
        name: "B2",
        execute: async (ctx: any) => {
          const start = Date.now();
          await new Promise(r => setTimeout(r, 50));
          executionTimes.push(Date.now() - start);
          ctx.results = [...(ctx.results || []), "B2"];
        },
      },
      {
        name: "B3",
        execute: async (ctx: any) => {
          const start = Date.now();
          await new Promise(r => setTimeout(r, 150));
          executionTimes.push(Date.now() - start);
          ctx.results = [...(ctx.results || []), "B3"];
        },
      },
      {
        name: "C",
        execute: async (ctx: any) => {
          ctx.value = 2;
        },
      },
    ];

    const graph = new GraphFlow({
      name: "fork-join-test",
      schema: { parse: (ctx: any) => ctx } as any,
      context: { value: 0, results: [] as string[] },
      nodes: nodes,
      entryNode: "A",
    });

    // Enregistrer les nodes
    nodes.forEach(node => nodeRegistry.registerParallel(node));

    const context = await graph.execute("A");

    const totalTime = Date.now() - startTime;

    expect(context.value).to.equal(2);
    expect(context.results).to.have.length(3);
    expect(context.results).to.include("B1");
    expect(context.results).to.include("B2");
    expect(context.results).to.include("B3");
    
    // Le temps total devrait être proche du max(100, 50, 150) = 150ms
    // et non 100+50+150 = 300ms (séquentiel)
    expect(totalTime).to.be.lessThan(250); // Marge de manœuvre
  });

  it("should merge contexts with deep-merge by default", async () => {
    const nodes: ParallelNodeConfig<any>[] = [
      {
        name: "start",
        execute: async (ctx: any) => {
          ctx.base = "base";
        },
        parallel: { enabled: true, joinNode: "merge" },
        next: ["branch1", "branch2"],
      },
      {
        name: "branch1",
        execute: async (ctx: any) => {
          ctx.fromBranch1 = "value1";
        },
      },
      {
        name: "branch2",
        execute: async (ctx: any) => {
          ctx.fromBranch2 = "value2";
        },
      },
      {
        name: "merge",
        execute: async (ctx: any) => {
          ctx.merged = true;
        },
      },
    ];

    const graph = new GraphFlow({
      name: "merge-test",
      schema: { parse: (ctx: any) => ctx } as any,
      context: {} as any,
      nodes: nodes,
      entryNode: "start",
    });

    nodes.forEach(node => nodeRegistry.registerParallel(node));

    const context = await graph.execute("start");

    expect(context.base).to.equal("base");
    expect(context.fromBranch1).to.equal("value1");
    expect(context.fromBranch2).to.equal("value2");
    expect(context.merged).to.be.true;
  });
});
