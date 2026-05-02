# Event-Driven Workflows

In most traditional code, a function starts and runs until it returns. In `@ai.ntellect/core`, a workflow can **pause and wait for the world to change**.

This is achieved through **Event-Driven Nodes**.

## ⚙️ How it Works

An event-driven node uses the `when` property to define its trigger conditions. When the engine reaches such a node, it does not execute the `execute` function immediately. Instead, it:
1. Saves the current state (Checkpoint).
2. Registers a listener for the specified events.
3. Pauses execution.

Once the event arrives via `workflow.emit()`, the engine wakes up, validates the event, and executes the node logic.

---

## 🛠️ Configuration & Strategies

### 1. The `single` Strategy
The simplest form of reactivity. The node fires as soon as any one of the listed events occurs.
```typescript
when: {
  events: ["payment.received", "payment.manual_override"],
  strategy: { type: "single" },
}
```

### 2. The `all` Strategy
Used for synchronization. The node only executes after *all* required events have been received.
```typescript
when: {
  events: ["identity.verified", "credit.checked"],
  strategy: { type: "all" },
}
```

### 3. The `correlate` Strategy (Advanced)
In a multi-user system, you receive thousands of events. You need to ensure the event you receive belongs to the **current workflow instance**.

The `correlate` strategy allows you to provide a function that matches event payloads to the workflow context.
```typescript
when: {
  events: ["order.shipped"],
  strategy: {
    type: "correlate",
    correlation: (events) => 
      events[0].payload.orderId === ctx.orderId,
  },
}
```

---

## 📡 Emitting Events

Events can be emitted from anywhere in your application—an API endpoint, a webhook handler, or even another GraphFlow.

```typescript
// Trigger a waiting node in a specific workflow instance
await workflow.emit("payment.received", {
  orderId: "order_123",
  amount: 49.99,
  timestamp: Date.now(),
});
```

---

## ⏱️ Timeouts & Resilience

What happens if the event never arrives? To prevent "zombie" workflows, you can define a `timeout`.

```typescript
when: {
  events: ["user.approval"],
  timeout: 3600000, // 1 hour
  strategy: { type: "single" },
}
```
If the timeout is reached, the workflow can either:
1. Throw a timeout error.
2. Move to a fallback node (via the `next` logic).

## 📈 Use Case: The "Human-in-the-Loop" Pattern

Event-driven nodes are the foundation of **Human-in-the-Loop (HITL)**.

1. **Workflow reaches a sensitive node** (e.g., `execute_large_transfer`).
2. **Workflow pauses** using a `when` node waiting for `admin.approved`.
3. **Admin receives an email** with a link.
4. **Admin clicks "Approve"**, which triggers an API call to `workflow.emit("admin.approved", { ... })`.
5. **Workflow resumes** and completes the transfer.

This turns a risky autonomous action into a secure, audited business process.
