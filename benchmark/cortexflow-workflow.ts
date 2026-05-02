/**
 * CortexFlow benchmark workflow — Gmail fetch + LLM summarisation.
 *
 * Mirrors the LangGraph workflow exactly: both frameworks perform
 * classify intent (LLM call #1) → fetch mails → summarise (LLM call #2).
 */
import { TransitionAction } from '../petri/index';
import { CortexFlowOrchestrator } from '../petri/orchestrator';
import { ToolRegistry } from '../graph/registry';
import { GraphFlow } from '../graph/index';
import { z } from 'zod';
import { IntentClassifier } from '../petri/intent-classifier';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function runCortexFlowBenchmark() {
  console.log('\n🚀 Starting CortexFlow benchmark...\n');

  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  let llmCalls = 0;

  /** Thin wrapper that counts every LLM call for the benchmark report. */
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
  const toolRegistry = new ToolRegistry();
  const orchestrator = new CortexFlowOrchestrator('mail_assistant', toolRegistry);

  /**
   * Intent classifier (LLM call #1).
   * Matches LangGraph's classifyIntent node so both frameworks do equal work.
   */
  const classifier = new IntentClassifier(llmCall, {
    intents: ['FETCH_MAILS', 'SUMMARIZE', 'UNKNOWN'],
    confidenceThreshold: 0.6,
  });
  orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
  orchestrator.setLLMCall(llmCall);

  // ---------------------------------------------------------------------------
  // Petri Net topology
  // ---------------------------------------------------------------------------

  const net = orchestrator.petri;
  net.addPlace({ id: 'idle', type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
  net.addPlace({ id: 'processing', type: 'normal', tokens: [] });
  net.addPlace({ id: 'done', type: 'final', tokens: [] });

  // ---------------------------------------------------------------------------
  // GraphFlow — fetch + summarise (LLM call #2 inside 'summarize' node)
  // ---------------------------------------------------------------------------

  const mailGraph = new GraphFlow<any>({
    name: 'mail_fetch_summarize',
    context: { maxMails: 5 },
    schema: z.object({ maxMails: z.number() }).passthrough(),
    nodes: [
      {
        name: 'fetch_mails',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Fetching mails from Gmail API...');
          const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: ctx.maxMails || 5,
            q: '',
          });
          const messages = res.data.messages || [];
          ctx.fetchedMails = [];
          for (const msg of messages) {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From'],
            });
            const headers = detail.data.payload?.headers || [];
            ctx.fetchedMails.push({
              id: msg.id,
              subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
              from: headers.find(h => h.name === 'From')?.value || '(unknown)',
            });
          }
          console.log(`  [CortexFlow] Fetched ${ctx.fetchedMails.length} mails`);
        },
        next: 'summarize',
      },
      {
        name: 'summarize',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Summarizing with LLM...');
          const mailText = ctx.fetchedMails
            .map((m: any) => `From: ${m.from}\nSubject: ${m.subject}`)
            .join('\n\n');
          const prompt = `Summarize these emails in 3 bullet points max:\n\n${mailText}\n\nRespond in JSON: {"summary": "..."}`;
          const response = await llmCall(prompt);
          const parsed = JSON.parse(response);
          ctx.summary = parsed.summary;
          console.log(`  [CortexFlow] Summary: ${ctx.summary}`);
        },
      },
    ],
    entryNode: 'fetch_mails',
  });

  toolRegistry.register({
    name: 'mail_fetch_summarize',
    description: 'Fetch and summarize mails from Gmail',
    graph: mailGraph,
    startNode: 'fetch_mails',
  });

  net.addTransition({
    id: 'process_mails',
    from: ['idle'],
    to: 'processing',
    action: {
      type: 'graphflow',
      name: 'mail_fetch_summarize',
      contextMapper: (ctx) => ({ maxMails: ctx.maxMails || 5 }),
    } as TransitionAction,
  });

  net.addTransition({
    id: 'complete',
    from: ['processing'],
    to: 'done',
  });

  const sessionId = orchestrator.startSession();
  const result = await orchestrator.orchestrate(
    'Please fetch my 5 latest mails and summarize them',
    sessionId
  );

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    framework: 'CortexFlow',
    totalTime: endTime - startTime,
    llmCalls,
    memoryUsed: endMemory - startMemory,
    summary: (result as any).transitionResult?.actionResult?.summary || 'N/A',
    mailsCount: (result as any).transitionResult?.actionResult?.fetchedMails?.length || 0,
    intentConfidence: result.intent.confidence,
    needsClarification: result.needsClarification,
  };
}
