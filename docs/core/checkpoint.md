# Système de Checkpoints

Le système de checkpoints permet de sauvegarder, reprendre et faire du débogage temporel sur les workflows. L'état est sauvegardé après chaque exécution de nœud dans un adaptateur configurable.

## Concepts clés

- **Checkpoint** — Snapshot de l'état du workflow après un nœud
- **runId** — Identifiant groupant les checkpoints d'une exécution
- **breakpoints** — Pause automatique avant certains nœuds
- **time travel** — Reprise d'un checkpoint avec modification d'état

## Adaptateurs

| Adaptateur | Usage |
|------------|-------|
| `InMemoryCheckpointAdapter` | Tests, développement |
| Autres à venir | Database, Redis, etc. |

## Utilisation de base

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";

const adapter = new InMemoryCheckpointAdapter();
const workflow = new GraphFlow({ /* ... */ });

// Exécution avec checkpointing automatique
const runId = await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["approve_order"], // Optionnel: pause avant ces nœuds
});

// Lister tous les checkpoints d'une exécution
const checkpoints = await workflow.listCheckpoints(adapter);

// Historique d'un run
const history = await workflow.getCheckpointHistory(runId, adapter);
```

## Reprise et voyage temporel

```typescript
// Reprise depuis le dernier checkpoint
await workflow.resumeFromCheckpoint(runId, adapter);

// Reprise depuis un checkpoint spécifique avec modification d'état
await workflow.resumeFromCheckpoint(cpId, adapter, {
  contextModifications: { status: "retry" },
});
```

## Interruptions et breakpoints

```typescript
// Interruption manuelle en cours d'exécution
workflow.interrupt();

// Configuration des breakpoints pour pause avant certains nœuds
await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["think", "approve_order"],
});
// Le moteur s'arrête avant d'exécuter ces nœuds
```

## Métadonnées des checkpoints

Chaque checkpoint tracke:
- `runId` — Groupe les checkpoints liés
- `interrupted` — Exécution en pause
- `awaitingApproval` — En attente d'approbation humaine
- `error` — Informations d'erreur si échec

## Erreurs spécifiques

- `CheckpointInterruptError` — Déclenchée lors d'une interruption
- `CheckpointAwaitApprovalError` — Déclenchée en attente d'approbation

## Intégration CLI

Le CLI interactif supporte la gestion des checkpoints:
- `/status` — Affiche l'état d'exécution
- `/list` — Liste les checkpoints disponibles
- `/resume [cpId]` — Reprend depuis un checkpoint
- `/approve` — Approuve une action en attente
- `/reject` — Rejette une action en attente
- `/modify k=v` — Modifie le contexte avant la reprise
