# Retry avec Backoff

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
    delay: 1000,
  },
}
```

## Stratégies de backoff

### Fixed (fixe)

Délai constant entre chaque tentative:

```typescript
retry: {
  maxAttempts: 3,
  backoff: "fixed",
  delay: 1000, // 1 seconde à chaque fois
}
```

### Linear (linéaire)

Délai qui augmente linéairement:

```typescript
retry: {
  maxAttempts: 3,
  backoff: "linear",
  delay: 1000, // 1s, 2s, 3s...
}
```

### Exponential (exponentiel)

Délai qui double à chaque tentative:

```typescript
retry: {
  maxAttempts: 3,
  backoff: "exponential",
  delay: 1000, // 1s, 2s, 4s...
}
```

## Cas d'usage

- **Appels API instables** — Réessayer en cas d'erreurs réseau
- **Opérations de base de données** — Gérer les verrous temporaires
- **Services tiers** — Tolérance aux pannes transientes
