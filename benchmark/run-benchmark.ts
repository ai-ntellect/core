/**
 * @file run-benchmark.ts
 * @description CortexFlow vs LangGraph — multi-step mail triage benchmark.
 *
 * Runs the same scenario on two backends:
 *   1. Ollama local  (llama3:latest)
 *   2. Groq API      (llama-3.1-8b-instant, free tier)
 *
 * A warmup call is made before timing starts on each backend to eliminate
 * model-loading cold-start from the measurements.
 *
 * Scenario: fetch 5 mails → batch-classify urgency → draft replies → archive
 *
 * Run: pnpm run benchmark
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createLLMClient } from './llm-client';
import { runCortexFlowBenchmark } from './cortexflow-workflow';
import { runLangGraphNaiveBenchmark, runLangGraphOptimisedBenchmark } from './langgraph-workflow';

dotenv.config({ path: path.join(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// Backend configs
// ---------------------------------------------------------------------------

const BACKENDS = {
  ollama: {
    label: 'Ollama local (llama3:latest)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey:  'ollama',
    model:   'llama3:latest',
  },
  groq: {
    label: 'Groq API (llama-3.1-8b-instant)',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey:  process.env.GROQ_API_KEY ?? '',
    model:   'llama-3.1-8b-instant',
  },
} as const;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const col = (s: string, w = 22) => String(s).padEnd(w);

function memMB(bytes: number) {
  return `${Math.max(0, bytes / 1024 / 1024).toFixed(1)} MB`;
}

function printTable(results: Array<{ framework: string; totalTime: number; llmCalls: number; memoryUsed: number; mailsCount: number; urgentCount: number; responsesCount: number; archivedCount: number; [k: string]: unknown }>) {
  const headers = ['Metric', ...results.map(r => r.framework)];
  const w = 22;
  console.log(headers.map(h => col(h, w)).join(''));
  console.log('─'.repeat(w * headers.length));

  const rows: [string, (r: typeof results[0]) => string][] = [
    ['LLM Calls',         r => `${r.llmCalls}`],
    ['Total Time',        r => `${r.totalTime} ms`],
    ['Memory Used',       r => memMB(r.memoryUsed)],
    ['Mails Fetched',     r => `${r.mailsCount}`],
    ['Urgent Found',      r => `${r.urgentCount}`],
    ['Responses Drafted', r => `${r.responsesCount}`],
    ['Archived',          r => `${r.archivedCount}`],
  ];

  for (const [label, fn] of rows) {
    console.log(col(label, w) + results.map(r => col(fn(r), w)).join(''));
  }
}

function makeRow(r: Awaited<ReturnType<typeof runCortexFlowBenchmark>>) {
  return r;
}

function printReduction(results: Array<{ framework: string; totalTime: number; llmCalls: number; [k: string]: unknown }>) {
  const naive = results.find(r => r.framework.includes('naive'));
  if (!naive) return;
  console.log('\nLLM call reduction vs naive:');
  for (const r of results.filter(x => x !== naive)) {
    const pct = (((naive.llmCalls - r.llmCalls) / naive.llmCalls) * 100).toFixed(0);
    const sign = Number(pct) > 0 ? `-${pct}%` : `+${Math.abs(Number(pct))}%`;
    console.log(`  ${r.framework.padEnd(28)}: ${sign}  (${r.llmCalls} vs ${naive.llmCalls} calls)`);
  }
  console.log('\nSpeed vs naive:');
  for (const r of results.filter(x => x !== naive)) {
    const ratio = naive.totalTime / r.totalTime;
    const label = ratio > 1.01 ? `${ratio.toFixed(2)}x faster` : ratio < 0.99 ? `${(1/ratio).toFixed(2)}x slower` : 'same';
    console.log(`  ${r.framework.padEnd(28)}: ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Warmup — eliminates model cold-start from measurements
// ---------------------------------------------------------------------------

async function warmup(llm: ReturnType<typeof createLLMClient>, label: string) {
  process.stdout.write(`  Warming up ${label}... `);
  const t = Date.now();
  await llm.call('Reply with JSON only: {"ready":true}');
  llm.resetCount();
  console.log(`done (${Date.now() - t} ms)`);
}

// ---------------------------------------------------------------------------
// Suite runner
// ---------------------------------------------------------------------------

async function runSuite(backendKey: keyof typeof BACKENDS) {
  const cfg = BACKENDS[backendKey];
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  Backend: ${cfg.label}`);
  console.log(`${'═'.repeat(64)}\n`);

  const llm = createLLMClient(cfg);
  await warmup(llm, cfg.label);

  const cortex  = await runCortexFlowBenchmark(llm);
  const lgNaive = await runLangGraphNaiveBenchmark(llm);
  const lgOpt   = await runLangGraphOptimisedBenchmark(llm);

  console.log(`\n${'─'.repeat(64)}`);
  console.log('  RESULTS');
  console.log(`${'─'.repeat(64)}\n`);
  printTable([cortex, lgNaive, lgOpt]);
  printReduction([cortex, lgNaive, lgOpt]);

  return { backend: cfg.label, cortex, lgNaive, lgOpt };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('CortexFlow vs LangGraph — Multi-step Mail Triage Benchmark');
  console.log('Scenario: fetch 5 mails → flag urgent → draft replies → archive\n');
  console.log('Note: one warmup LLM call is made before each backend\'s timer starts');
  console.log('      to exclude model loading from measurements.\n');

  const results: Awaited<ReturnType<typeof runSuite>>[] = [];

  results.push(await runSuite('ollama'));

  if (!process.env.GROQ_API_KEY) {
    console.log('\nGroq: GROQ_API_KEY not set — skipping remote backend.\n');
  } else {
    results.push(await runSuite('groq'));
  }

  // ---------------------------------------------------------------------------
  // Cross-backend summary (if both ran)
  // ---------------------------------------------------------------------------

  if (results.length === 2) {
    const [ol, gr] = results;
    console.log(`\n${'═'.repeat(64)}`);
    console.log('  CROSS-BACKEND SUMMARY (measured, not projected)');
    console.log(`${'═'.repeat(64)}\n`);

    const w = 32;
    console.log(col('Metric', w) + col('Ollama local', 20) + col('Groq API', 20));
    console.log('─'.repeat(w + 40));

    const rows: [string, (s: typeof ol) => string][] = [
      ['CortexFlow total time',     s => `${s.cortex.totalTime} ms`],
      ['CortexFlow LLM calls',      s => `${s.cortex.llmCalls}`],
      ['LangGraph naive total time', s => `${s.lgNaive.totalTime} ms`],
      ['LangGraph naive LLM calls', s => `${s.lgNaive.llmCalls}`],
      ['LangGraph opt total time',  s => `${s.lgOpt.totalTime} ms`],
      ['LangGraph opt LLM calls',   s => `${s.lgOpt.llmCalls}`],
    ];

    for (const [label, fn] of rows) {
      console.log(col(label, w) + col(fn(ol), 20) + col(fn(gr), 20));
    }

    const naiveOl = ol.lgNaive.totalTime;
    const naiveGr = gr.lgNaive.totalTime;
    const cfOl    = ol.cortex.totalTime;
    const cfGr    = gr.cortex.totalTime;

    console.log('\nObserved speed ratio (CortexFlow vs LangGraph naive):');
    console.log(`  Ollama local : ${naiveOl > cfOl ? (naiveOl/cfOl).toFixed(2)+'x faster' : (cfOl/naiveOl).toFixed(2)+'x slower'}`);
    console.log(`  Groq API     : ${naiveGr > cfGr ? (naiveGr/cfGr).toFixed(2)+'x faster' : (cfGr/naiveGr).toFixed(2)+'x slower'}`);
    console.log(`\nLLM call reduction (CortexFlow vs LangGraph naive): -${(((ol.lgNaive.llmCalls - ol.cortex.llmCalls) / ol.lgNaive.llmCalls) * 100).toFixed(0)}%`);
  }

  console.log(`\n${'═'.repeat(64)}\n`);
}

main().catch(console.error);
