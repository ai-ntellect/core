import { ZodSchema } from "zod";
import { GraphContext } from "../types";
import { GraphFlow } from "./index";

/**
 * Controller class for managing the execution of graph flows
 * Handles both sequential and parallel execution of multiple graphs
 */
export class GraphController {
  /**
   * Executes multiple graphs sequentially
   * @param graphs - Array of GraphFlow instances to execute
   * @param startNodes - Array of starting node identifiers for each graph
   * @param inputContexts - Optional array of initial contexts for each graph
   * @returns Map containing results of each graph execution, keyed by graph name and index
   * @template T - Zod schema type for graph context validation
   */
  static async executeSequential<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    inputContexts?: Partial<GraphContext<T>>[]
  ): Promise<Map<string, GraphContext<T>>> {
    const results = new Map<string, GraphContext<T>>();
    for (let i = 0; i < graphs.length; i++) {
      const result = await graphs[i].execute(startNodes[i], inputContexts?.[i]);
      results.set(`${graphs[i].name}-${i}`, result);
    }
    return results;
  }

  /**
   * Executes multiple graphs in parallel with optional concurrency control
   * @param graphs - Array of GraphFlow instances to execute
   * @param startNodes - Array of starting node identifiers for each graph
   * @param inputContexts - Optional array of initial contexts for each graph
   * @param inputs - Optional array of additional inputs for each graph
   * @param concurrencyLimit - Optional limit on number of concurrent graph executions
   * @returns Map containing results of each graph execution, keyed by graph name
   * @template T - Zod schema type for graph context validation
   */
  static async executeParallel<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    inputContexts?: Partial<GraphContext<T>>[],
    inputs?: any[],
    concurrencyLimit?: number
  ): Promise<Map<string, GraphContext<T>>> {
    const results = new Map<string, GraphContext<T>>();

    if (inputContexts) {
      inputContexts = inputContexts.map((ctx) => ctx || {});
    }

    if (inputs) {
      inputs = inputs.map((input) => input || {});
    }

    if (concurrencyLimit) {
      for (let i = 0; i < graphs.length; i += concurrencyLimit) {
        const batchResults = await Promise.all(
          graphs
            .slice(i, i + concurrencyLimit)
            .map((graph, index) =>
              graph.execute(
                startNodes[i + index],
                inputContexts?.[i + index] || {},
                inputs?.[i + index]
              )
            )
        );
        batchResults.forEach((result, index) => {
          results.set(`${graphs[i + index].name}`, result);
        });
      }
    } else {
      const allResults = await Promise.all(
        graphs.map((graph, index) =>
          graph.execute(
            startNodes[index],
            inputContexts?.[index] || {},
            inputs?.[index] || {}
          )
        )
      );
      allResults.forEach((result, index) => {
        results.set(`${graphs[index].name}`, result);
      });
    }
    return results;
  }
}
