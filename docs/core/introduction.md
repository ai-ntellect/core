# Introduction

Welcome to the core of **@ai.ntellect/core**. This framework is built on the principle that **AI agents in production must be deterministic**.

While most frameworks focus on "autonomy" (letting the LLM decide everything), we focus on **Orchestration**. We provide the tools to wrap probabilistic AI in a deterministic shell, ensuring your agent doesn't drift, hallucinate its routing, or enter infinite loops.

---

## 🛠️ The Three Pillars of the Core

### 1. Graph-Based Execution (GraphFlow)
At the lowest level, we use **GraphFlow**. A GraphFlow is a typed directed graph where each node is a discrete unit of logic.
- **Modular**: Each node is an independent action.
- **Typed**: Every transition is validated via Zod, preventing runtime type errors.
- **Dynamic**: Nodes can execute sequentially, in parallel (Fork-Join), or based on conditional logic.

### 2. Event-Driven Reactivity
Our engine doesn't just run from start to finish; it lives in a state of reactivity.
- **External Triggers**: Nodes can pause and wait for webhooks, blockchain events, or user actions.
- **Asynchronousity**: The system can handle thousands of paused workflows, resuming them only when the required event arrives.
- **Interoperability**: By using an `IEventEmitter` interface, the framework integrates seamlessly with any event-driven architecture.

### 3. Deterministic Orchestration (CortexFlow)
This is where the "Intelligence" meets "Control." CortexFlow implements the **Classifier-Controller Split**:
- **The LLM as the Classifier**: It identifies the *Intent* of the user request.
- **The Petri Net as the Controller**: It routes that intent through a mathematically verified path.

By moving the routing logic out of the LLM and into a Petri Net, we achieve **formal verification**. We can prove, before a single line of code runs, that your workflow is free of deadlocks and that all states are reachable.

---

## 🚀 Why this matters for Production

| The "Autonomous" Approach | The "@ai.ntellect/core" Approach |
| :--- | :--- |
| LLM decides the next step at every turn | LLM decides the *intent* once |
| Hallucinations lead to routing errors | Routing is deterministic and verified |
| Prompt engineering is used to "fix" flow | Graph structure defines the flow |
| Debugging involves "guessing" LLM state | Debugging involves tracing a state machine |

**In short: We move AI from "guessing" to "executing."**
