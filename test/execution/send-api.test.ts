import { expect } from "chai";
import { GraphFlow } from "../../execution";
import { nodeRegistry } from "../../execution/registry";
import { ParallelNodeConfig } from "../../execution/types.parallel";

describe("Send API (Fan-out dynamique)", () => {
  beforeEach(() => {
    (nodeRegistry as any).executeFunctions.clear();
    (nodeRegistry as any).nodeConfigs.clear();
  });

  it("should fan-out to dynamic number of branches", async () => {
    const items = ["item1", "item2", "item3"];
    let processedCount = 0;

    const nodes: ParallelNodeConfig<any>[] = [
      {
        name: "start",
        execute: async (ctx: any) => {
          ctx.processed = [];
        },
        send: (ctx: any) => {
          return ctx.items.map((item: string, i: number) => ({
            to: "processItem",
            input: { currentItem: item, index: i },
            branchId: `item_${i}`,
          }));
        },
        parallel: { enabled: true, joinNode: "done" },
      },
      {
        name: "processItem",
        execute: async (ctx: any) => {
          ctx.processed.push(`Processed: ${ctx.currentItem}`);
        },
      },
      {
        name: "done",
        execute: async (ctx: any) => {
          ctx.finished = true;
        },
      },
    ];

    const graph = new GraphFlow({
      name: "send-api-test",
      schema: { parse: (ctx: any) => ctx } as any,
      context: { items, processed: [] as string[] },
      nodes: nodes,
      entryNode: "start",
    });

    nodes.forEach(node => nodeRegistry.registerParallel(node));

    const context = await graph.execute("start");

    expect(context.processed).to.have.length(3);
    expect(context.finished).to.be.true;
    expect(context.processed[0]).to.include("item1");
    expect(context.processed[1]).to.include("item2");
    expect(context.processed[2]).to.include("item3");
  });

  it("should use reducers for state merge", async () => {
    const nodes: ParallelNodeConfig<any>[] = [
      {
        name: "start",
        execute: async (ctx: any) => {
          ctx.results = [];
        },
        send: (ctx: any) => {
          return [
            { to: "addOne", input: { value: "A" } },
            { to: "addTwo", input: { value: "B" } },
          ];
        },
        parallel: { enabled: true, joinNode: "merge" },
        reducers: [
          {
            key: "results",
            reducer: (acc: string[], val: string) => [...acc, val],
            initial: [],
          },
        ],
      },
      {
        name: "addOne",
        execute: async (ctx: any) => {
          ctx.results.push(ctx.value);
        },
      },
      {
        name: "addTwo",
        execute: async (ctx: any) => {
          ctx.results.push(ctx.value);
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
      name: "reducer-test",
      schema: { parse: (ctx: any) => ctx } as any,
      context: {} as any,
      nodes: nodes,
      entryNode: "start",
    });

    nodes.forEach(node => nodeRegistry.registerParallel(node));

    const context = await graph.execute("start");

    expect(context.results).to.have.length(2);
    expect(context.merged).to.be.true;
  });
});
