# Resilience & Checkpoints

In production, workflows fail. Servers crash, APIs timeout, and humans take days to approve requests. The **Checkpoint System** is what makes `@ai.ntellect/core` production-grade.

## 📌 What is a Checkpoint?

A checkpoint is a **serialized snapshot** of a workflow's entire state at a specific point in time. It includes:
1. The current **Context** (the data).
2. The current **Node/Position** (where we are).
3. The **Run ID** (which execution this belongs to).
4. **Metadata** (timestamps, error states, approval status).

---

## 🛠️ Core Functionalities

### 1. Automatic State Persistence
By using `executeWithCheckpoint`, the engine automatically saves the state after every single node execution. If the process crashes, you don't lose progress; you simply resume from the last successful node.

### 2. Breakpoints (Human-in-the-Loop)
Breakpoints allow you to intentionally pause a workflow *before* a critical node executes.
```typescript
await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["execute_payment"], 
});
```
The workflow will stop exactly before `execute_payment`. It stays in a `awaiting_approval` state until an external command calls `resumeFromCheckpoint`.

### 3. Time-Travel Debugging
This is the most powerful tool for developers. You can resume a workflow from *any* previous checkpoint in its history, and you can even **modify the state** before resuming.

```typescript
// "What would have happened if the user had entered 'USD' instead of 'EUR'?"
await workflow.resumeFromCheckpoint(cpId, adapter, {
  contextModifications: { currency: "USD" },
});
```

---

## 🔌 Adapters

You can choose where your checkpoints are stored based on your needs:

| Adapter | Best For | Persistence |
| :--- | :--- | :--- |
| `InMemoryCheckpointAdapter` | Local dev, unit tests | Volatile (Lost on restart) |
| `RedisPetriCheckpointAdapter` | High-performance production | Persistent / Distributed |
| `PostgresPetriCheckpointAdapter` | Audit-heavy, relational data | Persistent / ACID |

---

## 🧠 Petri Net Checkpoints

For **CortexFlow** workflows, checkpoints are even more critical. We save the **Petri Net Marking** (the distribution of tokens across places).

This means you can:
- Pause a complex orchestration.
- Restore the exact state of the Petri Net.
- See exactly which transitions were enabled at the moment of the pause.

---

## ⚠️ Error Handling & Recovery

When a node fails, the system creates an **Error Checkpoint**.
Instead of the whole system crashing, the workflow enters a `failed` state. A developer or an automated process can then:
1. Analyze the error in the checkpoint metadata.
2. Fix the underlying issue (or modify the context).
3. Resume the workflow from the failed node.

**This eliminates the need to restart long-running workflows from scratch.**
