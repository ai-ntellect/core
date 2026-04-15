---
description: >
  Assemblez un graphe cognitif pour la prise de décision et des graphes
  d'actions pour l'exécution pour créer un agent.
---

# Créer un agent

Un agent connecte un LLM à vos **workflows complets** (pas des actions isolées).

## Pourquoi des workflows complets ?

Une action isolée (juste "lire un fichier") n'a pas de valeur. Un **workflow complet** oui :

```
READ -> TRANSFORM -> WRITE  (valide plus qu'une simple lecture)
FETCH -> CACHE -> PARSE     (valide plus qu'un simple fetch)
SEARCH -> FETCH -> SUMMARY   (valide plus qu'une simple recherche)
```

---

## Concepts clés

### Comment l'agent comprend l'intention

Un **agent intelligent** doit connaître les **actions disponibles** avant de prendre une décision. Le LLM ne peut pas deviner ! Nous devons lui **fournir une liste structurée** de toutes les actions disponibles.

C'est ici qu'intervient la méthode **`generateActionSchema`**.

La méthode `generateActionSchema` sert à **générer dynamiquement une documentation des actions disponibles** pour l'agent.

**Son rôle :**

- Extraire les **actions** disponibles à partir des workflows enregistrés
- Générer une **description de chaque action** et de ses **paramètres**
- Construire un **prompt structuré** que l'IA peut comprendre

L'agent récupère toutes les actions disponibles grâce à `generateActionSchema`, les **convertit en une liste d'actions claires**, les **envoie au LLM** sous forme d'un **prompt structuré** et le **LLM analyse la requête utilisateur** et choisit **quelle action exécuter**.

### Comment éviter de répéter les actions

Un problème qu'on peut rencontrer avec un **LLM** est qu'il peut **réexécuter des actions déjà effectuées**. Dans certains scénarios (comme des transactions blockchain), cela peut poser problème.

Une manière d'éviter ce comportement est d'utiliser un **historique des actions passées** (`executedGraphs`). Cette variable permet à l'agent de **garder une trace des workflows déjà exécutés** et d'ajuster ses décisions en conséquence.

### Graphe cognitif vs Graphe d'actions

Dans ce framework, un **agent** est basé sur **deux types de graphes** distincts :

1. **Un graphe cognitif** (`cognitiveGraph`) : Responsable du **raisonnement** et de la prise de décision.
2. **Des graphes d'actions** (`actionsGraph`) : Contient **toutes les actions exécutables** par l'agent.

Ces deux niveaux permettent à l'agent de fonctionner en **pensant d'abord** avant d'exécuter des actions.

Le **graphe cognitif** est le **cerveau** de l'agent. Il analyse **le contexte** avant d'exécuter une action. Il peut **refuser d'agir** s'il détecte qu'une action a déjà été exécutée.

Les **graphes d'actions ne sont déclenchés que par une validation.** Un graphe d'action ne peut être exécuté **que si le graphe cognitif le valide**. Cela empêche l'agent d'effectuer des actions **non autorisées** ou **non demandées**.

---

## Prérequis

```bash
npm install @ai.ntellect/core zod
```

### Ollama (recommandé, local)

```sh
# https://ollama.com
ollama pull gemma4:4b
```

### OpenAI (alternative)

