# Module Mémoire

Persistance de données pour les agents.

## Utilisation

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory/adapters/in-memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();

// Sauvegarder
await memory.save("my_key", { data: "hello" });

// Récupérer
const result = await memory.recall("my_key");

// Supprimer
await memory.delete("my_key");
```

## Adaptateurs

| Adaptateur | Description |
|------------|-------------|
| `InMemoryAdapter` | Stockage en mémoire (volatile) |
| `RedisAdapter` | Redis pour persistance |
| `MeilisearchAdapter` | Recherche vectorielle |

## Redis

```typescript
import { RedisAdapter } from "@ai.ntellect/core/modules/memory/adapters/redis";

const memory = new Memory(
  new RedisAdapter({
    host: "localhost",
    port: 6379,
  })
);
await memory.init();
```

## Meilisearch

```typescript
import { MeilisearchAdapter } from "@ai.ntellect/core/modules/memory/adapters/meilisearch";

const memory = new Memory(
  new MeilisearchAdapter({
    apiKey: "your_key",
    host: "http://localhost:7700",
  })
);
await memory.init();
```

## API

```typescript
memory.init(): Promise<void>
memory.save(key: string, data: any): Promise<void>
memory.recall(key: string): Promise<any>
memory.delete(key: string): Promise<void>
memory.clear(): Promise<void>
```
