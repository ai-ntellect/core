# Key Concepts

To understand `@ai.ntellect/core`, you need to shift your mental model from "autonomous agents" to "deterministic orchestration."

## 🧠 The Classifier-Controller Split

The core innovation of this framework is the separation of **Intent Classification** from **Execution Logic**.

### 1. The Classifier (LLM)
The LLM is used as a high-dimensional pattern matcher. Its only job is to map a user's natural language input to a pre-defined **Intent**.
- **Input**: "I need to check my balance and transfer $50 to Alice."
- **Output**: `{ intent: "TRANSFER_FUNDS", confidence: 0.98 }`

By restricting the LLM to classification, we eliminate the "routing hallucinations" that occur when the LLM tries to decide the next step in a complex workflow.

### 2. The Controller (Petri Net)
Once the intent is classified, the **CortexFlow Orchestrator** takes over. It uses a verified Petri Net to determine the exact sequence of steps.
- **Deterministic**: The same intent always triggers the same path.
- **Verifiable**: We can mathematically prove the workflow will never deadlock.
- **Observably**: Every transition is a discrete event that can be logged and audited.

---

## 🏗️ The Execution Engine: GraphFlow

While the Controller decides *which* workflow to run, **GraphFlow** is the engine that actually *runs* it.

### Workflow as a Typed Graph
A `GraphFlow` is a directed graph where each node is a discrete unit of logic. Unlike simple scripts, GraphFlows are:
- **Strongly Typed**: Every transition is validated via Zod.
- **Stateful**: They maintain a shared context that evolves as the graph is traversed.
- **Resilient**: Built-in retry logic and checkpointing allow workflows to survive crashes or wait for human approval.

### Orchestration vs. Automation
- **Automation**: A linear sequence of "If X then Y." It's brittle and fails when the world changes.
- **Orchestration**: The coordination of multiple asynchronous processes, handling parallel branches, and reacting to external events. 

`@ai.ntellect/core` provides **orchestration**, allowing you to build systems that are as flexible as a human operator but as reliable as a compiler.

---

## 🔄 The Lifecycle of a Request

1. **Input**: User sends a message.
2. **Classify**: LLM identifies the **Intent**.
3. **Route**: The **Petri Net** finds the matching transition.
4. **Execute**: The **GraphFlow** associated with that transition runs its nodes.
5. **Respond**: The final state is returned to the user.

**Total LLM calls for routing: 1.**
