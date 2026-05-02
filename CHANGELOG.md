# Change Log

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- (Upcoming features will be listed here)

---

## [0.12.0] - 2026-05-03

### 🚀 Added

* **CortexFlow Orchestration**
  Stop LLMs from deciding your execution path.
  $\rightarrow$ Eliminates routing hallucinations and uncontrolled tool selection.

* **Hybrid Intent Classification**
  Cut latency and eliminate classification guesswork with keyword-first detection and LLM fallback.
  $\rightarrow$ Increases reliability in production workloads.

* **Multi-Intent Execution**
  One message, multiple workflows.
  $\rightarrow$ Enables compound flows (e.g. fetch $\rightarrow$ process $\rightarrow$ notify) without repeated chatting.

* **Formal Verification for Workflows**
  Mathematically prove your agent can't deadlock.
  $\rightarrow$ Prevents invalid execution graphs before runtime.

* **Persistent Execution State**
  Stop losing state on crashes with Redis and PostgreSQL checkpoint adapters.
  $\rightarrow$ Enables long-running, fault-tolerant agents.

* **Petri Pattern Library**
  Stop starting from scratch. Prebuilt templates for Human-Approval, RAG, and Structured Data Extraction.
  $\rightarrow$ Accelerates the building of common agent patterns.

* **Benchmark Suite**
  The Proof: CortexFlow vs LangGraph.
  $\rightarrow$ Demonstrates significant reduction in LLM calls and lower latency.

* **Production-Centric Documentation**
  Complete overhaul of the `/docs` folder and README.
  $\rightarrow$ Shifts focus from technical manual to product-centric "Control Layer" guide.

### 🔧 Changed

* **Architecture Positioning**
  Framework redefined as: **“A control layer for LLM systems”** rather than a general-purpose agent framework.
  $\rightarrow$ Clearly differentiates the system from probabilistic autonomous agents.

* **Zod Upgrade**
  Migrated to latest schema validation patterns for stricter runtime guarantees.

### 🐛 Fixed

* Improved stability in benchmark execution under high concurrency.
* Fixed inconsistent Petri transition edge cases under concurrent token updates.

---

## [0.11.0] - 2026-05-02

### 🚀 Added

* **Plan $\rightarrow$ Compile $\rightarrow$ Execute Pattern**
  Implemented a pattern where the LLM generates a Zod-validated plan, which is then compiled into a deterministic GraphFlow.
  $\rightarrow$ Ensures the LLM handles the "What" (planning) while the system handles the "How" (execution).

* **Advanced Verification Suite**
  Integrated real-world LLM tests (via Groq) and on-chain tests (via Sepolia).
  $\rightarrow$ Guarantees reliability in actual production environments.

### 🔧 Changed

* **AI-Optimized Instructions**
  Updated `AGENTS.md` with high-signal guidance for AI agents contributing to the repo.

---

## [0.10.0] - 2026-04-30

### 🚀 Added

* **Checkpoint & Time-Travel System**
  Implemented save/resume functionality with the ability to jump back to any state.
  $\rightarrow$ Enables bulletproof debugging and long-term workflow persistence.

* **Interactive Steering CLI**
  Added a REPL with slash commands for real-time agent oversight.
  $\rightarrow$ Allows developers to approve, reject, or modify agent state mid-execution.

* **Multi-Graph Orchestration**
  Introduced `GraphController` to manage multiple GraphFlows in parallel or sequence.
  $\rightarrow$ Allows building complex, modular systems from simple, testable graphs.

---

## [0.8.x] - 2025-03-16 to 2025-04-13

### 🚀 Added

* **Configurable Cognitive Agents**
  Introduced an `Agent` class with cognitive loops and tool integration.
  $\rightarrow$ Bridges the gap between pure workflows and interactive assistants.

* **Low-Latency NLP Engine**
  Integrated `@nlpjs/basic` for intent detection without needing an LLM call.
  $\rightarrow$ Drastically reduces cost and latency for simple classification tasks.

* **Standardized Prompting & LLM Factory**
  Implemented `PromptBuilder` and `LLMFactory` for consistent model handling.
  $\rightarrow$ Simplifies switching between providers (OpenAI, Groq, Ollama).

### 🔧 Changed

* **Event Correlation Logic**
  Enhanced `waitForCorrelatedEvents` for precision in multi-user environments.
  $\rightarrow$ Prevents event "leakage" between different workflow instances.

---

## [0.6.x] - 2025-02-01 to 2025-02-04

### 🚀 Added

* **Reactive State Observation**
  Implemented `GraphObserver` using RxJS for real-time state tracking.
  $\rightarrow$ Enables building live dashboards and monitoring tools for agents.

* **Concurrent Execution Model**
  Added Fork-Join parallelism and event-driven nodes to `GraphFlow`.
  $\rightarrow$ Allows agents to perform multiple tasks simultaneously and wait for external triggers.

* **Enterprise Persistence**
  Integrated Redis and Meilisearch adapters for shared, persistent state.
  $\rightarrow$ Moves the system from "in-memory" to "distributed production" ready.

---

## [0.3.x] - 2025-01-20 to 2025-01-25

### 🚀 Added

* **Advanced Memory Management**
  Implemented `AgentRuntime` with dynamic action processing.
  $\rightarrow$ Improves how agents remember and utilize previous tool outputs.

* **Action Scheduling**
  Added the ability to schedule and cancel future actions.
  $\rightarrow$ Enables agents to handle time-delayed tasks and reminders.

### 🔧 Changed

* **Result Interpretation**
  Replaced `Synthesizer` with a more robust `Interpreter` class.
  $\rightarrow$ Improves the quality and structure of final AI responses.

---

## [0.0.x - 0.1.x] - 2025-01-15 to 2025-01-20

### 🚀 Added

* **Core Engine Foundations**
  Initial implementation of `GraphFlow` and the event-driven execution model.
  $\rightarrow$ Established the baseline for typed, deterministic workflow management.

* **Agent & Memory Basics**
  Introduced basic `Agent` classes and in-memory storage adapters.
  $\rightarrow$ Provided the first functional tool-using AI assistants.
