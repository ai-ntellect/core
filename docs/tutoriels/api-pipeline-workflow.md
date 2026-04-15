# Tutoriel: API Pipeline Workflow

Dans ce tutoriel, nous allons créer un workflow pour **fetcher des données d'API avec cache intelligent**.

## Le problème

Quand on fait des requêtes API:
1. **Lenteur** - Chaque requête prend du temps
2. **Rate limiting** - Les APIs limitent le nombre de requêtes
3. **Coût** - Chaque requête peut coûter de l'argent

Un workflow avec **cache** résout ces problèmes.

## Résultat attendu

```
Appel 1:
[FETCH] GET https://api.example.com/users -> 200
[CACHE] Sauvegardé pour 60s

Appel 2 (dans 30s):
[CACHE] Hit! Retourne les données cached
-> Plus rapide, moins de requêtes
```

## Schema

```typescript
import { z } from "zod";

const ApiPipelineSchema = z.object({
  url: z.string().describe("URL de l'API à requêter"),
  method: z.enum(["GET", "POST"]).default("GET")
    .describe("Méthode HTTP"),
  headers: z.record(z.string()).optional()
    .describe("Headers HTTP (ex: Authorization)"),
  body: z.string().optional()
    .describe("Corps de la requête (pour POST)"),
  transform: z.enum(["json", "extract", "none"]).default("json")
    .describe("Comment transformer le résultat"),
  result: z.string().optional()
    .describe("Résultat de la requête"),
  cached: z.boolean().optional()
    .describe("Si les données viennent du cache"),
  status: z.number().optional()
    .describe("Code HTTP de la réponse"),
  error: z.string().optional()
    .describe("Message d'erreur si échec"),
});
```

## Cache simple

```typescript
// Stockage en mémoire
// TTL = 60 secondes
const cache = new Map<string, { data: string; timestamp: number }>();

function getCache(url: string, ttlMs: number = 60000): string | null {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }
  return null;
}

function setCache(url: string, data: string): void {
  cache.set(url, { data, timestamp: Date.now() });
}
```

## Workflow complet (4 noeuds)

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const ApiPipelineSchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  transform: z.enum(["json", "extract", "none"]).default("json"),
  result: z.string().optional(),
  cached: z.boolean().optional(),
  status: z.number().optional(),
  error: z.string().optional(),
});

const cache = new Map<string, { data: string; timestamp: number }>();

