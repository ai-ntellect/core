# Modular Extensions

`@ai.ntellect/core` is built on a **Pluggable Architecture**. While the core engine handles GraphFlows and Petri Nets, specialized capabilities are provided via **Modules**.

## 🧩 What is a Module?

A module is an optional, independent component that extends the framework's capabilities. Instead of bloating the core engine, we use a **Service-Adapter pattern** to ensure that modules are:
- **Swappable**: Change your database or NLP provider without touching your workflow logic.
- **Optional**: Only include the modules your specific agent needs.
- **Testable**: Each module has a single responsibility and a clean interface.

---

## 🛠️ Available Modules

### 1. Memory System
Handles the persistence and retrieval of data. It's the "long-term brain" of your agent.
- **Core Interface**: `IMemoryAdapter`
- **Adapters**: 
  - `InMemoryAdapter`: Fast, volatile storage for testing.
  - `RedisAdapter`: Distributed, high-performance persistence.
  - `MeilisearchAdapter`: Full-text and semantic search for RAG.

### 2. Agenda (Scheduling)
Adds a temporal dimension to your agents. Instead of just reacting to users, your agent can **act on its own**.
- **Core Interface**: `ICronService`
- **Capabilities**: 
  - Schedule a `GraphFlow` to run every Monday at 9 AM.
  - Trigger a "follow-up" node 24 hours after a user interaction.
  - Manage recurring maintenance tasks.

### 3. NLP Engine
Provides lightweight natural language processing for tasks that don't require a full LLM call (saving latency and cost).
- **Capabilities**: Sentiment analysis, entity extraction, and keyword classification.
- **Integration**: Used as a standard `GraphNode` within a workflow.

---

## 📐 Design Principles

### Dependency Inversion (IoC)
Modules never depend on a specific technology. They depend on **Interfaces**.
For example, the `Memory` module doesn't know about Redis; it knows about `IMemoryAdapter`. You inject the adapter at runtime:

```typescript
const memory = new Memory(new RedisAdapter({ url: "redis://localhost:6379" }));
```

### Synergy with GraphFlow
Modules are designed to be called from within `GraphNodes`. 
- A node can save a result to **Memory**.
- A node can schedule a future run via the **Agenda**.
- A node can classify a string using the **NLP** module.

**This creates a powerful loop: LLM classifies $\rightarrow$ GraphFlow executes $\rightarrow$ Modules persist/schedule.**
