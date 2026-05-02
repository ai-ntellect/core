# @ai.ntellect/core

**Build LLM agents that don't lose control in production.**

*LLMs generate. You control.*

One LLM call → deterministic execution → no routing hallucinations.

---

## Why

LLMs are great at generating text.  
**They are bad at controlling systems.**

Most frameworks let the LLM decide everything:
- which tool to call
- in what order
- with what context

→ This breaks as complexity grows.

**This framework does the opposite:**
- LLM decides **intent (once)**
- Your system handles **execution (deterministically)**

No drift. No hidden loops. No surprises.

**This is not an agent framework. It’s a control layer for LLM systems.**

---

### The Contrast

**Most frameworks:**
`User` $\rightarrow$ `LLM` $\rightarrow$ `LLM` $\rightarrow$ `LLM` $\rightarrow$ `Tool` $\rightarrow$ `LLM` (Probabilistic Chaos)

**This framework:**
`User` $\rightarrow$ `LLM` $\rightarrow$ `System` $\rightarrow$ `Done` (Deterministic Control)

---

## Why this works

Because routing is **defined**, not **learned**.

- **No prompt drift**: Your agent won't change its behavior because of a minor prompt tweak.
- **No hidden loops**: Execution paths are explicit and finite.
- **No probabilistic branching**: If the intent is X, the path is ALWAYS Y.

Just state + transitions.

---

## Quick example

```ts
const { intent } = await orchestrator.orchestrate("Summarise my last 5 emails");

// 1 LLM call
// → { intent: "SUMMARISE", confidence: 0.95 }

// No repeated LLM calls for control flow.
// No uncontrolled loops. No probabilistic retries. Just execution.
```

---

## What you can build

Use this when your app needs **execution you can trust** — not just text generation.

### AI features that don't break after 3 prompts
Consistency is the default.
- **Example**: “Summarise my last 5 emails” $\rightarrow$ always triggers the same workflow.
- **Benefit**: No drift. No weird tool switching after 10 messages.

### Payments & critical actions (without fear)
High-stakes actions handled with mathematical certainty.
- **Example**: “Send 0.5 ETH to Alice” $\rightarrow$ validated $\rightarrow$ approved $\rightarrow$ executed.
- **Benefit**: No hallucinated parameters. No accidental calls.

### Human-in-the-loop systems
AI prepares $\rightarrow$ human validates $\rightarrow$ system executes.
- **Perfect for**: Admin panels, internal tools, compliance flows.
- **Benefit**: Built-in checkpoints and resume capabilities.

### Async workflows that actually resume
React to the world without losing state.
- **Example**: Wait for webhook $\rightarrow$ continue execution $\rightarrow$ no lost state.
- **Benefit**: No hacks. No polling spaghetti.

### Agents that use tools without going rogue
The LLM decides the intent; the system executes the exact flow.
- **Benefit**: No infinite loops. No random retries.

### Backend logic powered by intent
Turn user messages into safe function calls.
- **Replace**: Fragile prompt logic, ad-hoc tool routing, and hidden state.
- **With**: Explicit execution graphs.

---

## When to use this

Use this if:
- Your agent breaks as conversations grow
- You need predictable execution
- You want to debug your agent like a backend system

Don’t use this if:
- You just need a simple chatbot
- You want fully autonomous LLM reasoning at every step

---

## Core idea

```
User → LLM (intent) → Petri Net (routing) → GraphFlow (execution)
```

One decision. Then control.

---

## Technical Details

### Installation

```sh
pnpm add @ai.ntellect/core zod
```

**Requirements**: TypeScript 5.x+, Node.js 18+.

