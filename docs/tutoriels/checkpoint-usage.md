# Utiliser les Checkpoints

Ce tutoriel vous guide dans l'utilisation du système de checkpoints pour sauvegarder et reprendre des workflows.

## Prérequis

- Avoir lu [Créer un graphe simple](./creer-un-graphe-simple.md)
- Comprendre les concepts de base de GraphFlow

## Étape 1: Configuration de l'adaptateur

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";
import { z } from "zod";

const Schema = z.object({
  step: z.string(),
  data: z.any().optional(),
});

const adapter = new InMemoryCheckpointAdapter();

const workflow = new GraphFlow({
  name: "checkpoint-demo",
  schema: Schema,
  context: { step: "start", data: null },
  nodes: [
    {
      name: "step1",
      execute: async (ctx) => {
        ctx.step = "step1";
        ctx.data = "Processed in step 1";
      },
      next: ["step2"],
    },
    {
      name: "step2",
      execute: async (ctx) => {
        ctx.step = "step2";
        ctx.data = "Processed in step 2";
      },
    },
  ],
});
```

## Étape 2: Exécution avec checkpoints

```typescript
// Démarrer l'exécution avec checkpointing
const runId = await workflow.executeWithCheckpoint("step1", adapter);

console.log(workflow.getContext().step); // "step1" ou "step2" selon le timing
```

## Étape 3: Lister les checkpoints

```typescript
const checkpoints = await workflow.listCheckpoints(adapter);
console.log(checkpoints);
// Affiche tous les checkpoints du run
```

## Étape 4: Reprendre l'exécution

```typescript
// Reprendre depuis le dernier checkpoint
await workflow.resumeFromCheckpoint(runId, adapter);
```

## Étape 5: Voyage temporel

```typescript
// Reprendre depuis un checkpoint spécifique avec modification d'état
const cpId = checkpoints[0].id; // Premier checkpoint
await workflow.resumeFromCheckpoint(cpId, adapter, {
  contextModifications: { step: "modified", data: "Changed!" },
});
```

## Étape 6: Utiliser les breakpoints

```typescript
// Pause automatique avant certains nœuds
await workflow.executeWithCheckpoint("step1", adapter, {
  breakpoints: ["step2"], // Pause avant step2
});
// Le workflow s'arrête avant d'exécuter step2
```

## Résumé

Vous savez maintenant:
- ✅ Configurer un adaptateur de checkpoint
- ✅ Exécuter un workflow avec sauvegarde automatique
- ✅ Lister et reprendre des checkpoints
- ✅ Faire du voyage temporel avec modification d'état
- ✅ Utiliser des breakpoints pour pause humaine
