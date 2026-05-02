# Événements

Les noeuds peuvent attendre des événements avant de s'exécuter.

## Configuration

```typescript
{
  name: "await_payment",
  when: {
    events: ["payment.received"],
    timeout: 30000, // 30s
    strategy: { type: "single" },
  },
  execute: async (ctx) => {
    ctx.status = "paid";
  },
}
```

## Strategies

### single

Exécute dès le premier événement:

```typescript
strategy: { type: "single" }
```

### all

Attend tous les événements:

```typescript
strategy: { type: "all" }
```

### correlate

Attend plusieurs événements avec corrélation:

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

## Émettre des événements

```typescript
await workflow.emit("payment.received", { orderId: "123" });
```

## Exemple complet

```typescript
import EventEmitter from "events";
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const Schema = z.object({
  status: z.string(),
  orderId: z.string(),
});

const workflow = new GraphFlow({
  name: "order",
  schema: Schema,
  context: { status: "pending", orderId: "" },
  nodes: [
    {
      name: "await_payment",
      when: {
        events: ["payment.received"],
        timeout: 10000,
        strategy: { type: "single" },
      },
      execute: async (ctx, _, event) => {
        ctx.orderId = event.payload.orderId;
        ctx.status = "payment_received";
      },
    },
  ],
  eventEmitter: new EventEmitter(),
});

workflow.execute("await_payment");

setTimeout(() => {
  workflow.emit("payment.received", { orderId: "123" });
}, 100);
```

## Observation

```typescript
workflow
  .observe()
  .event("payment.received")
  .subscribe((event) => {
    console.log("Event:", event);
  });
```
