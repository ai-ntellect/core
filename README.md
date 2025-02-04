# @ai.ntellect/core

A powerful framework for building AI-powered applications with graph-based workflows, memory management, and embedding services.

## Features

- 🔄 **Graph-based workflow engine**: Build complex, type-safe workflows with retry mechanisms and error handling
- 🧠 **Memory management**: Store and retrieve AI-related data with multiple storage adapters (Meilisearch, Redis)
- 🔍 **Embedding services**: Generate and compare text embeddings for semantic search and similarity matching
- ⏰ **Task scheduling**: Schedule and manage recurring tasks with cron expressions

## Installation

```bash
npm install @ai.ntellect/core
```

## Core components

The Graph system is the heart of the framework, enabling dynamic and highly flexible workflows.

### Basic graph structure

```typescript
import { Graph, GraphContext } from "@ai.ntellect/core";
import { z } from "zod";

// Context Schema Definition
const contextSchema = z.object({
  input: z.string(),
  result: z.number().optional(),
  error: z.string().optional(),
});

// Graph Creation
const workflow = new Graph("processWorkflow", {
  name: "workflow",
  nodes: [
    {
      name: "inputValidation",
      execute: async (context) => {
        if (context.input.length < 3) {
          context.error = "Input too short";
        }
      },
      next: ["processing"],
    },
    {
      name: "processing",
      condition: (context) => !context.error,
      execute: async (context) => {
        context.result = context.input.length;
      },
      next: ["finalValidation"],
    },
    {
      name: "finalValidation",
      execute: async (context) => {
        if (context.result && context.result < 10) {
          context.error = "Result too small";
        }
      },
    },
  ],
  initialContext: {
    input: "",
    result: undefined,
    error: undefined,
  },
  validator: contextSchema,
  globalErrorHandler: (error, context) => {
    console.error("Global error:", error);
  },
});
```

## Advanced graph features

### 1. Nodes with conditions

Add sophisticated conditions for node execution:

```typescript
{
  name: "conditionalNode",
  // Execute the node only if the condition is met
  condition: (context) => context.result > 10,
  execute: async (context) => {
    // Conditional logic
  }
}
```

### 2. Error handling

```typescript
{
  name: "unreliableOperation",
  retry: {
    // Maximum number of attempts
    maxAttempts: 3,
    // Delay between attempts
    delay: 1000 // 1 second
  },
  execute: async (context) => {
    // Potentially unstable operation
  },
  // Node-specific error handler
  onError: (error) => {
    console.warn("Node error:", error);
  }
}
```

### 3. Dynamic and parallel execution

```typescript
// Execute multiple graphs in parallel
const results = await GraphController.executeParallel(
  [graph1, graph2, graph3],
  ["startNode1", "startNode2", "startNode3"],
  [context1, context2, context3],
  undefined, // parameters
  3 // concurrency limit
);
```

### 4. Events

```typescript
workflow.on("nodeCompleted", (data) => {
  console.log(`Node ${data.nodeName} completed`);
});

// Emit custom events
await workflow.emit("customEvent", {
  additionalData: "value",
});
```

### 5. Dynamic graph modification

```typescript
// Dynamically add nodes
workflow.addNode({
  name: "newNode",
  execute: async (context) => {
    // New logic
  },
});

// Remove nodes
workflow.removeNode("obsoleteNode");
```

### 6. Context validation with Zod

Use Zod for runtime context validation:

```typescript
const strictContextSchema = z.object({
  // Define precise rules
  input: z.string().min(3).max(100),
  result: z.number().positive(),
  timestamp: z.date(),
});

const workflow = new Graph("strictWorkflow", {
  // The validator will check each context modification
  validator: strictContextSchema,
});
```

## Complete example: Data processing workflow

```typescript
const dataProcessingWorkflow = new Graph("dataProcessor", {
  nodes: [
    {
      name: "dataFetch",
      execute: async (context) => {
        context.rawData = await fetchData();
      },
      next: ["dataValidation"],
    },
    {
      name: "dataValidation",
      condition: (context) => context.rawData.length > 0,
      execute: async (context) => {
        context.validatedData = validateData(context.rawData);
      },
      next: ["dataTransformation"],
    },
    {
      name: "dataTransformation",
      execute: async (context) => {
        context.processedData = transformData(context.validatedData);
      },
      next: ["dataStorage"],
    },
    {
      name: "dataStorage",
      execute: async (context) => {
        await storeData(context.processedData);
      },
    },
  ],
});
```

## Key points

- **Total flexibility**: Create complex workflows with great freedom
- **Type safety**: Runtime context and parameter validation
- **Dynamic management**: Modify graphs during execution
- **Resilience**: Integrated retry and error handling mechanisms

## GraphController: Advanced execution strategies

### Sequential execution

```typescript
const sequentialResults = await GraphController.executeSequential(
  [graph1, graph2],
  ["startNode1", "startNode2"],
  [context1, context2]
);
```

### Parallel execution with concurrency control

```typescript
const parallelResults = await GraphController.executeParallel(
  multipleGraphs,
  startNodes,
  inputContexts,
  inputParams,
  3 // Maximum 3 graphs executing simultaneously
);
```

## Performance considerations

- Use `executeParallel` for independent workflows
- Implement appropriate concurrency limits
- Monitor context size and complexity
- Leverage Zod for efficient runtime validation
