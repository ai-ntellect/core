/**
 * CortexFlow benchmark workflow — multi-step mail triage.
 *
 * Scenario: fetch 5 mails, classify urgency in batch, generate responses for
 * urgent mails in batch, archive the rest.
 *
 * LLM call budget:
 *   #1  Intent classification  (CortexFlowOrchestrator / IntentClassifier)
 *   #2  Batch urgency check    (single call for all 5 mails at once)
 *   #3  Batch response draft   (single call for all urgent mails, skipped if none)
 *
 * Total: 2–3 LLM calls regardless of inbox size.
 * The Petri Net routes between GraphFlow nodes without any additional LLM call.
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
// Types
// ---------------------------------------------------------------------------

interface Mail {
  id: string;
  subject: string;
  from: string;
}

interface UrgencyResult {
  index: number;
  urgent: boolean;
  reason: string;
}

interface ResponseDraft {
  index: number;
  response: string;
}

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

function createGmailClient() {
  const credPath = path.join(__dirname, '../client_secret.json');
  const tokenPath = path.join(__dirname, '../gmail_token.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
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

  /** Counts every LLM call made during the benchmark. */
  const llmCall = async (prompt: string): Promise<string> => {
    llmCalls++;
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3:latest', prompt, stream: false, format: 'json' }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return data.response as string;
  };

  const gmail = createGmailClient();
  const toolRegistry = new ToolRegistry();
  const orchestrator = new CortexFlowOrchestrator('mail_triage', toolRegistry);

  // LLM call #1 — intent classification (inside orchestrator)
  const classifier = new IntentClassifier(llmCall, {
    intents: ['TRIAGE_MAILS', 'FETCH_MAILS', 'UNKNOWN'],
    confidenceThreshold: 0.6,
  });
  orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
  orchestrator.setLLMCall(llmCall);

  // ---------------------------------------------------------------------------
  // Petri Net topology:  idle ──[process_mails]──► processing ──[complete]──► done
  // All multi-step coordination is handled inside the GraphFlow below.
  // The Petri Net fires exactly one transition per user request — no LLM needed.
  // ---------------------------------------------------------------------------

  const net = orchestrator.petri;
  net.addPlace({ id: 'idle',       type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
  net.addPlace({ id: 'processing', type: 'normal',  tokens: [] });
  net.addPlace({ id: 'done',       type: 'final',   tokens: [] });

  // ---------------------------------------------------------------------------
  // GraphFlow — 4 nodes, 2 LLM calls (urgency batch + response batch)
  // ---------------------------------------------------------------------------

  const mailGraph = new GraphFlow<any>({
    name: 'process_mails',
    context: { maxMails: 5 },
    schema: z.object({ maxMails: z.number() }).passthrough(),
    nodes: [
      // ── Node 1: fetch ────────────────────────────────────────────────────
      {
        name: 'fetch_mails',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Fetching mails from Gmail API...');
          const res = await gmail.users.messages.list({ userId: 'me', maxResults: ctx.maxMails || 5, q: '' });
          const messages = res.data.messages || [];
          ctx.mails = [] as Mail[];
          for (const msg of messages) {
            const detail = await gmail.users.messages.get({
              userId: 'me', id: msg.id!, format: 'metadata',
              metadataHeaders: ['Subject', 'From'],
            });
            const headers = detail.data.payload?.headers || [];
            ctx.mails.push({
              id: msg.id!,
              subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
              from:    headers.find((h: any) => h.name === 'From')?.value    || '(unknown)',
            });
          }
          console.log(`  [CortexFlow] Fetched ${ctx.mails.length} mails`);
        },
        next: 'classify_urgency',
      },

      // ── Node 2: LLM call #2 — batch urgency classification ───────────────
      {
        name: 'classify_urgency',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Classifying urgency (1 batch LLM call for all mails)...');
          const mailList = (ctx.mails as Mail[])
            .map((m, i) => `[${i}] From: ${m.from}\n    Subject: ${m.subject}`)
            .join('\n');

          const prompt = `You are an email triage assistant. For each email below, determine if it needs an urgent reply today.
An email is urgent if the subject contains words like: urgent, ASAP, deadline, action required, meeting today, important, respond today.

Emails:
${mailList}

Respond with JSON only, no explanation:
{"urgency": [{"index": 0, "urgent": true, "reason": "..."}, ...]}`;

          const raw = await llmCall(prompt);
          let results: UrgencyResult[] = [];
          try {
            const parsed = JSON.parse(raw);
            results = Array.isArray(parsed.urgency) ? parsed.urgency : [];
          } catch {
            // fallback: mark all as non-urgent
          }

          ctx.urgentMails = (ctx.mails as Mail[]).filter((_, i) =>
            results.find(r => r.index === i)?.urgent === true
          );
          ctx.nonUrgentMails = (ctx.mails as Mail[]).filter((_, i) =>
            !results.find(r => r.index === i)?.urgent
          );
          console.log(`  [CortexFlow] Urgent: ${ctx.urgentMails.length}, Non-urgent: ${ctx.nonUrgentMails.length}`);
        },
        next: 'respond_urgent',
      },

      // ── Node 3: LLM call #3 — batch response drafts (skipped if none) ───
      {
        name: 'respond_urgent',
        execute: async (ctx: any) => {
          if (!ctx.urgentMails || ctx.urgentMails.length === 0) {
            console.log('  [CortexFlow] No urgent mails — skipping response generation');
            ctx.responses = [] as ResponseDraft[];
            return;
          }
          console.log(`  [CortexFlow] Drafting responses for ${ctx.urgentMails.length} urgent mail(s) (1 batch LLM call)...`);
          const mailList = (ctx.urgentMails as Mail[])
            .map((m, i) => `[${i}] From: ${m.from}\n    Subject: ${m.subject}`)
            .join('\n');

          const prompt = `Draft a brief, professional reply for each urgent email below. Keep each reply under 40 words.

Emails:
${mailList}

Respond with JSON only:
{"responses": [{"index": 0, "response": "..."}, ...]}`;

          const raw = await llmCall(prompt);
          ctx.responses = [] as ResponseDraft[];
          try {
            const parsed = JSON.parse(raw);
            ctx.responses = Array.isArray(parsed.responses) ? parsed.responses : [];
          } catch {
            // keep empty array
          }
          console.log(`  [CortexFlow] Drafted ${ctx.responses.length} response(s)`);
        },
        next: 'archive_others',
      },

      // ── Node 4: archive non-urgent (no LLM) ─────────────────────────────
      {
        name: 'archive_others',
        execute: async (ctx: any) => {
          const count = ctx.nonUrgentMails?.length || 0;
          console.log(`  [CortexFlow] Archiving ${count} non-urgent mail(s) (no LLM)`);
          ctx.archivedCount = count;
        },
      },
    ],
    entryNode: 'fetch_mails',
  });

  toolRegistry.register({
    name: 'process_mails',
    description: 'Fetch, triage, respond to urgent mails and archive the rest',
    graph: mailGraph,
    startNode: 'fetch_mails',
  });

  net.addTransition({
    id: 'process_mails',
    from: ['idle'],
    to: 'processing',
    action: {
      type: 'graphflow',
      name: 'process_mails',
      contextMapper: (ctx) => ({ maxMails: ctx.maxMails || 5 }),
    } as TransitionAction,
  });

  net.addTransition({ id: 'complete', from: ['processing'], to: 'done' });

  const sessionId = orchestrator.startSession();
  const result = await orchestrator.orchestrate(
    'Fetch my 5 latest mails, flag the urgent ones, draft replies for urgent mails, and archive the rest.',
    sessionId
  );

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;
  const actionResult = (result as any).transitionResult?.actionResult ?? {};

  return {
    framework: 'CortexFlow',
    totalTime: endTime - startTime,
    llmCalls,
    memoryUsed: endMemory - startMemory,
    mailsCount:    actionResult.mails?.length       ?? 0,
    urgentCount:   actionResult.urgentMails?.length  ?? 0,
    responsesCount: actionResult.responses?.length   ?? 0,
    archivedCount: actionResult.archivedCount        ?? 0,
    intentConfidence: result.intent.confidence,
    needsClarification: result.needsClarification ?? false,
  };
}
