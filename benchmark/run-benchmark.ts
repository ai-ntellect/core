import { ChatOllama } from '@langchain/ollama';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Ollama
const model = new ChatOllama({
  model: 'llama3:latest',
  baseUrl: 'http://localhost:11434',
  temperature: 0,
});

// Gmail client
function createGmailClient() {
  const tokenPath = path.join(__dirname, '../gmail_token.json');
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../client_secret.json'), 'utf8'));
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    credentials.web.client_id,
    credentials.web.client_secret,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials(token);
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Fetch mails
async function fetchMails(gmail: any, maxResults = 5) {
  console.log('  [Fetch] Fetching mails from Gmail API...');
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: '',
  });
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
      subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
      from: headers.find((h: any) => h.name === 'From')?.value || '(unknown)',
    });
  }
  return mails;
}

// Summarize
async function summarizeMails(mails: any[]) {
  console.log('  [Summarize] Summarizing with LLM...');
  const mailText = mails.map((m: any) => `From: ${m.from}\nSubject: ${m.subject}`).join('\n\n');
  const prompt = `Summarize these emails in 3 bullet points max:\n\n${mailText}\n\nRespond in JSON: {"summary": "..."}`;

  const response = await model.invoke([{ role: 'user', content: prompt }]);
  try {
    const parsed = JSON.parse(response.content as string);
    return parsed.summary;
  } catch {
    return response.content;
  }
}

// LangGraph workflow
const MailState = Annotation.Root({
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
  }),
  mails: Annotation<any[]>(),
  summary: Annotation<string>(),
  maxMails: Annotation<number>(),
});

const workflow = new StateGraph(MailState)
  .addNode('fetch_mails', async (state) => {
    const gmail = createGmailClient();
    const mails = await fetchMails(gmail, state.maxMails || 5);
    console.log(`  [LangGraph] Fetched ${mails.length} mails`);
    return { mails };
  })
  .addNode('summarize', async (state) => {
    const summary = await summarizeMails(state.mails);
    console.log(`  [LangGraph] Summary: ${summary}`);
    return { summary };
  })
  .addEdge('__start__', 'fetch_mails')
  .addEdge('fetch_mails', 'summarize')
  .addEdge('summarize', '__end__');

const graph = workflow.compile();

async function runLangGraph() {
  console.log('\n🚀 Starting LangGraph benchmark...\n');
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const result = await graph.invoke({
    messages: [{ role: 'user', content: 'Fetch 5 mails and summarize' }],
    maxMails: 5,
  });

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    framework: 'LangGraph',
    totalTime: endTime - startTime,
    llmCalls: 1,
    memoryUsed: endMemory - startMemory,
    summary: result.summary,
    mailsCount: result.mails?.length || 0,
  };
}

// CortexFlow simulation (lightweight)
async function runCortexFlow() {
  console.log('\n🚀 Starting CortexFlow benchmark...\n');
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  let llmCalls = 0;

  const llmCall = async (prompt: string) => {
    llmCalls++;
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3:latest',
        prompt,
        stream: false,
        format: 'json',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.response;
  };

  const gmail = createGmailClient();

  // Simulate intent classification
  llmCalls++;
  const intent = await llmCall(`Classify intent: "fetch 5 mails". Possible: FETCH_MAILS, SUMMARIZE. JSON: {"intent": "...", "confidence": 0.9}`);

  // Fetch mails
  const mails = await fetchMails(gmail, 5);

  // Summarize
  const summary = await summarizeMails(mails);

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    framework: 'CortexFlow',
    totalTime: endTime - startTime,
    llmCalls,
    memoryUsed: endMemory - startMemory,
    summary,
    mailsCount: mails.length,
  };
}

// Main benchmark
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('   CortexFlow vs LangGraph Benchmark');
  console.log('   Scenario: Fetch 5 Gmail + LLM Summarization');
  console.log('═══════════════════════════════════════════\n');

  const cortexResult = await runCortexFlow();
  const langGraphResult = await runLangGraph();

  console.log('\n═══════════════════════════════════════════');
  console.log('                    RESULTS');
  console.log('═══════════════════════════════════════════\n');

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

  console.log('\n─────────────────────────────────────────────');
  console.log('Summary Comparison:');
  console.log('CortexFlow:', cortexResult.summary?.substring(0, 100) + '...');
  console.log('LangGraph:', langGraphResult.summary?.substring(0, 100) + '...');

  if (langGraphResult.totalTime > 0) {
    const speedup = (langGraphResult.totalTime / cortexResult.totalTime).toFixed(2);
    console.log(`\n⚡ CortexFlow is ${speedup}x faster than LangGraph`);
  }

  console.log('\n═══════════════════════════════════════════\n');
}

main().catch(console.error);
