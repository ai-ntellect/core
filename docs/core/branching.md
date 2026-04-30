# Branching Conditionnel

Les nœuds peuvent déterminer dynamiquement l'étape suivante en utilisant plusieurs stratégies.

## Array statique

Le moteur prend le premier par défaut:

```typescript
{
  name: "step1",
  execute: async (ctx) => { /* ... */ },
  next: ["step2", "step3"], // step2 sera exécuté
}
```

## Fonction dynamique

Inspectez le contexte et décidez:

```typescript
{
  name: "evaluate",
  execute: async (ctx) => { /* ... */ },
  next: (ctx) => ctx.status === "ok" ? ["process"] : ["retry"],
}
```

## Objets conditionnels

Branching avec conditions multiples:

```typescript
{
  name: "check_score",
  execute: async (ctx) => { /* ... */ },
  next: [
    { when: (ctx) => ctx.score > 80, then: "pass" },
    { when: (ctx) => ctx.score > 50, then: "review" },
    { then: "fail" }, // Fallback par défaut
  ],
}
```

## Combinaison avec les événements

Le branching fonctionne aussi avec les nœuds événementiels:

```typescript
{
  name: "await_approval",
  when: { events: ["approval.received"], timeout: 30000 },
  execute: async (ctx) => { /* ... */ },
  next: (ctx) => ctx.approved ? ["process"] : ["reject"],
}
```
