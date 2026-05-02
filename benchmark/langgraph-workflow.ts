/**
 * LangGraph benchmark workflow — Gmail fetch + LLM summarisation.
 *
 * To match CortexFlow's workload this workflow includes an explicit intent
 * classification node so both frameworks perform the same number of LLM calls
 * (classify + summarise = 2) and the comparison is apples-to-apples.
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
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
  }),
  intent: Annotation<string>(),
  mails: Annotation<any[]>(),
  summary: Annotation<string>(),
  maxMails: Annotation<number>(),
});

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

async function fetchMails(maxResults = 5) {
  console.log('  [LangGraph] Fetching mails from Gmail API...');
  const tokenPath = path.join(__dirname, '../gmail_token.json');
  const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../client_secret.json'), 'utf8')
  );
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    credentials.web.client_id,
    credentials.web.client_secret,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const res = await gmail.users.messages.list({ userId: 'me', maxResults, q: '' });
  const messages = res.data.messages || [];
  const mails: any[] = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From'],
    });
    const headers = detail.data.payload?.headers || [];
    mails.push({
      id: msg.id,
      subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
      from: headers.find(h => h.name === 'From')?.value || '(unknown)',
    });
  }
  return mails;
}

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

/**
 * Node 1 — Intent classification (LLM call #1).
 *
 * Mirrors CortexFlow's IntentClassifier so both frameworks do the same work.
 */
async function classifyIntent(state: typeof MailState.State) {
  console.log('  [LangGraph] Classifying intent...');
  const lastMessage = state.messages[state.messages.length - 1]?.content || '';

  const prompt = `You are an intent classifier. Available intents: FETCH_MAILS, SUMMARIZE, UNKNOWN.
Classify the user message and extract parameters.

User message: "${lastMessage}"

Respond with JSON only: {"intent": "INTENT", "confidence": 0.0-1.0, "params": {"count": 5}}`;

  const response = await model.invoke([{ role: 'user', content: prompt }]);

  let parsed: any = { intent: 'FETCH_MAILS', confidence: 0.8, params: { count: 5 } };
  try {
    parsed = JSON.parse(response.content as string);
  } catch {
    // fallback to default
  }

  console.log(`  [LangGraph] Intent: ${parsed.intent} (confidence: ${parsed.confidence})`);
  return { intent: parsed.intent, maxMails: parsed.params?.count || 5 };
}

/** Node 2 — Gmail fetch (no LLM). */
async function fetchMailsNode(state: typeof MailState.State) {
  const mails = await fetchMails(state.maxMails || 5);
  console.log(`  [LangGraph] Fetched ${mails.length} mails`);
  return { mails };
}

/**
 * Node 3 — Summarisation (LLM call #2).
 *
 * Identical prompt to CortexFlow for a fair summary quality comparison.
 */
async function summariseNode(state: typeof MailState.State) {
  console.log('  [LangGraph] Summarizing with LLM...');
  const mailText = state.mails
    .map(m => `From: ${m.from}\nSubject: ${m.subject}`)
    .join('\n\n');

  const prompt = `Summarize these emails in 3 bullet points max:\n\n${mailText}\n\nRespond in JSON: {"summary": "..."}`;
  const response = await model.invoke([{ role: 'user', content: prompt }]);

  let summary = response.content as string;
  try {
    const parsed = JSON.parse(summary);
    summary = Array.isArray(parsed.summary)
      ? parsed.summary.join(' ')
      : (parsed.summary ?? summary);
  } catch {
    // keep raw string
  }

  console.log(`  [LangGraph] Summary: ${summary}`);
  return { summary };
}

// ---------------------------------------------------------------------------
// Graph compilation
// ---------------------------------------------------------------------------

const workflow = new StateGraph(MailState)
  .addNode('classify', classifyIntent)
  .addNode('fetch_mails', fetchMailsNode)
  .addNode('summarize', summariseNode)
  .addEdge('__start__', 'classify')
  .addEdge('classify', 'fetch_mails')
  .addEdge('fetch_mails', 'summarize')
  .addEdge('summarize', '__end__');

const graph = workflow.compile();

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function runLangGraphBenchmark() {
  console.log('\n🚀 Starting LangGraph benchmark...\n');

  llmCallCount = 0;
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const result = await graph.invoke({
    messages: [{ role: 'user', content: 'Please fetch my 5 latest mails and summarize them' }],
    maxMails: 5,
  });

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    framework: 'LangGraph',
    totalTime: endTime - startTime,
    llmCalls: llmCallCount,
    memoryUsed: endMemory - startMemory,
    summary: result.summary,
    mailsCount: result.mails?.length || 0,
  };
}
