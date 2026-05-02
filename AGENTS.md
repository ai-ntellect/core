# AGENTS.md

## Project Overview
- **Package**: `@ai.ntellect/core` v0.12.0 — In-process workflow engine with typed graphs, events, LLM agent support
- **Package Manager**: pnpm v10.33.0 (enforced via `packageManager` field)
- **CI order**: `install --frozen-lockfile` → `test:all` → `build`

## Commands

```sh
pnpm install                    # Runs build (prepare script)
pnpm run build                  # tsc → dist/ (rimraf cleans first)
pnpm test                       # Mocha via ts-node, 5000ms timeout (.mocharc.json)
pnpm run test:all               # Same as pnpm test (both use test/**/*.test.ts)
pnpm test --grep "suite name"  # Run specific suite
```

## Architecture

```
graph/          Core engine — GraphFlow, nodes, events, observer
  registry.ts    Tool registry for plan→compile→execute
  planner.ts     LLM→plan JSON (Zod-validated)
  compiler.ts    plan→GraphFlow executable
graph/adapters/  Checkpoint adapters (InMemoryCheckpointAdapter)
modules/agent/  LLM agent with tools (each tool = a GraphFlow)
modules/memory/  Pluggable memory (InMemory, Redis, Meilisearch)
modules/agenda/  Cron scheduling backed by memory adapter
modules/nlp/    NLP engine (@nlpjs/basic) wrapped as graph nodes
modules/cli/    Interactive REPL with checkpoint + human-in-the-loop
modules/embedding/  AI embedding adapter
petri/           CortexFlow — intent classification & orchestration
  intent-classifier.ts
  orchestrator.ts
  matrix.ts
  types.ts
  checkpoint-adapter.ts    Petri checkpoint persistence
  web-server.ts            Web visualization interface
  documentation-generator.ts  Living docs (Mermaid/MD/HTML)
types/          Zod schemas + type aliases
interfaces/     Contract interfaces (ICheckpointAdapter, IMemoryAdapter, etc.)
app/            Separate Next.js app (own package.json, not part of core build)
scripts/        Utilities (e.g., get-gmail-token.ts, generate-petri-docs.ts)
benchmark/      CortexFlow vs LangGraph benchmarks
```

**Entry point**: `index.ts` — re-exports from graph, modules, types, interfaces, utils.

**Path alias**: `@/*` → root (tsconfig.json `paths`).

**tsconfig include**: `index.ts`, `modules/**/*`, `graph/**/*`, `types/**/*`, `interfaces/**/*`, `utils/**/*` — excludes `test/`, `examples/`, `petri/`, `app/`.

## CLI

### Agent CLI
```sh
pnpm cli -p groq -m llama-3.1-8b-instant       # Groq
pnpm cli -p openai -m gpt-4o-mini              # OpenAI
pnpm cli -p ollama -m llama3:latest            # Local Ollama
pnpm cli -p openrouter -m <model>              # OpenRouter
```

Supported providers: `openai`, `ollama`, `groq`, `openrouter`, `google`, `custom`.

**Auto-loads `.env`** for API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`). No `dotenv` dependency — CLI reads `.env` manually.

**Slash commands**: `/status`, `/history`, `/list`, `/resume [cpId]`, `/approve`, `/reject`, `/modify k=v`, `/clear`, `/help`, `/exit`

### CortexFlow Dev CLI (Petri Net Debugger)
```sh
npx ts-node cli-dev.ts [workflow.json]       # Launch interactive debugger
```

**Commands:**
- `load <file.json>` - Load a Petri net from JSON
- `show [placeId]` - Show marking (all places or specific)
- `enabled` - List enabled transitions
- `step <transitionId>` - Fire a transition
- `auto` - Auto-fire enabled transitions until blocked
- `inject <placeId> [json]` - Add a token to a place
- `history` - Show transition history
- `dot` - Export graph to DOT format
- `reset` - Reset to initial marking
- `help` - Show help
- `exit` - Quit

### Generate Petri Documentation
```sh
npx ts-node scripts/generate-petri-docs.ts <petri-net.json> [output-dir]
```

Generates Mermaid diagrams, Markdown docs, and HTML preview in `./docs/petri` (or specified dir).

## Key Patterns

### Plan → Compile → Execute
```typescript
const registry = new ToolRegistry();
registry.register({ name: 'check_balance', description: '...', graph, startNode: 'run' });
const plan = await generatePlan(userIntent, registry, llmCall);
const { graph, startNode } = compilePlan(plan, registry);
const ctx = await graph.execute(startNode, {});
```

### No axios — use native fetch
This project uses native Node.js `fetch` (Node 18+). Do not add axios as a dependency.

### Zod v4+ syntax
Use `z.unknown()` instead of `z.any()`. Use `z.record(z.string(), z.unknown())` for records.

## Testing

- **Framework**: Mocha + Chai + chai-as-promised + sinon
- **Config**: `.mocharc.json` — 5000ms timeout, spec: `test/**/*.test.ts`
- **Known intermittent failure**: 1 agent test (`process runs tool graph when LLM requests an action`) — Ollama-dependent
- **Real LLM tests** (Ollama): `test/petri/real-llm.test.ts` — uses `llama3:latest` at `localhost:11434`
  - Run: `pnpm test --grep "CortexFlow Real LLM"`
- **Real onchain tests**: `test/graph/plan-real-onchain.test.ts` (requires Sepolia wallets in `.env`)
- **Petri checkpoint tests**: `test/petri/checkpoint-persistence.test.ts`
- **Ollama models available**: `llama3:latest`, `llama3.2:3b`, `llama3:8b`, `phi3:latest`, `gemma4:e4b`

## Checkpoint System
- `executeWithCheckpoint(adapter, config)` — auto-saves state after each node
- `resumeFromCheckpoint(cpId, adapter, contextModifications?)` — time travel capable
- `interrupt()` — manual pause mid-execution
- **Breakpoints**: config `breakpoints: ["nodeName"]` pauses *before* node executes
- Errors: `CheckpointInterruptError`, `CheckpointAwaitApprovalError`

### Petri Checkpoint Persistence (NEW)
- `petri/checkpoint-adapter.ts` — `IPetriCheckpointAdapter`, `InMemoryPetriCheckpointAdapter`
- `orchestrator.setPetriCheckpointAdapter(adapter)` — enable Petri state persistence
- `orchestrator.savePetriState(sessionId)` — manual save
- `orchestrator.restorePetriState(checkpointId)` — restore Petri net + session

## Environment
- `.env` is gitignored; contains `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- **Ollama IS available** on this machine (macOS, `localhost:11434`)
- **Sepolia testnet**: `RPC_URL`, `PRIVATE_KEY_1`, `PRIVATE_KEY_2`, `STUDENT_2`, `STUDENT_3`, `STUDENT_4` in `.env`
- `client_secret.json` at root — Google OAuth2 credentials for Gmail API access
- `gmail_token.json` — generated by `scripts/get-gmail-token.ts`

## Benchmark Results
**CortexFlow vs LangGraph** (see `benchmark/run-benchmark.ts`):
- CortexFlow: 13.4s (2 LLM calls, includes traceability + formal Petri semantics)
- LangGraph: 3.7s (1 LLM call, raw execution time)
- **CortexFlow provides 0.28x the speed but with full traceability and formal verification**

## Logging
- `utils/logger.ts` — Pino logger with traceId propagation
- Orchestrator automatically generates traceIds for each session
- Log format: `{"level":"INFO","msg":"Session started","sessionId":"...","traceId":"..."}`
