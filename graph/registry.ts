import { ZodSchema } from "zod";
import { GraphNodeConfig } from "../types";
import { ParallelNodeConfig } from "./types.parallel";

/**
 * Registry centralisé pour les fonctions execute
 * Évite le transfert de fonctions aux workers
 * Pattern utilisé par LangGraph (tools registry)
 */
export class NodeRegistry {
  private static instance: NodeRegistry;
  private executeFunctions = new Map<string, Function>();
  private nodeConfigs = new Map<string, GraphNodeConfig<any, any>>();
  private subgraphs = new Map<string, any>(); // GraphFlow instances

  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  register<T extends ZodSchema>(nodeConfig: GraphNodeConfig<T, any>): void {
    this.nodeConfigs.set(nodeConfig.name, nodeConfig);
    this.executeFunctions.set(nodeConfig.name, nodeConfig.execute);
  }

  registerParallel<T extends ZodSchema>(nodeConfig: ParallelNodeConfig<T, any>): void {
    this.nodeConfigs.set(nodeConfig.name, nodeConfig as any);
    this.executeFunctions.set(nodeConfig.name, nodeConfig.execute);
  }

  registerSubgraph(name: string, graph: any): void {
    this.subgraphs.set(name, graph);
  }

  getExecute(nodeName: string): Function | undefined {
    return this.executeFunctions.get(nodeName);
  }

  getNodeConfig(nodeName: string): GraphNodeConfig<any, any> | undefined {
    return this.nodeConfigs.get(nodeName);
  }

  getSubgraph(name: string): any | undefined {
    return this.subgraphs.get(name);
  }

  // Version sérialisable (sans fonctions) pour workers
  getSerializableConfig(nodeName: string): any | undefined {
    const config = this.nodeConfigs.get(nodeName);
    if (!config) return undefined;
    const { execute, condition, ...serializable } = config as any;
    return serializable;
  }

  clear(): void {
    this.executeFunctions.clear();
    this.nodeConfigs.clear();
    this.subgraphs.clear();
  }
}

// Export singleton
export const nodeRegistry = NodeRegistry.getInstance();
