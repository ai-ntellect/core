# AGENTS.md

## Project Overview
- **Package**: `@ai.ntellect/core` - In-process workflow engine for Node.js/TypeScript
- **Package Manager**: pnpm (v10.33.0 enforced via `packageManager` field)

## Commands

```sh
pnpm install              # Install dependencies
pnpm run build           # TypeScript compile to dist/
pnpm run test            # Single test run (Mocha)
pnpm run test:all        # Run all tests
pnpm run test:coverage   # Coverage with nyc
pnpm run test:watch      # Watch mode (all tests)
pnpm run test:watch:graph  # Watch mode (graph tests only)
```

## CLI

```sh
pnpm cli --provider ollama --model gemma4:e4b --role "Assistant"
pnpm cli --provider openai --api-key sk-... "My Assistant"
```

Options: `-p/--provider`, `-m/--model`, `-b/--base-url`, `--api-key`, `-r/--role`, `-g/--goal`, `-v/--verbose`, `-h/--help`

## Run Examples

```sh
pnpm run example:hello    # Simple graph example
pnpm run example:events   # Event-triggered workflow
pnpm run example:agent    # Agent with tools
```

## Testing
- **Framework**: Mocha + Chai + chai-as-promised + sinon
- **Config**: `.mocharc.json` (5000ms timeout)
- **Test pattern**: `test/**/*.test.ts`
- **Note**: Tests run via ts-node (no transpilation needed)

## Build Output
- **Source**: `index.ts`, `modules/`, `graph/`, `types/`, `interfaces/`, `utils/`
- **Exclude from build**: `test/`, `examples/` (see tsconfig.json)
- **OutDir**: `dist/`

## CI Pipeline
1. `pnpm install --frozen-lockfile`
2. `pnpm run test:all`
3. `pnpm run build`
