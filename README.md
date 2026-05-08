# @ai.ntellect/core

**Stop your AI agents from going off-rails in production.**

*LLMs generate. You control.*

One LLM call $\rightarrow$ deterministic execution $\rightarrow$ no routing hallucinations.

---

## Why

LLMs are great at generating text.  
**They are bad at controlling systems.**

Most frameworks let the LLM decide everything:
- which tool to call
- in what order
- with what context

$\rightarrow$ This breaks as complexity grows.

**This framework does the opposite:**
- LLM decides **intent (once)**
- Your system handles **execution (deterministically)**

No drift. No hidden loops. No surprises.

**This is not an agent framework. It's a control layer for LLM systems.**

---

### The Contrast

**Most frameworks:**
`User` $\rightarrow$ `LLM` $\rightarrow$ `LLM` $\rightarrow$ `LLM` $\rightarrow$ `Tool` $\rightarrow$ `LLM` (Probabilistic Chaos)

**This framework:**
`User` $\rightarrow$ `LLM` $\rightarrow$ `System` $\rightarrow$ `Done` (Deterministic Control)

---

## Why this works

We replaced probabilistic guessing with explicit definitions. Routing is **defined**, not **learned**.

- **No prompt drift**: Your agent won't change its behavior because of a minor prompt tweak.
- **No hidden loops**: Execution paths are explicit and finite.
- **No probabilistic branching**: If the intent is X, the path is ALWAYS Y.

Just state + transitions.

---

## Quick Reference

```
User → LLM (intent) → Petri Net (routing) → GraphFlow (execution)
```

One decision. Then control.

---

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

**Requirements**: TypeScript 5.x+, Node.js 18+.

---

## Table of Contents

