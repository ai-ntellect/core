# Créer un agent basique

Un agent qui utilise un LLM pour choisir et exécuter des workflows.

## Prérequis

```bash
pnpm add @ai.ntellect/core zod
```

### Ollama (recommandé)

```sh
# https://ollama.com
ollama pull gemma4:4b
```

### OpenAI (alternative)

```sh
export OPENAI_API_KEY=sk-...
```

## Concept

```
Utilisateur -> "Calcule 25 + 7"

Agent:
  1. Envoie la requête + outils au LLM
  2. LLM choisit: calculator, params: {a: 25, b: 7, operation: "add"}
  3. Exécute le workflow
  4. Retourne "Le résultat est 32"
```

## Exemple: Calculatrice

### 1. Schema

```typescript
import { z } from "zod";

const CalcSchema = z.object({
  a: z.number().describe("Premier nombre"),
  b: z.number().describe("Deuxième nombre"),
  operation: z.enum(["add", "subtract", "multiply", "divide"])
    .describe("Opération à effectuer"),
  result: z.number().optional().describe("Résultat du calcul"),
});
```

### 2. Workflow (outil)

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const calculator = new GraphFlow({
  name: "calculator",
  schema: CalcSchema,
  context: { a: 0, b: 0, operation: "add" },
  nodes: [
    {
      name: "calculate",
      execute: async (ctx: GraphContext<typeof CalcSchema>) => {
        switch (ctx.operation) {
          case "add": ctx.result = ctx.a + ctx.b; break;
          case "subtract": ctx.result = ctx.a - ctx.b; break;
          case "multiply": ctx.result = ctx.a * ctx.b; break;
          case "divide": ctx.result = ctx.b !== 0 ? ctx.a / ctx.b : 0; break;
        }
        console.log(`=> ${ctx.a} ${ctx.operation} ${ctx.b} = ${ctx.result}`);
      },
    },
  ],
});
```

### 3. Configuration LLM

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

### 4. Créer l'agent

```typescript
import { Agent } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Assistant Calcul",
  goal: "Aider avec les calculs",
  backstory: "Tu es un assistant mathématique",
  tools: [calculator],
  llmConfig: getLLMConfig(),
  verbose: true,
});
```

### 5. Utiliser

```typescript
// Le LLM choisit automatiquement le bon outil
const result = await agent.process("Calcule 25 + 7");
console.log(result.response);
```

## Exemple: File Reader

```typescript
const ReadSchema = z.object({
  path: z.string().describe("Chemin du fichier"),
  content: z.string().optional(),
});

const readFileFlow = new GraphFlow({
  name: "read_file",
  schema: ReadSchema,
  context: { path: "", content: undefined },
  nodes: [
    {
      name: "read",
      execute: async (ctx: GraphContext<typeof ReadSchema>) => {
        const fs = await import("fs/promises");
        ctx.content = await fs.readFile(ctx.path, "utf-8");
      },
    },
  ],
});

const agent = new Agent({
  role: "File Assistant",
  goal: "Lire des fichiers",
  tools: [readFileFlow],
  llmConfig: getLLMConfig(),
});

await agent.process("Lis le fichier package.json");
```

## Agent multi-outils

```typescript
const agent = new Agent({
  role: "Assistant Polyvalent",
  goal: "Aider avec calculs et fichiers",
  tools: [calculator, readFileFlow],
  llmConfig: getLLMConfig(),
  verbose: true,
});

// Le LLM choisit l'outil selon la demande
await agent.process("Calcule 100 / 4");
await agent.process("Lis README.md");
```

## Exemple: HTTP Fetcher

```typescript
const FetchSchema = z.object({
  url: z.string().describe("URL à requêter"),
  response: z.string().optional(),
  status: z.number().optional(),
});

const fetchFlow = new GraphFlow({
  name: "fetch_url",
  schema: FetchSchema,
  context: { url: "" },
  nodes: [
    {
      name: "fetch",
      execute: async (ctx: GraphContext<typeof FetchSchema>) => {
        const res = await fetch(ctx.url);
        ctx.status = res.status;
        ctx.response = await res.text();
      },
    },
  ],
});

const agent = new Agent({
  tools: [fetchFlow],
  llmConfig: getLLMConfig(),
});

await agent.process("Fetch https://jsonplaceholder.typicode.com/users/1");
```

## Structure d'un outil

```typescript
const monOutil = new GraphFlow({
  name: "nom_outil",       // Identifiant unique (le LLM l'utilise)
  schema: MonSchema,        // Zod schema avec .describe()
  context: { /* état */ },
  nodes: [
    {
      name: "execute",      // Premier noeud
      execute: async (ctx) => {
        // Logique de l'outil
      },
    },
  ],
});
```

**Important:** Le `.describe()` dans le schema Zod guide le LLM pour comprendre les paramètres.

## Comment le LLM choisit

Le LLM reçoit un prompt structuré:

```
## RÔLE
Assistant Calcul

## OUTILS DISPONIBLES
- calculator: {a: number, b: number, operation: "add"|"subtract"|...}

## INSTRUCTIONS
Réponds avec JSON: {actions: [...], response: "..."}
```

Le LLM retourne:
```json
{
  "actions": [{"name": "calculator", "parameters": {"a": 25, "b": 7, "operation": "add"}}],
  "response": "Le résultat est 32"
}
```

## Exécuter

```sh
# Test sans LLM (appel direct)
pnpm ts-node examples/test-tools.ts

# Avec Ollama
OLLAMA_MODEL=gemma4:4b pnpm ts-node examples/agent-tools.ts

# Avec OpenAI
OPENAI_API_KEY=sk-... pnpm ts-node examples/agent-tools.ts
```

## Voir aussi

- [Agent On-Chain](agent-on-chain.md) — Agent avec mémoire, historique, et transactions blockchain
