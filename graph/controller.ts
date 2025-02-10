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
  static async executeSequential<T extends ZodSchema[]>(
    graphs: { [K in keyof T]: GraphFlow<T[K]> },
    startNodes: string[],
    inputs: any[]
  ): Promise<any[]> {
    const results = new Map<string, GraphContext<T[keyof T]>>();
    for (let i = 0; i < graphs.length; i++) {
      const result = await graphs[i].execute(startNodes[i], inputs[i]);
      results.set(`${graphs[i].name}-${i}`, result);
    }
    return Array.from(results.values());
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
  static async executeParallel<T extends ZodSchema[]>(
    graphs: { [K in keyof T]: GraphFlow<T[K]> },
    startNodes: string[],
    concurrency: number,
    inputs: any[]
  ): Promise<any[]> {
    const results = new Map<string, GraphContext<T[keyof T]>>();

    if (inputs) {
      inputs = inputs.map((input) => input || {});
    }

    if (concurrency) {
      for (let i = 0; i < graphs.length; i += concurrency) {
        const batchResults = await Promise.all(
          graphs
            .slice(i, i + concurrency)
            .map((graph, index) =>
              graph.execute(startNodes[i + index], inputs?.[i + index])
            )
        );
        batchResults.forEach((result, index) => {
          results.set(`${graphs[i + index].name}`, result);
        });
      }
    } else {
      const allResults = await Promise.all(
        graphs.map((graph, index) =>
          graph.execute(startNodes[index], inputs?.[index] || {})
        )
      );
      allResults.forEach((result, index) => {
        results.set(`${graphs[index].name}`, result);
      });
    }
    return Array.from(results.values());
  }
}
