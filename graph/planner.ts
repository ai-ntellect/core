import { z } from 'zod';
import { ToolRegistry, PlanStep } from './registry';

export const PlanSchema = z.object({
  goal: z.string(),
  steps: z.array(
    z.object({
      node: z.string(),
      params: z.record(z.any()).optional(),
      description: z.string().optional(),
    })
  ),
});

export type Plan = z.infer<typeof PlanSchema>;

export async function generatePlan(
  userIntent: string,
  registry: ToolRegistry,
  llmCall: (prompt: string) => Promise<string>
): Promise<Plan> {
  const availableTools = registry.list();

  const prompt = `You are a workflow planner. Generate a structured plan as JSON with "goal" (string) and "steps" (array of { node: string, params?: Record<string, any>, description?: string }).
Only use tools from the available list.

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

User intent: ${userIntent}

Respond with valid JSON only.`;

  const response = await llmCall(prompt);
  return PlanSchema.parse(JSON.parse(response));
}

export function renderPlan(plan: Plan): string {
  return `Goal: ${plan.goal}\nSteps:\n${plan.steps.map((s, i) => `${i + 1}. ${s.node}${s.description ? ` (${s.description})` : ''}`).join('\n')}`;
}
