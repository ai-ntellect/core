/**
 * LangGraph benchmark workflows — multi-step mail triage.
 *
 * Two variants are exported to show the architectural spectrum:
 *
 *   runLangGraphNaiveBenchmark    — idiomatic LangGraph usage, one LLM call
 *                                   per routing decision (how most developers
 *                                   write it following the official examples).
 *                                   LLM calls: 1 intent + 5 urgency + 1 response = 7
 *
 *   runLangGraphOptimizedBenchmark — hand-optimised: urgency classification is
 *                                    batched manually. Requires the developer to
 *                                    consciously restructure the graph.
 *                                    LLM calls: 1 intent + 1 batch urgency + 1 response = 3
 *
 * CortexFlow (see cortexflow-workflow.ts) reaches 2–3 calls structurally,
 * without requiring the developer to think about batching — the Petri Net
 * enforces the separation between semantic analysis and coordination.
 */
import { ChatOllama } from '@langchain/ollama';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// LLM setup
// ---------------------------------------------------------------------------

let llmCallCount = 0;

const _model = new ChatOllama({
  model: 'llama3:latest',
  baseUrl: 'http://localhost:11434',
  temperature: 0,
  format: 'json',
});

/** Thin wrapper that counts every LLM call for the benchmark report. */
const model = {
  async invoke(input: Parameters<typeof _model.invoke>[0]) {
    llmCallCount++;
    return _model.invoke(input);
  },
};

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

const MailState = Annotation.Root({
  messages:     Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
  }),
  intent:       Annotation<string>(),
  mails:        Annotation<any[]>(),
  urgentMails:  Annotation<any[]>(),
  responses:    Annotation<any[]>(),
  archivedCount: Annotation<number>(),
  maxMails:     Annotation<number>(),
});

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

async function fetchMails(maxResults = 5) {
  console.log('  [LangGraph] Fetching mails from Gmail API...');
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../client_secret.json'), 'utf8'));
  const token       = JSON.parse(fs.readFileSync(path.join(__dirname, '../gmail_token.json'), 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    credentials.web.client_id,
    credentials.web.client_secret,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const res      = await gmail.users.messages.list({ userId: 'me', maxResults, q: '' });
  const messages = res.data.messages || [];
  const mails: any[] = [];

  for (const msg of messages) {
    const detail  = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'metadata', metadataHeaders: ['Subject', 'From'] });
    const headers = detail.data.payload?.headers || [];
    mails.push({
      id:      msg.id,
      subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
      from:    headers.find((h: any) => h.name === 'From')?.value    || '(unknown)',
    });
  }
  return mails;
}

/** Safely parse JSON produced by the LLM; returns `fallback` on failure. */
function safeParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Shared nodes (identical between both variants)
// ---------------------------------------------------------------------------

async function classifyIntent(state: typeof MailState.State) {
  console.log('  [LangGraph] Classifying intent...');
  const last = state.messages[state.messages.length - 1]?.content || '';
  const prompt = `You are an intent classifier. Available intents: TRIAGE_MAILS, FETCH_MAILS, UNKNOWN.
Classify the user message and extract parameters.
User message: "${last}"
Respond with JSON only: {"intent": "INTENT", "confidence": 0.0-1.0, "params": {"count": 5}}`;

  const res    = await model.invoke([{ role: 'user', content: prompt }]);
  const parsed = safeParse<any>(res.content as string, { intent: 'TRIAGE_MAILS', params: { count: 5 } });
  console.log(`  [LangGraph] Intent: ${parsed.intent}`);
  return { intent: parsed.intent, maxMails: parsed.params?.count || 5 };
}

async function fetchMailsNode(state: typeof MailState.State) {
  const mails = await fetchMails(state.maxMails || 5);
  console.log(`  [LangGraph] Fetched ${mails.length} mails`);
  return { mails };
}

async function generateResponsesNode(state: typeof MailState.State) {
  if (!state.urgentMails || state.urgentMails.length === 0) {
    console.log('  [LangGraph] No urgent mails — skipping response generation');
    return { responses: [] };
  }
  console.log(`  [LangGraph] Drafting responses for ${state.urgentMails.length} urgent mail(s)...`);
  const mailList = state.urgentMails
    .map((m: any, i: number) => `[${i}] From: ${m.from}\n    Subject: ${m.subject}`)
    .join('\n');
  const prompt = `Draft a brief, professional reply for each urgent email below. Keep each reply under 40 words.
Emails:\n${mailList}\nRespond with JSON only: {"responses": [{"index": 0, "response": "..."}, ...]}`;

  const res    = await model.invoke([{ role: 'user', content: prompt }]);
  const parsed = safeParse<any>(res.content as string, { responses: [] });
  const responses = Array.isArray(parsed.responses) ? parsed.responses : [];
  console.log(`  [LangGraph] Drafted ${responses.length} response(s)`);
  return { responses };
}

async function archiveNode(state: typeof MailState.State) {
  const urgentIds = new Set((state.urgentMails || []).map((m: any) => m.id));
  const count     = (state.mails || []).filter((m: any) => !urgentIds.has(m.id)).length;
  console.log(`  [LangGraph] Archiving ${count} non-urgent mail(s) (no LLM)`);
  return { archivedCount: count };
}

