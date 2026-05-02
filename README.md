# @ai.ntellect/core

A lightweight, in-process workflow engine for Node.js/TypeScript. Define workflows as **directed graphs** where nodes execute sequentially or in parallel, state is typed with Zod, and execution can pause for events. The entire runtime is ~1000 lines of code — no external services, no message queues, no infrastructure to manage.

## What this is

This is a **graph-based execution engine**. You define a graph with nodes (steps) and edges (transitions). The engine walks the graph, executing nodes, managing state, and handling events. Think of it as:

- **Not a workflow engine like Temporal** — no persistence, replay, or cross-machine scaling
- **Not an agent framework like LangGraph** — it provides primitives (graphs, events, state), not agent patterns
- **Not a state machine library** — graphs are dynamic, nodes can branch/merge, state is mutable

It's a **middle ground**: powerful enough for complex orchestration, simple enough to embed directly in your app.

## Core Architecture

```
Your App
    ↓
GraphFlow (graph definition)
    ↓
GraphNode (execution engine)
    ↓
RxJS Event System (reactive state)
    ↓
Zod Validation (typed state)
```

### Key Components

| Component | Role |
|-----------|------|
| `GraphFlow` | Graph container: name, schema, context, nodes |
| `GraphNode` | Execution engine: runs nodes, handles transitions |
| `GraphEventManager` | Event system: RxJS Subjects + EventEmitter |
| `GraphObserver` | Reactive API: subscribe to state/events |
| `CheckpointAdapter` | Persistence: save/resume state |
| `NodeRegistry` | Registry: execute functions for workers |

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

**Test with real LLM**: `pnpm test --grep "REAL"` (requires `GROQ_API_KEY`)

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
