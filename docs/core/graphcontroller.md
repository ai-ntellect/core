# GraphController: Multi-Graph Orchestration

While a `GraphFlow` is powerful for a single workflow, real-world applications often require the coordination of multiple independent workflows. The `GraphController` is the orchestrator that manages these relationships.

## 🎯 Purpose

The `GraphController` allows you to treat individual `GraphFlows` as modular components. Instead of building one giant, monolithic graph, you can build small, testable graphs and compose them into complex pipelines.

---

## 🚀 Execution Modes

### 1. Sequential Execution
Use `executeSequential` when Workflow B depends on the successful completion of Workflow A.

```typescript
const controller = new GraphController();

await controller.executeSequential([
  { graph: userValidationGraph, startNode: "start" },
  { graph: paymentProcessingGraph, startNode: "init" },
  { graph: notificationGraph, startNode: "send" },
]);
```
If any graph in the sequence fails, the chain stops, and the error is propagated, preventing inconsistent states.

### 2. Parallel Execution
Use `executeParallel` to trigger multiple independent workflows simultaneously, reducing overall latency.

```typescript
const results = await controller.executeParallel([
  { graph: fetchStockGraph, startNode: "start" },
  { graph: fetchPriceGraph, startNode: "start" },
  { graph: checkComplianceGraph, startNode: "start" },
]);
```
The `GraphController` manages the `Promise.all` logic internally and returns an array of results once all graphs have completed.

---

## 🛠️ Advanced Patterns

### The "Super-Graph" Pattern
You can use a `GraphController` inside a `GraphNode` of another `GraphFlow`. This allows you to create hierarchical workflows:
- **Parent Graph**: Handles high-level business logic.
- **Child Graphs (via Controller)**: Handle specific technical implementations.

### Cross-Graph Event Communication
Graphs managed by a controller can communicate via the event system.
1. `Graph A` emits an event `data.ready`.
2. `Graph B` has a node waiting for `data.ready`.
3. `Graph B` wakes up and processes the data produced by `Graph A`.

---

## ⚖️ When to use GraphController vs. Parallel Nodes?

| Feature | Parallel Nodes (within GraphFlow) | GraphController (across GraphFlows) |
| :--- | :--- | :--- |
| **Scope** | Intra-graph (Internal) | Inter-graph (External) |
| **State** | Shares the same `Context` | Each graph has its own `Context` |
| **Coupling** | Tightly coupled | Loosely coupled (Modular) |
| **Use Case** | Splitting a single task into sub-tasks | Orchestrating different business modules |
