import { runCortexFlowBenchmark } from './cortexflow-workflow';
import { runLangGraphBenchmark } from './langgraph-workflow';

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('   CortexFlow vs LangGraph Benchmark');
  console.log('   Scenario: Fetch 5 Gmail + LLM Summarization');
  console.log('══════════════════════════════════════════\n');

  // Run CortexFlow benchmark
  const cortexResult = await runCortexFlowBenchmark();

  // Run LangGraph benchmark
  const langGraphResult = await runLangGraphBenchmark();

  // Print comparison
  console.log('\n══════════════════════════════════════════');
  console.log('                    RESULTS');
  console.log('══════════════════════════════════════════\n');

  console.log('Framework'.padEnd(20) + 'CortexFlow'.padEnd(20) + 'LangGraph');
  console.log('-'.repeat(60));
  console.log(
    'Total Time'.padEnd(20) +
    `${cortexResult.totalTime}ms`.padEnd(20) +
    `${langGraphResult.totalTime}ms`
  );
  console.log(
    'LLM Calls'.padEnd(20) +
    `${cortexResult.llmCalls}`.padEnd(20) +
    `${langGraphResult.llmCalls}`
  );
  console.log(
    'Memory Used'.padEnd(20) +
    `${(cortexResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`.padEnd(20) +
    `${(langGraphResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`
  );
  console.log(
    'Mails Fetched'.padEnd(20) +
    `${cortexResult.mailsCount}`.padEnd(20) +
    `${langGraphResult.mailsCount}`
  );
  console.log(
    'Intent Confidence'.padEnd(20) +
    `${cortexResult.intentConfidence || 'N/A'}`.padEnd(20) +
    'N/A'
  );
  console.log(
    'Needs Clarification'.padEnd(20) +
    `${cortexResult.needsClarification || false}`.padEnd(20) +
    'false'
  );

  console.log('\n─────────────────────────────────────────────');
  console.log('Summary Comparison:');
  console.log('CortexFlow:', cortexResult.summary?.substring(0, 100) + '...');
  console.log('LangGraph:', langGraphResult.summary?.substring(0, 100) + '...');

  // Calculate speedup
  if (langGraphResult.totalTime > 0) {
    const speedup = (langGraphResult.totalTime / cortexResult.totalTime).toFixed(2);
    console.log(`\n⚡ CortexFlow is ${speedup}x faster than LangGraph`);
  }

  console.log('\n══════════════════════════════════════════\n');
}

main().catch(console.error);
