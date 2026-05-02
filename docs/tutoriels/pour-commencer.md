# Quick Start Guide

Welcome to **@ai.ntellect/core**. This guide will take you from zero to your first deterministic workflow in less than 5 minutes.

## 1. Installation

Install the core package and Zod (used for state validation):

```sh
pnpm add @ai.ntellect/core zod
```

## 2. Your First Workflow: "Hello World"

The basic unit of execution in this framework is the `GraphFlow`. Create a file named `index.ts`:

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// 1. Define the state shape (This ensures your agent never crashes due to missing data)
const Schema = z.object({
  message: z.string(),
});

// 2. Define the workflow
const workflow = new GraphFlow({
  name: "hello-world",
  schema: Schema,
  context: { message: "" },
  nodes: [
    {
      name: "greet",
      execute: async (ctx) => {
        ctx.message = "Hello from @ai.ntellect/core!";
        console.log("Node 'greet' executed.");
      },
    },
  ],
});

// 3. Run it
async function run() {
  await workflow.execute("greet");
  console.log("Final State:", workflow.getContext().message);
}

run();
```

## 3. Running the code

Use `ts-node` to execute your TypeScript file directly:

```sh
pnpm ts-node index.ts
```

**Expected Output:**
```text
Node 'greet' executed.
Final State: Hello from @ai.ntellect/core!
```

---

## 🧭 What's Next?

Now that you've run a simple node, it's time to explore the real power of the framework:

- **Want to chain multiple steps?** $\rightarrow$ [Build a Simple Graph](./creer-un-graphe-simple.md)
- **Want to add an LLM?** $\rightarrow$ [Create a Tool-Using Agent](./creer-un-agent.md)
- **Want to handle real-world events?** $\rightarrow$ [Explore Event-Driven Nodes](../core/les-evenements.md)
