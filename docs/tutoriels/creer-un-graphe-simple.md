# Créer un graphe simple

Créez un workflow avec plusieurs noeuds séquentiels.

## Schema

```typescript
import { z } from "zod";

const Schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});
```

## Noeuds

```typescript
import { GraphNodeConfig } from "@ai.ntellect/core/types";

const retrieveData: GraphNodeConfig<typeof Schema> = {
  name: "retrieveData",
  execute: async (ctx) => {
    ctx.input = "Hello, GraphFlow!";
    console.log("Donnée:", ctx.input);
  },
  next: ["processData"],
};

const processData: GraphNodeConfig<typeof Schema> = {
  name: "processData",
  execute: async (ctx) => {
    ctx.processed = ctx.input.toUpperCase();
    console.log("Transformé:", ctx.processed);
  },
  next: ["logResult"],
};

const logResult: GraphNodeConfig<typeof Schema> = {
  name: "logResult",
  execute: async (ctx) => {
    ctx.result = `Résultat: ${ctx.processed}`;
    console.log(ctx.result);
  },
};
```

## Graphe complet

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const Schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});

const retrieveData = {
  name: "retrieveData",
  execute: async (ctx) => {
    ctx.input = "Hello, GraphFlow!";
  },
  next: ["processData"],
};

const processData = {
  name: "processData",
  execute: async (ctx) => {
    ctx.processed = ctx.input.toUpperCase();
  },
  next: ["logResult"],
};

const logResult = {
  name: "logResult",
  execute: async (ctx) => {
    ctx.result = `Résultat: ${ctx.processed}`;
  },
};

const workflow = new GraphFlow({
  name: "SimpleGraph",
  schema: Schema,
  context: { input: "", processed: "", result: "" },
  nodes: [retrieveData, processData, logResult],
});

async function main() {
  await workflow.execute("retrieveData");
  console.log(workflow.getContext());
}

main();
```

## Résultat

```
{ input: 'Hello, GraphFlow!', processed: 'HELLO, GRAPHFLOW!', result: 'Résultat: HELLO, GRAPHFLOW!' }
```

## next dynamique

`next` peut être une fonction:

```typescript
{
  name: "check",
  execute: async (ctx) => {
    ctx.value = 10;
  },
  next: (ctx) => ctx.value > 5 ? ["success"] : ["failure"],
},
{
  name: "success",
  execute: async (ctx) => { /* ... */ },
},
{
  name: "failure", 
  execute: async (ctx) => { /* ... */ },
},
```
