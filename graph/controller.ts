import { GraphDefinition } from "@/types";
import { GraphEngine } from "./engine";

/**
 * Controller responsible for executing workflows based on graph definitions.
 * @template T The type representing the graph's state.
 */
export class GraphController<T> {
  /**
   * Executes a sequence of actions using the corresponding graph definitions.
   * @param {any[]} actions - The list of actions to execute.
   * @param {GraphDefinition<T>[]} graphs - The available graph definitions.
   * @returns {Promise<any>} The final state of the executed workflow.
   * @throws {Error} If no actions are provided or if the graph is not found.
   */
  async run(actions: any[], graphs: GraphDefinition<T>[]): Promise<any> {
    if (actions.length === 0) {
      throw new Error("No actions provided");
    }

    // Create a mapping of graph names to their definitions for quick lookup.
    const graphMap = new Map(graphs.map((g) => [g.name, g]));

    for (const action of actions) {
      // Retrieve the graph definition based on the action name.
      const graphDefinition = graphMap.get(action.name);
      if (!graphDefinition) {
        throw new Error(`Graph not found: ${action.name}`);
      }

      // Initialize the graph engine with the selected graph definition.
      const graph = new GraphEngine(graphDefinition, {
        schema: graphDefinition.schema,
        autoDetectCycles: true,
      });

      // Construct the initial state from action parameters.
      const initialState = {
        context: action.parameters.reduce(
          (acc: Record<string, any>, param: { name: string; value: any }) => {
            acc[param.name] = param.value;
            return acc;
          },
          {}
        ),
      };

      // Execute the graph starting from the defined entry node.
      await graph.execute(initialState, graphDefinition.entryNode);

      // Retrieve the final state after execution.
      const result = graph.getState();
      if (!result) {
        throw new Error("Workflow execution failed to return a state");
      }

      return result;
    }
  }
}
