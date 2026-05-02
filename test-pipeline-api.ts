import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

import { AgentPipeline, priceZone } from "./pipeline/agent-pipeline";

// ============================================
// USE CASE 1: Simple 2-stage pipeline (no human gate)
// ============================================
async function testSimplePipeline() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" USE CASE 1: Simple 2-stage pipeline (auto)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const pipeline = new AgentPipeline({
    name: "simple-analysis",
    trigger: priceZone("BTC", 78000, 79000),
    stages: [
      {
        id: "fetch",
        run: async (ctx) => {
          console.log(`  [fetch] Fetching data for ${ctx.asset}...`);
          await new Promise(r => setTimeout(r, 500));
          return { price: 78500, volume: 1000 };
        },
      },
      {
        id: "analyze",
        run: async (ctx) => {
          console.log(`  [analyze] Analyzing price $${ctx.price}...`);
          await new Promise(r => setTimeout(r, 500));
          return { signal: "BUY", confidence: 0.85 };
        },
      },
    ],
    gate: "auto",
    onApprove: async (ctx) => {
      console.log(`  [execute] Signal: ${ctx.signal} @ $${ctx.price}`);
    },
  });

  console.log(`Initial place: ${pipeline.getPlace()}`);
  console.log("Pipeline created with auto gate (no human approval needed)\n");
}

// ============================================
// USE CASE 2: Pipeline with human approval
// ============================================
async function testHumanGatePipeline() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" USE CASE 2: Pipeline with human gate");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const pipeline = new AgentPipeline({
    name: "trading-approval",
    trigger: priceZone("ETH", 2300, 2400),
    stages: [
      {
        id: "alpha",
        run: async (ctx) => {
          console.log(`  [@Alpha] Analyzing ${ctx.asset}...`);
          return { signal: "BUY", confidence: 80, entryPrice: 2350 };
        },
      },
      {
        id: "guardian",
        run: async (ctx) => {
          console.log(`  [@Guardian] Auditing...`);
          return { verdict: "ACCEPTABLE", score: 5 };
        },
      },
      {
        id: "oracle",
        run: async (ctx) => {
          console.log(`  [@Oracle] Deciding...`);
          return { decision: "EXECUTE", action: { side: "BUY", sizeUsd: 50 } };
        },
      },
    ],
    gate: "human",
    onApprove: async (ctx) => {
      console.log(`  ✓ Human approved! Executing trade: ${ctx.decision}`);
      console.log(`  → ${ctx.action.side} $${ctx.action.sizeUsd}`);
    },
  });

  console.log(`Initial place: ${pipeline.getPlace()}`);
  console.log("Pipeline created with human gate\n");
}

// ============================================
// USE CASE 3: Pipeline with conditional logic
// ============================================
async function testConditionalPipeline() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" USE CASE 3: Pipeline with conditional execution");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const pipeline = new AgentPipeline({
    name: "conditional-trade",
    trigger: priceZone("SOL", 100, 120),
    stages: [
      {
        id: "analyze",
        run: async (ctx) => {
          console.log(`  [analyze] Checking market conditions...`);
          const shouldTrade = ctx.price > 110;
          return { shouldTrade, signal: shouldTrade ? "BUY" : "WAIT" };
        },
      },
      {
        id: "execute_if_approved",
        run: async (ctx) => {
          if (!ctx.shouldTrade) {
            console.log(`  [skip] Conditions not met, skipping trade`);
            return { skipped: true };
          }
          console.log(`  [execute] Placing trade...`);
          return { executed: true, orderId: "12345" };
        },
      },
    ],
    gate: "auto",
  });

  console.log("Pipeline with conditional logic created");
  console.log("Stage 2 checks ctx.shouldTrade before executing\n");
}

// ============================================
// Run all use cases
// ============================================
async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  AgentPipeline API — Multiple Use Cases");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await testSimplePipeline();
  await testHumanGatePipeline();
  await testConditionalPipeline();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  All use cases defined successfully!");
  console.log("  User never sees Petri net, transitions, or fireTransition()");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
