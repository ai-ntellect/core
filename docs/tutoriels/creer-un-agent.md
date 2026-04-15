# Créer un agent basique

Un agent utilise un **LLM pour raisonner** et **choisir des actions**. Ce n'est pas juste des workflows isolés.

## Prérequis

```bash
pnpm add @ai.ntellect/core zod
```

### Ollama (recommandé)

```sh
ollama pull gemma4:4b
```

## Concept clé: Comment l'agent sait quoi faire

Un **LLM ne peut pas deviner** les actions disponibles. L'agent doit lui **fournir une liste structurée**.

C'est le rôle de **`generateActionSchema`**: générer dynamiquement la documentation des outils.

```
Utilisateur: "Envoie 1 ETH à 0x123"

Agent:
  1. Construit le prompt avec les outils disponibles
  2. LLM choisit: prepareEvmTransaction avec {to: "0x123", value: "1"}
  3. Exécute et retourne le résultat
```

## Exemple basique: Agent Calculatrice

### 1. Définir les outils

```typescript
import { z } from "zod";
import { GraphFlow, Agent } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const CalcSchema = z.object({
  a: z.number().describe("Premier nombre"),
  b: z.number().describe("Deuxième nombre"),
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
  result: z.number().optional(),
});

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
      },
    },
  ],
});
```

### 2. Créer l'agent

```typescript
const agent = new Agent({
  role: "Assistant Mathématique",
  goal: "Aider avec les calculs",
  tools: [calculator],
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
});
```

### 3. Utiliser

```typescript
await agent.process("Calcule 25 + 7");
// -> LLM choisit calculator avec les bons paramètres
// -> Retourne: "Le résultat est 32"
```

---

## Exemple agentique: Multi-outils avec raisonnement

Le vrai pouvoir d'un agent: **choisir le bon outil** selon la requête.

### Outils

```typescript
// Outil 1: Calculatrice
const calculator = new GraphFlow({
  name: "calculator",
  schema: z.object({
    a: z.number(), b: z.number(),
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    result: z.number().optional(),
  }),
  context: { a: 0, b: 0, operation: "add" },
  nodes: [{ name: "calc", execute: async (ctx) => {
    switch (ctx.operation) {
      case "add": ctx.result = ctx.a + ctx.b; break;
      case "subtract": ctx.result = ctx.a - ctx.b; break;
      case "multiply": ctx.result = ctx.a * ctx.b; break;
      case "divide": ctx.result = ctx.b !== 0 ? ctx.a / ctx.b : 0; break;
    }
  }}],
});

// Outil 2: Recherche web
const searchTool = new GraphFlow({
  name: "web_search",
  schema: z.object({
    query: z.string(),
    results: z.array(z.string()).optional(),
  }),
  context: { query: "", results: undefined },
  nodes: [{ name: "search", execute: async (ctx) => {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(ctx.query)}&format=json`);
    const data = await res.json();
    ctx.results = (data.RelatedTopics || []).slice(0, 5).map((r: any) => r.Text);
  }}],
});

// Outil 3: Lire fichier
const readFile = new GraphFlow({
  name: "read_file",
  schema: z.object({
    path: z.string(),
    content: z.string().optional(),
  }),
  context: { path: "", content: undefined },
  nodes: [{ name: "read", execute: async (ctx) => {
    const fs = await import("fs/promises");
    ctx.content = await fs.readFile(ctx.path, "utf-8");
  }}],
});
```

### Agent multi-outils

```typescript
const agent = new Agent({
  role: "Assistant Polyvalent",
  goal: "Aider l'utilisateur avec diverses tâches",
  tools: [calculator, searchTool, readFile],
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
});

// Le LLM choisit LE bon outil selon la requête
await agent.process("Combien font 100 divisé par 4?");
// -> Utilise calculator

await agent.process("Cherche les dernières news sur Rust");
// -> Utilise web_search