// ---------------------------------------------------------------------------
// VARIANT A — Naive: one LLM call per urgency decision (5 calls for 5 mails)
//
// This mirrors how most developers use LangGraph, following the official
// "supervisor/router" pattern where each routing decision is an LLM call.
// ---------------------------------------------------------------------------

/**
 * Decides urgency for each mail with a separate LLM call.
 * This is the standard LangGraph pattern: one node = one LLM call.
 * For N mails → N LLM calls.
 */
async function decideUrgencyNaive(state: typeof MailState.State) {
  console.log(`  [LangGraph/naive] Checking urgency mail by mail (${state.mails.length} LLM calls)...`);
  const urgentMails: any[] = [];

  for (let i = 0; i < state.mails.length; i++) {
    const mail   = state.mails[i];
    const prompt = `Is this email urgent (needs a reply today)?
From: ${mail.from}
Subject: ${mail.subject}
Urgent means: deadline today, ASAP, meeting today, action required.
Respond with JSON only: {"urgent": true, "reason": "..."}`;

    const res    = await model.invoke([{ role: 'user', content: prompt }]);
    const parsed = safeParse<any>(res.content as string, { urgent: false });
    if (parsed.urgent === true) urgentMails.push(mail);
  }

  console.log(`  [LangGraph/naive] Urgent: ${urgentMails.length}`);
  return { urgentMails };
}

// ---------------------------------------------------------------------------
// VARIANT B — Optimised: one batch LLM call for all urgency decisions
//
// The developer explicitly restructures the node to batch all mails in one
// prompt. This requires manual effort and architectural awareness.
// ---------------------------------------------------------------------------

/**
 * Decides urgency for all mails in a single batch LLM call.
 * This requires the developer to consciously choose batching.
 */
async function decideUrgencyBatch(state: typeof MailState.State) {
  console.log('  [LangGraph/optimised] Batch urgency check (1 LLM call for all mails)...');
  const mailList = state.mails
    .map((m: any, i: number) => `[${i}] From: ${m.from}\n    Subject: ${m.subject}`)
    .join('\n');
  const prompt = `For each email below, determine if it needs an urgent reply today.
An email is urgent if the subject contains: urgent, ASAP, deadline, action required, meeting today.
Emails:\n${mailList}\nRespond with JSON only: {"urgency": [{"index": 0, "urgent": true, "reason": "..."}, ...]}`;

  const res     = await model.invoke([{ role: 'user', content: prompt }]);
  const parsed  = safeParse<any>(res.content as string, { urgency: [] });
  const results: any[] = Array.isArray(parsed.urgency) ? parsed.urgency : [];

  const urgentMails = state.mails.filter((_: any, i: number) =>
    results.find((r: any) => r.index === i)?.urgent === true
  );
  console.log(`  [LangGraph/optimised] Urgent: ${urgentMails.length}`);
  return { urgentMails };
}

// ---------------------------------------------------------------------------
// Graph compilation
// ---------------------------------------------------------------------------

function buildGraph(urgencyNode: (s: typeof MailState.State) => Promise<any>) {
  return new StateGraph(MailState)
    .addNode('classify',           classifyIntent)
    .addNode('fetch_mails',        fetchMailsNode)
    .addNode('decide_urgency',     urgencyNode)
    .addNode('generate_responses', generateResponsesNode)
    .addNode('archive',            archiveNode)
    .addEdge('__start__',          'classify')
    .addEdge('classify',           'fetch_mails')
    .addEdge('fetch_mails',        'decide_urgency')
    .addEdge('decide_urgency',     'generate_responses')
    .addEdge('generate_responses', 'archive')
    .addEdge('archive',            '__end__')
    .compile();
}

const naiveGraph     = buildGraph(decideUrgencyNaive);
const optimisedGraph = buildGraph(decideUrgencyBatch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function benchmarkResult(framework: string, start: number, startMem: number, result: any) {
  return {
    framework,
    totalTime:      Date.now() - start,
    llmCalls:       llmCallCount,
    memoryUsed:     process.memoryUsage().heapUsed - startMem,
    mailsCount:     result.mails?.length       ?? 0,
    urgentCount:    result.urgentMails?.length  ?? 0,
    responsesCount: result.responses?.length    ?? 0,
    archivedCount:  result.archivedCount        ?? 0,
  };
}

const INPUT = {
  messages: [{ role: 'user' as const, content: 'Fetch my 5 latest mails, flag the urgent ones, draft replies for urgent mails, and archive the rest.' }],
  maxMails: 5,
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function runLangGraphNaiveBenchmark() {
  console.log('\n🚀 Starting LangGraph (naive) benchmark...\n');
  llmCallCount = 0;
  const t0 = Date.now();
  const m0 = process.memoryUsage().heapUsed;
  const result = await naiveGraph.invoke(INPUT);
  return benchmarkResult('LangGraph (naive)', t0, m0, result);
}

export async function runLangGraphOptimisedBenchmark() {
  console.log('\n🚀 Starting LangGraph (optimised) benchmark...\n');
  llmCallCount = 0;
  const t0 = Date.now();
  const m0 = process.memoryUsage().heapUsed;
  const result = await optimisedGraph.invoke(INPUT);
  return benchmarkResult('LangGraph (optimised)', t0, m0, result);
}
