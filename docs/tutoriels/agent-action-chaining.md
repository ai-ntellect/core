# Agent qui enchaîne les actions

Un agent qui **utilise plusieurs outils** pour accomplir une tâche complexe.

## Concept

Une seule requête peut déclencher **plusieurs actions**:

```
User: "Cherche les dernières news sur Python, combien il y en a?"

Agent:
  1. [web_search] query="Python news"
     -> 10 résultats
  2. [count_results] items=10
     -> "Il y a 10 résultats"
```

## Outils

### Recherche web

```typescript
import { z } from "zod";
import { GraphFlow, Agent } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const SearchSchema = z.object({
  query: z.string(),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).optional(),
  count: z.number().optional(),
});

const searchTool = new GraphFlow({
  name: "web_search",
  schema: SearchSchema,
  context: { query: "", results: undefined },
  nodes: [{
    name: "search",
    execute: async (ctx: GraphContext<typeof SearchSchema>) => {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(ctx.query)}&format=json`
      );
      const data = await res.json();
      ctx.results = (data.RelatedTopics || [])
        .slice(0, 10)
        .map((r: any) => ({ title: r.Text?.substring(0, 80), url: r.FirstURL || "" }));
      ctx.count = ctx.results.length;
    },
  }],
});
```

### Compteur

```typescript
const countTool = new GraphFlow({
  name: "count_items",
  schema: z.object({
    items: z.array(z.any()),
    total: z.number().optional(),
  }),
  context: { items: [], total: undefined },
  nodes: [{
    name: "count",
    execute: async (ctx) => {
      ctx.total = ctx.items.length;
    },
  }],
});
```

### Agent multi-outils

```typescript
const agent = new Agent({
  role: "Assistant Recherche",
  goal: "Chercher et analyser l'information",
  tools: [searchTool, countTool],
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
  verbose: true,
});

// Le LLM peut utiliser plusieurs outils
await agent.process("Cherche les news sur Rust et dis-moi combien il y en a");
// Logique:
// 1. web_search(query="Rust news")
// 2. count_items(items=résultats)
// 3. Retourne: "Il y a 8 résultats"
```

## Exemple: Rechercher et filtrer

```typescript
const filterTool = new GraphFlow({
  name: "filter_results",
  schema: z.object({
    items: z.array(z.string()),
    keyword: z.string(),
    filtered: z.array(z.string()).optional(),
  }),
  context: { items: [], keyword: "", filtered: undefined },
  nodes: [{
    name: "filter",
    execute: async (ctx) => {
      ctx.filtered = ctx.items.filter(item => 
        item.toLowerCase().includes(ctx.keyword.toLowerCase())
      );
    },
  }],
});

const agent = new Agent({
  tools: [searchTool, filterTool],
  llmConfig: getLLMConfig(),
});

await agent.process(
  "Cherche des infos sur TypeScript et garde seulement celles parlant de React"
);
// 1. web_search(query="TypeScript React")
// 2. filter_results(keyword="React")
// 3. Retourne les résultats filtrés
```

## Exemple: Rechercher et sauvegarder

```typescript
const saveTool = new GraphFlow({
  name: "save_to_file",
  schema: z.object({
    path: z.string(),
    content: z.string(),
    saved: z.boolean().optional(),
  }),
  context: { path: "", content: "", saved: undefined },
  nodes: [{
    name: "save",
    execute: async (ctx) => {
      const fs = await import("fs/promises");
      await fs.writeFile(ctx.path, ctx.content, "utf-8");
      ctx.saved = true;
    },
  }],
});

const agent = new Agent({
  tools: [searchTool, saveTool],
  llmConfig: getLLMConfig(),
});

await agent.process(
  "Cherche les dernières news sur Go, sauvegarde-les dans news.txt et dis-moi le nombre"
);
// 1. web_search(query="Go programming news")
// 2. save_to_file(path="news.txt", content=résultats)
// 3. countTool(items=résultats)
// 4. Retourne: "8 résultats trouvés et sauvegardés"
```

## Pattern: Tool Orchestration

Le LLM peut **orchestrer** les outils dynamiquement:

```typescript
// Le prompt guide le LLM:
// "Tu as accès à ces outils:
//  - web_search: pour chercher sur le web
//  - count_items: pour compter des éléments
//  - filter_results: pour filtrer
//  - save_to_file: pour sauvegarder
//
// Choisis les outils appropriés pour répondre à l'utilisateur."

// Requête: "Combien de résultats sur Python?"
// -> LLM: web_search + count_items

// Requête: "Cherche et filtre les résultats Docker"
// -> LLM: web_search + filter_results

// Requête: "Cherche, sauvegarde et compte"
// -> LLM: web_search + save_to_file + count_items
```

## Test sans LLM

```typescript
// Tu peux tester les outils directement sans LLM
await searchTool.execute("search", { query: "TypeScript" });
console.log(searchTool.getContext().results);

await filterTool.execute("filter", { 
  items: ["React", "Vue", "Angular", "Svelte"],
  keyword: "React" 
});
console.log(filterTool.getContext().filtered); // ["React"]
```

## Configuration

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
