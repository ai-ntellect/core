# @ai.ntellect/core

Moteur de workflows **in-process** pour Node.js/TypeScript.

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Concepts clés

### GraphFlow

Structure de base pour définir un workflow avec:
- **Schema** (Zod) — validation du contexte
- **Context** — état initial
- **Nodes** — étapes du workflow

### Nodes

Chaque node a:
- `name` — identifiant unique
- `execute` — logique asynchrone
- `next` (optionnel) — noeuds suivants
- `when` (optionnel) — déclencheurs événementiels

### Observation

RxJS-based pour observer les changements d'état.

## Structure du projet

```
docs/
  README.md              # Ce fichier
  core/                  # Concepts core
    graphflow.md         # GraphFlow en détail
    les-evenements.md    # Noeuds événementiels
  modules/               # Modules optionnels
    memory/              # Persistance
    agenda/              # Planification cron
  tutoriels/             # Guides pratiques
    pour-commencer.md    # Installation et premier workflow
    creer-un-graphe-simple.md  # Hello world
    creer-un-agent.md    # Agent avec LLM
```

## Modules optionnels

### Memory

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();
```

### Agenda

```typescript
import { Agenda } from "@ai.ntellect/core";
import { NodeCronAdapter } from "@ai.ntellect/core/modules/agenda/adapters/node-cron";

const agenda = new Agenda(new NodeCronAdapter());
agenda.schedule("0 * * * *", async () => { /* ... */ });
```

## Exemples fonctionnels

Voir [`examples/`](./examples/) et [`examples/README.md`](./examples/README.md).

```sh
# Hello world
pnpm run example:hello

# Noeuds événementiels
pnpm run example:events

# Agent avec outils
OLLAMA_MODEL=gemma4:4b pnpm run example:agent
```

## Développement

```sh
pnpm install
pnpm run test:all
pnpm run build
```
