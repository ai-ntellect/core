# @ai.ntellect/core

An in-process workflow engine for Node.js/TypeScript. It lets you define workflows as graphs of nodes, where each node performs a specific task and can wait for events before proceeding. The entire runtime weighs only a few hundred lines and embeds directly in your application—no external services, no message queues, no infrastructure to manage.

## What this is useful for

You build applications that need to coordinate multiple steps with shared state. Instead of spaghetti callbacks or scattered service calls, you define a graph once and let the engine execute it. State is typed with Zod, so you get validation at every step. Events let you pause nodes and wait for external triggers—a payment confirmation, a user response, a webhook. The state is observable, so any part of your app can react to changes.

## What this is NOT

This is not a distributed orchestration system. It doesn't replay workflows across crashes, doesn't persist to a database by default, and doesn't scale across machines. For those needs, use Temporal or Inngest.

This is not an agent framework like LangGraph or Mastra. It provides the primitives (graphs, events, observable state) but doesn't dictate how you build AI agents. You can layer an agent on top if you want, but the core is generic.

## Installation

```sh
pnpm add @ai.ntellect/core zod
```

Requires TypeScript 5.x+ and Node.js 18+.

## Core Concepts

### GraphFlow

A GraphFlow is a workflow definition. It has a name, a schema that defines what the workflow state looks like, an initial context, and a list of nodes. Think of it as a function with internal state that executes in stages.

When you create a GraphFlow, you define the shape of all data that flows through the workflow using Zod. This isn't optional—every time the workflow moves between nodes, the context is validated. If something is the wrong type or fails a validation rule, the workflow throws immediately.

The nodes are the actual steps. Each node has a name and an execute function. This function receives the workflow context and can modify it. When a node finishes, the engine looks for the next node to run.

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// The schema defines the shape of your workflow state.
// Every field is validated when moving between nodes.
const Schema = z.object({
  message: z.string(),
});

// Create the workflow with initial values.
const workflow = new GraphFlow({
  name: "hello",
  schema: Schema,
  context: { message: "" },
  nodes: [
    {
      name: "greet",
      execute: async (ctx) => {
        ctx.message = "Hello!";
      },
    },
  ],
});

// Start execution at a specific node.
await workflow.execute("greet");

