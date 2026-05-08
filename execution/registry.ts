import { GraphFlow } from './index';
import { ParallelNodeConfig } from './types.parallel';

// ========== Parallel Node Registry (legacy) ==========

export const nodeRegistry = {
  executeFunctions: new Map<string, Function>(),
  nodeConfigs: new Map<string, ParallelNodeConfig<any>>(),
  subgraphs: new Map<string, GraphFlow<any>>(),

  registerParallel(nodeConfig: ParallelNodeConfig<any>) {
    this.nodeConfigs.set(nodeConfig.name, nodeConfig);
    if (nodeConfig.execute) {
      this.executeFunctions.set(nodeConfig.name, nodeConfig.execute);
    }
  },

  registerSubgraph(name: string, graph: GraphFlow<any>) {
    this.subgraphs.set(name, graph);
  },

  getSubgraph(name: string) {
    return this.subgraphs.get(name);
  },

  getExecuteFunction(nodeName: string) {
    return this.executeFunctions.get(nodeName);
  },

  getNodeConfig(nodeName: string) {
    return this.nodeConfigs.get(nodeName);
  },

  clear() {
    this.executeFunctions.clear();
    this.nodeConfigs.clear();
    this.subgraphs.clear();
  },
};

// ========== Tool Registry for Plan → Compile → Execute ==========

export interface RegisteredTool {
  name: string;
  description: string;
  graph: GraphFlow<any>;
  startNode: string;
}

export interface PlanStep {
  node: string;
  params?: Record<string, any>;
  description?: string;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values()).map(({ name, description }) => ({
      name,
      description,
    }));
  }

  validateSteps(steps: PlanStep[]) {
    const errors: string[] = [];
    steps.forEach((step, index) => {
      if (!this.tools.has(step.node)) {
        errors.push(`Step ${index}: Unknown node ${step.node}`);
      }
    });
    return { valid: errors.length === 0, errors };
  }
}
