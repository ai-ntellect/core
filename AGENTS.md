# AGENTS.md

## Project Overview
- **Package**: `@ai.ntellect/core` v0.12.0
- **Core Thesis**: Deterministic control over LLM agents. LLM as **Classifier** (Intent) $\rightarrow$ Petri Net as **Controller** (Routing) $\rightarrow$ GraphFlow as **Executor** (Logic).
- **Package Manager**: pnpm v10.33.0
- **CI Order**: `install --frozen-lockfile` $\rightarrow$ `test:all` $\rightarrow$ `build`

## Commands
```sh
pnpm install                    # Installs & builds (via prepare script)
pnpm run build                  # tsc → dist/
pnpm test                       # Mocha tests (5000ms timeout)
pnpm run test:all               # Runs all tests in test/**/*.test.ts
pnpm test --grep "suite name"    # Run specific suite
```

## Architecture
- `graph/`: **GraphFlow** — Typed graphs, nodes, events. Entry point for execution.
- `petri/`: **CortexFlow** — Intent classification & Petri Net orchestration.
- `pipeline/`: **AgentPipeline** — Declarative pipelines with triggers and human gates.
- `modules/`: Pluggable extensions:
  - `agent/`: LLM agent with GraphFlow tools.
  - `memory/`: Persistent state (InMemory, Redis, Meilisearch).
  - `agenda/`: Cron scheduling.
  - `nlp/`: @nlpjs/basic wrappers.
- `interfaces/` & `types/`: Contract interfaces and Zod schemas.
- `app/`: Next.js frontend (independent of core build).

**Key Aliases**: `@/*` $\rightarrow$ root.
**TS Include**: Includes all core logic; excludes `test/`, `examples/`, `petri/` (some), `app/`.

## CLI Tools
### Agent REPL
`pnpm cli -p <provider> -m <model>` (Providers: `openai`, `ollama`, `groq`, `openrouter`, `google`)
- **Key Commands**: `/status`, `/history`, `/list`, `/resume [cpId]`, `/approve`, `/reject`, `/modify k=v`.
- **Auth**: Auto-loads `.env` for API keys.

### Petri Debugger
`npx ts-node cli-dev.ts [workflow.json]`
- **Commands**: `load`, `show`, `enabled`, `step`, `auto`, `inject`, `history`, `dot`, `reset`.

### Documentation Generator
`npx ts-node scripts/generate-petri-docs.ts <petri-net.json> [output-dir]`
- Generates Mermaid diagrams and Markdown/HTML docs for Petri Nets.

## Key Patterns & Implementation
### 1. Deterministic Routing
Avoid LLM-driven routing loops. Use:
`User` $\rightarrow$ `IntentClassifier` $\rightarrow$ `PetriNet` $\rightarrow$ `GraphFlow`.

### 2. Plan $\rightarrow$ Compile $\rightarrow$ Execute
LLM generates a Zod-validated JSON plan $\rightarrow$ Compiled to a `GraphFlow` $\rightarrow$ Executed.

### 3. AgentPipeline (v0.12.0+)
Declarative pipelines with `Trigger` $\rightarrow$ `Stage[]` $\rightarrow$ `Gate` (human/auto).

### 4. Development Constraints
- **Network**: Use native `fetch` (Node 18+). **Do not use axios**.
- **Validation**: Use Zod v4+ syntax. Prefer `z.unknown()` over `z.any()`.

## Testing & Verification
- **Framework**: Mocha + Chai + Sinon.
- **Real LLM Tests**: `pnpm test --grep "CortexFlow Real LLM"` (Requires Ollama `llama3:latest` at `localhost:11434`).
- **Onchain Tests**: `test/graph/plan-real-onchain.test.ts` (Requires Sepolia env).
- **Pipeline Tests**: `test/pipeline/agent-pipeline.test.ts`.

## Environment & Setup
- **Local LLM**: Ollama available at `localhost:11434`.
- **Blockchain**: Sepolia testnet keys in `.env`.
- **Google API**: `client_secret.json` (root) and `gmail_token.json` (generated via `scripts/get-gmail-token.ts`).