const apiPipelineFlow = new GraphFlow({
  name: "api_pipeline",
  schema: ApiPipelineSchema,
  context: { url: "", method: "GET", transform: "json" },
  nodes: [
    // ============================================
    // NOEUD 1: Vérifier le cache
    // ============================================
    {
      name: "check_cache",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        const cached = cache.get(ctx.url);
        if (cached && Date.now() - cached.timestamp < 60000) {
          ctx.result = cached.data;
          ctx.cached = true;
          console.log(`[CACHE] Hit! Données récupérées`);
        } else {
          ctx.cached = false;
          console.log(`[CACHE] Miss, besoin de fetcher`);
        }
      },
      // CONDITIONNEL: Passer au fetch seulement si pas de cache
      next: (ctx) => ctx.cached ? [] : ["fetch_data"],
    },

    // ============================================
    // NOEUD 2: Fetch les données
    // ============================================
    {
      name: "fetch_data",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        try {
          const options: RequestInit = {
            method: ctx.method,
            headers: {
              "Content-Type": "application/json",
              ...ctx.headers,
            },
          };
          if (ctx.body && ctx.method === "POST") {
            options.body = ctx.body;
          }

          console.log(`[FETCH] ${ctx.method} ${ctx.url}`);
          const res = await fetch(ctx.url, options);
          ctx.status = res.status;

          if (!res.ok) {
            ctx.error = `HTTP ${res.status}: ${res.statusText}`;
            console.log(`[FETCH] Erreur: ${ctx.error}`);
            return;
          }

          ctx.result = await res.text();
          console.log(`[FETCH] Succès (${ctx.status})`);
        } catch (err: any) {
          ctx.error = err.message;
          console.log(`[FETCH] Erreur réseau: ${ctx.error}`);
        }
      },
      // CONDITIONNEL: Transformer seulement si pas d'erreur
      next: (ctx) => ctx.error ? [] : ["transform_data"],
    },

    // ============================================
    // NOEUD 3: Transformer les données
    // ============================================
    {
      name: "transform_data",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        if (!ctx.result) return;

        switch (ctx.transform) {
          case "json":
            // Formater le JSON joliment
            try {
              const json = JSON.parse(ctx.result);
              ctx.result = JSON.stringify(json, null, 2);
              console.log(`[TRANSFORM] JSON formaté`);
            } catch {
              console.log(`[TRANSFORM] Réponse non-JSON, laissé tel quel`);
            }
            break;

          case "extract":
            // Extraire toutes les URLs
            const urls = ctx.result.match(/https?:\/\/[^\s"']+/g) || [];
            ctx.result = urls.join("\n");
            console.log(`[TRANSFORM] ${urls.length} URLs extraites`);
            break;

          case "none":
          default:
            console.log(`[TRANSFORM] Aucune transformation`);
        }
      },
      // CONDITIONNEL: Sauvegarder en cache seulement si pas déjà cached
      next: (ctx) => !ctx.cached ? ["save_cache"] : [],
    },

    // ============================================
    // NOEUD 4: Sauvegarder en cache
    // ============================================
    {
      name: "save_cache",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        if (ctx.result) {
          cache.set(ctx.url, {
            data: ctx.result,
            timestamp: Date.now(),
          });
          console.log(`[CACHE] Sauvegardé (TTL: 60s)`);
        }
      },
    },
  ],
});
```

## Utilisation

### Test direct

```typescript
async function test() {
  console.log("=== Test API Pipeline ===\n");

  // Premier appel: doit fetcher
  console.log("Appel 1 (devrait fetcher):");
  await apiPipelineFlow.execute("check_cache", {
    url: "https://jsonplaceholder.typicode.com/users/1",
    transform: "json",
  });
  let ctx = apiPipelineFlow.getContext();
  console.log("Cached:", ctx.cached);
  console.log("Status:", ctx.status);
  console.log("Result:", ctx.result?.substring(0, 50) + "...");

  // Deuxième appel (devrait utiliser le cache)
  console.log("\nAppel 2 (devrait utiliser cache):");
  await apiPipelineFlow.execute("check_cache", {
    url: "https://jsonplaceholder.typicode.com/users/1",
    transform: "json",
  });
  ctx = apiPipelineFlow.getContext();
  console.log("Cached:", ctx.cached);

  // Extraire les URLs d'une page
  console.log("\nAppel 3 (extraction d'URLs):");
  await apiPipelineFlow.execute("check_cache", {
    url: "https://example.com",
    transform: "extract",
  });
  ctx = apiPipelineFlow.getContext();
  console.log("URLs extraites:", ctx.result);
}

test();
```

### Avec un agent

```typescript
const agent = new Agent({
  role: "API Assistant",
  goal: "Fetcher et transformer des données d'API",
  tools: [apiPipelineFlow],
  llmConfig: getLLMConfig(),
});

await agent.process("Fetch les données de https://api.github.com/users");
await agent.process("Récupère https://jsonplaceholder.typicode.com/posts et formate en JSON");
await agent.process("Trouve toutes les URLs dans https://example.com");
```

## Exemple complet testable

```typescript
// examples/api-pipeline.ts

import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const ApiPipelineSchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST"]).default("GET"),
  transform: z.enum(["json", "extract", "none"]).default("json"),
  result: z.string().optional(),
  cached: z.boolean().optional(),
  status: z.number().optional(),
  error: z.string().optional(),
});

