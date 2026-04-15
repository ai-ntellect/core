# @ai.ntellect/core

Moteur de workflows **in-process** pour Node.js/TypeScript.

## Ce que c'est

Un runtime léger et embarquable pour orchestrer des workflows avec:

- **Graphes de workflows** — structure nodale avec état typé (Zod)
- **Noeuds pilotés par événements** — attendre des événements, timeouts, corrélation
- **Observation réactive** — état observable via RxJS
- **Couche Agent optionnelle** — les `GraphFlow` deviennent des outils pour un LLM via [Vercel AI SDK](https://github.com/vercel/ai)

## Ce que ce n'est pas

| Utilisez ce package si... | Prenez autre chose si... |
|---------------------------|---------------------------|
| Workflow runtime léger embarquable dans votre app Node/TS | Orchestration distribuée avec replay — [Temporal](https://temporal.io/), [Inngest](https://www.inngest.com/) |
| Contexte typé, état observable, corrélation d'événements | Step/queue SaaS multi-tenant |
| Graphes comme outils pour LLM sans glue code | Framework agent complet — LangGraph, Mastra |

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Concepts de base

### GraphFlow

Un `GraphFlow` définit un workflow avec:
- Un **schema** (Zod) pour valider le contexte
- Un **contexte** initial
- Des **noeuds** avec logique d'exécution

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const Schema = z.object({
  message: z.string(),
});

const workflow = new GraphFlow({
  name: "hello",
  schema: Schema,
  context: { message: "" },
  nodes: [
    {
      name: "greet",
      execute: async (ctx) => {
        ctx.message = "Hello!";
      },
    },
  ],
});

await workflow.execute("greet");
console.log(workflow.getContext().message); // "Hello!"
```

### Noeuds séquentiels

Les noeuds peuvent pointer vers le suivant via `next`:

```typescript
nodes: [
  {
    name: "step1",
    execute: async (ctx) => { /* ... */ },
    next: ["step2"],
  },
  {
    name: "step2",
    execute: async (ctx) => { /* ... */ },
  },
]
```

### Noeuds pilotés par événements

Un noeud peut attendre un événement avant de s'exécuter:

```typescript
{
  name: "await_payment",
  when: {
    events: ["payment.received"],
    timeout: 30000, // 30s timeout
    strategy: { type: "single" }, // ou "all"
  },
  execute: async (ctx) => {
    ctx.status = "paid";
  },
}
```

Pour attendre plusieurs événements corrélés:

```typescript
{
  name: "validation",
  when: {
    events: ["payment.validated", "inventory.checked"],
    strategy: {
      type: "correlate",
      correlation: (events) =>
        events.every(e => e.payload.orderId === events[0].payload.orderId),
    },
  },
}
```

### Observation de l'état

```typescript
workflow
  .observe()
  .state()
  .subscribe((ctx) => console.log("state:", ctx));

workflow
  .observe()
  .property("status")
  .subscribe((status) => console.log("status:", status));
```

## Module Agent

Le module Agent connecte un LLM à vos `GraphFlow` (outils).

### Configuration LLM

```typescript
// OpenAI
const llmConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
};

// Ollama (local)
const llmConfig = {
  provider: "ollama",
  model: "gemma4:4b",  // ou llama3.2:1b, etc.
  baseUrl: "http://localhost:11434",
};
```

### Exemple: Agent Calculator

```typescript
import { z } from "zod";
import { GraphFlow, Agent } from "@ai.ntellect/core";

const CalcSchema = z.object({
  a: z.number().describe("Premier nombre"),
  b: z.number().describe("Deuxième nombre"),
  operation: z.enum(["add", "subtract"]).describe("Opération"),
  result: z.number().optional(),
});

const calculator = new GraphFlow({
  name: "calculator",
  schema: CalcSchema,
  context: { a: 0, b: 0, operation: "add" },
  nodes: [{
    name: "calculate",
    execute: async (ctx) => {
      ctx.result = ctx.operation === "add" ? ctx.a + ctx.b : ctx.a - ctx.b;
      console.log(`=> ${ctx.a} ${ctx.operation} ${ctx.b} = ${ctx.result}`);
    },
  }],
});

const agent = new Agent({
  role: "Assistant Calcul",
  goal: "Aider avec les calculs",
  tools: [calculator],
  llmConfig: {
    provider: "ollama",
    model: "gemma4:4b",
  },
  verbose: true,
});

const result = await agent.process("Calcule 25 + 7");
console.log(result.response);
```

## Exemples

```sh
# Workflow simple
pnpm run example:hello

# Workflow avec événements
pnpm run example:events

# Agent avec outils (nécessite Ollama ou OPENAI_API_KEY)
OLLAMA_MODEL=gemma4:4b pnpm ts-node examples/agent-tools.ts
```

## Modules optionnels

### Memory

Persistance avec adaptateurs:
- `InMemoryAdapter` — stockage en mémoire
- `RedisAdapter` — Redis
- `MeilisearchAdapter` — recherche vectorielle

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();
await memory.save("user_prefs", { theme: "dark" });
const prefs = await memory.recall("user_prefs");
```

### Agenda

Planification cron:

```typescript
import { Agenda } from "@ai.ntellect/core";
import { NodeCronAdapter } from "@ai.ntellect/core/modules/agenda/adapters/node-cron";

const agenda = new Agenda(new NodeCronAdapter());
agenda.schedule("0 * * * *", async () => {
  console.log("Toutes les heures");
});
```

## Développement

```sh
pnpm install
pnpm run test:all
pnpm run build
```

## Tests

Les tests utilisent Mocha + Chai:

```sh
pnpm run test:all
pnpm run test:coverage
```

## Licence

MIT
