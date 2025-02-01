import { GraphEngine } from "../graph/engine";
import { Action, GraphDefinition, SharedState } from "../types";

export function setupGraphsWithActions<T>(
  actions: Action[],
  baseStateMapping: Record<string, SharedState<T>>,
  graphMaps: GraphDefinition<T>[]
): {
  initialStates: SharedState<T>[];
  graphs: GraphEngine<T>[];
  startNodes: string[];
} {
  const initialStates = actions.map((action) => {
    const parametersObject = Object.fromEntries(
      action.parameters.map((param) => [
        param.name,
        param.value !== undefined ? param.value : null,
      ]) // Handle optional values
    );

    const baseState = baseStateMapping[action.name] || {};

    return {
      ...baseState,
      ...parametersObject,
    };
  });

  const selectedGraphs = actions
    .map((action) => graphMaps.find((graph) => graph.name === action.name))
    .filter((graph): graph is GraphDefinition<T> => graph !== undefined);

  if (selectedGraphs.length !== actions.length) {
    throw new Error("Graph not found");
  }

  const startNodes = selectedGraphs.map((graph) => graph.entryNode);
  const graphEngines = selectedGraphs.map((graph) => new GraphEngine(graph));

  return {
    initialStates: initialStates as SharedState<T>[],
    graphs: graphEngines,
    startNodes,
  };
}
