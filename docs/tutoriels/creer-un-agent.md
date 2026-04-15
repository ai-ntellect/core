# Créer un agent

Un agent connecte un LLM à vos **workflows complets** (pas des actions isolées).

## Pourquoi des workflows complets ?

Une action isolée (juste "lire un fichier") n'a pas de valeur. Un **workflow complet** oui :

```
READ -> TRANSFORM -> WRITE  (valide plus qu'une simple lecture)
FETCH -> CACHE -> PARSE     (valide plus qu'un simple fetch)
SEARCH -> FETCH -> SUMMARY   (valide plus qu'une simple recherche)
```

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Prérequis

### Ollama (recommandé, local)

```sh
# https://ollama.com
ollama pull gemma4:4b
```

### OpenAI

```sh
export OPENAI_API_KEY=sk-...
```

## Concept de base

```
Utilisateur -> "Lis config.json et remplace la valeur debug: true par false"

Agent (LLM) ->
  1. Identifie l'outil adapté
  2. Extrait les paramètres: {path: "config.json", search: "debug: true", replace: "debug: false"}
  3. Exécute le workflow
  4. Retourne le résultat
```

---

## WORKFLOW 1: File Editor (Read + Replace + Write)

Workflow complet pour lire, modifier et sauvegarder un fichier.

### Schema

```typescript
import { z } from "zod";

const FileEditorSchema = z.object({
  path: z.string().describe("Chemin du fichier"),
  operation: z.enum(["read", "replace", "append"]),
  search: z.string().optional().describe("Texte à chercher"),
  replace: z.string().optional().describe("Texte de remplacement"),
  content: z.string().optional(),
  success: z.boolean().optional(),
});
```

### Workflow complet (3 noeuds)

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const fileEditorFlow = new GraphFlow({
  name: "file_editor",
  schema: FileEditorSchema,
  context: { path: "", operation: "read", success: false },
  nodes: [
    // NOEUD 1: Lire le fichier
    {
      name: "read_file",
      execute: async (ctx) => {
        const fs = await import("fs/promises");
        ctx.content = await fs.readFile(ctx.path, "utf-8");
        console.log(`[READ] ${ctx.path}: ${ctx.content.split("\n").length} lignes`);
      },
      next: ["process_content"], // Toujours passer au suivant
    },
    
    // NOEUD 2: Traiter selon l'opération
    {
      name: "process_content",
      execute: async (ctx) => {
        if (ctx.operation === "read") {
          ctx.success = true;
        } else if (ctx.operation === "replace" && ctx.search) {
          if (ctx.content?.includes(ctx.search)) {
            ctx.content = ctx.content.replace(ctx.search, ctx.replace || "");
            ctx.success = true;
            console.log(`[PROCESS] Remplacement effectué`);
          } else {
            ctx.success = false;
          }
        }
      },
      // CONDITIONNEL: Ne sauvegarder que si modification réussie
      next: (ctx) => ctx.operation !== "read" && ctx.success ? ["write_file"] : [],
    },
    
    // NOEUD 3: Sauvegarder (uniquement si modification)
    {
      name: "write_file",
      execute: async (ctx) => {
        const fs = await import("fs/promises");
        await fs.writeFile(ctx.path, ctx.content || "", "utf-8");
        console.log(`[WRITE] ${ctx.path} sauvegardé`);
      },
    },
  ],
});
```

### Utilisation

```typescript
// Avec un agent
const agent = new Agent({
  role: "File Editor",
  goal: "Lire et modifier des fichiers",
  tools: [fileEditorFlow],
  llmConfig: getLLMConfig(),
});

// LLM comprend automatiquement les paramètres
await agent.process("Lis package.json et remplace 'version': '0.9.0' par '0.9.1'");

// Ou directement (sans LLM)
await fileEditorFlow.execute("read_file", {
  path: "config.json",
  operation: "replace",
  search: "debug: true",
  replace: "debug: false",
});
```

---

## WORKFLOW 2: API Pipeline (Fetch + Cache + Transform)

Workflow pour fetcher des données avec cache intelligent.

### Schema

```typescript
const ApiPipelineSchema = z.object({
  url: z.string().describe("URL de l'API"),
  transform: z.enum(["json", "extract", "none"]).default("json"),
  result: z.string().optional(),
  cached: z.boolean().optional(),
  status: z.number().optional(),
});
```

### Workflow avec cache

```typescript
const cache = new Map<string, { data: string; timestamp: number }>();

