# GraphController - Orchestration Multi-Graphes

Le `GraphController` permet d'exécuter plusieurs graphes de workflows en parallèle ou séquentiellement.

## Installation

Le `GraphController` est exporté depuis le package principal:

```typescript
import { GraphController } from "@ai.ntellect/core";
```

## Exécution parallèle

Exécutez plusieurs workflows simultanément:

```typescript
import { GraphController } from "@ai.ntellect/core";

const controller = new GraphController();

// Exécution parallèle
await controller.executeParallel([
  { graph: workflow1, startNode: "start" },
  { graph: workflow2, startNode: "init" },
]);
```

## Exécution séquentielle

Exécutez plusieurs workflows l'un après l'autre:

```typescript
// Exécution séquentielle
await controller.executeSequential([
  { graph: workflow1, startNode: "start" },
  { graph: workflow2, startNode: "init" },
]);
```

## Cas d'usage

- **Pipelines de données** — Traitement séquentiel de plusieurs étapes
- **Workflows parallèles** — Tâches indépendantes simultanées
- **Synchronisation** — Attendre que tous les workflows soient terminés
