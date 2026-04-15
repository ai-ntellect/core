# Agent avec mémoire

Un agent qui **se souvient** des interactions passées.

## Concept

Sans mémoire:
```
User: "Mon nom est Pierre"
Agent: "Bonjour Pierre!"
User: "Comment je m'appelle?"  <- L'agent a oublié
Agent: "Je ne sais pas"
```

Avec mémoire:
```
User: "Mon nom est Pierre"
Agent: "Bonjour Pierre!"
  -> Mémorise: {name: "Pierre"}
  
User: "Comment je m'appelle?"
Agent: "Tu t'appelles Pierre!"
  -> Vérifie la mémoire: {name: "Pierre"}
```

## Implementation

### Schema avec mémoire

```typescript
import { z } from "zod";
import { Agent, Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const AgentSchema = z.object({
  message: z.string(),
  memory: z.record(z.any()).optional(),
  response: z.string().optional(),
});
```

### Outil de lecture mémoire

```typescript
const recallTool = new GraphFlow({
  name: "recall_memory",
  schema: z.object({
    query: z.string(),
    result: z.string().optional(),
  }),
  context: { query: "", result: undefined },
  nodes: [{
    name: "recall",
    execute: async (ctx, _, __, memory: Memory) => {
      const data = await memory.recall("user_context");
      ctx.result = data ? JSON.stringify(data) : "(aucun souvenir)";
    },
  }],
});
```

### Outil d'écriture mémoire

```typescript
const memorizeTool = new GraphFlow({
  name: "memorize",
  schema: z.object({
    key: z.string(),
    value: z.string(),
    saved: z.boolean().optional(),
  }),
  context: { key: "", value: "", saved: undefined },
  nodes: [{
    name: "save",
    execute: async (ctx, _, __, memory: Memory) => {
      const existing = await memory.recall(ctx.key) || {};
      await memory.save(ctx.key, { ...existing, value: ctx.value });
      ctx.saved = true;
    },
  }],
});
```

### Agent avec mémoire

```typescript
async function main() {
  const memory = new Memory(new InMemoryAdapter());
  await memory.init();

  const agent = new Agent({
    role: "Assistant Mémoire",
    goal: "Se souvenir des informations de l'utilisateur",
    tools: [recallTool, memorizeTool],
    llmConfig: getLLMConfig(),
    memory,  // <- Passe la mémoire
  });

  // Interaction 1: Apprendre
  await agent.process("Je m'appelle Pierre et j'aime le café");
  // -> Mémorise: {name: "Pierre", preference: "café"}

  // Interaction 2: Se souvenir
  const response = await agent.process("Comment je m'appelle?");
  // -> "Tu t'appelles Pierre"

  // Interaction 3: Utiliser le souvenir
  const response2 = await agent.process("Qu'est-ce que j'aime?");
  // -> "Tu aimes le café"
}
```

## Pattern: Lire avant d'écrire

```typescript
const agent = new Agent({
  role: "Assistant Intelligent",
  tools: [recallTool, memorizeTool],
  llmConfig: getLLMConfig(),
  memory,
});

// Le LLM sait qu'il doit:
// 1. Vérifier la mémoire (recallTool)
// 2. Si info manquante, poser une question
// 3. Sauvegarder (memorizeTool)
await agent.process("Tu sais quelque chose sur moi?");
await agent.process("Retiens que je suis développeur React");
await agent.process("De quoi je suis développeur?");
```

## Test

```typescript
async function test() {
  const memory = new Memory(new InMemoryAdapter());
  await memory.init();
  
  // Sauvegarder directement
  await memory.save("user", { name: "Pierre", lang: "fr" });
  
  // Récupérer
  const user = await memory.recall("user");
  console.log(user); // { name: "Pierre", lang: "fr" }
}
```
