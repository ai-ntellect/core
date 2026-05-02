# GraphFlow: The Execution Engine

`GraphFlow` is the primary primitive for defining a workflow in `@ai.ntellect/core`. Think of it as a **typed state machine** where each transition is a validated step.

## 🏗️ Creating a Workflow

A GraphFlow consists of a **Schema** (Zod), an initial **Context**, and a set of **Nodes**.

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// 1. Define the state shape (MANDATORY for validation)
const OrderSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  amount: z.number(),
});

// 2. Define the workflow
const orderWorkflow = new GraphFlow({
  name: "OrderProcessing",
  schema: OrderSchema,
  context: { orderId: "", status: "pending", amount: 0 },
  nodes: [
    {
      name: "validate_order",
      execute: async (ctx) => {
        if (ctx.amount <= 0) throw new Error("Invalid amount");
        ctx.status = "validated";
      },
      next: "process_payment",
    },
    {
      name: "process_payment",
      execute: async (ctx) => {
        // Payment logic here
        ctx.status = "paid";
      },
    },
  ],
});

await orderWorkflow.execute("validate_order");
```

---

## 🛣️ Routing Logic

### Sequential & Conditional Execution
Nodes move to the next step via the `next` property. This can be:
- **Static**: `next: "nextNodeName"`
- **Dynamic**: `next: (ctx) => ctx.amount > 100 ? "high_value_flow" : "standard_flow"`

### Parallel Execution (Fork-Join Model)
You can execute multiple branches concurrently to reduce latency.
```typescript
{
  name: "start",
  parallel: { enabled: true, joinNode: "merge" },
  next: ["fetch_user", "fetch_inventory", "check_credit"],
}
```
The engine clones the context for each branch, executes them via `Promise.all`, and merges the results into the `joinNode` using a **Reducer**.

### Dynamic Fan-Out (The Send API)
When the number of parallel branches is determined at runtime (e.g., processing a list of items), use the `send` API:
```typescript
{
  name: "distribute",
  send: (ctx) => ctx.items.map(item => ({
    to: "processItem",
    input: { item },
  })),
  parallel: { enabled: true, joinNode: "complete" },
}
```

---

## ⚡ Event-Driven Nodes

A node can pause execution and wait for an external signal. This is critical for **Human-in-the-Loop** or **Asynchronous Integrations**.

```typescript
{
  name: "await_approval",
  when: {
    events: ["manager.approved"],
    timeout: 86400000, // 24 hours
    strategy: { type: "single" },
  },
  execute: async (ctx, _, event) => {
    ctx.approvedBy = event.payload.managerId;
    ctx.status = "approved";
  },
}
```

### Event Strategies
- **`single`**: Fires on the first matching event.
- **`all`**: Fires only after *every* listed event has arrived.
- **`correlate`**: Fires when events arrive that match a custom correlation function (e.g., matching `orderId`).

---

## 🔍 Observability & State

Because GraphFlow is deterministic, it is fully observable.

### Reactive State Tracking
You can subscribe to context changes in real-time:
```typescript
workflow.observe().property("status").subscribe(s => console.log(`Status: ${s}`));
```

### Formal Validation
The Zod schema isn't just for TypeScript types; it's a **runtime guard**. If a node attempts to set the context to an invalid state, the GraphFlow throws an error immediately, preventing corrupted state from propagating.

---

## 📖 API Reference

### `GraphFlow` Methods
- `execute(nodeName, initialContext)`: Starts the workflow.
- `emit(event, payload)`: Triggers event-driven nodes.
- `getContext()`: Returns the current validated state.
- `observe()`: Returns an observer for state and event tracking.

### `GraphNodeConfig` Properties
- `name`: Unique identifier.
- `execute`: The core logic function.
- `next`: Routing logic (string or function).
- `when`: Event-wait configuration.
- `parallel`: Fork-Join configuration.
- `retry`: Backoff and attempt configuration.
