import { expect } from "chai";
import { z } from "zod";
import { GraphController } from "../../graph/controller";
import { GraphFlow } from "../../graph/index";
import { GraphContext, GraphNodeConfig } from "../../types";

describe("GraphController", () => {
  const TestSchema = z.object({
    counter: z.number(),
    message: z.string(),
    value: z.number().optional(),
    prefix: z.string().optional(),
  });

  const createTestGraph = (name: string): GraphFlow<typeof TestSchema> => {
    const nodes: GraphNodeConfig<typeof TestSchema>[] = [
      {
        name: "start",
        execute: async (context) => {
          if (context.value !== undefined) {
            context.counter = context.value;
          }
          if (context.prefix) {
            context.message = `${context.prefix}-${name}`;
          } else {
            context.message = name;
          }
        },
      },
      {
        name: "increment",
        execute: async (context) => {
          context.counter += 1;
        },
      },
    ];

    return new GraphFlow({
      name,
      nodes,
      schema: TestSchema,
      context: { counter: 0, message: "" },
    });
  };

  describe("Sequential Execution", () => {
    it("should execute graphs sequentially with different contexts", async () => {
      const graph1 = createTestGraph("graph1");
      const graph2 = createTestGraph("graph2");
      const graph3 = createTestGraph("graph3");

      const contexts = [
        { value: 10, prefix: "test1" },
        { value: 20, prefix: "test2" },
        { value: 30, prefix: "test3" },
      ];

      const results = await GraphController.executeSequential(
        [graph1, graph2, graph3],
        ["start", "start", "start"],
        contexts
      );

      expect(results).to.have.length(3);
      expect(results[0].context.counter).to.equal(10);
      expect(results[1].context.counter).to.equal(20);
      expect(results[2].context.counter).to.equal(30);
      expect(results[0].context.message).to.equal("test1-graph1");
      expect(results[1].context.message).to.equal("test2-graph2");
      expect(results[2].context.message).to.equal("test3-graph3");
      expect(results[0].graphName).to.equal("graph1");
      expect(results[0].nodeName).to.equal("start");
    });

    it("should handle missing contexts gracefully", async () => {
      const graph1 = createTestGraph("graph1");
      const graph2 = createTestGraph("graph2");

      const results = await GraphController.executeSequential(
        [graph1, graph2],
        ["start", "start"]
      );

      expect(results).to.have.length(2);
      expect(results[0].context.counter).to.equal(0);
      expect(results[1].context.counter).to.equal(0);
      expect(results[0].context.message).to.equal("graph1");
      expect(results[1].context.message).to.equal("graph2");
    });
  });

  describe("Parallel Execution", () => {
    it("should execute graphs in parallel with concurrency limit", async () => {
      const graphs = Array.from({ length: 5 }, (_, i) =>
        createTestGraph(`graph${i + 1}`)
      );

      const contexts = Array.from({ length: 5 }, (_, i) => ({
        value: (i + 1) * 10,
        prefix: `test${i + 1}`,
      }));

      // Ajouter un délai dans l'exécution
      const originalExecute = graphs[0].execute;
      graphs[0].execute = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return originalExecute.apply(graphs[0], args);
      };

      const startTime = Date.now();
      const results = await GraphController.executeParallel(
        graphs,
        Array(5).fill("start"),
        2,
        contexts
      );
      const executionTime = Date.now() - startTime;

      expect(executionTime).to.be.greaterThan(0);
      expect(results).to.have.length(5);
      results.forEach((result, i) => {
        expect(result.context.counter).to.equal((i + 1) * 10);
        expect(result.context.message).to.equal(`test${i + 1}-graph${i + 1}`);
      });
    });

    it("should handle errors in parallel execution", async () => {
      const errorGraph = new GraphFlow({
        name: "errorGraph",
        nodes: [
          {
            name: "start",
            execute: async () => {
              throw new Error("Test error");
            },
          },
        ],
        schema: TestSchema,
        context: { counter: 0, message: "" },
      });

      const successGraph = createTestGraph("successGraph");

      try {
        await GraphController.executeParallel(
          [errorGraph, successGraph],
          ["start", "start"],
          2
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.equal("Test error");
      }
    });
  });

  describe("Complex Workflows", () => {
    it("should handle mixed sequential and parallel execution", async () => {
      const graphs = Array.from({ length: 4 }, (_, i) =>
        createTestGraph(`graph${i + 1}`)
      );

      // Exécuter les deux premiers graphes en parallèle
      const parallelResults = await GraphController.executeParallel(
        graphs.slice(0, 2),
        ["start", "start"],
        2,
        [
          { value: 10, prefix: "parallel1" },
          { value: 20, prefix: "parallel2" },
        ]
      );

      // Puis exécuter les deux suivants séquentiellement
      const sequentialResults = await GraphController.executeSequential(
        graphs.slice(2),
        ["start", "start"],
        [
          { value: 30, prefix: "seq1" },
          { value: 40, prefix: "seq2" },
        ]
      );

      const allResults = [...parallelResults, ...sequentialResults];
      expect(allResults).to.have.length(4);
      expect(allResults.map((r) => r.context.counter)).to.deep.equal([
        10, 20, 30, 40,
      ]);
      expect(allResults.map((r) => r.context.message)).to.deep.equal([
        "parallel1-graph1",
        "parallel2-graph2",
        "seq1-graph3",
        "seq2-graph4",
      ]);
    });
  });

  it("should wait for correlated events", async function () {
    const graph = new GraphFlow({
      name: "test",
      schema: TestSchema,
      nodes: [
        {
          name: "correlatedEventsNode",
          when: {
            events: ["eventA", "eventB"],
            timeout: 1000,
            strategy: {
              type: "correlate",
              correlation: (events) => {
                const eventA = events.find((e) => e.type === "eventA");
                const eventB = events.find((e) => e.type === "eventB");
                return eventA?.payload?.id === eventB?.payload?.id;
              },
            },
          },
          execute: async (context: GraphContext<typeof TestSchema>) => {
            context.message = "Correlated events received";
          },
        },
      ],
      context: { value: 0, counter: 0, message: "" },
    });

    const execution = graph.execute("correlatedEventsNode");

    // Émettre les événements corrélés
    setTimeout(() => {
      graph.emit("eventA", { id: "123", status: "completed" });
      graph.emit("eventB", { id: "123", status: "available" });
    }, 100);

    await execution;
    expect(graph.getContext().message).to.equal("Correlated events received");
  });
});
