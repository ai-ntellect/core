# @ai.ntellect/core

An in-process workflow engine for Node.js/TypeScript built around two complementary primitives: **GraphFlow** for typed graph execution and **CortexFlow** for LLM agent orchestration via Petri Nets.

Inspired by [Hybrid Petri Net / LLM Agent architectures](https://www.mdpi.com/1999-5903/17/8/363).

## What this is

- **GraphFlow** — define workflows as directed graphs where nodes execute steps, state is typed with Zod, and execution can pause for external events or checkpoints.
- **CortexFlow** — a Petri Net orchestration layer that uses a **single LLM call per user turn** to classify intent, then routes deterministically through a state machine. All routing is token-based and free of additional LLM calls.

What it is not:
- **Not Temporal** — no distributed persistence or cross-machine replay
- **Not LangGraph** — routing is deterministic and happens outside the LLM; the LLM only decides intent
- **Not a state machine library** — graphs are dynamic, and Petri Nets include static analysis for deadlocks and boundedness

The combination addresses a real problem in production LLM agents: as conversation history grows, context bloat causes hallucinations and routing errors. By confining the LLM to a single, well-scoped classification call and delegating all control flow to a verified Petri Net, the system stays predictable regardless of how long the session runs.

## Core Architecture

```
User Message
    ↓
IntentClassifier  (1 LLM call — classify intent)
    ↓
PetriNet          (deterministic token-based routing — no LLM)
    ↓
GraphFlow         (node execution — tools, APIs, optional dynamic plan)
    ↓
Zod Validation    (typed state at every step)
```

### Key Components

| Component | Role |
|-----------|------|
| `CortexFlowOrchestrator` | Top-level coordinator: intent → Petri net → GraphFlow |
| `PetriNet` | Formally-verified state machine (deadlock detection, boundedness) |
| `IntentClassifier` | Single-LLM-call intent resolution with confidence thresholding |
| `GraphFlow` | Graph container: name, schema, context, nodes |
| `GraphNode` | Execution engine: runs nodes, handles transitions |
| `GraphEventManager` | Event system: RxJS Subjects + EventEmitter |
| `GraphObserver` | Reactive API: subscribe to state/events |
| `CheckpointAdapter` | Persistence: save/resume state |
| `ToolRegistry` | Registry of GraphFlow tools available to transitions |

---

## What this is useful for

You build applications that need to **coordinate multiple steps with shared state**:

- **Multi-step workflows**: onboarding, checkout, data pipelines
- **Event-driven processes**: wait for webhooks, user actions, async operations
- **Stateful agents**: LLM loops with tools (each tool = a GraphFlow)
- **Parallel processing**: Fork-Join model, dynamic fan-out via Send API
- **Human-in-the-loop**: breakpoints, approvals, checkpoints

Instead of spaghetti callbacks or scattered service calls, you define a graph once and let the engine execute it.

---

## Key Features

### Graph Execution
- **Typed state with Zod** — Context validated at every node transition
- **Sequential & parallel nodes** — Fork-Join model with `Promise.all`
- **Dynamic branching** — `next` accepts strings, arrays, functions, or conditional objects
- **Send API (fan-out)** — Runtime-determined branches via `send: (ctx) => Send[]`
- **State Reducers** — Control how parallel results merge (`Reducers.append`, `deepMerge`)

### Resilience
- **Event-driven nodes** — Pause workflows waiting for external triggers
- **Checkpoint system** — Save/resume state, time travel debugging
- **Retry with backoff** — Configurable resilience for flaky operations
- **Breakpoints** — Human-in-the-loop review before critical nodes

### Observability
- **Observable state** — RxJS Observables on context changes
- **Event emission** — `nodeStarted`, `nodeCompleted`, `nodeStateChanged`
- **Graph visualization** — `GraphVisualizer` for debugging

### Extensions
- **Plan → Compile → Execute Pattern** — LLM generates plan JSON, compiled to GraphFlow at runtime
- **LLM Agent module** — Tools as GraphFlows, cognitive loop (think → execute → reply)
- **Agent Handoff** — Delegate to sub-agents via Command pattern
- **Memory module** — Pluggable adapters (InMemory, Redis, Meilisearch)
- **Agenda module** — Cron scheduling with `node-cron`
- **NLP module** — `@nlpjs/basic` wrapped as graph nodes

## CortexFlow — Petri Net Orchestration

CortexFlow solves the **LLM context overload** problem in multi-step agents. Instead of letting the LLM drive every routing decision, a Petri Net handles control flow deterministically while the LLM is called only once per turn.

### Why Petri Nets?

Petri Nets enable structural analysis that a pure LLM agent cannot provide:
- **Deadlock detection** — identify blocking states before deployment, not at runtime
- **Boundedness check** — verify that token counts stay bounded under all reachable markings
- **Reachability analysis** — enumerate every state the workflow can reach statically

These checks are run at build time via `matrix.ts` and surface issues before any LLM is involved.

### Quick Start

```typescript
import { CortexFlowOrchestrator } from "@ai.ntellect/core/petri/orchestrator";
import { IntentClassifier } from "@ai.ntellect/core/petri/intent-classifier";
import { ToolRegistry } from "@ai.ntellect/core";

const registry = new ToolRegistry();
const orchestrator = new CortexFlowOrchestrator("mail_assistant", registry);

// 1. Single LLM call for intent classification
const classifier = new IntentClassifier(llmFn, {
  intents: ["FETCH_MAILS", "SUMMARIZE", "UNKNOWN"],
  confidenceThreshold: 0.7,
});
orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
orchestrator.setLLMCall(llmFn);

// 2. Define the Petri Net (places + transitions)
const net = orchestrator.petri;
net.addPlace({ id: "idle",       type: "initial", tokens: [{ id: "start", data: {}, createdAt: 0 }] });
net.addPlace({ id: "processing", type: "normal",  tokens: [] });
net.addPlace({ id: "done",       type: "final",   tokens: [] });

net.addTransition({
  id: "process_mails",
  from: ["idle"],
  to: "processing",
  action: { type: "graphflow", name: "mail_fetch_summarize" },
});

// 3. Register a GraphFlow tool
registry.register({ name: "mail_fetch_summarize", description: "...", graph: mailGraph, startNode: "fetch" });

// 4. Run
const sessionId = orchestrator.startSession();
const result = await orchestrator.orchestrate("Summarise my last 5 emails", sessionId);
// → { intent: { intent: "FETCH_MAILS", confidence: 0.95, ... }, transitionResult: ... }
```

### Clarification on Low Confidence

When the classifier confidence is below the threshold, the orchestrator automatically generates a clarifying question instead of firing a transition:

```typescript
// result.needsClarification === true
// result.clarificationQuestion === "Do you want to fetch emails, summarise them, or both?"
```

### Dev CLI

Debug your Petri Net interactively without writing tests:

```sh
pnpm run dev:cli examples/my_workflow.json
```

Commands: `show`, `enabled`, `step <id>`, `auto`, `inject <placeId> [json]`, `history`, `dot`, `reset`.

### Benchmark

Scenario: fetch 5 emails → batch-classify urgency → draft replies for urgent ones → archive the rest.

Three implementations are compared: CortexFlow, LangGraph naive (one LLM call per routing decision — the standard pattern), and LangGraph optimised (manually batched by the developer).

```sh
pnpm run benchmark   # requires Ollama + llama3:latest, or GROQ_API_KEY in .env
```

Results below are measured, not projected. A warmup call is made before each timer starts to exclude model loading.

#### Ollama local — llama3:latest

| | CortexFlow | LangGraph naive | LangGraph optimised |
|---|---|---|---|
| LLM calls | **2** | 7 | 2 |
| Total time | **5 181 ms** | 15 305 ms | 6 773 ms |
| vs naive | **2.95× faster** | baseline | 2.26× faster |

#### Groq API — llama-3.1-8b-instant

| | CortexFlow | LangGraph naive | LangGraph optimised |
|---|---|---|---|
| LLM calls | **2** | 7 | 2 |
| Total time | **1 757 ms** | 2 052 ms | 1 603 ms |
| vs naive | **1.17× faster** | baseline | 1.28× faster |

**LLM call reduction vs naive: −71% on both backends.**

On Groq (each call ~250 ms), LangGraph optimised is 154 ms faster than CortexFlow — the Petri Net + structured logging overhead becomes measurable when the LLM itself is near-instant. This is an honest trade-off: CortexFlow's structural guarantees (deadlock detection, boundedness) have a small fixed cost.

On Ollama (each call ~2 s), fewer calls dominate: CortexFlow is nearly 3× faster than the naive pattern.

---

## Plan → Compile → Execute (LLM as Planner)

Treat the LLM as a **planner, not a runtime**. The LLM generates a structured plan (JSON), which is compiled into an executable GraphFlow:

```typescript
import { ToolRegistry, generatePlan, compilePlan } from "@ai.ntellect/core";

// 1. Register tools (each tool = GraphFlow)
const registry = new ToolRegistry();
registry.register({ name: "check_balance", description: "...", graph, startNode: "run" });

// 2. LLM generates plan (Zod-validated JSON)
const plan = await generatePlan(userIntent, registry, llmCall);

// 3. Compile to GraphFlow
const { graph, startNode } = compilePlan(plan, registry);

// 4. Execute with full checkpoint support
const ctx = await graph.execute(startNode, {});
```

**Why this is different**:
- **LangGraph** = routing within a *fixed* graph
- **This pattern** = LLM *generates the graph structure* itself

**Benefits**: deterministic, observable, debuggable, checkpointable.

**Test with real LLM (CortexFlow)**: `pnpm run test:petri` (requires Ollama + llama3 running locally)

---

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

**Requirements**: TypeScript 5.x+, Node.js 18+.

---

## Core Concepts

### GraphFlow: The Graph Container

A `GraphFlow` is a **workflow definition**. It has:
- A `name` (identifier)
- A `schema` (Zod schema defining state shape)
- An `context` (initial state)
- A `nodes` array (the steps)

Think of it as a **function with internal state** that executes in stages.

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// 1. Define state shape with Zod (VALIDATION AT EVERY STEP)
const Schema = z.object({
  message: z.string(),
  count: z.number().default(0),
});

// 2. Create the workflow
const workflow = new GraphFlow({
  name: "counter",
  schema: Schema,
  context: { message: "", count: 0 },
  nodes: [
    {
      name: "increment",
      execute: async (ctx) => {
        ctx.count++; // Typed! Autocomplete works.
        ctx.message = `Count is now ${ctx.count}`;
      },
    },
  ],
});

// 3. Execute
await workflow.execute("increment");
console.log(workflow.getContext().count); // 1
```

**Key insight**: The Zod schema isn't optional. Every time the workflow moves between nodes, the context is **validated**. If something is the wrong type or fails a validation rule, the workflow throws immediately.

---

### Nodes: The Steps

Each node has:
- A `name` (unique identifier)
- An `execute` function (the logic)
- Optional `next` (where to go next)
- Optional `when` (event-driven pause)
- Optional `parallel` (fork into parallel branches)

#### Sequential Execution

By default, nodes execute **sequentially**:

```typescript
nodes: [
  {
    name: "fetch_user",
    execute: async (ctx) => {
      ctx.user = await db.users.find(ctx.userId);
    },
    next: "validate_user", // After this, run "validate_user"
  },
  {
    name: "validate_user",
    execute: async (ctx) => {
      if (!ctx.user.emailVerified) throw new Error("User not verified");
    },
    next: "send_welcome",
  },
  {
    name: "send_welcome",
    execute: async (ctx) => {
      await sendEmail(ctx.user.email, "Welcome!");
    },
  },
]
```

The engine walks through the chain automatically. Each node receives the context modified by the previous node.

#### Parallel Execution (Fork-Join Model)

Set `parallel: { enabled: true }` on a node to fork into **parallel branches**:

```typescript
nodes: [
  {
    name: "start",
    execute: async (ctx) => { ctx.value = 1; },
    parallel: { enabled: true, joinNode: "merge" },
    next: ["branch1", "branch2", "branch3"], // These run IN PARALLEL
  },
  {
    name: "branch1",
    execute: async (ctx) => { ctx.from1 = "done"; },
  },
  {
    name: "branch2",
    execute: async (ctx) => { ctx.from2 = "done"; },
  },
  {
    name: "merge",
    execute: async (ctx) => {
      // ctx.from1 and ctx.from2 are both set (from parallel branches)
      console.log(ctx.from1, ctx.from2);
    },
  },
]
```

**How it works**:
1. Node "start" executes
2. Engine forks: clones context 3 times (once per branch)
3. Branches "branch1", "branch2", "branch3" execute **concurrently** via `Promise.all`
4. Engine waits for ALL branches to complete
5. Results are **merged** (deep merge by default, or use reducers)
6. Node "merge" executes (the `joinNode`)

#### Dynamic Fan-Out (Send API)

For runtime-determined branches, use the **Send API**:

```typescript
nodes: [
  {
    name: "distribute",
    execute: async (ctx) => { ctx.results = []; },
    send: (ctx) => ctx.items.map((item, i) => ({
      to: "processItem",
      input: { currentItem: item, index: i },
      branchId: `item_${i}`,
    })),
    parallel: { enabled: true, joinNode: "done" },
  },
  {
    name: "processItem",
    execute: async (ctx) => {
      ctx.results.push(`Processed: ${ctx.currentItem}`);
    },
  },
]
```

This creates **N parallel branches** at runtime based on `ctx.items.length`.

#### State Reducers

Control how parallel branch results merge:

```typescript
{
  name: "start",
  parallel: { enabled: true, joinNode: "merge" },
  reducers: [
    {
      key: "results",
      reducer: (acc, val) => [...acc, ...val], // Append arrays
      initial: [],
    },
  ],
  next: ["branch1", "branch2"],
}
```

Built-in reducers: `Reducers.append`, `Reducers.deepMerge`, `Reducers.lastWins`, `Reducers.sum`.

---

### Event-Driven Nodes

Nodes can **pause and wait** for external events:

```typescript
{
  name: "await_payment",
  when: {
    events: ["payment.received"],
    timeout: 30000, // 30s timeout
    strategy: { type: "single" }, // Execute when ANY event arrives
  },
  execute: async (ctx) => {
    ctx.status = "paid"; // Event payload is in context
  },
}
```

**Strategies**:
- `single` — Execute when first matching event arrives
- `all` — Execute when ALL listed events have arrived
- `correlate` — Execute when events match a correlation function

**Emit events from anywhere in your app**:

```typescript
workflow.emit("payment.received", {
  orderId: "123",
  amount: 99,
});
```

---

### Observable State

Subscribe to context changes reactively:

```typescript
// Subscribe to entire context
workflow
  .observe()
  .state()
  .subscribe((ctx) => {
    console.log("Context changed:", ctx);
  });

// Subscribe to a single property
workflow
  .observe()
  .property("status")
  .subscribe((status) => {
    console.log("Status is now:", status);
  });
```

---

### Checkpoint System

Save and resume workflow state:

```typescript
import { InMemoryCheckpointAdapter } from "@ai.ntellect/core";

const adapter = new InMemoryCheckpointAdapter();

// Execute with automatic checkpointing
const { checkpointId } = await workflow.executeWithCheckpoint("start", adapter, {
  breakpoints: ["approve_order"], // Pause before these nodes
});

// List all checkpoints
const checkpoints = await workflow.listCheckpoints(adapter);

// Resume from a checkpoint (time travel!)
await workflow.resumeFromCheckpoint(checkpointId, adapter, {
  contextModifications: { status: "retry" },
});
```

---

## LLM Agent Module

The Agent module adds **LLM capabilities** on top of GraphFlow:

```typescript
import { Agent, createCalculatorTool } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Math Assistant",
  goal: "Help with calculations",
  tools: [createCalculatorTool()],
  llmConfig: {
    provider: "groq",
    model: "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY,
  },
  verbose: true,
});

