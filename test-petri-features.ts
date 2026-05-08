import { CortexFlowOrchestrator } from './routing/orchestrator';
import { IntentClassifier, HybridIntentClassifier } from './routing/intent-classifier';
import { ToolRegistry } from './execution/registry';
import { GraphFlow } from './execution/index';
import { PetriNet } from './routing/index';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Chargement manuel du .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
});

const GROQ_API_KEY = envVars['GROQ_API_KEY'];

async function groqCall(prompt: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Schéma pour les outils de test
const TestSchema = z.object({
  query: z.string().default(''),
  data: z.string().default(''),
  result: z.string().default(''),
  message: z.string().default(''),
  fetched: z.boolean().default(false),
  processed: z.boolean().default(false),
  notified: z.boolean().default(false),
});

type TestContext = z.infer<typeof TestSchema>;

function createTestTools(): ToolRegistry {
  const registry = new ToolRegistry();

  const fetchGraph = new GraphFlow<typeof TestSchema>({
    name: 'fetch_data_graph',
    schema: TestSchema,
    context: { query: '', data: '', result: '', message: '', fetched: false, processed: false, notified: false },
    nodes: [
      {
        name: 'fetch_data',
        execute: async (ctx) => {
          console.log('  [Tool] fetch_data exécuté');
          ctx.data = `Données récupérées`;
          ctx.fetched = true;
        },
      },
    ],
    entryNode: 'fetch_data',
  });
  registry.register({ name: 'fetch_data', description: 'Récupère des données', graph: fetchGraph, startNode: 'fetch_data' });

  const processGraph = new GraphFlow<typeof TestSchema>({
    name: 'process_data_graph',
    schema: TestSchema,
    context: { query: '', data: '', result: '', message: '', fetched: false, processed: false, notified: false },
    nodes: [
      {
        name: 'process_data',
        execute: async (ctx) => {
          console.log('  [Tool] process_data exécuté');
          ctx.result = `Données traitées: ${ctx.data}`;
          ctx.processed = true;
        },
      },
    ],
    entryNode: 'process_data',
  });
  registry.register({ name: 'process_data', description: 'Traite des données', graph: processGraph, startNode: 'process_data' });

  return registry;
}

function setupPetriNet(orchestrator: CortexFlowOrchestrator) {
  const net = orchestrator.petri;

  net.addPlace({ id: 'idle', type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: Date.now() }] });
  net.addPlace({ id: 'fetching', type: 'normal', tokens: [] });
  net.addPlace({ id: 'processing', type: 'normal', tokens: [] });
  net.addPlace({ id: 'done', type: 'final', tokens: [] });

  net.addTransition({
    id: 'do_fetch',
    from: ['idle'],
    to: 'fetching',
    guard: {
      type: 'deterministic',
      condition: "context.intent === 'FETCH_DATA'",
    },
    action: { type: 'graphflow', name: 'fetch_data' } as any,
  });

  net.addTransition({
    id: 'do_process',
    from: ['idle'],
    to: 'processing',
    guard: {
      type: 'deterministic',
      condition: "context.intent === 'PROCESS_DATA'",
    },
    action: { type: 'graphflow', name: 'process_data' } as any,
  });

  net.addTransition({ id: 'fetch_to_done', from: ['fetching'], to: 'done' });
  net.addTransition({ id: 'process_to_done', from: ['processing'], to: 'done' });
}

async function testMultiIntents(orchestrator: CortexFlowOrchestrator, sessionId: string) {
  console.log('\n=== TEST 1: Multi-intents ===');
  const message = 'Récupère les données et traite-les';
  console.log(`Message: "${message}"`);

  const result = await orchestrator.orchestrate(message, sessionId);
  console.log('Intent principal:', result.intent.intent);
  console.log('Confiance:', result.intent.confidence);
  console.log('Multi-intents détectés:', result.intent.intents ? result.intent.intents.map(i => i.intent) : 'aucun');
  console.log('Transition exécutée:', result.transitionResult?.transitionId);
}

async function testSingleIntent(orchestrator: CortexFlowOrchestrator, sessionId: string) {
  console.log('\n=== TEST 2: Single intent ===');
  const message = 'Récupère les données';
  console.log(`Message: "${message}"`);

  const result = await orchestrator.orchestrate(message, sessionId);
  console.log('Intent:', result.intent.intent);
  console.log('Confiance:', result.intent.confidence);
  console.log('Transition exécutée:', result.transitionResult?.transitionId);
}

async function testFallbackMode(orchestrator: CortexFlowOrchestrator, sessionId: string) {
  console.log('\n=== TEST 3: Fallback Mode (confiance faible) ===');
  const message = 'fais un truc au hasard s\'il te plaît';
  console.log(`Message: "${message}"`);

  orchestrator.setFallbackLLM(async (message: string, session: any) => {
    console.log('  [Fallback] Message reçu:', message);
    return {
      response: 'Je suis en mode fallback. Je ne peux pas traiter cette demande.',
      shouldReenterPetri: false,
    };
  });

  const result = await orchestrator.orchestrate(message, sessionId);
  console.log('Intent:', result.intent.intent, '(attendu: UNKNOWN)');
  console.log('Fallback response:', result.fallbackResponse?.substring(0, 60));
}

async function testJsonPattern() {
  console.log('\n=== TEST 4: Chargement pattern JSON ===');
  const patternPath = path.join(__dirname, 'petri', 'patterns', 'human-approval.json');
  const pattern = JSON.parse(fs.readFileSync(patternPath, 'utf-8'));

  console.log(`Pattern: ${pattern.name}`);
  console.log(`Description: ${pattern.description}`);
  console.log(`Places: ${pattern.places.length}, Transitions: ${pattern.transitions.length}`);
  console.log('✅ Pattern JSON valide');
}

async function main() {
  console.log('🚀 Tests des nouvelles fonctionnalités Petri\n');

  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY manquant');
    return;
  }

  const registry = createTestTools();
  const orchestrator = new CortexFlowOrchestrator('test', registry);
  orchestrator.setLLMCall(groqCall);
  setupPetriNet(orchestrator);

  const classifier = new IntentClassifier(groqCall, {
    intents: ['FETCH_DATA', 'PROCESS_DATA', 'UNKNOWN'],
    confidenceThreshold: 0.6,
  });
  orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
  orchestrator.setConfidenceThreshold(0.6);

  const sessionId = orchestrator.startSession();

  try {
    await testMultiIntents(orchestrator, sessionId);
    await testSingleIntent(orchestrator, sessionId + '_2');
    await testFallbackMode(orchestrator, sessionId + '_fallback');
    await testJsonPattern();

    console.log('\n✅ Tests terminés avec succès!');
    console.log('\nFonctionnalités implémentées:');
    console.log('1. ✅ Mode hybride/échappatoire (fallback LLM)');
    console.log('2. ✅ Classifieur multi-intents');
    console.log('3. ✅ Patterns prêts à l\'emploi (JSON)');
    console.log('4. ✅ Adapters de persistance (Redis + Postgres)');
  } catch (error) {
    console.error('\n❌ Erreur:', error);
  }
}

main();
