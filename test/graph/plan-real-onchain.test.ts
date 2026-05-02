import { expect } from 'chai';
import { z } from 'zod';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { GraphFlow } from '../../graph/index';
import { ToolRegistry } from '../../graph/registry';
import { generatePlan, PlanSchema, renderPlan } from '../../graph/planner';
import { compilePlan } from '../../graph/compiler';

// Load env
function loadEnv() {
  const fs = require('fs');
  const content = fs.readFileSync('.env', 'utf-8');
  const env: Record<string, string> = {};
  content.split('\n').forEach((line: string) => {
    const idx = line.indexOf('=');
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return env;
}

const env = loadEnv();
const RPC_URL = env['RPC_URL'];
const PRIVATE_KEY_1 = env['PRIVATE_KEY_1'];

// Real viem clients
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const account = privateKeyToAccount(PRIVATE_KEY_1 as `0x${string}`);
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

// Real LLM call via Groq
async function callGroq(prompt: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env['GROQ_API_KEY']}`,
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

  if (!response.ok) throw new Error(`Groq API error: ${await response.text()}`);
  return (await response.json()).choices[0].message.content;
}

// Real onchain tools
function createRealCheckBalanceTool() {
  const g = new GraphFlow<any>({
    name: 'check_balance',
    context: { balance: '', address: '' },
    schema: z.object({ balance: z.string(), address: z.string() }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        const address = ctx.address || account.address;
        console.log(`  [check_balance] Checking real balance for ${address}`);
        const balance = await publicClient.getBalance({ address });
        ctx.balance = formatEther(balance);
        ctx.address = address;
        console.log(`  [check_balance] Balance: ${ctx.balance} ETH`);
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createRealEstimateGasTool() {
  const g = new GraphFlow<any>({
    name: 'estimate_gas',
    context: { gas: 0, to: '', amount: '' },
    schema: z.object({ gas: z.number(), to: z.string(), amount: z.string() }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [estimate_gas] Estimating gas for ${ctx.amount} ETH to ${ctx.to}`);
        const gas = await publicClient.estimateGas({
          account,
          to: ctx.to,
          value: parseEther(ctx.amount || '0.001'),
        });
        ctx.gas = Number(gas);
        console.log(`  [estimate_gas] Estimated gas: ${ctx.gas}`);
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

function createRealSendEthTool() {
  const g = new GraphFlow<any>({
    name: 'send_eth',
    context: { txHash: '', to: '', amount: '', balance: '' },
    schema: z.object({ txHash: z.string(), to: z.string(), amount: z.string(), balance: z.string() }).passthrough(),
    nodes: [{
      name: 'run',
      execute: async (ctx: any) => {
        console.log(`  [send_eth] Sending REAL ${ctx.amount} ETH to ${ctx.to}`);
        const hash = await walletClient.sendTransaction({
          to: ctx.to,
          value: parseEther(ctx.amount || '0.001'),
        });
        ctx.txHash = hash;
        console.log(`  [send_eth] TX sent: ${hash}`);
        console.log(`  [send_eth] View: https://sepolia.etherscan.io/tx/${hash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  [send_eth] Confirmed! Block: ${receipt.blockNumber}`);
        return ctx;
      },
    }],
    entryNode: 'run',
  });
  return g;
}

describe('Plan → Compile → Execute (REAL Onchain + LLM)', function () {
  this.timeout(120000); // Onchain + LLM calls take time

  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register({
      name: 'check_balance',
      description: 'Check wallet ETH balance on Sepolia',
      graph: createRealCheckBalanceTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'estimate_gas',
      description: 'Estimate gas for a transaction on Sepolia',
      graph: createRealEstimateGasTool(),
      startNode: 'run',
    });
    registry.register({
      name: 'send_eth',
      description: 'Send ETH to an address on Sepolia',
      graph: createRealSendEthTool(),
      startNode: 'run',
    });
  });

  it('USE CASE 1 (REAL): Check balance + Send 0.001 ETH to another wallet', async () => {
    console.log('\n=== USE CASE 1 (REAL): Send 0.001 ETH to STUDENT_2 ===\n');

    const plan = await generatePlan(
      `Check my balance, estimate gas, then send 0.001 ETH to ${env['STUDENT_2']}`,
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

    // Execute REAL onchain
    const { graph, startNode } = compilePlan(plan, registry);
    console.log(`\nExecuting REAL onchain plan from node: ${startNode}`);

    const ctx = await graph.execute(startNode, {});
    console.log('\nFinal context:', JSON.stringify(ctx, null, 2));

    expect(ctx.txHash).to.be.a('string');
    expect(ctx.txHash).to.include('0x');
    console.log('\n✅ USE CASE 1 COMPLETED - REAL TX SENT!\n');
    console.log(`   TX: https://sepolia.etherscan.io/tx/${ctx.txHash}`);
  });

  it('USE CASE 2 (REAL): Just check balance', async () => {
    console.log('\n=== USE CASE 2 (REAL): Check balance ===\n');

    const plan = await generatePlan(
      'Check my wallet balance on Sepolia',
      registry,
      callGroq
    );

    console.log('Generated plan:', JSON.stringify(plan, null, 2));

    const { graph, startNode } = compilePlan(plan, registry);
    const ctx = await graph.execute(startNode, {});

    console.log('\nBalance:', ctx.balance, 'ETH');
    expect(ctx.balance).to.be.a('string');
    console.log('\n✅ USE CASE 2 COMPLETED\n');
  });

  it('USE CASE 3 (REAL): Estimate gas without sending', async () => {
    console.log('\n=== USE CASE 3 (REAL): Estimate gas ===\n');

    const plan = await generatePlan(
      `Estimate gas to send 0.001 ETH to ${env['STUDENT_3']}`,
      registry,
      callGroq
    );

    console.log('Generated plan:', JSON.stringify(plan, null, 2));

    const { graph, startNode } = compilePlan(plan, registry);
    const ctx = await graph.execute(startNode, {});

    console.log('\nEstimated gas:', ctx.gas);
    expect(ctx.gas).to.be.a('number').above(21000);
    console.log('\n✅ USE CASE 3 COMPLETED\n');
  });
});
