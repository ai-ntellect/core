# AGENTS.md

## Project Overview
- **Package**: `@ai.ntellect/core` v0.9.0 — In-process workflow engine with typed graphs, events, LLM agent support
- **Package Manager**: pnpm v10.33.0 (enforced via `packageManager` field in package.json)

## Commands

```sh
pnpm install                    # Install dependencies
pnpm run build                  # TypeScript compile to dist/ (runs on prepare)
pnpm test                       # Mocha via ts-node (default spec)
pnpm run test:all               # Full suite: test/**/*.test.ts
pnpm run test:watch:graph       # Watch graph tests only
```

**CI order**: `install --frozen-lockfile` → `test:all` → `build`

## CLI

```sh
pnpm cli -p groq -m llama-3.1-8b-instant       # Groq
pnpm cli -p openai -m gpt-4o-mini              # OpenAI
pnpm cli -p ollama -m gemma4:4b                # Local Ollama
pnpm cli -p openrouter -m <model>              # OpenRouter
```

Supported providers: `openai`, `ollama`, `groq`, `openrouter`.

**Auto-loads `.env`** for API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`). No `dotenv` dependency — CLI reads `.env` manually.

**Slash commands**: `/status`, `/history`, `/list`, `/resume [cpId]`, `/approve`, `/reject`, `/modify k=v`, `/clear`, `/help`, `/exit`

**Breakpoint**: auto-pauses before `think` node for human-in-the-loop review.

## Architecture

```
graph/          Core engine — GraphFlow, node execution, events, observer
graph/adapters/ Checkpoint adapters (InMemoryCheckpointAdapter)
modules/agent/  LLM agent with tools (each tool = a GraphFlow)
modules/memory/ Pluggable memory adapters (InMemory, Redis, Meilisearch)
modules/agenda/ Cron scheduling backed by memory adapter
modules/nlp/    NLP engine (@nlpjs/basic) wrapped as graph nodes
modules/cli/    Interactive REPL with checkpoint + human-in-the-loop
types/          Zod schemas + type aliases (Checkpoint, GraphContext, etc.)
interfaces/     Contract interfaces (ICheckpointAdapter, IMemoryAdapter, etc.)
```

**Entry point**: `index.ts` — re-exports everything from graph, modules, types, interfaces, utils.

**Path alias**: `@/*` → root (configured in tsconfig.json).

## Key Concepts Agents Should Know

### Checkpoint System
- `executeWithCheckpoint(adapter, config)` — auto-saves state after each node
- `resumeFromCheckpoint(cpId, adapter, contextModifications?)` — time travel capable
- `interrupt()` — manual pause mid-execution
- **Breakpoints**: config `breakpoints: ["nodeName"]` pauses *before* node executes
- Errors: `CheckpointInterruptError`, `CheckpointAwaitApprovalError`

### GraphFlow
- `next` accepts: string, array, conditional objects, or function
- State uses Proxy-wrapping — every property set emits `nodeStateChanged`
- Supports retry with backoff, `when` (event-driven waits), `when.strategy` (single/all/correlate)

### Agent
- Tools are GraphFlows; deduplication prevents re-running same action+params
- `processWithCheckpoint()` / `resumeFromCheckpoint()` for checkpoint-aware sessions
- Groq fallback chain: `llama-3.1-8b-instant` → `allam-2-7b` → `groq/compound-mini`

## Testing
- **Framework**: Mocha + Chai + chai-as-promised + sinon
- **Config**: `.mocharc.json` (5000ms timeout), runs via ts-node
- **Pattern**: `test/**/*.test.ts`
- **Known failure**: 1 agent test fails intermittently (`process runs tool graph when LLM requests an action`) — Ollama-dependent, unrelated to checkpoint code
- Focused run: `pnpm test --grep "suite name"`

## Build
- `tsconfig.json` excludes `test/` and `examples/`
- Output: `dist/` with declaration maps and source maps
- `prepare` script runs build — `pnpm install` triggers compile

## Environment
- `.env` is gitignored; contains `GROQ_API_KEY` and `OPENROUTER_API_KEY`
- CLI loads `.env` manually (no `dotenv` package)
- **Ollama is not available on this machine** (Windows, no local server)
