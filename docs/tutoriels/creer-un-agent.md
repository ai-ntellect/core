# Créer un agent

Un agent connecte un LLM à vos `GraphFlow` (outils). Le LLM décide quel outil utiliser selon la requête.

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Prérequis

### Ollama (recommandé, local)

```sh
# Installer Ollama: https://ollama.com
ollama pull gemma4:4b
# ou plus rapide:
ollama pull llama3.2:1b
```

### OpenAI (alternative)

```sh
export OPENAI_API_KEY=sk-...
```

## Concept

Un agent:
1. Reçoit une requête utilisateur
2. Envoie la requête + outils disponibles au LLM
3. Le LLM choisit un outil et ses paramètres
4. L'agent exécute le workflow
5. Le LLM génère une réponse

## Exemple: Calculatrice

### 1. Définir le schema

```typescript
import { z } from "zod";

const CalcSchema = z.object({
  a: z.number().describe("Premier nombre"),
  b: z.number().describe("Deuxième nombre"),
  operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("Opération"),
  result: z.number().optional().describe("Résultat"),
});
```

### 2. Créer le workflow (outil)

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

### 3. Configurer le LLM

```typescript
function getLLMConfig() {
  if (process.env.OLLAMA_MODEL) {
    return {
      provider: "ollama" as const,
      model: process.env.OLLAMA_MODEL,
      baseUrl: process.env.OLLAMA_HOST || "http://localhost:11434",
    };
  }
  return {
    provider: "openai" as const,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
  };
}
```

### 4. Créer l'agent

```typescript
import { Agent } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Assistant Calcul",
  goal: "Aider avec les calculs",
  backstory: "Tu es un assistant qui fait des calculs",
  tools: [calculator],
  llmConfig: getLLMConfig(),
  verbose: true,
});
```

### 5. Utiliser l'agent

```typescript
async function main() {
  const result = await agent.process("Calcule 25 + 7");
  console.log(result.response);
}

main().catch(console.error);
```

### Exécution

```sh
# Ollama
OLLAMA_MODEL=gemma4:4b pnpm ts-node examples/agent-tools.ts

# OpenAI
OPENAI_API_KEY=sk-... pnpm ts-node examples/agent-tools.ts
```

## Exemple: Notes

```typescript
const NoteSchema = z.object({
  content: z.string().describe("Contenu à sauvegarder"),
  saved: z.boolean().optional(),
});

const notes: Array<{ content: string; createdAt: Date }> = [];

const noteFlow = new GraphFlow({
  name: "save_note",
  schema: NoteSchema,
  context: { content: "" },
  nodes: [
    {
      name: "save",
      execute: async (ctx) => {
        notes.push({ content: ctx.content, createdAt: new Date() });
        ctx.saved = true;
        console.log(`Saved: "${ctx.content}"`);
      },
    },
  ],
});

const agent = new Agent({
  role: "Assistant Personnel",
  goal: "Gérer les notes de l'utilisateur",
  tools: [noteFlow],
  llmConfig: getLLMConfig(),
});

// Utilisation
await agent.process("Souviens-toi que le rendez-vous est à 15h");
```

## Exemple: Agent multi-outils

```typescript
const agent = new Agent({
  role: "Assistant Personnel",
  goal: "Aider avec calculs et notes",
  backstory: "Tu es un assistant utile",
  tools: [calculator, noteFlow, searchFlow], // plusieurs outils
  llmConfig: getLLMConfig(),
  verbose: true,
});

await agent.process("Calcule 10 * 5 et sauvegarde le résultat");
```

## Agent avec événements

Un agent peut interagir avec des workflows qui attendent des webhooks:

```typescript
const orderFlow = new GraphFlow({
  name: "process_order",
  schema: OrderSchema,
  context: { orderId: "", status: "pending" },
  nodes: [
    {
      name: "await_payment",
      when: {
        events: ["payment.confirmed"],
        timeout: 10000,
        strategy: { type: "single" },
      },
      execute: async (ctx) => {
        ctx.status = "payment_received";
      },
    },
  ],
});

const agent = new Agent({
  role: "Agent Commandes",
  tools: [orderFlow],
  llmConfig: getLLMConfig(),
});

// L'agent crée la commande
await agent.process("Crée une commande pour Alice");

// Later: webhook simulé
await orderFlow.emit("payment.confirmed", { orderId: "123" });
```

## Notes sur les modèles

| Modèle | Avantages | Inconvénients |
|--------|----------|---------------|
| gemma4:4b | Local, gratuit | Plus lent, prompts moins cohérents |
| llama3.2:1b | Très rapide | Moins précis |
| gpt-4o-mini | Fiable JSON | Payant |

### Conseils pour Ollama

- Ajouter des instructions claires dans le prompt
- Le schema doit être simple
- Tester avec des requêtes basiques d'abord

## Reference API

```typescript
new Agent({
  role: string;           // Rôle de l'agent
  goal: string;           // Objectif
  backstory?: string;     // Personnalité
  tools: GraphFlow[];     // Outils disponibles
  llmConfig: LLMConfig;   // Configuration LLM
  memory?: Memory;         // Mémoire optionnelle
  verbose?: boolean;      // Logging
})

agent.process(input: string): Promise<AgentContext>
```

### LLMConfig

```typescript
// OpenAI
{
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
}

// Ollama
{
  provider: "ollama",
  model: "gemma4:4b",
  baseUrl: "http://localhost:11434",
}
```