- [Core Thesis](#core-thesis)
- [Source Structure](#source-structure)
- [GraphFlow — Typed Execution](#graphflow--typed-execution)
- [CortexFlow — Intent Routing](#cortexflow--intent-routing)
- [Agent — Cognitive Loop](#agent--cognitive-loop)
- [AgentPipeline — Declarative Pipelines](#agentpipeline--declarative-pipelines)
- [Persistence — Memory & Checkpoints](#persistence--memory--checkpoints)
- [Planner & Compiler](#planner--compiler)
- [CLI (Interactive REPL)](#cli-interactive-repl)
- [Testing & Build](#testing--build)

---

## Core Thesis

The framework architecture is the **Classifier-Controller Split**:

| Layer | Role | Technology | Correctness |
|-------|------|-----------|-------------|
| **Intent** | Classify user input | LLM | Probabilistic (confidence threshold) |
| **Routing** | Choose execution path | Petri Net | Deterministic (verified) |
| **Execution** | Run business logic | GraphFlow | Typed (Zod validated) |

This split means the LLM is called exactly **once per turn** for intent classification. All subsequent routing and execution is handled by verified, typed code.

---

## Source Structure

```
@ai.ntellect/core
├── execution/         # GraphFlow engine (typed nodes, events, checkpoints, planner, compiler)
├── routing/           # PetriNet, CortexFlowOrchestrator, IntentClassifier
├── agent/             # Agent, GenericExecutor, handlers, tools
├── persistence/       # Barrel: Memory + checkpoint adapters
├── pipeline/          # AgentPipeline (trigger → stages → gate)
├── modules/           # Plugins: agenda, cli, embedding, memory, nlp
├── interfaces/        # Contract interfaces
├── types/             # Zod schemas
└── index.ts           # Barrel: all public API exports
```

### Path Aliases

- `@ai.ntellect/core` — root barrel (all major exports)
- `@ai.ntellect/core/execution/...` — deep imports for GraphFlow internals
- `@ai.ntellect/core/routing/...` — deep imports for PetriNet / CortexFlow
- `@ai.ntellect/core/agent/...` — deep imports for Agent module
- `@ai.ntellect/core/pipeline/...` — deep imports for AgentPipeline

---

## GraphFlow — Typed Execution

A `GraphFlow` is a **typed state machine** where each node is a discrete unit of logic.

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const schema = z.object({ count: z.number().default(0) });

const workflow = new GraphFlow({
  name: "counter",
  schema,
  context: { count: 0 },
  nodes: [
    {
      name: "increment",
      execute: async (ctx) => { ctx.count++; },
      next: "double",
    },
    {
      name: "double",
      execute: async (ctx) => { ctx.count *= 2; },
    },
  ],
});

await workflow.execute("increment");
console.log(workflow.context.count); // 2
```

### Node Types

| Type | Description |
|------|-------------|
| **Sequential** | `next: "nodeName"` or `next: (ctx) => condition ? "a" : "b"` |
| **Parallel** | `parallel: { enabled: true, joinNode: "merge" }` — fork-join model |
| **Send API** | Dynamic fan-out: create N parallel branches at runtime |
| **Event-Driven** | `when: "event.name"` — pause and wait for external event |

### Checkpoints

Save/resume workflow state with time-travel debugging and human-in-the-loop breakpoints:

```typescript
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";

const adapter = new InMemoryCheckpointAdapter();
const cpId = await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["approve_payment"],
});

// Later, resume with optional state modification:
await workflow.resumeFromCheckpoint(cpId, adapter, {
  contextModifications: { status: "approved" },
});
```

---

## CortexFlow — Intent Routing

CortexFlow wraps intent classification + Petri Net routing. The LLM identifies intent once; the Petri Net handles all control flow deterministically.

### Basic Usage

```typescript
import { CortexFlowOrchestrator, IntentClassifier } from "@ai.ntellect/core/routing/orchestrator";
import { ToolRegistry } from "@ai.ntellect/core";
import { GraphFlow } from "@ai.ntellect/core";

const llmFn = async (prompt: string) => { /* your LLM call */ };
const registry = new ToolRegistry();
const orchestrator = new CortexFlowOrchestrator("mail_assistant", registry);

const classifier = new IntentClassifier(llmFn, {
  intents: ["FETCH_MAILS", "SUMMARIZE", "UNKNOWN"],
  confidenceThreshold: 0.7,
});
orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
orchestrator.setLLMCall(llmFn);

// Build Petri Net
const net = orchestrator.petri;
net.addPlace({ id: "idle", type: "initial", tokens: [{ id: "start", data: {}, createdAt: 0 }] });
net.addPlace({ id: "done", type: "final", tokens: [] });
net.addTransition({
  id: "process_mails",
  from: ["idle"],
  to: "done",
  action: { type: "graphflow", name: "mail_fetch" },
});

registry.register({ name: "mail_fetch", description: "...", graph: new GraphFlow({...}), startNode: "fetch" });

const sessionId = orchestrator.startSession();
const result = await orchestrator.orchestrate("Summarise my last 5 emails", sessionId);
```

### Key Components

| Export | Source | Description |
|--------|--------|-------------|
| `PetriNet` | `@ai.ntellect/core` | Core Petri Net engine |
| `CortexFlowOrchestrator` | `@ai.ntellect/core/routing` | Intent → routing → execution |
| `IntentClassifier` | `@ai.ntellect/core/routing` | LLM-based intent classification |
| `HybridIntentClassifier` | `@ai.ntellect/core/routing` | Keyword + LLM fallback |

### Advanced Features

- **Hybrid Fallback**: Delegate to conversational LLM on low confidence
- **Multi-Intent**: Execute multiple intents sequentially
- **Formal Verification**: Deadlock detection via incidence matrices
- **Persistence**: Redis/PostgreSQL checkpoint adapters

---

## Agent — Cognitive Loop

The `Agent` class wraps a cognitive loop (think → execute → reply) on top of GraphFlow, with LLM-driven tool selection.

```typescript
import { Agent, createCalculatorTool } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Math Assistant",
  tools: [createCalculatorTool()],
  llmConfig: {
    provider: "groq",
    model: "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY,
  },
});

const result = await agent.process("What is 25 + 7?");
```

### Cognitive Loop Components

| Component | Location | Description |
|-----------|----------|-------------|
| `Agent` | `agent/agent.ts` | Public API: orchestrates the cognitive loop |
| `GenericExecutor` | `agent/generic-executor.ts` | Decision-making + action execution |
| `DynamicGoalHandler` | `agent/handlers/` | Context-aware goal computation |
| `DynamicNextHandler` | `agent/handlers/` | Next-state routing |
| `LLMFactory` | `agent/llm-factory.ts` | Multi-provider LLM client |
| `PromptBuilder` | `agent/prompt-builder.ts` | Structured prompt construction |
| Tools (`file-system`, etc.) | `agent/tools/` | Prebuilt agent tools |

### Built-in Agent Tools

```typescript
import {
  createFileReaderTool,
  createFileWriterTool,
  createShellTool,
  createDirectoryListerTool,
  createAllAgentTools,
  createCalculatorTool,
} from "@ai.ntellect/core";
```

---

## AgentPipeline — Declarative Pipelines

Declarative pipelines with triggers, typed stages, and human gates.

```typescript
import { AgentPipeline } from "@ai.ntellect/core";
import { InMemoryPetriCheckpointAdapter } from "@ai.ntellect/core";

const pipeline = new AgentPipeline({
  name: "price-monitor",
  stages: [
    {
      id: "fetch",
      run: async (ctx) => ({ data: await fetchData() }),
      retry: { max: 3, delayMs: 1000 },
    },
    {
      id: "process",
      run: async (ctx) => ({ result: processData(ctx.data) }),
    },
  ],
  trigger: { type: "cron", expression: "*/5 * * * *" },
  gate: "human",
  checkpointAdapter: new InMemoryPetriCheckpointAdapter(),
});

await pipeline.start();
```

---

## Persistence — Memory & Checkpoints

The `persistence/` barrel provides a unified interface for storage:

```typescript
import {
  Memory,
  InMemoryCheckpointAdapter,
  InMemoryPetriCheckpointAdapter,
  RedisPetriCheckpointAdapter,
  PostgresPetriCheckpointAdapter,
} from "@ai.ntellect/core";
```

### Memory

```typescript
import { Memory } from "@ai.ntellect/core";
import { InMemoryAdapter } from "@ai.ntellect/core/modules/memory";

const memory = new Memory(new InMemoryAdapter());
await memory.init();
await memory.createMemory({ content: "Hello", roomId: "default" });
const results = await memory.getMemoryByIndex("Hello", { roomId: "default" });
```

### Checkpoint Adapters

| Adapter | Use Case |
|---------|----------|
| `InMemoryCheckpointAdapter` | Testing / development |
| `InMemoryPetriCheckpointAdapter` | PetriNet checkpoint testing |
| `RedisPetriCheckpointAdapter` | Distributed / production |
| `PostgresPetriCheckpointAdapter` | SQL-backed persistence |

---

## Planner & Compiler

For advanced workflows, the LLM generates a Zod-validated JSON plan that is compiled into a deterministic GraphFlow at runtime.

```typescript
import { Planner, Compiler } from "@ai.ntellect/core";

const planner = new Planner(llmFn);
const plan = await planner.createPlan("Send 0.5 ETH to Alice after checking balance");

const compiler = new Compiler();
const workflow = compiler.compile(plan);

await workflow.execute("start");
```

---

## CLI (Interactive REPL)

```sh
pnpm cli -p groq -m llama-3.1-8b-instant
pnpm cli -p openai -m gpt-4o-mini
pnpm cli -p ollama -m gemma4:4b
```

**Slash commands**: `/status`, `/history`, `/list`, `/resume [cpId]`, `/approve`, `/reject`, `/modify k=v`, `/clear`, `/help`.

The CLI automatically loads API keys from `.env` (`GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`).

---

## GraphController

Orchestrate multiple GraphFlows in parallel or sequence:

```typescript
import { GraphController } from "@ai.ntellect/core";

const controller = new GraphController();
controller.add("workflow_a", graphA);
controller.add("workflow_b", graphB);

await controller.parallel("workflow_a", "workflow_b");
await controller.sequential("workflow_a", "workflow_b");
```

---

## Testing & Build

```sh
pnpm run build                  # tsc → dist/
pnpm test                       # Mocha via ts-node (5s timeout)
pnpm run test:all               # Full suite (test/**/*.test.ts)
pnpm test --grep "suite name"   # Focused suite
pnpm run test:watch             # Watch mode
```

**Real LLM tests**: `pnpm test --grep "CortexFlow Real LLM"` (requires Ollama `llama3:latest` on `localhost:11434`).

**Examples**:

```sh
pnpm run example:hello
pnpm run example:agent
pnpm run example:onchain
```

---

## License

MIT
