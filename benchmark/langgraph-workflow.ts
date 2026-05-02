/**
 * LangGraph benchmark workflows — multi-step mail triage.
 *
 * Two variants:
 *
 *   runLangGraphNaiveBenchmark     — one LLM call per urgency decision (N mails = N calls).
 *                                    Mirrors the standard LangGraph supervisor/router pattern.
 *                                    LLM calls: 1 intent + 5 urgency + 0–1 response = 6–7
 *
 *   runLangGraphOptimisedBenchmark — urgency batched manually by the developer.
 *                                    LLM calls: 1 intent + 1 urgency batch + 0–1 response = 2–3
 */
import { StateGraph, Annotation } from '@langchain/langgraph';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { LLMCall, safeParse } from './llm-client';

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

const MailState = Annotation.Root({
  messages:      Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
  }),
  intent:        Annotation<string>(),
  mails:         Annotation<any[]>(),
  urgentMails:   Annotation<any[]>(),
  responses:     Annotation<any[]>(),
  archivedCount: Annotation<number>(),
  maxMails:      Annotation<number>(),
});

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

async function fetchMails(maxResults = 5) {
  console.log('  [LangGraph] Fetching mails...');
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

// ---------------------------------------------------------------------------
// Node factories (capture llm via closure)
// ---------------------------------------------------------------------------

function makeNodes(llm: LLMCall, variant: 'naive' | 'optimised') {
  async function classifyIntent(state: typeof MailState.State) {
    console.log(`  [LangGraph/${variant}] Classifying intent...`);
    const last   = state.messages[state.messages.length - 1]?.content || '';
    const raw    = await llm.call(
      `Intent classifier. Intents: TRIAGE_MAILS, FETCH_MAILS, UNKNOWN.\nMessage: "${last}"\nJSON: {"intent":"INTENT","params":{"count":5}}`
    );
    const parsed = safeParse<any>(raw, { intent: 'TRIAGE_MAILS', params: { count: 5 } });
    return { intent: parsed.intent, maxMails: parsed.params?.count || 5 };
  }

  async function fetchMailsNode(state: typeof MailState.State) {
    const mails = await fetchMails(state.maxMails || 5);
    console.log(`  [LangGraph/${variant}] Fetched ${mails.length} mails`);
    return { mails };
  }

  /** Naive: one LLM call per mail. */
  async function decideUrgencyNaive(state: typeof MailState.State) {
    console.log(`  [LangGraph/naive] Urgency check per mail (${state.mails.length} LLM calls)...`);
    const urgentMails: any[] = [];
    for (const mail of state.mails) {
      const raw    = await llm.call(
        `Is this email urgent (needs reply today)? Urgent = security alert/deadline/ASAP/action required.\nFrom: ${mail.from}\nSubject: ${mail.subject}\nJSON: {"urgent":true}`
      );
      const parsed = safeParse<any>(raw, { urgent: false });
      if (parsed.urgent === true) urgentMails.push(mail);
    }
    console.log(`  [LangGraph/naive] Urgent: ${urgentMails.length}`);
    return { urgentMails };
  }

  /** Optimised: one batch LLM call for all mails. */
  async function decideUrgencyBatch(state: typeof MailState.State) {
    console.log('  [LangGraph/optimised] Batch urgency (1 LLM call)...');
    const mailList = state.mails.map((m: any, i: number) => `[${i}] From: ${m.from} | Subject: ${m.subject}`).join('\n');
    const raw      = await llm.call(
      `For each email, is it urgent (needs reply today)?\n\nEmails:\n${mailList}\n\nJSON: {"urgency":[{"index":0,"urgent":true},...]}`
    );
    const parsed   = safeParse<any>(raw, { urgency: [] });
    const results  = Array.isArray(parsed.urgency) ? parsed.urgency : [];
    const urgentMails = state.mails.filter((_: any, i: number) => results.find((r: any) => r.index === i)?.urgent === true);
    console.log(`  [LangGraph/optimised] Urgent: ${urgentMails.length}`);
    return { urgentMails };
  }

  async function generateResponsesNode(state: typeof MailState.State) {
    if (!state.urgentMails?.length) {
      console.log(`  [LangGraph/${variant}] No urgent mails — skipping`);
      return { responses: [] };
    }
    console.log(`  [LangGraph/${variant}] Batch response draft (1 LLM call)...`);
    const mailList = state.urgentMails.map((m: any, i: number) => `[${i}] From: ${m.from} | Subject: ${m.subject}`).join('\n');
    const raw      = await llm.call(
      `Draft a brief professional reply (<40 words) for each urgent email.\n\nEmails:\n${mailList}\n\nJSON: {"responses":[{"index":0,"response":"..."},...]}`
    );
    const parsed   = safeParse<any>(raw, { responses: [] });
    const responses = Array.isArray(parsed.responses) ? parsed.responses : [];
    console.log(`  [LangGraph/${variant}] Drafted ${responses.length} response(s)`);
    return { responses };
  }

  async function archiveNode(state: typeof MailState.State) {
    const urgentIds = new Set((state.urgentMails || []).map((m: any) => m.id));
    const count     = (state.mails || []).filter((m: any) => !urgentIds.has(m.id)).length;
    console.log(`  [LangGraph/${variant}] Archive ${count} mail(s) (no LLM)`);
    return { archivedCount: count };
  }

  return { classifyIntent, fetchMailsNode, decideUrgencyNaive, decideUrgencyBatch, generateResponsesNode, archiveNode };
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildGraph(llm: LLMCall, variant: 'naive' | 'optimised') {
  const nodes = makeNodes(llm, variant);
  const urgencyNode = variant === 'naive' ? nodes.decideUrgencyNaive : nodes.decideUrgencyBatch;

  return new StateGraph(MailState)
    .addNode('classify',           nodes.classifyIntent)
    .addNode('fetch_mails',        nodes.fetchMailsNode)
    .addNode('decide_urgency',     urgencyNode)
    .addNode('generate_responses', nodes.generateResponsesNode)
    .addNode('archive',            nodes.archiveNode)
    .addEdge('__start__',          'classify')
    .addEdge('classify',           'fetch_mails')
    .addEdge('fetch_mails',        'decide_urgency')
    .addEdge('decide_urgency',     'generate_responses')
    .addEdge('generate_responses', 'archive')
    .addEdge('archive',            '__end__')
    .compile();
}

// ---------------------------------------------------------------------------
// Runner helper
// ---------------------------------------------------------------------------

const INPUT = {
  messages: [{ role: 'user' as const, content: 'Fetch my 5 latest mails, flag the urgent ones, draft replies for urgent mails, and archive the rest.' }],
  maxMails: 5,
};

async function run(label: string, llm: LLMCall, variant: 'naive' | 'optimised') {
  console.log(`\n🚀 LangGraph (${variant}) benchmark...\n`);
  llm.resetCount();
  const t0 = Date.now();
  const m0 = process.memoryUsage().heapUsed;

  const graph  = buildGraph(llm, variant);
  const result = await graph.invoke(INPUT);

  return {
    framework:      label,
    totalTime:      Date.now() - t0,
    llmCalls:       llm.callCount,
    memoryUsed:     process.memoryUsage().heapUsed - m0,
    mailsCount:     result.mails?.length        ?? 0,
    urgentCount:    result.urgentMails?.length   ?? 0,
    responsesCount: result.responses?.length     ?? 0,
    archivedCount:  result.archivedCount         ?? 0,
  };
}

export async function runLangGraphNaiveBenchmark(llm: LLMCall) {
  return run('LangGraph (naive)', llm, 'naive');
}

export async function runLangGraphOptimisedBenchmark(llm: LLMCall) {
  return run('LangGraph (optimised)', llm, 'optimised');
}
