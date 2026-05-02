# Retry

Les nœuds peuvent réessayer en cas d'échec avec un backoff configurable.

## Configuration de base

```typescript
{
  name: "fetch_api",
  execute: async (ctx) => {
    ctx.data = await fetch("https://api.example.com/data");
  },
  retry: {
    maxAttempts: 3,
    backoff: "exponential", // ou "linear", "fixed"
    delay: 1000, // délai initial en ms
  },
}
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

## Cas d'usage

- **Appels API instables** : Réessayer en cas d'erreurs réseau
- **Opérations de base de données** : Gérer les verrous temporaires
- **Services tiers** : Tolérance aux pannes transientes

## Exemple complet

```typescript
import { GraphFlow } from "@ai.ntellect/core";

const workflow = new GraphFlow({
  name: "api-fetch",
  context: { data: null, attempts: 0 },
  nodes: [{
    name: "fetch_api",
    execute: async (ctx) => {
      ctx.attempts++;
      const response = await fetch("https://api.example.com/data");
      if (!response.ok) throw new Error("API error");
      ctx.data = await response.json();
    },
    retry: {
      maxAttempts: 3,
      backoff: "exponential",
      delay: 1000, // 1s, 2s, 4s entre les tentatives
    },
  }]
});

await workflow.execute("fetch_api");
console.log(`Récupéré après ${workflow.getContext().attempts} tentative(s)`);
```