### Table of Contents
- [Core Concepts](#core-concepts)
- [CortexFlow — Petri Net Orchestration](#cortexflow--petri-net-orchestration)
- [AgentPipeline](#agentpipeline-v0120)
- [LLM Agent Module](#llm-agent-module)
- [CLI (Interactive REPL)](#cli-interactive-repl)
- [Testing & Build](#testing--build)

Advanced: [Architecture](./ARCHITECTURE.md) · [Benchmark](./BENCHMARK.md)

---

## Core Concepts

### GraphFlow: The Graph Container
A `GraphFlow` is a **workflow definition**. It has:
- A `name` (identifier)
- A `schema` (Zod schema defining state shape)
- An `context` (initial state)
- A `nodes` array (the steps)

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

const Schema = z.object({
  message: z.string(),
  count: z.number().default(0),
});

const workflow = new GraphFlow({
  name: "counter",
  schema: Schema,
  context: { message: "", count: 0 },
  nodes: [
    {
      name: "increment",
      execute: async (ctx) => {
        ctx.count++; 
        ctx.message = `Count is now ${ctx.count}`;
      },
    },
  ],
});

await workflow.execute("increment");
```

### Nodes: The Steps
Nodes can be **Sequential**, **Parallel** (Fork-Join model), or **Event-Driven**.

#### Sequential Execution
Nodes execute one after another via the `next` property.

#### Parallel Execution
Set `parallel: { enabled: true, joinNode: "merge" }` to fork into concurrent branches using `Promise.all`.

#### Dynamic Fan-Out (Send API)
Create $N$ parallel branches at runtime based on context data.

#### Event-Driven Nodes
Nodes can pause and wait for external events (e.g., `payment.received`) via the `when` property.

### Checkpoint System
Save and resume workflow state using an `ICheckpointAdapter`. Supports breakpoints and time-travel debugging.

---

## CortexFlow — Petri Net Orchestration

CortexFlow solves the **LLM context overload** problem. Instead of letting the LLM drive every routing decision, a Petri Net handles control flow deterministically while the LLM is called only once per turn.

### Why Petri Nets?
They enable structural analysis:
- **Deadlock detection** — identify blocking states before deployment.
- **Boundedness check** — verify token counts stay bounded.
- **Reachability analysis** — enumerate every possible state statically.

### Custom Petri Net Example
```typescript
import { CortexFlowOrchestrator } from "@ai.ntellect/core/petri/orchestrator";
import { IntentClassifier } from "@ai.ntellect/core/petri/intent-classifier";
import { ToolRegistry } from "@ai.ntellect/core";

const llmFn = async (prompt: string) => { /* your LLM call */ };
const registry = new ToolRegistry();
const orchestrator = new CortexFlowOrchestrator("mail_assistant", registry);

const classifier = new IntentClassifier(llmFn, {
  intents: ["FETCH_MAILS", "SUMMARIZE", "UNKNOWN"],
  confidenceThreshold: 0.7,
});
orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
orchestrator.setLLMCall(llmFn);

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

registry.register({ name: "mail_fetch_summarize", description: "...", graph: /* your GraphFlow */, startNode: "fetch" });

const sessionId = orchestrator.startSession();
const result = await orchestrator.orchestrate("Summarise my last 5 emails", sessionId);
```

### Advanced Features
- **Hybrid Fallback Mode**: Delegate to a conversational LLM on low confidence.
- **Multi-Intent Classification**: Execute multiple intents sequentially.
- **Ready-to-Use Petri Patterns**: JSON blueprints for Human-Approval, RAG, and Data Extraction.
- **Persistence Adapters**: Redis and PostgreSQL support.

---

## AgentPipeline (v0.12.0+)

Declarative workflow pipelines with triggers, human gates, and retry logic.

```typescript
import { AgentPipeline, PricePollingTrigger } from "@ai.ntellect/core/pipeline/agent-pipeline";

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
  trigger: new PricePollingTrigger("BTC", 50000, 60000, 10000),
  gate: "human", 
  checkpointAdapter: new InMemoryPetriCheckpointAdapter(),
});

await pipeline.start();
// Later: await pipeline.approve({ approvedBy: "user123" });
```

---

## LLM Agent Module

Adds a cognitive loop (think → execute → reply) on top of GraphFlow.

```typescript
import { Agent, createCalculatorTool } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Math Assistant",
  tools: [createCalculatorTool()],
  llmConfig: { provider: "groq", model: "llama-3.1-8b-instant", apiKey: process.env.GROQ_API_KEY },
});

const result = await agent.process("What is 25 + 7?");
```

---

## CLI (Interactive REPL)

Run agents interactively from your terminal:

```sh
pnpm cli -p groq -m llama-3.1-8b-instant
pnpm cli -p openai -m gpt-4o-mini
pnpm cli -p ollama -m gemma4:4b
```

**Slash commands**: `/status`, `/history`, `/resume [cpId]`, `/approve`, `/reject`, `/modify k=v`.

---

## Testing & Build

```sh
pnpm test                       # Mocha via ts-node
pnpm run test:all               # Full suite
pnpm run build                  # TypeScript compile to dist/
```

**Examples**:
`pnpm run example:hello`, `example:events`, `example:agent`, `example:onchain`.

---

## License
MIT