const apiPipelineFlow = new GraphFlow({
  name: "api_pipeline",
  schema: ApiPipelineSchema,
  context: { url: "", transform: "json", cached: false },
  nodes: [
    // NOEUD 1: Vérifier le cache
    {
      name: "check_cache",
      execute: async (ctx) => {
        const cached = cache.get(ctx.url);
        // Cache valide 60 secondes
        if (cached && Date.now() - cached.timestamp < 60000) {
          ctx.result = cached.data;
          ctx.cached = true;
          console.log(`[CACHE] Hit!`);
        }
      },
      // CONDITIONNEL: Passer au fetch seulement si pas de cache
      next: (ctx) => ctx.cached ? [] : ["fetch_data"],
    },
    
    // NOEUD 2: Fetch les données
    {
      name: "fetch_data",
      execute: async (ctx) => {
        const res = await fetch(ctx.url);
        ctx.status = res.status;
        ctx.result = await res.text();
        console.log(`[FETCH] ${ctx.status}`);
      },
      next: ["transform_data"],
    },
    
    // NOEUD 3: Transformer selon le type
    {
      name: "transform_data",
      execute: async (ctx) => {
        if (ctx.transform === "json") {
          try {
            const json = JSON.parse(ctx.result || "");
            ctx.result = JSON.stringify(json, null, 2);
            console.log(`[TRANSFORM] JSON formaté`);
          } catch { /* pas du JSON */ }
        } else if (ctx.transform === "extract") {
          // Extraire les URLs
          const urls = ctx.result?.match(/https?:\/\/[^\s"]+/g) || [];
          ctx.result = urls.join("\n");
          console.log(`[TRANSFORM] ${urls.length} URLs extraites`);
        }
      },
      next: (ctx) => !ctx.cached ? ["save_cache"] : [],
    },
    
    // NOEUD 4: Sauvegarder en cache
    {
      name: "save_cache",
      execute: async (ctx) => {
        if (ctx.result) {
          cache.set(ctx.url, { data: ctx.result, timestamp: Date.now() });
        }
      },
    },
  ],
});
```

### Utilisation

```typescript
// Premier appel: fetch + cache
await apiPipelineFlow.execute("check_cache", {
  url: "https://api.github.com/users",
  transform: "json",
});

// Deuxième appel (dans 30s): retourne du cache
await apiPipelineFlow.execute("check_cache", {
  url: "https://api.github.com/users",
  transform: "json",
});
```

---

## WORKFLOW 3: Web Research (Search + Extract + Summary)

Recherche web avec extraction et synthèse.

### Schema

```typescript
const WebResearchSchema = z.object({
  topic: z.string().describe("Sujet de recherche"),
  maxResults: z.number().default(5),
  rawResults: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
  })).optional(),
  summary: z.string().optional(),
});
```

### Workflow de recherche

```typescript
const webResearchFlow = new GraphFlow({
  name: "web_research",
  schema: WebResearchSchema,
  context: { topic: "", maxResults: 5 },
  nodes: [
    // NOEUD 1: Rechercher
    {
      name: "search",
      execute: async (ctx) => {
        const res = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(ctx.topic)}&format=json`
        );
        const data = await res.json();
        ctx.rawResults = (data.RelatedTopics || [])
          .slice(0, ctx.maxResults)
          .filter((r: any) => r.Text)
          .map((r: any) => ({
            title: r.Text.substring(0, 80),
            url: r.FirstURL || "",
            snippet: r.Text,
          }));
        console.log(`[SEARCH] ${ctx.rawResults.length} résultats`);
      },
      next: ["validate_results"],
    },
    
    // NOEUD 2: Valider/filtrer les résultats
    {
      name: "validate_results",
      execute: async (ctx) => {
        // Filter out empty or duplicate results
        const seen = new Set();
        ctx.rawResults = ctx.rawResults?.filter(r => {
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return r.title.length > 10;
        }) || [];
        console.log(`[VALIDATE] ${ctx.rawResults.length} résultats valides`);
      },
      next: ["generate_summary"],
    },
    
    // NOEUD 3: Générer un résumé formaté
    {
      name: "generate_summary",
      execute: async (ctx) => {
        ctx.summary = ctx.rawResults
          ?.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}`)
          .join("\n\n");
        console.log(`[SUMMARY] Généré`);
      },
    },
  ],
});
```

---

## WORKFLOW 4: Markdown Pipeline (Read + Parse + Convert + Write)

Conversion Markdown vers HTML.

```typescript
const MarkdownPipelineSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string().optional(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  links: z.array(z.string()).optional(),
});

