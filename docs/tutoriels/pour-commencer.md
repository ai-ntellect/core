# Pour commencer

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

## Vérification

Créez `index.ts`:

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext, GraphNodeConfig } from "@ai.ntellect/core/types";

const Schema = z.object({
  message: z.string(),
});

const workflow = new GraphFlow({
  name: "hello",
  schema: Schema,
  context: { message: "" },
  nodes: [
    {
      name: "greet",
      execute: async (ctx: GraphContext<typeof Schema>) => {
        ctx.message = "Hello!";
        console.log(ctx.message);
      },
    },
  ],
});

async function main() {
  await workflow.execute("greet");
}

main();
```

## Exécution

```sh
pnpm ts-node index.ts
```

Sortie:
```
Hello!
```

## Exemples dans le repo

```sh
# Hello world
pnpm run example:hello

# Noeuds événementiels
pnpm run example:events
```

## Prochaines étapes

- [Créer un graphe simple](creer-un-graphe-simple.md)
- [Créer un agent](creer-un-agent.md)
