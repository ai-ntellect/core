import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { CortexFlowOrchestrator } from '../../routing/orchestrator';
import { PetriNet, TransitionAction } from '../../routing/index';
import { ToolRegistry } from '../../execution/registry';
import { GraphFlow } from '../../execution/index';
import { z } from 'zod';
import { IntentClassifier, IntentClassifierFn } from '../../routing/intent-classifier';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Helper: create LLM call using Ollama
function createOllamaCall(model = 'llama3:latest') {
  return async (prompt: string) => {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
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
}

// Helper: create Gmail client using token
function createGmailClient() {
  const tokenPath = path.join(__dirname, '../../gmail_token.json');
  if (!fs.existsSync(tokenPath)) {
    throw new Error('gmail_token.json not found. Run: node scripts/get-gmail-token.js');
  }
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../../client_secret.json'), 'utf8'));
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    credentials.web.client_id,
    credentials.web.client_secret,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials(token);
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

describe('CortexFlow Real LLM Test (Ollama/Llama 3)', function() {
  this.timeout(120000);

  let orchestrator: CortexFlowOrchestrator;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    orchestrator = new CortexFlowOrchestrator('mail_assistant', toolRegistry);
  });

  it('should classify intent with real LLM', async function() {
    try {
      const checkResp = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (!checkResp.ok) throw new Error('Ollama not accessible');
    } catch (e) {
      console.log('⚠️  Ollama API not accessible, skipping real LLM test');
      this.skip();
      return;
    }

    const llmCall = createOllamaCall();
    const classifier = new IntentClassifier(llmCall, {
      intents: ['FETCH_MAILS', 'SUMMARIZE', 'APPROVE', 'REJECT', 'UNKNOWN'],
      confidenceThreshold: 0.6,
    });
    orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);

    const result = await orchestrator.orchestrate('Please summarize my 5 latest mails');
    expect(result.intent.intent).to.not.equal('UNKNOWN');
    expect(result.intent.confidence).to.be.above(0.5);
  });

  it('should handle low confidence with real LLM', async function() {
    try {
      const checkResp = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (!checkResp.ok) throw new Error('Ollama not accessible');
    } catch (e) {
      console.log('⚠️  Ollama not available, skipping');
      this.skip();
      return;
    }

    const llmCall = createOllamaCall();
    const classifier = new IntentClassifier(llmCall, {
      confidenceThreshold: 0.9,
    });
    orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);

    console.log('\n🚀  Testing low confidence handling with Ollama...');
    const sessionId = orchestrator.startSession();

    const result = await orchestrator.orchestrate(
      'asdfghjkl qwertyuiop',  // Nonsense input
      sessionId
    );

    console.log('\n📊  Result:', {
      intent: result.intent,
      confidence: result.intent.confidence,
      needsClarification: result.needsClarification,
      clarificationQuestion: result.clarificationQuestion,
    });

    expect(result.needsClarification).to.be.true;
    expect(result.clarificationQuestion).to.be.a('string').and.not.empty;

    console.log('✅  Low confidence handling works!\n');
  });

  it('should fetch 5 real mails and summarize with LLM', async function() {
    // Check Ollama
    try {
      const checkResp = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (!checkResp.ok) throw new Error('Ollama not accessible');
    } catch (e) {
      console.log('⚠️  Ollama not available, skipping');
      this.skip();
      return;
    }

    // Check Gmail token
    if (!fs.existsSync(path.join(__dirname, '../../gmail_token.json'))) {
      console.log('⚠️  gmail_token.json not found, skipping');
      this.skip();
      return;
    }

    // Check if Gmail API is enabled
    try {
      const gmail = createGmailClient();
      await gmail.users.getProfile({ userId: 'me' });
    } catch (error: any) {
      if (error.code === 403) {
        console.log('⚠️  Gmail API not enabled. Enable at: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=266761775636');
        this.skip();
        return;
      }
    }

    const llmCall = createOllamaCall();
    const gmail = createGmailClient();
    const classifier = new IntentClassifier(llmCall, {
      intents: ['FETCH_MAILS', 'SUMMARIZE', 'UNKNOWN'],
      confidenceThreshold: 0.6,
    });
    orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
    orchestrator.setLLMCall(llmCall);

    // Setup Petri net
    const net = orchestrator.petri;
    net.addPlace({ id: 'idle', type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
    net.addPlace({ id: 'processing', type: 'normal', tokens: [] });
    net.addPlace({ id: 'done', type: 'final', tokens: [] });

    // Create GraphFlow that fetches real mails and summarizes
    const mailGraph = new GraphFlow<any>({
      name: 'mail_fetch_summarize',
      context: { maxMails: 5 },
      schema: z.object({ maxMails: z.number() }).passthrough(),
      nodes: [
        {
          name: 'fetch_mails',
          execute: async (ctx: any) => {
            console.log('  [fetch_mails] Fetching mails from Gmail API...');
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
            console.log(`  [fetch_mails] Fetched ${ctx.fetchedMails.length} mails`);
          },
          next: 'summarize',
        },
        {
          name: 'summarize',
          execute: async (ctx: any) => {
            console.log('  [summarize] Summarizing with LLM...');
            const mailText = ctx.fetchedMails.map((m: any) => `From: ${m.from}\nSubject: ${m.subject}`).join('\n\n');
            const prompt = `Summarize these emails in 3 bullet points max:\n\n${mailText}\n\nRespond in JSON: {"summary": "..."}`;
            const response = await llmCall(prompt);
            const parsed = JSON.parse(response);
            ctx.summary = parsed.summary;
            console.log(`  [summarize] Summary: ${ctx.summary}`);
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

    console.log('\n🚀  Starting real Gmail + LLM test...');
    const sessionId = orchestrator.startSession();

    const result = await orchestrator.orchestrate(
      'Please fetch my 5 latest mails and summarize them',
      sessionId
    );

    console.log('\n📊  Result:', {
      intent: result.intent,
      needsClarification: result.needsClarification,
    });

    expect(result.intent.intent).to.not.equal('UNKNOWN');
    expect(result.needsClarification).to.be.false;
    expect((result as any).transitionResult).to.exist;

    console.log('✅  Real Gmail + LLM test passed!\n');
  });
});