const cache = new Map<string, { data: string; timestamp: number }>();

const apiPipelineFlow = new GraphFlow({
  name: "api_pipeline",
  schema: ApiPipelineSchema,
  context: { url: "", method: "GET", transform: "json" },
  nodes: [
    {
      name: "check_cache",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        const cached = cache.get(ctx.url);
        if (cached && Date.now() - cached.timestamp < 60000) {
          ctx.result = cached.data;
          ctx.cached = true;
        } else {
          ctx.cached = false;
        }
      },
      next: (ctx) => ctx.cached ? [] : ["fetch_data"],
    },
    {
      name: "fetch_data",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        const res = await fetch(ctx.url);
        ctx.status = res.status;
        ctx.result = await res.text();
      },
      next: (ctx) => ctx.error ? [] : ["transform_data"],
    },
    {
      name: "transform_data",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        if (ctx.transform === "json") {
          try {
            const json = JSON.parse(ctx.result || "");
            ctx.result = JSON.stringify(json, null, 2);
          } catch { /* not json */ }
        }
      },
      next: (ctx) => !ctx.cached ? ["save_cache"] : [],
    },
    {
      name: "save_cache",
      execute: async (ctx: GraphContext<typeof ApiPipelineSchema>) => {
        if (ctx.result) {
          cache.set(ctx.url, { data: ctx.result, timestamp: Date.now() });
        }
      },
    },
  ],
});

async function test() {
  // Test 1: Fetch JSON
  await apiPipelineFlow.execute("check_cache", {
    url: "https://jsonplaceholder.typicode.com/users/1",
    transform: "json",
  });
  console.log("Test 1 - Status:", apiPipelineFlow.getContext().status);
  console.log("Test 1 - Cached:", apiPipelineFlow.getContext().cached);

  // Test 2: Should be cached
  await apiPipelineFlow.execute("check_cache", {
    url: "https://jsonplaceholder.typicode.com/users/1",
    transform: "json",
  });
  console.log("Test 2 - Cached:", apiPipelineFlow.getContext().cached);
}

test();
```

## Concepts clés

### 1. Cache conditionnel

```typescript
next: (ctx) => ctx.cached ? [] : ["fetch_data"]
```

- Si **déjà cached** → fin du workflow (pas besoin de fetcher)
- Si **pas cached** → aller à `fetch_data`

### 2. Cache multi-noeud

```
check_cache ─┬─ (cached) ──> FIN
             │
             └─ (miss) ──> fetch_data ──> transform_data ──> save_cache ──> FIN
```

Le cache est vérifié **avant** le fetch, et sauvegardé **après** la transformation.

### 3. Transformation flexible

```typescript
switch (ctx.transform) {
  case "json":      // Formater joliment
  case "extract":   // Extraire URLs
  case "none":      // Garder tel quel
}
```

Le LLM peut demander différents types de transformation.

## Pour aller plus loin

### Cache Redis pour persistance

```typescript
import { createClient } from "redis";

const redis = createClient();

const apiPipelineFlow = new GraphFlow({
  name: "api_pipeline",
  // ...
  nodes: [
    {
      name: "check_cache",
      execute: async (ctx) => {
        const cached = await redis.get(ctx.url);
        if (cached) {
          ctx.result = cached;
          ctx.cached = true;
        }
      },
      next: (ctx) => ctx.cached ? [] : ["fetch_data"],
    },
    // ...
    {
      name: "save_cache",
      execute: async (ctx) => {
        await redis.setEx(ctx.url, 60, ctx.result!);
      },
    },
  ],
});
```

### Retry automatique

```typescript
{
  name: "fetch_with_retry",
  execute: async (ctx) => {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const res = await fetch(ctx.url);
        ctx.result = await res.text();
        ctx.status = res.status;
        return;
      } catch (err) {
        attempts++;
        if (attempts >= 3) ctx.error = err.message;
      }
    }
  },
}
```
