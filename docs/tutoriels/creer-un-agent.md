# Créer un agent

Un agent connecte un LLM à vos `GraphFlow` (outils). Le LLM choisit quoi exécuter.

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Prérequis

### Ollama (recommandé, local)

```sh
# https://ollama.com
ollama pull llama3.2:1b
```

### OpenAI

```sh
export OPENAI_API_KEY=sk-...
```

## Concept

```
Utilisateur -> LLM -> Outil 1 (read_file) -> Résultat
                     -> Outil 2 (fetch) -> Résultat
                     -> Réponse texte
```

## Exemple 1: Agent File Reader

### Définir le schema

```typescript
import { z } from "zod";

const Schema = z.object({
  path: z.string().describe("Chemin du fichier"),
  content: z.string().optional(),
  error: z.string().optional(),
});
```

### Créer le workflow (outil)

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const readFileFlow = new GraphFlow({
  name: "read_file",
  schema: Schema,
  context: { path: "", content: undefined, error: undefined },
  nodes: [
    {
      name: "read",
      execute: async (ctx: GraphContext<typeof Schema>) => {
        const fs = await import("fs/promises");
        try {
          ctx.content = await fs.readFile(ctx.path, "utf-8");
        } catch (err: any) {
          ctx.error = err.message;
        }
      },
    },
  ],
});
```

### Config LLM

```typescript
function getLLMConfig() {
  if (process.env.OLLAMA_MODEL) {
    return {
      provider: "ollama" as const,
      model: process.env.OLLAMA_MODEL,
      baseUrl: "http://localhost:11434",
    };
  }
  return {
    provider: "openai" as const,
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  };
}
```

### Créer et utiliser l'agent

```typescript
import { Agent } from "@ai.ntellect/core";

const agent = new Agent({
  role: "File Assistant",
  goal: "Lire des fichiers à la demande",
  tools: [readFileFlow],
  llmConfig: getLLMConfig(),
  verbose: true,
});

// Utiliser
const result = await agent.process("Lis le fichier README.md");
console.log(result.response);
```

## Exemple 2: Agent HTTP Fetcher

```typescript
const FetchSchema = z.object({
  url: z.string().describe("URL à requêter"),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.string().optional(),
  response: z.string().optional(),
  status: z.number().optional(),
});

const fetchFlow = new GraphFlow({
  name: "fetch_url",
  schema: FetchSchema,
  context: { url: "", method: "GET", response: undefined, status: undefined },
  nodes: [
    {
      name: "fetch",
      execute: async (ctx) => {
        const res = await fetch(ctx.url, {
          method: ctx.method,
          headers: { "Content-Type": "application/json" },
          body: ctx.body,
        });
        ctx.status = res.status;
        ctx.response = await res.text();
      },
    },
  ],
});

const agent = new Agent({
  role: "Web Assistant",
  goal: "Faire des requêtes HTTP",
  tools: [fetchFlow],
  llmConfig: getLLMConfig(),
});

const result = await agent.process(
  "Va chercher https://api.github.com/users/octocat"
);
```

## Exemple 3: Agent Recherche Web

```typescript
const SearchSchema = z.object({
  query: z.string().describe("Requête"),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
  })).optional(),
});

const searchFlow = new GraphFlow({
  name: "search",
  schema: SearchSchema,
  context: { query: "", results: undefined },
  nodes: [
    {
      name: "search",
      execute: async (ctx) => {
        const res = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(ctx.query)}&format=json`
        );
        const data = await res.json();
        ctx.results = data.RelatedTopics?.slice(0, 5).map((r: any) => ({
          title: r.Text,
          url: r.FirstURL,
          snippet: r.Text,
        })) || [];
      },
    },
  ],
});
```

## Exemple 4: Agent Multi-Outils

```typescript
const agent = new Agent({
  role: "Assistant Polyvalent",
  goal: "Aider avec fichiers, web et recherche",
  tools: [readFileFlow, fetchFlow, searchFlow],
  llmConfig: getLLMConfig(),
  verbose: true,
});

// Combiner les outils
const result = await agent.process(
  "Cherche les infos sur Node.js, puis lis le package.json du projet"
);
```

## Exemple 5: Agent avec Mémoire

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();

const agent = new Agent({
  role: "Assistant avec Mémoire",
  goal: "Se souvenir des interactions passées",
  tools: [searchFlow],
  llmConfig: getLLMConfig(),
  memory,
});

await agent.process("Je m'appelle Pierre");
await agent.process("Comment je m'appelle ?"); // Se souvient
```

## Exemple 6: Agent avec Événements (Webhooks)

```typescript
const orderFlow = new GraphFlow({
  name: "process_order",
  schema: z.object({
    status: z.string(),
    orderId: z.string(),
  }),
  context: { status: "pending", orderId: "" },
  nodes: [
    {
      name: "await_payment",
      when: {
        events: ["payment.confirmed"],
        timeout: 60000,
        strategy: { type: "single" },
      },
      execute: async (ctx) => {
        ctx.status = "paid";
      },
    },
  ],
});

const agent = new Agent({
  role: "Order Manager",
  tools: [orderFlow],
  llmConfig: getLLMConfig(),
});

// L'agent crée la commande
await agent.process("Crée une commande pour Alice");

// Plus tard, webhook externe
await orderFlow.emit("payment.confirmed", { orderId: "123" });
```

## Exécuter

```sh
# Ollama
OLLAMA_MODEL=llama3.2:1b pnpm ts-node examples/agent-useful.ts

# OpenAI
OPENAI_API_KEY=sk-... pnpm ts-node examples/agent-useful.ts
```

## Comparaison des modèles

| Modèle | Vitesse | Fiabilité JSON | Coût |
|--------|---------|----------------|------|
| llama3.2:1b | Rapide | Moyenne | Gratuit |
| gemma4:4b | Lente | Moyenne | Gratuit |
| gpt-4o-mini | Rapide | Bonne | Payant |

## Structure d'un outil

```typescript
const monOutil = new GraphFlow({
  name: "nom_outil",        // Identifiant unique
  schema: MonSchema,         // Zod schema avec descriptions
  context: { /* état */ },
  nodes: [
    {
      name: "execute",      // Premier noeud
      execute: async (ctx) => {
        // Logique ici
      },
    },
  ],
});
```

Le `describe()` dans le schema Zod est utilisé par le LLM pour comprendre les paramètres.