```sh
export OPENAI_API_KEY=sk-...
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
        if (cached && Date.now() - cached.timestamp < 60000) {
          ctx.result = cached.data;
          ctx.cached = true;
          console.log(`[CACHE] Hit!`);
        }
      },
      next: (ctx) => ctx.cached ? [] : ["fetch_data"],
    },
    // NOEUD 2: Fetch les données
    {
      name: "fetch_data",
      execute: async (ctx) => {
        const res = await fetch(ctx.url);
        ctx.status = res.status;
        ctx.result = await res.text();
      },
      next: ["transform_data"],
    },
    // NOEUD 3: Transformer
    {
      name: "transform_data",
      execute: async (ctx) => {
        if (ctx.transform === "json") {
          try {
            const json = JSON.parse(ctx.result || "");
            ctx.result = JSON.stringify(json, null, 2);
          } catch { /* pas du JSON */ }
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

---

## WORKFLOW 3: Web Research (Search + Extract + Summary)

Recherche web avec extraction et synthèse.

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
          .map((r: any) => ({ title: r.Text?.substring(0, 80), url: r.FirstURL || "" }));
        console.log(`[SEARCH] ${ctx.rawResults.length} résultats`);
      },
      next: ["validate_results"],
    },
    // NOEUD 2: Valider/filtrer
    {
      name: "validate_results",
      execute: async (ctx) => {
        const seen = new Set();
        ctx.rawResults = ctx.rawResults?.filter(r => {
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return r.title?.length > 10;
        }) || [];
      },
      next: ["generate_summary"],
    },
    // NOEUD 3: Générer résumé
    {
      name: "generate_summary",
      execute: async (ctx) => {
        ctx.summary = ctx.rawResults?.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}`).join("\n\n");
      },
    },
  ],
});
```

---

## WORKFLOW 4: Markdown Pipeline (Read + Parse + Convert + Write)

Conversion Markdown vers HTML.

```typescript
const markdownPipeline = new GraphFlow({
  name: "markdown_pipeline",
  schema: MarkdownPipelineSchema,
  context: { inputPath: "", links: [] },
  nodes: [
    { name: "read_md", execute: async (ctx) => {
      const fs = await import("fs/promises");
      ctx.markdown = await fs.readFile(ctx.inputPath, "utf-8");
      ctx.outputPath = ctx.outputPath || ctx.inputPath.replace(".md", ".html");
    }, next: ["extract_links"] },
    { name: "extract_links", execute: async (ctx) => {
      ctx.links = ctx.markdown?.match(/https?:\/\/[^\s\)]+/g) || [];
    }, next: ["convert_html"] },
    { name: "convert_html", execute: async (ctx) => {
      let html = ctx.markdown
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
        .replace(/\n\n/g, "</p><p>");
      ctx.html = `<!DOCTYPE html><html><body><p>${html}</p></body></html>`;
    }, next: ["save_html"] },
    { name: "save_html", execute: async (ctx) => {
      const fs = await import("fs/promises");
      await fs.writeFile(ctx.outputPath!, ctx.html!, "utf-8");
    }},
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

## Exemple Avancé: Agent avec Mémoire et Historique

Cet exemple montre comment l'agent :
1. Mémorise les interactions passées
2. Évite de répéter les mêmes actions

### Définition du contexte

```typescript
const AgentContextSchema = z.object({
  prompt: z.object({
    raw: z.string(),
    embedding: z.array(z.number()).optional(),
  }),
  actions: z.array(z.object({
    name: z.string(),
    parameters: z.union([
      z.array(z.object({ name: z.string(), value: z.any() })),
      z.record(z.any()),
    ]),
  })),
  executedGraphs: z.array(z.string()),
  knowledge: z.string().optional(),
  response: z.string().optional(),
});

type AgentContext = GraphContext<typeof AgentContextSchema>;
```

### Graphe cognitif (cerveau de l'agent)

```typescript
const cognitiveGraph = new GraphFlow({
  name: "cognitive",
  schema: AgentContextSchema,
  context: { prompt: { raw: "" }, actions: [], executedGraphs: [], knowledge: "", response: "" },
  nodes: [
    // NOEUD 1: Récupérer la mémoire
    {
      name: "retrieveMemory",
      execute: async (ctx) => {
        // Chercher dans la mémoire si contexte pertinent
        console.log(`[MEMORY] Recherche: "${ctx.prompt.raw}"`);
      },
      next: ["makeDecision"],
    },
    // NOEUD 2: Prendre une décision
    {
      name: "makeDecision",
      execute: async (ctx) => {
        // Le LLM choisit l'action basée sur:
        // - La requête utilisateur
        // - Les actions disponibles
        // - L'historique (executedGraphs)
        console.log(`[DECISION] Historique: ${ctx.executedGraphs.length} actions`);
      },
      next: (ctx) => ctx.actions.length > 0 ? ["executeActions"] : [],
    },
    // NOEUD 3: Exécuter les actions
    {
      name: "executeActions",
      execute: async (ctx) => {
        // Exécuter chaque workflow
        for (const action of ctx.actions) {
          console.log(`[EXECUTE] ${action.name}`);
          // Ajouter à l'historique pour éviter les répétitions
          ctx.executedGraphs.push(action.name);
        }
      },
      next: ["saveMemory"],
    },
    // NOEUD 4: Sauvegarder en mémoire
    {
      name: "saveMemory",
      execute: async (ctx) => {
        console.log(`[MEMORY] Sauvegardé: ${ctx.executedGraphs.length} actions`);
      },
    },
  ],
});
```

### Point clé: Éviter les répétitions

Quand le LLM prend une décision, il reçoit dans son prompt:

```
## PAST ACTIONS (ne jamais réexécuter ces actions):
["prepareEvmTransaction", "file_editor"]
```

Cela permet d'éviter:
- De renvoyer une transaction déjà envoyée
- De lire un fichier déjà lu
- De faire une recherche déjà faite

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

---

## Exécuter les exemples

```sh
# Tester les workflows sans LLM
pnpm ts-node examples/workflows-complete.ts

# Avec Ollama
OLLAMA_MODEL=gemma4:e4b pnpm ts-node examples/agent-useful.ts
```

---

## Récapitulatif

Le framework permet de créer des agents avec:

1. **Graphe cognitif** - Raisonner avant d'agir
2. **Graphes d'actions** - Exécuter des tâches spécifiques
3. **Mémoire** - Se souvenir des interactions passées
4. **Historique (executedGraphs)** - Éviter de répéter les actions
5. **Workflows complets** - Chaînes d'actions significatives

Cette architecture **modulaire et évolutive** permet d'ajouter de nouvelles actions et d'adapter l'agent à différents cas d'usage.
