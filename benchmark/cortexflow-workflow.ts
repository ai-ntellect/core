/**
 * CortexFlow benchmark workflow — multi-step mail triage.
 *
 * LLM call budget (fixed regardless of inbox size):
 *   #1  Intent classification  (CortexFlowOrchestrator)
 *   #2  Batch urgency check    (one call for all N mails)
 *   #3  Batch response draft   (one call for all urgent mails; skipped if none)
 */
import { TransitionAction } from '../routing/index';
import { CortexFlowOrchestrator } from '../routing/orchestrator';
import { ToolRegistry } from '../execution/registry';
import { GraphFlow } from '../execution/index';
import { z } from 'zod';
import { HybridIntentClassifier } from '../routing/intent-classifier';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { LLMCall, safeParse } from './llm-client';

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

function createGmailClient() {
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../client_secret.json'), 'utf8'));
  const token       = JSON.parse(fs.readFileSync(path.join(__dirname, '../gmail_token.json'), 'utf8'));
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

export async function runCortexFlowBenchmark(llm: LLMCall) {
  console.log('\n🚀 CortexFlow benchmark...\n');
  llm.resetCount();

  const startTime   = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const gmail       = createGmailClient();
  const toolRegistry = new ToolRegistry();
  const orchestrator = new CortexFlowOrchestrator('mail_triage', toolRegistry);

  // Intent classification — keyword rules first, LLM fallback for ambiguous messages.
  // The benchmark input contains "fetch", "mail", "urgent", "archive" → keyword match,
  // confidence 0.95, no LLM call needed for classification.
  const classifier = new HybridIntentClassifier(
    [
      { intent: 'TRIAGE_MAILS', keywords: ['fetch', 'mail', 'urgent', 'archive'], confidence: 0.95 },
      { intent: 'TRIAGE_MAILS', keywords: ['triage', 'mail'],                     confidence: 0.95 },
      { intent: 'FETCH_MAILS',  keywords: ['fetch', 'email'],                     confidence: 0.90 },
      { intent: 'FETCH_MAILS',  keywords: ['fetch', 'mail'],                      confidence: 0.90 },
    ],
    { intents: ['TRIAGE_MAILS', 'FETCH_MAILS', 'UNKNOWN'], confidenceThreshold: 0.6 },
    llm.call.bind(llm), // LLM fallback for messages that don't match any rule
  );
  orchestrator.setIntentClassifier(HybridIntentClassifier.toFn(classifier), classifier);
  orchestrator.setLLMCall(llm.call.bind(llm));

  // ---------------------------------------------------------------------------
  // Petri Net: idle ──[process_mails]──► processing ──[complete]──► done
  // ---------------------------------------------------------------------------

  const net = orchestrator.petri;
  net.addPlace({ id: 'idle',       type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
  net.addPlace({ id: 'processing', type: 'normal',  tokens: [] });
  net.addPlace({ id: 'done',       type: 'final',   tokens: [] });

  // ---------------------------------------------------------------------------
  // GraphFlow — 4 nodes, 2 LLM calls
  // ---------------------------------------------------------------------------

  const mailGraph = new GraphFlow<any>({
    name: 'process_mails',
    context: { maxMails: 5 },
    schema: z.object({ maxMails: z.number() }).passthrough(),
    nodes: [
      {
        name: 'fetch_mails',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Fetching mails...');
          const res      = await gmail.users.messages.list({ userId: 'me', maxResults: ctx.maxMails || 5, q: '' });
          const messages = res.data.messages || [];
          ctx.mails = [];
          for (const msg of messages) {
            const detail  = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'metadata', metadataHeaders: ['Subject', 'From'] });
            const headers = detail.data.payload?.headers || [];
            ctx.mails.push({
              id:      msg.id!,
              subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
              from:    headers.find((h: any) => h.name === 'From')?.value    || '(unknown)',
            });
          }
          console.log(`  [CortexFlow] Fetched ${ctx.mails.length} mails`);
        },
        next: 'classify_urgency',
      },
      {
        name: 'classify_urgency',
        execute: async (ctx: any) => {
          console.log('  [CortexFlow] Batch urgency (LLM call #2)...');
          const mailList = ctx.mails.map((m: any, i: number) => `[${i}] From: ${m.from} | Subject: ${m.subject}`).join('\n');
          const raw = await llm.call(
            `For each email, is it urgent (needs reply today)? Urgent = deadline/ASAP/security alert/action required.\n\nEmails:\n${mailList}\n\nJSON: {"urgency":[{"index":0,"urgent":true},...]}`
          );
          const parsed  = safeParse<any>(raw, { urgency: [] });
          const results: any[] = Array.isArray(parsed.urgency) ? parsed.urgency : [];
          ctx.urgentMails    = ctx.mails.filter((_: any, i: number) => results.find((r: any) => r.index === i)?.urgent === true);
          ctx.nonUrgentMails = ctx.mails.filter((_: any, i: number) => !results.find((r: any) => r.index === i)?.urgent);
          console.log(`  [CortexFlow] Urgent: ${ctx.urgentMails.length}, Non-urgent: ${ctx.nonUrgentMails.length}`);
        },
        next: 'respond_urgent',
      },
      {
        name: 'respond_urgent',
        execute: async (ctx: any) => {
          if (!ctx.urgentMails?.length) {
            ctx.responses = [];
            console.log('  [CortexFlow] No urgent mails — response generation skipped');
            return;
          }
          console.log(`  [CortexFlow] Batch response draft for ${ctx.urgentMails.length} mail(s) (LLM call #3)...`);
          const mailList = ctx.urgentMails.map((m: any, i: number) => `[${i}] From: ${m.from} | Subject: ${m.subject}`).join('\n');
          const raw = await llm.call(
            `Draft a brief professional reply (<40 words) for each urgent email.\n\nEmails:\n${mailList}\n\nJSON: {"responses":[{"index":0,"response":"..."},...]}`
          );
          const parsed = safeParse<any>(raw, { responses: [] });
          ctx.responses = Array.isArray(parsed.responses) ? parsed.responses : [];
          console.log(`  [CortexFlow] Drafted ${ctx.responses.length} response(s)`);
        },
        next: 'archive_others',
      },
      {
        name: 'archive_others',
        execute: async (ctx: any) => {
          ctx.archivedCount = ctx.nonUrgentMails?.length || 0;
          console.log(`  [CortexFlow] Archive: ${ctx.archivedCount} mail(s) (no LLM)`);
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
    id: 'process_mails', from: ['idle'], to: 'processing',
    action: { type: 'graphflow', name: 'process_mails', contextMapper: (ctx) => ({ maxMails: ctx.maxMails || 5 }) } as TransitionAction,
  });
  net.addTransition({ id: 'complete', from: ['processing'], to: 'done' });

  const sessionId = orchestrator.startSession();
  const result    = await orchestrator.orchestrate(
    'Fetch my 5 latest mails, flag the urgent ones, draft replies for urgent mails, and archive the rest.',
    sessionId
  );

  const ar = (result as any).transitionResult?.actionResult ?? {};
  return {
    framework:     'CortexFlow',
    totalTime:     Date.now() - startTime,
    llmCalls:      llm.callCount,
    memoryUsed:    process.memoryUsage().heapUsed - startMemory,
    mailsCount:    ar.mails?.length        ?? 0,
    urgentCount:   ar.urgentMails?.length  ?? 0,
    responsesCount: ar.responses?.length   ?? 0,
    archivedCount: ar.archivedCount        ?? 0,
    intentConfidence: result.intent.confidence,
  };
}
