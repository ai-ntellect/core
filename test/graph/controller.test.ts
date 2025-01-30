import { GraphController } from "@/graph/controller";
import { GraphDefinition } from "@/types";
import { expect } from "chai";
import { z } from "zod";

describe("Controller", () => {
  // Define test schema
  const TestSchema = z.object({
    status: z.string(),
    count: z.number(),
  });

  type TestState = z.infer<typeof TestSchema>;

  // Sample workflow definitions
  const simpleWorkflow: GraphDefinition<TestState> = {
    name: "simple-workflow",
    entryNode: "start",
    nodes: {
      start: {
        name: "start",
        execute: async (_params: any, state: any) => ({
          context: {
            ...state.context,
            status: "completed",
            count: state.context.count + 1,
          },
        }),
        relationships: [],
      },
    },
    schema: TestSchema,
  };

  const complexWorkflow: GraphDefinition<TestState> = {
    name: "complex-workflow",
    entryNode: "first",
    nodes: {
      first: {
        name: "first",
        execute: async (_params: any, state: any) => ({
          context: {
            ...state.context,
            status: "step1",
            count: state.context.count + 2,
          },
        }),
        relationships: [],
      },
    },
    schema: TestSchema,
  };

  let controller: GraphController<TestState>;

  beforeEach(() => {
    controller = new GraphController<TestState>();
  });

  describe("Basic Execution", () => {
    it("should execute a single workflow successfully", async () => {
      const actions = [
        {
          name: "simple-workflow",
          parameters: [
            { name: "status", value: "initial" },
            { name: "count", value: 0 },
          ],
        },
      ];

      const result = await controller.run(actions, [simpleWorkflow]);

      expect(result.context).to.deep.equal({
        status: "completed",
        count: 1,
      });
    });

    it("should handle multiple workflows", async () => {
      const actions = [
        {
          name: "complex-workflow",
          parameters: [
            { name: "status", value: "initial" },
            { name: "count", value: 0 },
          ],
        },
      ];

      const result = await controller.run(actions, [
        simpleWorkflow,
        complexWorkflow,
      ]);

      expect(result.context).to.deep.equal({
        status: "step1",
        count: 2,
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when no actions provided", async () => {
      try {
        await controller.run([], [simpleWorkflow]);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).to.equal("No actions provided");
      }
    });

    it("should throw error when workflow not found", async () => {
      const actions = [
        {
          name: "non-existent-workflow",
          parameters: [
            { name: "status", value: "initial" },
            { name: "count", value: 0 },
          ],
        },
      ];

      try {
        await controller.run(actions, [simpleWorkflow]);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).to.equal(
          "Graph not found: non-existent-workflow"
        );
      }
    });
  });

  describe("Parameter Handling", () => {
    it("should correctly process workflow parameters", async () => {
      const actions = [
        {
          name: "simple-workflow",
          parameters: [
            { name: "status", value: "custom-initial" },
            { name: "count", value: 10 },
          ],
        },
      ];

      const result = await controller.run(actions, [simpleWorkflow]);

      expect(result.context).to.deep.equal({
        status: "completed",
        count: 11,
      });
    });
  });

  describe("Multiple Actions", () => {
    it("should process the first action only", async () => {
      const actions = [
        {
          name: "simple-workflow",
          parameters: [
            { name: "status", value: "initial" },
            { name: "count", value: 0 },
          ],
        },
        {
          name: "complex-workflow",
          parameters: [
            { name: "status", value: "initial" },
            { name: "count", value: 5 },
          ],
        },
      ];

      const result = await controller.run(actions, [
        simpleWorkflow,
        complexWorkflow,
      ]);

      expect(result.context).to.deep.equal({
        status: "completed",
        count: 1,
      });
    });
  });
});
