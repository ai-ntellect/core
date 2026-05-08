# AGENTS.md

## Project
- `@ai.ntellect/core` v0.12.0 — pnpm v10.33.0
- **Thesis**: LLM as **Classifier** → **Routing** (Petri Net) → **Execution** (GraphFlow)
- `pnpm install` runs `prepare` script (`tsc`), so build is automatic on install

## Commands
```sh
pnpm run build                # tsc → dist/
pnpm test                     # Mocha via ts-node (5s timeout, .mocharc.json)
pnpm run test:all             # test/**/*.test.ts
pnpm test --grep "suite"      # focused suite
pnpm run test:watch           # watch mode
pnpm run test:watch:execution # watch only execution tests
```
**Real LLM**: `pnpm test --grep "CortexFlow Real LLM"` (needs Ollama `llama3:latest` at `:11434`)

## Architecture (Bounded Contexts)
```
index.ts          → public API barrel
execution/        → GraphFlow (typed nodes, events, checkpoints, planner, compiler)
routing/          → PetriNet, CortexFlowOrchestrator, IntentClassifier
agent/            → Agent, GenericExecutor, handlers, tools
persistence/      → barrel re-exporting Memory + checkpoint adapters
pipeline/         → AgentPipeline (trigger → stages → gate)
modules/          → remaining plugins: agenda, cli, embedding, memory, nlp
interfaces/       → contract interfaces
types/            → Zod schemas (use z.unknown(), NOT z.any())
app/              → Next.js frontend (independent, not part of core build)
```

### Path Alias
`@/*` → `./*` (tsconfig paths). Safe to use in core source.

### TS Config Notes
- `routing/web-server.ts` is explicitly excluded from build (missing express/socket.io types)
- `test/` and `examples/` are excluded from tsc (ts-node handles them at runtime)

## CLI Tools
- **Agent REPL**: `pnpm cli -p <provider> -m <model>` (openai, ollama, groq, openrouter, google)
- **Debugger**: `npx ts-node cli-dev.ts [workflow.json]`

## Constraints
- Use native `fetch` (Node 18+). **No axios.**
- Use Zod v4+ syntax. Prefer `z.unknown()` over `z.any()`.
- `.env` auto-loaded by CLI; test suite does NOT preload dotenv

## Pre-existing Test Quirks
- Real LLM Ollama tests (`test/routing/real-llm.test.ts`) are flaky — Ollama occasionally returns `UNKNOWN` instead of the expected intent. Not caused by code changes.
