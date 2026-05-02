# System Architecture

`@ai.ntellect/core` is designed as a layered system that separates **Intent**, **Routing**, and **Execution**. This architecture ensures that as your AI agent becomes more complex, it remains maintainable and verifiable.

---

## 📐 The Three-Layer Model

### Layer 1: The Intent Layer (Probabilistic)
This is the only place where "uncertainty" is allowed. We use an LLM to classify user input.
- **Component**: `IntentClassifier`
- **Responsibility**: Map `String` $\rightarrow$ `IntentID`.
- **Guardrail**: Confidence thresholds. If the LLM is unsure, the system triggers a clarification request rather than guessing.

### Layer 2: The Routing Layer (Deterministic)
Once the intent is known, the system enters the **CortexFlow** layer. Routing is handled by a **Petri Net**.
- **Component**: `CortexFlowOrchestrator`
- **Responsibility**: Map `IntentID` $\rightarrow$ `WorkflowPath`.
- **Guardrail**: Formal Verification. Because Petri Nets are mathematical objects, we use incidence matrices to detect deadlocks and bounded states at build-time.

### Layer 3: The Execution Layer (Typed)
The final layer is the **GraphFlow** engine, which executes the specific steps of the chosen path.
- **Component**: `GraphFlow` / `GraphNode`
- **Responsibility**: Execute business logic and update state.
- **Guardrail**: Zod Validation. Every state transition is validated against a schema to ensure data integrity.

---

## 🔄 Data Flow & State Management

### The Shared Context
Every workflow instance has a **Context**. This is a single source of truth that is passed from node to node.
- **Immutable-ish**: Nodes modify the context, but these modifications are tracked.
- **Validated**: The context is validated against the `GraphFlow` schema at every node transition.

### Checkpointing & Persistence
To support long-running workflows (e.g., waiting for an event for 3 days), the architecture uses **Checkpoint Adapters**.
- After every node execution, the current context and the "marking" (current position in the Petri Net) are snapshotted.
- This allows the system to be completely stateless; a workflow can be resumed on a different server just by loading its `checkpointId` from Redis or PostgreSQL.

---

## 🧩 Modularity & Adapters

The framework follows the **Dependency Inversion Principle**. Core logic does not depend on specific technologies.

### Pluggable Modules
We provide interfaces for common agent needs:
- `IMemoryAdapter`: For long-term memory (InMemory $\rightarrow$ Redis $\rightarrow$ Meilisearch).
- `ICheckpointAdapter`: For state persistence (InMemory $\rightarrow$ Postgres).
- `IEventEmitter`: For event handling (Node.js EventEmitter $\rightarrow$ RabbitMQ $\rightarrow$ Kafka).

### The GraphController
For complex systems, a single graph isn't enough. The `GraphController` allows you to treat `GraphFlows` as building blocks, orchestrating them in parallel or sequence to build "Super-Graphs."

---

## 🚀 Summary of the Architectural Edge

| Feature | Traditional AI Frameworks | @ai.ntellect/core |
| :--- | :--- | :--- |
| **Control Flow** | LLM-driven (Probabilistic) | Petri Net-driven (Deterministic) |
| **State** | Loose / Prompt-based | Strongly Typed (Zod) |
| **Verification** | Trial and Error | Mathematical Proof (Deadlock detection) |
| **Persistence** | Session-based | Checkpoint-based (Time-travel) |
| **Latency** | Multiple LLM calls for routing | Single LLM call for classification |
