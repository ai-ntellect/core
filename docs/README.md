# Documentation: @ai.ntellect/core

Welcome to the official documentation for **@ai.ntellect/core**, the framework for building production-grade LLM agents that don't drift.

## The Core Thesis
**LLMs are exceptional at generating text, but they are unreliable at controlling systems.**

Most AI frameworks treat the LLM as the "brain" that makes every routing decision. As your agent grows in complexity, this leads to:
- **Routing Hallucinations**: The LLM forgets the rules and calls tools in the wrong order.
- **Context Bloat**: The prompt grows too large as it tries to explain every possible path.
- **Unpredictability**: The same input can lead to different execution paths.

**@ai.ntellect/core solves this by splitting the brain:**
1. **The LLM is the Classifier**: It identifies *intent* once.
2. **The System is the Controller**: A verified Petri Net handles the *routing* deterministically.
3. **GraphFlow is the Executor**: Typed graphs handle the *execution* without further LLM interference.

---

## 🧭 Navigation Guide

### 🚀 Getting Started
- [Quick Start Guide](./tutoriels/pour-commencer.md) — From `npm install` to your first workflow in 5 minutes.
- [The Philosophy](./philosophie.md) — Understand why deterministic control is the only way to scale AI agents.
- [Key Concepts](./concepts-cles.md) — GraphFlow, CortexFlow, and State Management.

### 🛠️ The Engine
- [GraphFlow Deep Dive](./core/graphflow.md) — Nodes, Parallelism, and the Send API.
- [Event-Driven Architectures](./core/les-evenements.md) — Building reactive systems that wait for the world.
- [Resilience & Checkpoints](./core/checkpoint.md) — Time-travel debugging and human-in-the-loop.
- [Technical Architecture](./core/architecture.md) — The blueprint of the engine.

### 🧠 AI Orchestration (CortexFlow)
- [Deterministic Routing](./core/graphflow.md) — How intent classification works.
- [Formal Verification](./core/architecture.md) — Deadlock detection and reachability analysis.
- [Hybrid Fallback](./core/architecture.md) — Balancing determinism with conversational flexibility.

### 🧩 Modules & Tooling
- [Memory Systems](./modules/memoire/) — Pluggable persistence (Redis, Meilisearch).
- [Agenda & Scheduling](./modules/agenda/) — Cron-based automation.
- [Interactive CLI](./cli/) — Debugging and running agents from your terminal.

### 📈 Real-World Application
- [Design Patterns](./cas-dusages.md) — How to model Approval Flows, RAG, and ETL pipelines.
- [Benchmarks](./core/benchmark.md) — CortexFlow vs LangGraph: Performance and Reliability.

---

## 🛠️ Quick Reference

| If you want to... | Go to... |
| :--- | :--- |
| Build a simple sequence of tasks | [GraphFlow](./core/graphflow.md) |
| Create an agent that handles intents | [CortexFlow](./core/graphflow.md) |
| Make a workflow pause for a human | [Checkpoints](./core/checkpoint.md) |
| Trigger a workflow via Webhook | [Events](./core/les-evenements.md) |
| Run an agent in your terminal | [CLI](./cli/) |
