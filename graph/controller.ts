import { ZodSchema } from "zod";
import { GraphExecutionResult } from "../types";
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
   * @param contexts - Optional array of contexts for each graph
   * @returns Map containing results of each graph execution, keyed by graph name and index
   * @template T - Zod schema type for graph context validation
   */
  static async executeSequential<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    contexts?: Partial<any>[]
  ): Promise<GraphExecutionResult<T>[]> {
    const results: GraphExecutionResult<T>[] = [];

    for (let i = 0; i < graphs.length; i++) {
      const context = await graphs[i].execute(startNodes[i], contexts?.[i]);
      results.push({
        graphName: graphs[i].name,
        nodeName: startNodes[i],
        context,
      });
    }

    return results;
  }

  private static async executeGraph<T extends ZodSchema>(
    graph: GraphFlow<T>,
    startNode: string,
    context?: Partial<any>
  ): Promise<GraphExecutionResult<T>> {
    try {
      const result = await graph.execute(startNode, context);
      return {
        graphName: graph.name,
        nodeName: startNode,
        context: result,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Executes multiple graphs in parallel with optional concurrency control
   * @param graphs - Array of GraphFlow instances to execute
   * @param startNodes - Array of starting node identifiers for each graph
   * @param concurrency - Optional limit on number of concurrent graph executions
   * @param contexts - Optional array of contexts for each graph
   * @returns Map containing results of each graph execution, keyed by graph name
   * @template T - Zod schema type for graph context validation
   */
  static async executeParallel<T extends ZodSchema>(
    graphs: GraphFlow<T>[],
    startNodes: string[],
    concurrency: number,
    contexts?: Partial<any>[]
  ): Promise<GraphExecutionResult<T>[]> {
    const results: GraphExecutionResult<T>[] = [];

    for (let i = 0; i < graphs.length; i += concurrency) {
      const batch = graphs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((graph, idx) => {
          const context = contexts?.[i + idx];
          return this.executeGraph(graph, startNodes[i + idx], context);
        })
      );
      results.push(...batchResults);
    }

    return results;
  }
}
