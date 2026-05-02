/**
 * @file run-benchmark.ts
 * @description CortexFlow vs LangGraph multi-step mail triage benchmark.
 *
 * Scenario: "Fetch 5 mails, flag the urgent ones, draft replies for urgent
 * mails, and archive the rest."
 *
 * Three implementations are compared:
 *
 *   CortexFlow          — Petri Net routes deterministically after 1 intent
 *                         call. GraphFlow batches urgency + response into 2
 *                         additional LLM calls. Total: 2–3 LLM calls.
 *
 *   LangGraph (naive)   — Standard LangGraph pattern: one LLM call per
 *                         routing decision. Each mail gets its own urgency
 *                         call. Total: 1 + 5 + 1 = 7 LLM calls.
 *
 *   LangGraph (optimised) — Hand-optimised: urgency is batched manually by
 *                         the developer. Total: 1 + 1 + 1 = 3 LLM calls.
 *                         Requires explicit architectural effort.
 *
 * Requirements:
 *   - Ollama running locally with llama3:latest
 *   - client_secret.json + gmail_token.json in project root
 *
 * Run: pnpm run benchmark
 */

import { runCortexFlowBenchmark } from './cortexflow-workflow';
import { runLangGraphNaiveBenchmark, runLangGraphOptimisedBenchmark } from './langgraph-workflow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const col = (s: string, w = 24) => String(s).padEnd(w);

function speedLabel(baseline: number, candidate: number): string {
  if (baseline <= 0 || candidate <= 0) return '';
  const r = baseline / candidate;
  if (r > 1.01)  return `${r.toFixed(2)}x faster`;
  if (r < 0.99)  return `${(1 / r).toFixed(2)}x slower`;
  return 'same';
}

function memMB(bytes: number): string {
  return `${Math.max(0, bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('   CortexFlow vs LangGraph — Multi-step Mail Triage Benchmark');
  console.log('   Scenario: fetch 5 mails → flag urgent → reply → archive');
  console.log('══════════════════════════════════════════════════════════════\n');

  const cortex    = await runCortexFlowBenchmark();
  const lgNaive   = await runLangGraphNaiveBenchmark();
  const lgOpt     = await runLangGraphOptimisedBenchmark();

  // ---------------------------------------------------------------------------
  // Results table
  // ---------------------------------------------------------------------------

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                          RESULTS');
  console.log('══════════════════════════════════════════════════════════════\n');

  const w = 22;
  console.log(col('Metric', w) + col('CortexFlow', w) + col('LangGraph naive', w) + col('LangGraph opt.', w));
  console.log('─'.repeat(w * 4));

  console.log(
    col('LLM Calls', w) +
    col(`${cortex.llmCalls}`, w) +
    col(`${lgNaive.llmCalls}`, w) +
    col(`${lgOpt.llmCalls}`, w)
  );
  console.log(
    col('Total Time', w) +
    col(`${cortex.totalTime} ms`, w) +
    col(`${lgNaive.totalTime} ms`, w) +
    col(`${lgOpt.totalTime} ms`, w)
  );
  console.log(
    col('Memory Used', w) +
    col(memMB(cortex.memoryUsed), w) +
    col(memMB(lgNaive.memoryUsed), w) +
    col(memMB(lgOpt.memoryUsed), w)
  );
  console.log(
    col('Mails Fetched', w) +
    col(`${cortex.mailsCount}`, w) +
    col(`${lgNaive.mailsCount}`, w) +
    col(`${lgOpt.mailsCount}`, w)
  );
  console.log(
    col('Urgent Found', w) +
    col(`${cortex.urgentCount}`, w) +
    col(`${lgNaive.urgentCount}`, w) +
    col(`${lgOpt.urgentCount}`, w)
  );
  console.log(
    col('Responses Drafted', w) +
    col(`${cortex.responsesCount}`, w) +
    col(`${lgNaive.responsesCount}`, w) +
    col(`${lgOpt.responsesCount}`, w)
  );
  console.log(
    col('Archived', w) +
    col(`${cortex.archivedCount}`, w) +
    col(`${lgNaive.archivedCount}`, w) +
    col(`${lgOpt.archivedCount}`, w)
  );
  if (cortex.intentConfidence !== undefined) {
    console.log(
      col('Intent Confidence', w) +
      col(`${cortex.intentConfidence}`, w) +
      col('N/A', w) +
      col('N/A', w)
    );
  }

  // ---------------------------------------------------------------------------
  // Speed comparison vs naive (the realistic baseline)
  // ---------------------------------------------------------------------------

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('Speed vs LangGraph naive:');
  console.log(`  CortexFlow         : ${speedLabel(lgNaive.totalTime, cortex.totalTime)}`);
  console.log(`  LangGraph optimised: ${speedLabel(lgNaive.totalTime, lgOpt.totalTime)}`);

  // ---------------------------------------------------------------------------
  // LLM call reduction
  // ---------------------------------------------------------------------------

  if (lgNaive.llmCalls > 0) {
    const cortexSaving = ((lgNaive.llmCalls - cortex.llmCalls) / lgNaive.llmCalls * 100).toFixed(0);
    const optSaving    = ((lgNaive.llmCalls - lgOpt.llmCalls)  / lgNaive.llmCalls * 100).toFixed(0);
    console.log('\n──────────────────────────────────────────────────────────────');
    console.log('LLM call reduction vs LangGraph naive:');
    console.log(`  CortexFlow          : -${cortexSaving}%  (${cortex.llmCalls} vs ${lgNaive.llmCalls} calls)`);
    console.log(`  LangGraph optimised : -${optSaving}%  (${lgOpt.llmCalls} vs ${lgNaive.llmCalls} calls)`);
  }

  // ---------------------------------------------------------------------------
  // Interpretation
  // ---------------------------------------------------------------------------

  console.log(`
══════════════════════════════════════════════════════════════
Notes:
  • The "naive" LangGraph variant mirrors how most developers write LangGraph
    agents: each routing decision is an LLM call, following the official
    supervisor/router examples. This is not a strawman — it is the default.

  • The "optimised" LangGraph variant shows that manual batching reduces calls
    to match CortexFlow, but it requires the developer to consciously restructure
    the graph. CortexFlow imposes this separation structurally, at zero extra
    developer effort.

  • CortexFlow's LLM call budget does not grow with the number of mails.
    For 10 or 20 mails the naive LangGraph count scales linearly; CortexFlow
    stays at 2–3 calls.

  • Beyond LLM call count, CortexFlow provides structural guarantees the other
    variants do not: deadlock detection, boundedness analysis, and reachability
    checks are computed from the incidence matrix before execution — not
    asserted by tests after the fact.
══════════════════════════════════════════════════════════════
`);
}

main().catch(console.error);
