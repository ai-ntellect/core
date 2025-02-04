import { ZodSchema } from "zod";
import { Graph } from ".";
import { GraphContext } from "../types";

export class GraphController {
  static async executeSequential<T extends ZodSchema>(
    graphs: Graph<T>[],
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

  static async executeParallel<T extends ZodSchema>(
    graphs: Graph<T>[],
    startNodes: string[],
    inputContexts?: Partial<GraphContext<T>>[],
    inputParams?: any[],
    concurrencyLimit?: number
  ): Promise<Map<string, GraphContext<T>>> {
    const results = new Map<string, GraphContext<T>>();

    if (inputContexts) {
      inputContexts = inputContexts.map((ctx) => ctx || {});
    }

    if (inputParams) {
      inputParams = inputParams.map((params) => params || {});
    }

    if (concurrencyLimit) {
      for (let i = 0; i < graphs.length; i += concurrencyLimit) {
        const batchResults = await Promise.all(
          graphs.slice(i, i + concurrencyLimit).map((graph, index) =>
            graph.execute(
              startNodes[i + index],
              inputContexts?.[i + index] || {},
              inputParams?.[i + index] || {} // ✅ Passe bien les paramètres
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
            inputParams?.[index] || {}
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
