# Building Your First Workflow

In this guide, we'll move from a single node to a **complete pipeline**. We will build a data processing workflow that retrieves, transforms, and logs information.

## 🏗️ The Blueprint

We want to create a three-step process:
`Retrieve Data` $\rightarrow$ `Transform to Uppercase` $\rightarrow$ `Log Result`

### 1. Define the State (Schema)
The **Schema** is the most important part of a GraphFlow. It acts as a contract. If a node tries to set a value that doesn't match the schema, the workflow will throw an error immediately.

```typescript
import { z } from "zod";

const DataSchema = z.object({
  rawInput: z.string(),
  processedData: z.string().optional(),
  finalResult: z.string().optional(),
});
```

### 2. Define the Nodes
Each node is a discrete unit of logic. We use the `next` property to define the path.

```typescript
const retrieveNode = {
  name: "retrieve",
  execute: async (ctx) => {
    ctx.rawInput = "deterministic orchestration is powerful";
  },
  next: "transform", // Go to 'transform' next
};

const transformNode = {
  name: "transform",
  execute: async (ctx) => {
    ctx.processedData = ctx.rawInput.toUpperCase();
  },
  next: "log", // Go to 'log' next
};

const logNode = {
  name: "log",
  execute: async (ctx) => {
    ctx.finalResult = `SUCCESS: ${ctx.processedData}`;
    console.log(ctx.finalResult);
  },
};
```

### 3. Assemble the GraphFlow

```typescript
import { GraphFlow } from "@ai.ntellect/core";

const workflow = new GraphFlow({
  name: "DataPipeline",
  schema: DataSchema,
  context: { rawInput: "", processedData: "", finalResult: "" },
  nodes: [retrieveNode, transformNode, logNode],
});

await workflow.execute("retrieve");
```

---

## ⚡ Advanced Routing: Dynamic Branching

In the real world, workflows aren't always linear. You can make the `next` property a **function** to create conditional logic.

**Example: High-Value Path**
```typescript
const checkAmount = {
  name: "checkAmount",
  execute: async (ctx) => {
    ctx.amount = 150;
  },
  next: (ctx) => {
    return ctx.amount > 100 ? ["premium_flow"] : ["standard_flow"];
  },
};

// Now the workflow splits based on the value of 'amount'
```

## 🚀 Summary
You've just built a deterministic pipeline. Unlike a standard script, this workflow is:
1. **Observable**: You can track exactly which node is running.
2. **Type-Safe**: Zod ensures your data is always correct.
3. **Extensible**: You can add a "Retry" or "Checkpoint" to any node without rewriting the whole logic.