const result = await agent.process("What is 25 + 7?");
console.log(result.response); // "25 + 7 = 32"
console.log(result.executedActions); // [{ name: "calculator", parameters: ... }]
```

### How the Agent works

The Agent runs a **cognitive loop**:

1. **Think** — LLM decides which tools to call and with what parameters
2. **Execute** — Tools (GraphFlows) run and return results
3. **Reply** — LLM generates final response

This repeats until:
- No more tools to call (task complete)
- `maxIterations` reached (default: 5)

### Agent Handoff

Agents can **delegate to other agents** using the Command pattern:

```typescript
// In a node, return a Command to handoff
{
  name: "delegate",
  execute: async (ctx) => {
    return {
      goto: "specialist_agent",
      update: { task: ctx.currentTask },
      graph: "PARENT", // Handoff to parent graph
    };
  },
}
```

Use `createHandoffTool()` to create a handoff tool for agents.

---

## CLI (Interactive REPL)

Run agents interactively:

```sh
pnpm cli -p groq -m llama-3.1-8b-instant       # Groq
pnpm cli -p openai -m gpt-4o-mini              # OpenAI
pnpm cli -p ollama -m gemma4:4b                # Local Ollama
pnpm cli -p openrouter -m <model>              # OpenRouter
```

**Slash commands**:
- `/status` — Show current execution state
- `/history` — Show conversation history
- `/resume [cpId]` — Resume from a checkpoint
- `/approve` / `/reject` — Handle pending approvals
- `/modify k=v` — Modify context before resuming

---

## Testing

```sh
pnpm test                       # Mocha via ts-node
pnpm run test:all               # Full suite
pnpm test --grep "suite name"    # Focused run
```

**Framework**: Mocha + Chai + chai-as-promised + sinon
**Pattern**: `test/**/*.test.ts`
**Config**: `.mocharc.json` (5000ms timeout)

---

## Build

```sh
pnpm install                    # Install dependencies
pnpm run build                  # TypeScript compile to dist/
```

**Output**: `dist/` with declaration maps and source maps
**CI order**: `install --frozen-lockfile` → `test:all` → `build`

---

## Examples

```sh
pnpm run example:hello           # Simple workflow
pnpm run example:events         # Event-driven workflow
pnpm run example:agent         # Agent with tools
pnpm run example:agent-events  # Agent with events
pnpm run example:agent-project  # Agent that creates files
pnpm run example:agent-complex  # Complex agent projects
pnpm run example:native-tools   # Native tools demo
pnpm run example:wallet        # Wallet assistant (legacy)
pnpm run example:onchain       # Onchain agent with plan→compile→execute
```

**Onchain example**: `examples/onchain-agent/` uses the plan→compile→execute pattern with real Sepolia wallets from `.env`.

All examples require either Ollama running locally or API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`) set in `.env`.

---

## License

MIT