// The context now contains the modified values.
console.log(workflow.getContext().message); // "Hello!"
```

In a real application, nodes would fetch data from APIs, process payments, send notifications, or call databases. The engine handles the flow control—you just write the logic for each step.

### Sequential nodes

By default, a node runs once and the workflow ends. But nodes can declare the next node to execute using the `next` property. This creates a chain—node A runs, then node B runs, then node C runs, and so on.

The engine walks through the chain automatically. Each node receives the context modified by the previous node. You don't need to manually pass data around.

```typescript
nodes: [
  {
    name: "fetch_user",
    execute: async (ctx) => {
      // ctx.user is populated here
      ctx.user = await db.users.find(ctx.userId);
    },
    next: ["validate_user"], // after this, run validate_user
  },
  {
    name: "validate_user",
    execute: async (ctx) => {
      // ctx.user is available here
      if (!ctx.user.emailVerified) {
        throw new Error("User not verified");
      }
    },
    next: ["send_welcome"],
  },
  {
    name: "send_welcome",
    execute: async (ctx) => {
      // send email, etc.
    },
  },
]
```

You can point to multiple next nodes, but the engine picks the first one by default. For conditional branching, a node can inspect the context and decide what to do inside its execute function, or you can use event-driven nodes to pause and wait.

### Event-driven nodes

This is where the workflow engine becomes powerful. A node can pause and wait for an external event before executing. This is useful when you need to wait for something that happens outside the workflow—a webhook, a user action, a message from another service.

When a node has a `when` property, the engine stops there and subscribes to the specified events. It won't execute the node's code until the event arrives (or the timeout fires).

```typescript
{
  name: "await_payment",
  when: {
    // Listen for this event name
    events: ["payment.received"],
    // If no event arrives in 30 seconds, the node executes anyway
    timeout: 30000,
    // "single" means: execute as soon as ANY matching event arrives
    strategy: { type: "single" },
  },
  execute: async (ctx) => {
    // The event payload is available in the workflow context
    ctx.status = "paid";
  },
}
```

The `strategy` determines when the node executes:

- **`single`**: Execute when the first matching event arrives. Useful for "wait for payment, then proceed."

- **`all`**: Execute only when ALL listed events have arrived. Useful for "wait for payment AND inventory check, then proceed."

- **`correlate`**: Execute when all events match a correlation condition. This is for scenarios where multiple events must relate to the same entity—to correlate a payment with the right order, for example:

```typescript
{
  name: "validation",
  when: {
    events: ["payment.validated", "inventory.checked"],
    strategy: {
      type: "correlate",
      // Only proceed when both events have the same orderId
      correlation: (events) =>
        events.every(e => e.payload.orderId === events[0].payload.orderId),
    },
  },
}
```

In your application code, you emit events from wherever they happen—webhook handlers, message consumers, async operations:

```typescript
// Somewhere in your HTTP handler
workflow.emit("payment.received", {
  orderId: "123",
  amount: 99,
});
```

The workflow engine receives this, checks which nodes are waiting, and triggers the appropriate ones.

### Observable state

Workflow state isn't just for nodes. You can subscribe to changes from anywhere in your application using the observe API. This returns RxJS Observables that emit every time the context updates.

Subscribe to the entire context:

```typescript
workflow
  .observe()
  .state()
  .subscribe((ctx) => {
    console.log("Context changed:", ctx);
  });
```

Or subscribe to a single property for more targeted reactions:

```typescript
workflow
  .observe()
  .property("status")
  .subscribe((status) => {
    console.log("Status is now:", status);
  });
```

This is useful for building dashboards, logging, debugging, or triggering side effects in other parts of your app.

### Context validation

Every time the workflow moves between nodes, the context is validated against the Zod schema. If validation fails, the workflow throws and stops. This prevents bad state from propagating through your workflow.

```typescript
const Schema = z.object({
  count: z.number().min(0), // must be >= 0
  status: z.enum(["pending", "done"]),
});

// If at some point ctx.count becomes negative,
// the workflow throws here
await workflow.validate(ctx);
```

Validation runs automatically after every node executes. You can also manually validate at any point.

## Agent Module

The Agent module adds LLM capabilities. It wraps your GraphFlows as tools that an LLM can call. The LLM receives your prompts, decides which tool to use, extracts the necessary parameters, and the GraphFlow executes with those parameters.

This is not a full agent framework. It gives you a simple way to connect an LLM to your workflows. You define what the tools do, the LLM decides when to use them.

### LLM configuration

The agent needs to know which LLM to use. You configure the provider and model:

```typescript
// OpenAI
const llmConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
};

// Ollama (running locally)
const llmConfig = {
  provider: "ollama",
  model: "gemma4:4b",
  baseUrl: "http://localhost:11434",
};
```

`openai` and `ollama` are supported. The model string depends on your provider—Ollama model names are whatever you have installed locally, OpenAI model names are standard (`gpt-4o-mini`, `gpt-4o`, etc.).

### Creating an Agent

You create an Agent with a role (what it is), a goal (what it should do), and a list of tools (GraphFlows that it can call). The role and goal guide the LLM's behavior. You can also set `maxIterations` to limit how many think-execute cycles the agent runs.

```typescript
// First, define a tool as a GraphFlow
const CalcSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
  operation: z.enum(["add", "subtract"]).describe("Operation to perform"),
  result: z.number().optional(),
});