const markdownPipeline = new GraphFlow({
  name: "markdown_pipeline",
  schema: MarkdownPipelineSchema,
  context: { inputPath: "", links: [] },
  nodes: [
    {
      name: "read_md",
      execute: async (ctx) => {
        const fs = await import("fs/promises");
        ctx.markdown = await fs.readFile(ctx.inputPath, "utf-8");
        ctx.outputPath = ctx.outputPath || ctx.inputPath.replace(".md", ".html");
      },
      next: ["extract_links"],
    },
    {
      name: "extract_links",
      execute: async (ctx) => {
        ctx.links = ctx.markdown?.match(/https?:\/\/[^\s\)]+/g) || [];
        console.log(`[LINKS] ${ctx.links.length} liens trouvés`);
      },
      next: ["convert_html"],
    },
    {
      name: "convert_html",
      execute: async (ctx) => {
        let html = ctx.markdown
          .replace(/^### (.*)$/gm, "<h3>$1</h3>")
          .replace(/^## (.*)$/gm, "<h2>$1</h2>")
          .replace(/^# (.*)$/gm, "<h1>$1</h1>")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
          .replace(/\n\n/g, "</p><p>")
          .replace(/\n/g, "<br>");
        
        ctx.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body><p>${html}</p></body></html>`;
      },
      next: ["save_html"],
    },
    {
      name: "save_html",
      execute: async (ctx) => {
        const fs = await import("fs/promises");
        await fs.writeFile(ctx.outputPath!, ctx.html!, "utf-8");
        console.log(`[SAVE] ${ctx.outputPath}`);
      },
    },
  ],
});
```

---

## Agent Multi-Tools Complet

```typescript
const agent = new Agent({
  role: "Assistant Polyvalent",
  goal: "Aider avec fichiers, APIs, et recherche web",
  backstory: "Tu es un assistant pratique qui accomplit des tâches concrètes",
  tools: [fileEditorFlow, apiPipelineFlow, webResearchFlow, markdownPipeline],
  llmConfig: getLLMConfig(),
  verbose: true,
});

// Ces requêtes utilisent différents outils automatiquement
await agent.process("Lis le fichier config.json et remplace api_url");
await agent.process("Fetch les données de https://api.example.com/users");
await agent.process("Cherche des infos sur React et ses alternatives");
await agent.process("Convertis README.md en HTML");
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

## Exécuter les exemples

```sh
# Tester les workflows sans LLM
pnpm ts-node examples/workflows-complete.ts

# Avec Ollama
OLLAMA_MODEL=gemma4:e4b pnpm ts-node examples/agent-useful.ts
```

---

## Structure d'un workflow complet

```
{
  name: "nom_outil",
  schema: MonSchema,        // Zod avec descriptions pour le LLM
  context: { /* état initial */ },
  nodes: [
    {
      name: "step1",       // NOEUD 1
      execute: async (ctx) => { /* logique */ },
      next: ["step2"],    // Toujours au suivant
    },
    {
      name: "step2",      // NOEUD 2
      execute: async (ctx) => { /* logique */ },
      next: (ctx) => ctx.success ? ["step3"] : [],  // CONDITIONNEL
    },
    {
      name: "step3",       // NOEUD 3
      execute: async (ctx) => { /* logique finale */ },
    },
  ],
}
```

**Points clés:**
- Chaque noeud fait **une chose**
- `next` peut être statique `["suivant"]` ou conditionnel `(ctx) => ...`
- Le schema Zod avec `describe()` guide le LLM
- Les `console.log` dans les nodes aide au debugging
