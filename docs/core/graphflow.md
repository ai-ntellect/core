# GraphFlow

Le moteur de workflow central du framework.

## Création d'un workflow

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
        ctx.message = "Hello, World!";
      },
    },
  ],
});

await workflow.execute("greet");
console.log(workflow.getContext().message); // "Hello, World!"
```

## Noeuds séquentiels

```typescript
nodes: [
  {
    name: "step1",
    execute: async (ctx) => { /* ... */ },
    next: ["step2"],
  },
  {
    name: "step2",
    execute: async (ctx) => { /* ... */ },
    next: (ctx) => ctx.value > 0 ? ["success"] : ["failure"],
  },
  {
    name: "success",
    execute: async (ctx) => { /* ... */ },
  },
  {
    name: "failure",
    execute: async (ctx) => { /* ... */ },
  },
]
```

`next` peut être:
- Un tableau statique: `["step2", "step3"]`
- Une fonction: `next: (ctx) => ctx.value > 0 ? ["success"] : []`

## Noeuds événementiels

Un noeud peut attendre un événement avant de s'exécuter:

```typescript
{
  name: "await_payment",
  when: {
    events: ["payment.received"],
    timeout: 30000, // 30 secondes
    strategy: { type: "single" },
  },
  execute: async (ctx) => {
    ctx.status = "paid";
  },
}
```

### Strategies

**single** — Le noeud s'exécute dès le premier événement:

```typescript
strategy: { type: "single" }
```

**all** — Le noeud attend tous les événements:

```typescript
strategy: { type: "all" }
```

**correlate** — Attend plusieurs événements corrélés:

```typescript
{
  events: ["payment.validated", "inventory.checked"],
  strategy: {
    type: "correlate",
    correlation: (events) =>
      events.every(e => e.payload.orderId === events[0].payload.orderId),
  },
}
```

### Émettre des événements

```typescript
await workflow.emit("payment.received", {
  orderId: "123",
  amount: 100,
});
```

### Exemple complet

```typescript
import EventEmitter from "events";
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const OrderSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  amount: z.number(),
});

const paymentNode = {
  name: "payment",
  when: {
    events: ["payment.received"],
    timeout: 30000,
    strategy: { type: "single" },
  },
  execute: async (ctx, _, event) => {
    ctx.orderId = event.payload.orderId;
    ctx.amount = event.payload.amount;
    ctx.status = "processing";
  },
  next: ["validation"],
};

const validationNode = {
  name: "validation",
  when: {
    events: ["payment.validated", "inventory.checked"],
    strategy: {
      type: "correlate",
      correlation: (events) =>
        events.every(e => e.payload.orderId === events[0].payload.orderId),
    },
  },
  execute: async (ctx) => {
    ctx.status = "validated";
  },
};

const workflow = new GraphFlow({
  name: "order",
  schema: OrderSchema,
  context: { orderId: "", status: "pending", amount: 0 },
  nodes: [paymentNode, validationNode],
  eventEmitter: new EventEmitter(),
});

// Démarrer le workflow
workflow.execute("payment");

// Émettre des événements
setTimeout(() => {
  workflow.emit("payment.received", { orderId: "123", amount: 100 });
}, 100);

setTimeout(() => {
  workflow.emit("inventory.checked", { orderId: "123" });
  workflow.emit("payment.validated", { orderId: "123" });
}, 200);
```

## Observation

### Observer tout l'état

```typescript
workflow
  .observe()
  .state()
  .subscribe((ctx) => {
    console.log("state:", ctx);
  });
```

### Observer une propriété

```typescript
workflow
  .observe()
  .property("status")
  .subscribe((status) => {
    console.log("status:", status);
  });
```

### Observer des événements

```typescript
workflow
  .observe()
  .event("payment.received")
  .subscribe((event) => {
    console.log("payment received:", event);
  });
```

## Schéma

Le schema Zod est utilisé pour valider le contexte:

```typescript
const Schema = z.object({
  userId: z.string(),
  status: z.enum(["pending", "active", "completed"]),
  data: z.record(z.any()),
});

const workflow = new GraphFlow({
  name: "my-workflow",
  schema: Schema,
  context: {
    userId: "",
    status: "pending",
    data: {},
  },
  nodes: [/* ... */],
});
```

## Référence API

### GraphFlow

```typescript
new GraphFlow(options: {
  name: string;
  schema: z.ZodType;
  context: T;
  nodes: GraphNodeConfig[];
  eventEmitter?: EventEmitter;
})
```

### Méthodes

- `execute(nodeName: string, initialContext?: Partial<T>): Promise<T>`
- `getContext(): T`
- `emit(event: string, payload: any): Promise<void>`
- `observe(): GraphObserver`
- `getNodes(): GraphNode[]`
- `getSchema(): z.ZodType`

### GraphNodeConfig

```typescript
{
  name: string;
  execute: (context: T, inputs?: any, event?: GraphEvent) => Promise<void>;
  next?: string[] | ((context: T) => string[]);
  when?: {
    events: string[];
    timeout?: number;
    strategy: {
      type: "single" | "all" | "correlate";
      correlation?: (events: GraphEvent[]) => boolean;
    };
  };
  retry?: {
    maxAttempts: number;
    delay: number;
  };
}
```
