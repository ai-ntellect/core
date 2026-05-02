import { ChatOllama, } from '@langchain/ollama';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Ollama model
const model = new ChatOllama({
  model: 'llama3:latest',
  baseUrl: 'http://localhost:11434',
  temperature: 0,
});

// Define state for LangGraph
const MailState = Annotation.Root({
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
  }),
  mails: Annotation<any[]>(),
  summary: Annotation<string>(),
  maxMails: Annotation<number>(),
});

async function fetchMails(maxResults = 5) {
  console.log('  [LangGraph] Fetching mails from Gmail API...');
  const tokenPath = path.join(__dirname, '../gmail_token.json');
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../client_secret.json'), 'utf8'));
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    credentials.web.client_id,
    credentials.web.client_secret,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

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
      subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
      from: headers.find(h => h.name === 'From')?.value || '(unknown)',
    });
  }
  return mails;
}

async function summarizeMails(mails: any[]) {
  console.log('  [LangGraph] Summarizing with LLM...');
  const mailText = mails.map(m => `From: ${m.from}\nSubject: ${m.subject}`).join('\n\n');
  const prompt = `Summarize these emails in 3 bullet points max:\n\n${mailText}\n\nRespond in JSON: {"summary": "..."}`;

  const response = await model.invoke([{ role: 'user', content: prompt }]);
  try {
    const parsed = JSON.parse(response.content as string);
    return parsed.summary;
  } catch {
    return response.content;
  }
}

// Build LangGraph workflow
const workflow = new StateGraph(MailState)
  .addNode('fetch_mails', async (state) => {
    const mails = await fetchMails(state.maxMails || 5);
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

export async function runLangGraphBenchmark() {
  console.log('\n🚀 Starting LangGraph benchmark...\n');

  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const result = await graph.invoke({
    messages: [{ role: 'user', content: 'Fetch 5 mails and summarize' }],
    maxMails: 5,
  });

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  const llmCalls = 1; // Only 1 LLM call for summarization

  return {
    framework: 'LangGraph',
    totalTime: endTime - startTime,
    llmCalls,
    memoryUsed: endMemory - startMemory,
    summary: result.summary,
    mailsCount: result.mails?.length || 0,
  };
}
