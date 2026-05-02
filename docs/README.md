# @ai.ntellect/core

Moteur de workflows **in-process** pour Node.js/TypeScript construit autour de deux primitives complémentaires : **GraphFlow** pour l'exécution nœud par nœud, et **CortexFlow** pour l'orchestration formellement vérifiée d'agents LLM via des Réseaux de Petri.

Inspiré de [l'architecture hybride Petri Net / Agent LLM](https://www.mdpi.com/1999-5903/17/8/363).

## Fonctionnalités clés

### GraphFlow
- **État typé avec Zod** — Contexte validé à chaque étape
- **Nœuds événementiels** — Pause en attendant des déclencheurs externes (webhooks, actions utilisateur)
- **Système de checkpoints** — Sauvegarde/reprise d'état, voyage temporel, breakpoints human-in-the-loop
- **État observable** — RxJS Observables sur les changements de contexte
- **Branching conditionnel** — `next` dynamique via fonctions, tableaux ou objets conditionnels
- **Retry avec backoff** — Résilience intégrée pour opérations instables
- **Orchestration multi-graphes** — Exécution parallèle ou séquentielle via `GraphController`
- **Module Agent LLM** — Outils comme GraphFlows, boucle cognitive (think → execute → reply)
- **Module Memory** — Adaptateurs pluggables (InMemory, Redis, Meilisearch)
- **Module Agenda** — Planification cron avec `node-cron`
- **Module NLP** — `@nlpjs/basic` enveloppé comme nœuds de graphe
- **CLI interactif** — REPL avec commandes slash, gestion de checkpoints, approbation humaine

### CortexFlow (Orchestration par Réseau de Petri)
- **Un seul appel LLM par tour** — Classification d'intention unique, routage déterministe par le Petri Net
- **Garanties formelles** — Détection de deadlock, bornage, atteignabilité
- **Clarification automatique** — Question générée automatiquement si la confiance est insuffisante
- **Propagation de traceId** — Corrélation des logs sur toute la trace d'orchestration
- **CLI de débogage** — Inspection interactive du marquage, injection de jetons, export DOT
- **Benchmark intégré** — Comparaison CortexFlow vs LangGraph (temps, appels LLM, mémoire)

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

Requires TypeScript 5.x+ and Node.js 18+.

## Concepts clés

### GraphFlow

Structure de base pour définir un workflow avec:
- **Schema** (Zod) — validation du contexte
- **Context** — état initial
- **Nodes** — étapes du workflow

### Checkpoint System

Sauvegarde et reprise d'exécution, voyage temporel, breakpoints:

```typescript
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";

const adapter = new InMemoryCheckpointAdapter();
const runId = await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["approve_order"],
});

// Reprise
await workflow.resumeFromCheckpoint(runId, adapter);

// Voyage temporel avec modification d'état
await workflow.resumeFromCheckpoint(cpId, adapter, {
  contextModifications: { status: "retry" },
});
```

### Agent LLM

Créez des agents avec outils (GraphFlows):

```typescript
const agent = new Agent({
  role: "Assistant",
  goal: "Help with tasks",
  tools: [calculatorTool],
  llmConfig: { provider: "groq", model: "llama-3.1-8b-instant" },
});
const result = await agent.process("What is 25 + 7?");
```

## Structure du projet

```
docs/
  README.md              # Ce fichier
  core/                  # Concepts GraphFlow
    graphflow.md         # GraphFlow en détail
    les-evenements.md    # Noeuds événementiels
    architecture.md      # Architecture générale
    checkpoint.md        # Système de checkpoints
    graphcontroller.md   # Orchestration multi-graphes
    branching.md         # Branching conditionnel
    retry.md             # Retry avec backoff
  modules/               # Modules optionnels
    memory/              # Persistance
    agenda/              # Planification cron
    nlp/                 # Traitement langage naturel
  cli/                   # Documentation CLI
    README.md            # CLI et commandes slash
  tutoriels/             # Guides pratiques
    pour-commencer.md    # Installation et premier workflow
    creer-un-graphe-simple.md  # Hello world
    creer-un-agent.md    # Agent avec LLM
    checkpoint-usage.md  # Utiliser les checkpoints

petri/                   # CortexFlow — Orchestration Réseau de Petri
  orchestrator.ts        # CortexFlowOrchestrator (intent → Petri → GraphFlow)
  intent-classifier.ts   # IntentClassifier (1 appel LLM par tour)
  index.ts               # PetriNet — moteur de jetons
  types.ts               # Types partagés (Token, Place, Transition, …)
  matrix.ts              # Analyse matricielle (détection deadlock/bornage)

benchmark/               # Benchmark CortexFlow vs LangGraph
  cortexflow-workflow.ts # Workflow CortexFlow (Gmail + résumé LLM)
  langgraph-workflow.ts  # Workflow LangGraph équivalent
  run-benchmark.ts       # Runner — tableau comparatif

cli-dev.ts               # CLI de débogage interactif (REPL Petri Net)
utils/logger.ts          # Logger Pino partagé avec traceId
```

## Modules optionnels

### Memory

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();
```

Adaptateurs disponibles: `InMemoryAdapter`, `RedisAdapter`, `MeilisearchAdapter`

### Agenda

```typescript
import { Agenda } from "@ai.ntellect/core";
import { NodeCronAdapter } from "@ai.ntellect/core/modules/agenda/adapters/node-cron";

const agenda = new Agenda(new NodeCronAdapter());
agenda.schedule("0 * * * *", async () => { /* ... */ });
```

### NLP

```typescript
import { NLPEngine } from "@ai.ntellect/core";

const nlp = new NLPEngine();
await nlp.train([
  { intent: "greeting", utterances: ["hello", "hi"], answer: "Hello!" },
]);
```

## CLI Interactif Agent

```sh
pnpm cli -p groq -m llama-3.1-8b-instant
pnpm cli -p openai -m gpt-4o-mini
```

**Commandes slash :**
- `/status`, `/history`, `/list`, `/resume [cpId]`
- `/approve`, `/reject`, `/modify k=v`
- `/clear`, `/help`, `/exit`

## CortexFlow DEV CLI (débogage Petri Net)

```sh
pnpm run dev:cli [workflow.json]
```

**Commandes :**
- `load <file.json>` — Charger un workflow depuis un fichier JSON
- `show [placeId]` — Afficher le marquage courant
- `enabled` — Lister les transitions activées
- `step <id>` — Franchir une transition
- `auto` — Franchir automatiquement jusqu'au blocage
- `inject <placeId> [json]` — Injecter un jeton
- `history` — Historique des transitions
- `dot` — Exporter en format Graphviz DOT
- `reset` — Réinitialiser au marquage initial

## Benchmark CortexFlow vs LangGraph

```sh
pnpm run benchmark
```

Mesure sur un scénario réel (Gmail API + résumé LLM) :
- Temps total
- Nombre d'appels LLM
- Mémoire consommée
- Confiance de l'intention

## Exemples fonctionnels

```sh
pnpm run example:hello           # Workflow simple
pnpm run example:events         # Workflow événementiel
pnpm run example:agent         # Agent avec outils
pnpm run example:agent-project  # Agent créant des fichiers
pnpm run example:native-tools  # Agent avec outils Node.js natifs
```

## Développement

```sh
pnpm install
pnpm run test:all
pnpm run build
```

### Tests

```sh
pnpm run test             # Exécution simple
pnpm run test:all         # Toutes les suites
pnpm run test:petri       # Suite Petri Net uniquement
pnpm run test:coverage
pnpm run test:watch
```
