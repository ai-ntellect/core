# Branching

Le branching permet de créer des chemins d'exécution multiples dans votre graphe, que ce soit par condition, en parallèle, ou via un fan-out dynamique.

## Branching conditionnel

Utilisez `next` avec une condition pour diriger le flux vers différents nœuds :

```typescript
import { GraphFlow } from "@ai.ntellect/core";

const workflow = new GraphFlow({
  name: "order-process",
  context: { amount: 0, status: "" },
  nodes: [
    {
      name: "check_amount",
      execute: async (ctx) => {
        ctx.status = ctx.amount > 1000 ? "high" : "normal";
      },
      next: [
        { when: (ctx) => ctx.status === "high", to: "manager_approval" },
        { when: (ctx) => ctx.status === "normal", to: "auto_approve" },
      ],
    },
    {
      name: "manager_approval",
      execute: async (ctx) => { ctx.approved = true; },
      next: "notify",
    },
    {
      name: "auto_approve",
      execute: async (ctx) => { ctx.approved = true; },
      next: "notify",
    },
    {
      name: "notify",
      execute: async (ctx) => { console.log("Commande approuvée"); },
    },
  ],
});

await workflow.execute("check_amount", { amount: 1500 });
```

## Parallélisation (Fork-Join)

Activez `parallel: { enabled: true }` sur un nœud pour exécuter plusieurs branches simultanément. Utilisez `joinNode` pour spécifier où les branches se rejoignent.

```typescript
const workflow = new GraphFlow({
  name: "parallel-processing",
  context: { results: [], data: "test" },
  nodes: [
    {
      name: "split",
      execute: async (ctx) => { ctx.results = []; },
      parallel: { enabled: true },
      next: [
        { to: "process_a", branchId: "a" },
        { to: "process_b", branchId: "b" },
        { to: "process_c", branchId: "c" },
      ],
    },
    {
      name: "process_a",
      execute: async (ctx) => { ctx.results.push("A"); },
      joinNode: "merge",
    },
    {
      name: "process_b",
      execute: async (ctx) => { ctx.results.push("B"); },
      joinNode: "merge",
    },
    {
      name: "process_c",
      execute: async (ctx) => { ctx.results.push("C"); },
      joinNode: "merge",
    },
    {
      name: "merge",
      execute: async (ctx) => {
        console.log("Résultats:", ctx.results); // ["A", "B", "C"]
      },
    },
  ],
});

await workflow.execute("split");
```

Chaque branche reçoit une copie isolée du contexte (`structuredClone`). Les résultats sont fusionnés selon les règles de réduction définies.

## Reducers (fusion des résultats)

Contrôlez comment les résultats des branches parallèles sont fusionnés avec des reducers :

```typescript
import { Reducers } from "@ai.ntellect/core";

{
  name: "split",
  execute: async (ctx) => { ctx.results = []; },
  parallel: { enabled: true },
  reducers: [
    { key: "results", reducer: Reducers.append }, // concatène les tableaux
  ],
  next: [
    { to: "branch_a", branchId: "a" },
    { to: "branch_b", branchId: "b" },
  ],
}
```

Reducers intégrés :
- `Reducers.append` — concatène les tableaux
- `Reducers.deepMerge` — fusion profonde (défaut)
- `Reducers.lastWins` — garde la dernière valeur
- `Reducers.sum` — additionne les nombres

## Send API (fan-out dynamique)

Le `send` API permet de créer dynamiquement des branches au runtime :

```typescript
import { SendAPI } from "@ai.ntellect/core";

{
  name: "distribute",
  execute: async (ctx) => { ctx.processed = 0; },
  send: (ctx) => {
    const items = ctx.items || ["a", "b", "c"];
    return SendAPI.map(items, (item, i) => ({
      to: "process_item",
      input: { item, index: i },
      branchId: `item_${i}`,
    }));
  },
  reducers: [
    { key: "processed", reducer: (acc, val) => acc + val },
  ],
  joinNode: "done",
},
{
  name: "process_item",
  execute: async (ctx) => {
    console.log("Traitement:", ctx.item);
    return 1; // sera additionné par le reducer
  },
  joinNode: "done",
},
{
  name: "done",
  execute: async (ctx) => {
    console.log("Total traité:", ctx.processed); // 3
  },
}
```

## Subgraphs (branches complexes)

Une branche peut être un graphe complet enregistré via `SubgraphManager` :

```typescript
import { SubgraphManager } from "@ai.ntellect/core";

const subgraph = new GraphFlow({
  name: "subtask",
  context: { result: "" },
  nodes: [{
    name: "run",
    execute: async (ctx) => { ctx.result = "done"; },
  }],
});

const manager = new SubgraphManager();
manager.register("subtask", subgraph);

// Utilisable comme branche parallèle
{
  name: "run_subgraph",
  execute: async (ctx) => {},
  parallel: { enabled: true },
  next: [{ to: "subtask", subgraph: "subtask" }],
  joinNode: "next",
}
```

## Cas d'usage

- **Validation parallèle** : Vérifier plusieurs conditions simultanément
- **Pipeline de données** : Traiter des éléments indépendants en parallèle
- **Fan-out dynamique** : Distribuer du travail selon la taille d'un tableau
- **Subgraphs** : Décomposer un workflow complexe en composants réutilisables
