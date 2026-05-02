# GraphController

Le `GraphController` permet d'exécuter plusieurs graphes en parallèle ou séquentiellement.

## Installation

```typescript
import { GraphController } from "@ai.ntellect/core";
```

## Exécution parallèle

Exécutez plusieurs workflows simultanément avec `executeParallel` :

```typescript
import { GraphController } from "@ai.ntellect/core";

const controller = new GraphController();

// Exécution parallèle de deux graphes
const results = await controller.executeParallel([
  { graph: workflow1, startNode: "start" },
  { graph: workflow2, startNode: "init" },
]);
```

## Exécution séquentielle

Exécutez plusieurs workflows l'un après l'autre avec `executeSequential` :

```typescript
// Exécution séquentielle : workflow2 ne démarre qu'après workflow1
await controller.executeSequential([
  { graph: workflow1, startNode: "start" },
  { graph: workflow2, startNode: "init" },
]);
```

## Cas d'usage

- **Pipelines de données** : Traitement séquentiel de plusieurs étapes
- **Workflows parallèles** : Tâches indépendantes simultanées
- **Synchronisation** : Attendre que tous les workflows soient terminés

## Exemple complet

```typescript
import { GraphController, GraphFlow } from "@ai.ntellect/core";

// Création de deux graphes simples
const graph1 = new GraphFlow({
  name: "process-data",
  context: { result: "" },
  nodes: [{
    name: "start",
    execute: async (ctx) => { ctx.result = "data processed"; }
  }]
});

const graph2 = new GraphFlow({
  name: "send-notification",
  context: { sent: false },
  nodes: [{
    name: "init",
    execute: async (ctx) => { ctx.sent = true; }
  }]
});

const controller = new GraphController();

// Exécution parallèle puis séquentielle
await controller.executeParallel([
  { graph: graph1, startNode: "start" },
  { graph: graph2, startNode: "init" },
]);

console.log("Tous les workflows sont terminés");
```
