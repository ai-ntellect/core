# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Added
- Comprehensive production-centric documentation and README overhaul.

---

## [0.12.0] - 2026-05-03

### Added
- **CortexFlow Orchestration**: Introduced the Petri Net layer for deterministic routing, eliminating LLM routing hallucinations.
- **Hybrid Intent Classification**: Added `HybridIntentClassifier` (keyword-first with LLM fallback) for faster and more reliable intent detection.
- **Multi-Intent Support**: Ability to detect and execute multiple intents sequentially from a single user message.
- **Formal Verification**: Integrated deadlock and boundedness checks for Petri Nets.
- **Petri Checkpoints**: Added Redis and PostgreSQL adapters for persisting Petri Net markings and session state.
- **Documentation Generator**: Added scripts to generate Mermaid diagrams and HTML docs from Petri Net JSON.
- **Benchmarks**: Added a comprehensive benchmark suite comparing CortexFlow vs LangGraph (latency and LLM call reduction).
- **Petri Patterns**: Added ready-to-use blueprints for Human-Approval, RAG, and Data Extraction.

### Changed
- **Zod Migration**: Updated to Zod v4 syntax across the core.
- **Positioning**: Shifted the framework's focus from a general agent framework to a "Control Layer for LLM Systems."

### Fixed
-- Fixed fair comparison logic and crashes in the benchmark suite.

---

## [0.11.0] - 2026-05-02

### Added
- **Plan $\rightarrow$ Compile $\rightarrow$ Execute**: Implemented the pattern where the LLM acts as a planner (generating a Zod-validated JSON plan) and the system compiles it into an executable GraphFlow.
- **Advanced Testing**: Added real-world LLM tests (via Groq) and on-chain tests (via Sepolia).

### Changed
- **AGENTS.md**: Updated with compact, high-signal instructions for AI agents.

---

## [0.10.0] - 2026-04-30

### Added
- **Checkpoint System**: Implemented save/resume functionality with support for "time travel" debugging.
- **Interactive CLI**: Added a REPL with slash commands (`/status`, `/resume`, `/approve`) for real-time agent steering.
- **GraphController**: Added a controller to orchestrate multiple GraphFlows in parallel or sequence.

---

## [0.8.x] - 2025-03-16 to 2025-04-13

### Added
- **Agent Class**: Introduced a configurable Assistant class with cognitive loops.
- **NLP Engine**: Integrated `@nlpjs/basic` as a GraphFlow node for low-latency classification.
- **PromptBuilder & LLMFactory**: Standardized the way prompts are constructed and LLM instances are created.
- **GraphVisualizer**: Added support for visualizing GraphFlow structures.

### Changed
- **Event Correlation**: Enhanced `waitForCorrelatedEvents` for better error handling and precision.
- **Parameter Handling**: Streamlined context validation and parameter coercion in `GraphFlow` and `GraphController`.

---

## [0.6.x] - 2025-02-01 to 2025-02-04

### Added
- **Reactive Observation**: Implemented `GraphObserver` using RxJS for real-time state tracking.
- **Advanced GraphFlow**: Added support for parallel execution (Fork-Join) and event-driven nodes.
- **Enterprise Memory**: Added Redis and Meilisearch adapters for persistent state.

### Changed
- **Architecture**: Restructured project modules and adapters for better separation of concerns.

---

## [0.3.x] - 2025-01-20 to 2025-01-25

### Added
- **AgentRuntime**: Advanced memory management and dynamic action processing.
- **Action Scheduling**: Ability to schedule and cancel future actions via a new `ActionScheduler`.
- **Structured Output**: Added `generateObject` utility for Zod-validated AI JSON.

### Changed
- **Interpreter Transition**: Replaced the `Synthesizer` component with a more robust `Interpreter` class.
- **Memory Refactor**: Introduced `CacheMemory` and `PersistentMemory` for optimized storage.

---

## [0.0.x - 0.1.x] - 2025-01-15 to 2025-01-20

### Added
- **Core Engine**: Initial implementation of `GraphFlow` and the event-driven execution model.
- **Agent Basics**: Initial `Agent` and `Evaluator` classes for tool-using assistants.
- **Memory Foundations**: Basic memory interfaces and in-memory adapters.
- **Project Initialization**: Setup of the `@ai.ntellect/core` package and CI basics.