await agent.process("Lis le README.md");
// -> Utilise read_file
```

---

## Exemple avancé: Agent avec historique

**Problème:** Un LLM peut répéter la même action.

**Solution:** Utiliser `executedGraphs` pour suivre ce qui a été fait.

### Schema avec historique

```typescript
const AgentSchema = z.object({
  input: z.string(),
  actions: z.array(z.object({
    name: z.string(),
    params: z.record(z.any()),
  })),
  executed: z.array(z.string()),  // <- Historique
  result: z.string().optional(),
});

// Outil avec vérification d'historique
const smartSearch = new GraphFlow({
  name: "web_search",
  schema: AgentSchema,
  context: { input: "", actions: [], executed: [], result: undefined },
  nodes: [
    {
      name: "check_already_done",
      execute: async (ctx) => {
        // Ne pas répéter si déjà fait
        if (ctx.executed.includes("web_search")) {
          ctx.result = "(Déjà fait, je saute)";
        }
      },
      next: (ctx) => ctx.result ? [] : ["do_search"],
    },
    {
      name: "do_search",
      execute: async (ctx) => {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(ctx.input)}&format=json`);
        const data = await res.json();
        ctx.result = JSON.stringify(data.RelatedTopics?.slice(0, 3));
        ctx.executed.push("web_search");  // <- Marquer comme fait
      },
    },
  ],
});
```

### Agent intelligent

```typescript
const agent = new Agent({
  role: "Assistant Mémoire",
  goal: "Ne jamais répéter une action déjà faite",
  tools: [smartSearch, calculator],
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
  memory: true,  // <- Mémorise les actions
});

await agent.process("Cherche info sur Python");
// -> Fait la recherche

await agent.process("Cherche encore info sur Python");
// -> LLM voit dans l'historique que c'est déjà fait
// -> Retourne: "J'ai déjà fait cette recherche"
```

---

## Concept: generateActionSchema

Comment l'agent sait quels outils existent?

```typescript
// L'agent utilise generateActionSchema pour créer:
// ## AVAILABLE ACTIONS:
// - calculator: {a: number, b: number, operation: "add"|"subtract"|...}
// - web_search: {query: string}
// - read_file: {path: string}

// Le LLM voit cette liste et choisit l'outil adapté
```

Le schema Zod avec `.describe()` est **la clé**: le LLM lit les descriptions pour comprendre quand utiliser chaque outil.

---

## Exemple: Agent qui enchaîne les actions

```typescript
const agent = new Agent({
  role: "Assistant Recherche",
  goal: "Rechercher puis résumer",
  tools: [searchTool, calculator],  // <- Pas readFile ici
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
});

// Le LLM peut:
// 1. Faire une recherche
// 2. Voir qu'il faut compter les résultats
// 3. Utiliser calculator pour le comptage
await agent.process("Combien de résultats sur 'TypeScript'?");

// Log interne:
// [web_search] query="TypeScript" -> 5 résultats
// [calculator] count=5 -> réponse: "5 résultats"
```

---

## Configuration LLM

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

---

## Structure d'un agent

```
Agent
├── role: "Ce que tu es"
├── goal: "Ton objectif"
├── tools: [Outil1, Outil2, ...]  <- Les actions disponibles
├── llmConfig: {...}               <- Le modèle utilisé
├── memory: true/false             <- Mémoire des interactions
└── verbose: true/false            <- Logs
```

**L'agentique c'est:**
- Le LLM **rompt** entre les outils
- L'historique **évite** les répétitions
- La mémoire **contexte** les futures actions
- Les tools sont des **choix**, pas des étapes fixes

---

## Exécuter

```sh
# Test rapide sans LLM
pnpm run example:hello

# Avec agent
OLLAMA_MODEL=gemma4:4b pnpm ts-node examples/agent-tools.ts
```

## Voir aussi

- [Créer un agent onchain](creer-agent-onchain.md) — Agent avec blockchain, mémoire avancée
- [File Editor Workflow](file-editor-workflow.md) — Workflow multi-étapes
- [API Pipeline](api-pipeline-workflow.md) — Workflow avec cache
