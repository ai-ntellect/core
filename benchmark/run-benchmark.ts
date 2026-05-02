/**
 * @file run-benchmark.ts
 * @description CortexFlow vs LangGraph benchmark runner.
 *
 * Scenario: "Please fetch my 5 latest mails and summarize them"
 *
 * Both frameworks are given the same natural-language input and perform
 * identical work:
 *   1. Intent classification via LLM (LLM call #1)
 *   2. Gmail API fetch (no LLM)
 *   3. LLM summarisation (LLM call #2)
 *
 * This ensures a fair comparison: same number of LLM calls, same data,
 * same prompt. The difference lies in how control flow is handled — LLM
 * routing (LangGraph) vs Petri Net token-based routing (CortexFlow).
 *
 * Requirements:
 *   - Ollama running locally with llama3:latest
 *   - client_secret.json + gmail_token.json in project root
 *
 * Run: pnpm run benchmark
 */

import { runCortexFlowBenchmark } from './cortexflow-workflow';
import { runLangGraphBenchmark } from './langgraph-workflow';

/** Normalises a summary value (string | string[] | any) into a display string. */
function displaySummary(value: unknown, maxLength = 120): string {
  if (Array.isArray(value)) {
    return value.join(' | ').substring(0, maxLength);
  }
  if (typeof value === 'string') {
    return value.substring(0, maxLength);
  }
  return JSON.stringify(value).substring(0, maxLength);
}

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('   CortexFlow vs LangGraph Benchmark');
  console.log('   Scenario: Fetch 5 Gmail + LLM Summarization');
  console.log('   Both frameworks: classify intent → fetch → summarise (2 LLM calls each)');
  console.log('══════════════════════════════════════════\n');

  const cortexResult = await runCortexFlowBenchmark();
  const langGraphResult = await runLangGraphBenchmark();

  // ---------------------------------------------------------------------------
  // Results table
  // ---------------------------------------------------------------------------

  console.log('\n══════════════════════════════════════════');
  console.log('                    RESULTS');
  console.log('══════════════════════════════════════════\n');

  const col = (s: string, w = 22) => String(s).padEnd(w);

  console.log(col('Metric') + col('CortexFlow') + col('LangGraph'));
  console.log('─'.repeat(66));
  console.log(col('Total Time')       + col(`${cortexResult.totalTime}ms`)               + col(`${langGraphResult.totalTime}ms`));
  console.log(col('LLM Calls')        + col(`${cortexResult.llmCalls}`)                  + col(`${langGraphResult.llmCalls}`));
  // Memory delta can be negative when GC fires during execution — clamp to 0 for display.
  const cortexMB = Math.max(0, cortexResult.memoryUsed / 1024 / 1024).toFixed(2);
  const langMB   = Math.max(0, langGraphResult.memoryUsed / 1024 / 1024).toFixed(2);
  console.log(col('Memory Used')      + col(`${cortexMB}MB`) + col(`${langMB}MB (+GC noise)`));
  console.log(col('Mails Fetched')    + col(`${cortexResult.mailsCount}`)                + col(`${langGraphResult.mailsCount}`));
  console.log(col('Intent Confidence')+ col(`${cortexResult.intentConfidence ?? 'N/A'}`) + col('N/A'));
  console.log(col('Needs Clarification') + col(`${cortexResult.needsClarification ?? false}`) + col('false'));

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Summary comparison:');
  console.log(`  CortexFlow : ${displaySummary(cortexResult.summary)}...`);
  console.log(`  LangGraph  : ${displaySummary(langGraphResult.summary)}...`);

  // ---------------------------------------------------------------------------
  // Speed delta
  // ---------------------------------------------------------------------------

  if (cortexResult.totalTime > 0 && langGraphResult.totalTime > 0) {
    const ratio = langGraphResult.totalTime / cortexResult.totalTime;
    if (ratio > 1) {
      console.log(`\n⚡ CortexFlow is ${ratio.toFixed(2)}x faster than LangGraph`);
    } else {
      console.log(`\n⚡ LangGraph is ${(1 / ratio).toFixed(2)}x faster than CortexFlow`);
    }
  }

  // ---------------------------------------------------------------------------
  // Interpretation note
  // ---------------------------------------------------------------------------

  console.log(`
📝 Notes:
  • Both frameworks perform 2 LLM calls (classify + summarise), making the
    comparison fair in terms of LLM workload.
  • CortexFlow's overhead comes from Petri Net token processing and intent
    classification — the trade-off for deterministic, deadlock-free routing.
  • LangGraph routes via LLM-driven edges; CortexFlow routes via token guards.
    At scale or in complex multi-step flows, the Petri Net's predictability
    and static analysis (deadlock / boundedness checks) become the differentiator.
`);

  console.log('══════════════════════════════════════════\n');
}

main().catch(console.error);
