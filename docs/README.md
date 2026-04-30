# @ai.ntellect/core

Moteur de workflows **in-process** pour Node.js/TypeScript. Définissez des workflows comme des graphes de nœuds, où chaque nœud effectue une tâche spécifique et peut attendre des événements avant de continuer.

## Fonctionnalités clés

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
  core/                  # Concepts core
    graphflow.md         # GraphFlow en détail
    les-evenements.md    # Noeuds événementiels
    architecture.md      # Architecture générale
    checkpoint.md        # Système de checkpoints (NOUVEAU)
    graphcontroller.md   # Orchestration multi-graphes (NOUVEAU)
    branching.md         # Branching conditionnel (NOUVEAU)
    retry.md             # Retry avec backoff (NOUVEAU)
  modules/               # Modules optionnels
    memory/              # Persistance
    agenda/              # Planification cron
    nlp/                 # Traitement langage naturel (NOUVEAU)
  cli/                   # Documentation CLI (NOUVEAU)
    README.md            # CLI et commandes slash
  tutoriels/             # Guides pratiques
    pour-commencer.md    # Installation et premier workflow
    creer-un-graphe-simple.md  # Hello world
    creer-un-agent.md    # Agent avec LLM
    checkpoint-usage.md  # Utiliser les checkpoints (NOUVEAU)
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

## CLI Interactif

```sh
pnpm cli -p groq -m llama-3.1-8b-instant
pnpm cli -p openai -m gpt-4o-mini
```

**Commandes slash:**
- `/status`, `/history`, `/list`, `/resume [cpId]`
- `/approve`, `/reject`, `/modify k=v`
- `/clear`, `/help`, `/exit`

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
pnpm run test        # Exécution simple
pnpm run test:all   # Toutes les suites
pnpm run test:coverage
pnpm run test:watch
```
