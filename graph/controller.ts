import { ZodSchema } from "zod";
import { GraphContext } from "../types";
import { GraphFlow } from "./index";
import { NodeParams } from "./node";

/**
 * Controller class for managing the execution of graph flows
 * Handles both sequential and parallel execution of multiple graphs
 */
export class GraphController {
  /**
   * Executes multiple graphs sequentially
   * @param graphs - Array of GraphFlow instances to execute
   * @param startNodes - Array of starting node identifiers for each graph
   * @param inputs - Optional array of additional inputs for each graph
   * @param params - Optional array of node parameters for each graph
   * @returns Map containing results of each graph execution, keyed by graph name and index
   * @template T - Zod schema type for graph context validation
   */
  static async executeSequential<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    params?: NodeParams[]
  ): Promise<any[]> {
    const results = new Map<string, GraphContext<T>>();
    for (let i = 0; i < graphs.length; i++) {
      const result = await graphs[i].execute(
        startNodes[i],
        params?.[i],
        undefined
      );
      results.set(`${graphs[i].name}-${i}`, result);
    }
    return Array.from(results.values());
  }

  private static async executeGraph<T extends ZodSchema>(
    graph: GraphFlow<T>,
    startNode: string,
    params?: NodeParams
  ): Promise<GraphContext<T>> {
    try {
      return await graph.execute(startNode, params);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Executes multiple graphs in parallel with optional concurrency control
   * @param graphs - Array of GraphFlow instances to execute
   * @param startNodes - Array of starting node identifiers for each graph
   * @param concurrency - Optional limit on number of concurrent graph executions
   * @param inputs - Optional array of additional inputs for each graph
   * @returns Map containing results of each graph execution, keyed by graph name
   * @template T - Zod schema type for graph context validation
   */
  static async executeParallel<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    concurrency: number,
    inputs?: any[]
  ): Promise<GraphContext<T>[]> {
    const results: GraphContext<T>[] = [];

    for (let i = 0; i < graphs.length; i += concurrency) {
      const batch = graphs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((graph, idx) => {
          const input = inputs?.[i + idx];
          return this.executeGraph(graph, startNodes[i + idx], input);
        })
      );
      results.push(...batchResults);
    }

    return results;
  }
}