// Then wrap it in an Agent
const agent = new Agent({
  role: "Math Assistant",
  goal: "Help with calculations",
  tools: [calculator],
  maxIterations: 3, // limit think-execute cycles
  llmConfig: {
    provider: "ollama",
    model: "gemma4:4b",
  },
  verbose: true,
});
```

### How the Agent works

The Agent runs in a continuous loop: **think** → **execute** → **think** → **execute** until either there are no more actions to execute or `maxIterations` is reached (default: 5).

1. **Think** — The LLM decides which tools to call and with what parameters
2. **Execute** — The tools run and return results
3. Repeat

The agent tracks `executedActions` to avoid re-running the same tool call twice. You can access the full result:

```typescript
const result = await agent.process("What is 25 plus 7?");
console.log(result.response);     // The agent's final response
console.log(result.executedActions); // Array of { name, parameters, result }
```

Enable verbose mode to see the internal thinking in the console—useful for debugging.

The Agent handles the full round-trip: receiving the prompt, detecting intent, calling the tool with parameters, returning the result. You only define the tools, the LLM figures out how to use them.

The `.describe()` calls in your Zod schema become the tool descriptions that the LLM sees. Make them clear—`"First number"` is better than `"a"`.

### Running examples

```sh
pnpm run example:hello           # Simple workflow
pnpm run example:events         # Event-driven workflow
pnpm run example:agent         # Agent with tools
pnpm run example:agent-project  # Agent that creates files on disk
pnpm run example:native-tools  # Agent with native Node.js tools
```

All examples require either Ollama running locally or `OPENAI_API_KEY` set.

## Optional Modules

These modules extend the core with common patterns. They're all optional—import only what you need.

### Memory

A key-value store with pluggable adapters. Use this to persist workflow state across restarts, share state between workflows, or cache API responses.

```typescript
import { Memory, InMemoryAdapter } from "@ai.ntellect/core";

const memory = new Memory(new InMemoryAdapter());
await memory.init();

// Save a value
await memory.save("user_prefs", { theme: "dark" });

// Retrieve it later
const prefs = await memory.recall("user_prefs");
```

Available adapters:

| Adapter | Use case |
|---------|----------|
| `InMemoryAdapter` | Testing, ephemeral storage |
| `RedisAdapter` | Distributed apps, cross-instance sharing |
| `MeilisearchAdapter` | Semantic search, similarity recall |

```typescript
import { Memory, RedisAdapter } from "@ai.ntellect/core";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);
const memory = new Memory(new RedisAdapter(redis));
```

### Agenda

Schedule recurring tasks with cron expressions. The agenda runs in-process—when the cron matches, your task function executes.

```typescript
import { Agenda, NodeCronAdapter } from "@ai.ntellect/core";

const agenda = new Agenda(new NodeCronAdapter());

// Every hour
agenda.schedule("0 * * * *", async () => {
  console.log("Hourly task running");
});

// Named job for cancellation
agenda.schedule("daily_cleanup", "0 0 * * *", async () => {
  console.log("Daily cleanup");
});
```

Uses `node-cron` under the hood. Syntax follows standard cron conventions.

## Development

```sh
pnpm install
pnpm run test:all
pnpm run build
```

### Testing

Mocha + Chai + chai-as-promised + sinon:

```sh
pnpm run test        # Single run
pnpm run test:all   # All test suites
pnpm run test:coverage
pnpm run test:watch
```

### CLI

Run agents interactively from the terminal. The CLI includes built-in tools for file operations, command execution, and environment inspection:

```sh
pnpm cli --provider ollama --model gemma4:4b --role "Assistant"
pnpm cli --provider openai --api-key sk-xxx "Coding Assistant"
```

Supported providers: `openai`, `ollama`. Default models vary by provider.

Options:
- `-p, --provider` — LLM provider (openai, ollama)
- `-m, --model` — model name
- `-b, --base-url` — API base URL
- `--api-key` — API key
- `-r, --role` — agent role
- `-g, --goal` — agent goal
- `-v, --verbose` — verbose output

## License

MIT