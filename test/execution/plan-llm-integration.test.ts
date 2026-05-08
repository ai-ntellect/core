import { expect } from 'chai';
import { z } from 'zod';
import { GraphFlow } from '../../execution/index';
import { ToolRegistry } from '../../execution/registry';
import { generatePlan, PlanSchema, renderPlan } from '../../execution/planner';
import { compilePlan } from '../../execution/compiler';

// Read .env manually
function loadEnv(): Record<string, string> {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('.env', 'utf-8');
    const env: Record<string, string> = {};
    content.split('\n').forEach((line: string) => {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return env;
  } catch {
    return {};
  }
}

// Real LLM call via Groq
async function callGroq(prompt: string): Promise<string> {
  const env = loadEnv();
  const apiKey = env['GROQ_API_KEY'];
  if (!apiKey) throw new Error('GROQ_API_KEY not found in .env');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'You are a workflow planner. Output valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Real onchain tools using GraphFlow
function createCheckBalanceTool() {
  const g = new GraphFlow<any>({
    name: 'check_balance',
    context: { balance: 0, address: '' },
    schema: z.object({ balance: z.number(), address: z.string() }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [check_balance] Checking balance for ${ctx.address || 'default wallet'}`);
        ctx.balance = 1.5; // Mock: 1.5 ETH
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createEstimateGasTool() {
  const g = new GraphFlow<any>({
    name: 'estimate_gas',
    context: { gas: 0, to: '', amount: '' },
    schema: z.object({ gas: z.number(), to: z.union([z.string(), z.number()]), amount: z.union([z.string(), z.number()]) }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [estimate_gas] Estimating gas for ${ctx.amount} ETH to ${ctx.to}`);
        ctx.gas = 21000;
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createSendEthTool() {
  const g = new GraphFlow<any>({
    name: 'send_eth',
    context: { txHash: '', to: '', amount: '' },
    schema: z.object({ txHash: z.string(), to: z.union([z.string(), z.number()]), amount: z.union([z.string(), z.number()]) }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [send_eth] Sending ${ctx.amount} ETH to ${ctx.to}`);
        ctx.txHash = '0xabc123...'; // Mock tx hash
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createGetTokenPriceTool() {
  const g = new GraphFlow<any>({
    name: 'get_token_price',
    context: { price: 0, symbol: '' },
    schema: z.object({ price: z.number(), symbol: z.string() }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [get_token_price] Getting price for ${ctx.symbol}`);
        ctx.price = 2500; // Mock: ETH price
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createSwapTokensTool() {
  const g = new GraphFlow<any>({
    name: 'swap_tokens',
    context: { swapHash: '', from: '', to: '', amount: '' },
    schema: z.object({ swapHash: z.string(), from: z.string(), to: z.string(), amount: z.union([z.string(), z.number()]) }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [swap_tokens] Swapping ${ctx.amount} ${ctx.from} to ${ctx.to}`);
        ctx.swapHash = '0xdef456...';
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

describe('Plan → Compile → Execute (Real LLM + Onchain Use Cases)', function () {
  this.timeout(60000); // LLM calls can take time

  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register({
      name: 'check_balance',
      description: 'Check wallet ETH balance',
      graph: createCheckBalanceTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'estimate_gas',
      description: 'Estimate gas for a transaction',
      graph: createEstimateGasTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'send_eth',
      description: 'Send ETH to an address',
      graph: createSendEthTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'get_token_price',
      description: 'Get current token price',
      graph: createGetTokenPriceTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'swap_tokens',
      description: 'Swap tokens on DEX',
      graph: createSwapTokensTool(),
      startNode: 'run',
    });
  });

  it('USE CASE 1: Send ETH - should generate a valid plan and execute it', async () => {
    console.log('\n=== USE CASE 1: Send 0.5 ETH to an address ===\n');

    const plan = await generatePlan(
      'Check my balance, estimate gas, then send 0.5 ETH to 0x1234567890abcdef',
      registry,
      callGroq
    );

    console.log('Generated plan:', JSON.stringify(plan, null, 2));
    console.log('\n' + renderPlan(plan));

    // Validate plan
    const validated = PlanSchema.parse(plan);
    expect(validated.goal).to.be.a('string');
    expect(validated.steps.length).to.be.at.least(2);

    // Validate against registry
    const validation = registry.validateSteps(validated.steps);
    expect(validation.valid).to.be.true;

    // Compile and execute
    const { graph, startNode } = compilePlan(plan, registry);
    console.log(`\nExecuting from node: ${startNode}`);

    const ctx = await graph.execute(startNode, {});
    console.log('\nFinal context:', JSON.stringify(ctx, null, 2));

    expect(ctx).to.be.an('object');
    console.log('\n✅ USE CASE 1 COMPLETED\n');
  });

  it('USE CASE 2: Swap tokens - should generate a plan with price check', async () => {
    console.log('\n=== USE CASE 2: Swap tokens with price check ===\n');

    const plan = await generatePlan(
      'Get ETH price, then swap 100 USDC to ETH',
      registry,
      callGroq
    );

    console.log('Generated plan:', JSON.stringify(plan, null, 2));
    console.log('\n' + renderPlan(plan));

    // Validate
    const validated = PlanSchema.parse(plan);
    expect(validated.steps).to.be.an('array').that.is.not.empty;

    const validation = registry.validateSteps(validated.steps);
    expect(validation.valid).to.be.true;

    // Execute
    const { graph, startNode } = compilePlan(plan, registry);
    console.log(`\nExecuting from node: ${startNode}`);

    const ctx = await graph.execute(startNode, {});
    console.log('\nFinal context:', JSON.stringify(ctx, null, 2));

    expect(ctx).to.be.an('object');
    console.log('\n✅ USE CASE 2 COMPLETED\n');
  });

  it('USE CASE 3: Complex workflow - should handle multi-step onchain operations', async () => {
    console.log('\n=== USE CASE 3: Complex workflow ===\n');

    const plan = await generatePlan(
      'Check balance, get ETH price, estimate gas, then send 0.1 ETH to 0xabc',
      registry,
      callGroq
    );

    console.log('Generated plan:', JSON.stringify(plan, null, 2));
    console.log('\n' + renderPlan(plan));

    // Validate
    const validated = PlanSchema.parse(plan);
    expect(validated.steps.length).to.be.at.least(3);

    const validation = registry.validateSteps(validated.steps);
    expect(validation.valid).to.be.true;

    // Execute
    const { graph, startNode } = compilePlan(plan, registry);
    console.log(`\nExecuting from node: ${startNode}`);

    const ctx = await graph.execute(startNode, {});
    console.log('\nFinal context:', JSON.stringify(ctx, null, 2));

    expect(ctx).to.be.an('object');
    console.log('\n✅ USE CASE 3 COMPLETED\n');
  });

  it('Should reject plans with unknown tools', async () => {
    const plan = {
      goal: 'Hack something',
      steps: [
        { node: 'hack_the_planet', description: 'Unknown tool' },
      ],
    };

    const validation = registry.validateSteps(plan.steps);
    expect(validation.valid).to.be.false;
    expect(validation.errors[0]).to.include('hack_the_planet');
  });
});
