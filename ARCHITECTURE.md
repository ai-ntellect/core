# @ai.ntellect/core — Architecture

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

## Key Components

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
| `AgentPipeline` | Declarative workflow pipelines with triggers, human gates, retry logic |

## Design Principles

### 1. LLM as Planner, Not Runtime
The LLM makes **one decision** (intent classification), then the Petri Net handles all routing deterministically. This prevents context bloat in long sessions.

### 2. Formal Verification
Petri Nets enable static analysis before deployment:
- **Deadlock detection** — identify blocking states before runtime
- **Boundedness check** — verify token counts stay bounded
- **Reachability analysis** — enumerate all reachable states

These checks run via `matrix.ts` at build time.

### 3. Typed State Everywhere
Zod schemas validate context at every node transition. If types don't match, the workflow fails fast.

### 4. Deterministic Routing
Once intent is classified, all routing is token-based through the Petri Net — no additional LLM calls for routing decisions.

## Why Petri Nets?

Unlike state machines or simple graphs, Petri Nets provide:
- **Concurrency modeling** — tokens can exist in multiple places simultaneously
- **Static analysis** — mathematical properties can be verified
- **Formal semantics** — unambiguous behavior definition

This makes them ideal for workflows where correctness matters more than flexibility.
