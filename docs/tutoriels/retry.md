# Retry

Le retry permet de gérer les échecs temporaires en réessayant l'exécution d'un nœud avec une stratégie de délai configurable.

## Configuration de base

Ajoutez une configuration `retry` sur n'importe quel nœud :

```typescript
import { GraphFlow } from "@ai.ntellect/core";

const workflow = new GraphFlow({
  name: "api-fetch",
  context: { data: null, attempts: 0 },
  nodes: [
    {
      name: "fetch_api",
      execute: async (ctx) => {
        ctx.attempts++;
        const response = await fetch("https://api.example.com/data");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        ctx.data = await response.json();
      },
      retry: {
        maxAttempts: 3,
        backoff: "exponential",
        delay: 1000, // délai initial en ms
      },
    },
  ],
});

await workflow.execute("fetch_api");
console.log(`Récupéré après ${workflow.getContext().attempts} tentative(s)`);
```

## Stratégies de backoff

### Fixed (fixe)

Délai constant entre chaque tentative :

```typescript
retry: {
  maxAttempts: 3,
  backoff: "fixed",
  delay: 1000, // 1 seconde à chaque fois
}
```

### Linear (linéaire)

Délai qui augmente linéairement (`delay * attempt`) :

```typescript
retry: {
  maxAttempts: 3,
  backoff: "linear",
  delay: 1000, // 1s, 2s, 3s...
}
```

### Exponential (exponentiel)

Délai qui double à chaque tentative (`delay * 2^(attempt-1)`) :

```typescript
retry: {
  maxAttempts: 3,
  backoff: "exponential",
  delay: 1000, // 1s, 2s, 4s...
}
```

## Exemple complet avec gestion d'erreur

```typescript
const workflow = new GraphFlow({
  name: "robust-fetch",
  context: { data: null, error: null, attempts: 0 },
  nodes: [
    {
      name: "fetch_with_retry",
      execute: async (ctx) => {
        ctx.attempts++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch("https://api.example.com/data", {
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          ctx.data = await response.json();
        } catch (err) {
          if (ctx.attempts >= 3) {
            ctx.error = err.message;
            throw err; // Propager après le dernier essai
          }
          throw err; // Déclenche le retry
        }
      },
      retry: {
        maxAttempts: 3,
        backoff: "exponential",
        delay: 1000,
      },
      next: [
        { when: (ctx) => !ctx.error, to: "success" },
        { when: (ctx) => ctx.error, to: "handle_error" },
      ],
    },
    {
      name: "success",
      execute: async (ctx) => {
        console.log("Success:", ctx.data);
      },
    },
    {
      name: "handle_error",
      execute: async (ctx) => {
        console.error("Failure after", ctx.attempts, "attempts:", ctx.error);
      },
    },
  ],
});
```

## Retry avec état persistant

Combinez le retry avec le système de checkpoints pour survivre à un redémarrage :

```typescript
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";

const adapter = new InMemoryCheckpointAdapter();

const workflow = new GraphFlow({
  name: "resilient-task",
  context: { attempts: 0 },
  nodes: [
    {
      name: "unstable_task",
      execute: async (ctx) => {
        ctx.attempts++;
        if (Math.random() < 0.7) throw new Error("Aleatory failure");
        ctx.done = true;
      },
      retry: { maxAttempts: 5, backoff: "exponential", delay: 500 },
    },
  ],
});

// Avec checkpoint, l'état des tentatives est préservé
await workflow.executeWithCheckpoint("unstable_task", {}, adapter);
```

## Cas d'usage

- **Appels API instables** : Réessayer en cas d'erreurs réseau (429, 500, 503)
- **Opérations de base de données** : Gérer les verrous temporaires ou timeouts
- **Services tiers** : Tolérance aux pannes transientes
- **Webhooks** : Garantir la livraison malgré les erreurs temporaires
- **LLM calls** : Gérer les rate limits des API d'IA
