import { GraphFlow } from './index';
import { z } from 'zod';
import { Plan } from './planner';
import { ToolRegistry } from './registry';

export function compilePlan(plan: Plan, registry: ToolRegistry): { graph: GraphFlow<any>; startNode: string } {
  const graph = new GraphFlow<any>({
    name: 'compiled-plan',
    context: {},
    schema: z.object({}).passthrough(),
    nodes: [],
    entryNode: '',
  });

  plan.steps.forEach((step, index) => {
    const tool = registry.get(step.node);
    if (!tool) {
      throw new Error(`Unknown tool: ${step.node}`);
    }

    const nodeName = `step_${index}_${step.node}`;
    const nextNode = index < plan.steps.length - 1
      ? `step_${index + 1}_${plan.steps[index + 1].node}`
      : undefined;

    graph.addNode({
      name: nodeName,
      execute: async (ctx: any) => {
        // Merge accumulated context with step params
        const toolCtx = { ...ctx, ...step.params };
        console.log(`  [${nodeName}] Executing ${step.node} with:`, toolCtx);

        // Execute the tool's graph
        const resultCtx = await tool.graph.execute(tool.startNode, toolCtx);

        // Merge tool result back into ctx (which is the graph's context)
        Object.assign(ctx, resultCtx, { _lastStep: step.node });
        console.log(`  [${nodeName}] Updated context:`, ctx);
      },
      next: nextNode,
    });
  });

  const startNode = plan.steps.length > 0 ? `step_0_${plan.steps[0].node}` : '';

  return { graph, startNode };
}
