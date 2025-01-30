# @ai.ntellect/core

---

## Introduction

**@ai.ntellect/core** is a highly extensible, graph-based workflow framework designed to tackle complex automation scenarios, pipelines, AI-driven agent flows, and even blockchain process orchestration. By modeling your processes as **Graphs** composed of **Nodes**, you can intuitively define both sequential and parallel task execution. The framework provides robust features including:

- **Dynamic state management** with optional schema validation
- **Parallel and conditional branching** execution
- **Controller-based orchestration** of multiple workflows
- **Subgraph** delegation for modular design
- **Memory management** for agents and chatbots (e.g., storing user context or embeddings)
- **Integration** with real-time notifiers and persistence layers

Whether you’re building a data pipeline, an AI-driven bot, or an automated blockchain process, @ai.ntellect/core offers a concise yet powerful suite of tooling to handle the complexity of stateful, event-driven orchestration.

---

## Installation

### Prerequisites

- **Node.js** (14.x or higher recommended)
- A package manager such as **npm** or **yarn**

### Installing the package

```bash
npm install @ai.ntellect/core
```

Or using Yarn:

```bash
yarn add @ai.ntellect/core
```

Or using pnpm:

```bash
pnpm add @ai.ntellect/core
```

### Initial configuration

- **Import the necessary classes**:

  ```ts
  import { GraphEngine, GraphController } from "@ai.ntellect/core";
  ```

- **(Optional) Define your state schema** using a validation library like [Zod](https://zod.dev) to ensure your data remains consistent throughout workflow execution.
- **Configure** advanced features (e.g., persistence, notifications, memory services) before running your workflows.

---

## Core concepts

@ai.ntellect/core revolves around the idea of **Graphs** and **Nodes**. On top of these concepts, the framework provides a powerful **Engine**, a high-level **Controller**, and optional **Memory** management for specialized use cases (like AI agents). This section explores each concept in detail.

### Graph

A **Graph** is a directed structure describing a workflow. It consists of:

- **Nodes**: the tasks or steps in your workflow
- **Edges (relationships)**: transitions from one node to another

You define a **Graph** via a `GraphDefinition`, specifying:

1. A unique **name** for the graph
2. An **entryNode** (starting point)
3. A map of **node objects** (each one describes a single node’s logic and transitions)

#### Why use graphs?

- **Clear visualization**: easily see the flow of tasks, including parallel branches.
- **Condition-based transitions**: skip or filter nodes on the fly.
- **Subgraph usage**: encapsulate common flows for reuse.

#### Example of a simple graph definition

```ts
const myGraphDefinition = {
  name: "my-simple-graph",
  entryNode: "start",
  nodes: {
    start: {
      name: "start",
      execute: async (_params, state) => {
        return { context: { ...state.context, status: "initialized" } };
      },
      relationships: [{ name: "process" }],
    },
    process: {
      name: "process",
      execute: async (_params, state) => {
        // do something
        return { context: { ...state.context, processed: true } };
      },
      relationships: [{ name: "finish" }],
    },
    finish: {
      name: "finish",
      execute: async (_params, state) => state,
      relationships: [],
    },
  },
};
```

### Node

A **Node** is a fundamental unit of work within a graph. Each node defines:

- **name**: a unique identifier within the graph
- **execute**: the asynchronous function that implements the node’s logic
- **condition** (optional): a function returning a boolean determining if this node should run
- **relationships**: an array of transitions to subsequent nodes
- **events** (optional): an array of event names that can trigger the node (bypassing usual transitions)

#### Listening to events

Besides sequential or parallel execution, a node can listen to custom events:

```ts
{
  name: "eventDrivenNode",
  events: ["USER_CREATED"],
  execute: async (params, state) => {
    console.log("User created:", params);
    return state;
  },
}
```

If the **Engine** later calls `engine.emit("USER_CREATED", {...})`, this node will be triggered. This mechanism is extremely powerful for event-driven architectures (e.g., a chatbot responding to user events, or a blockchain node responding to on-chain events).

### GraphEngine

#### Overview

The **GraphEngine** (often shortened to “engine”) is responsible for:

- Loading a `GraphDefinition`
- Executing its nodes according to **relationships** and optional **conditions**
- Handling **state** updates after each node execution
- Managing **event** emissions and listening for event-driven nodes
- Allowing **parallel** or **sequential** node execution
- Managing **subgraphs** if your workflow references external graph definitions

```ts
import { GraphEngine } from "ai.ntellect/core";

const engine = new GraphEngine(myGraphDefinition);
await engine.execute({ context: { user: "Alice" } }, "start");
```

### GraphController

#### Overview

The **GraphController** provides a **high-level orchestration** mechanism for multiple graphs. Instead of running a single workflow, you can define **actions**—each tied to a particular workflow—and the controller executes them in sequence (or other patterns) based on your configuration.

```ts
import { GraphController } from "ai.ntellect/core";

const controller = new GraphController<any>();
const resultState = await controller.run(
  [
    {
      name: "my-simple-graph",
      parameters: [
        { name: "user", value: "Alice" },
        { name: "count", value: 10 },
      ],
    },
  ],
  [myGraphDefinition, someOtherGraphDef]
);

console.log(resultState);
// => final state after running 'my-simple-graph'
```

**Use cases**:

- **Batch execution** of multiple workflows
- **Multi-tenant** orchestration where each tenant’s configuration is an “action”
- **Chained flows**: run workflow A, then run workflow B with the result of A

### Memory management

In advanced workflows, especially with chatbots or AI agents, you might want to maintain a **memory** of previous interactions or references. @ai.ntellect/core accommodates this via an abstract class **BaseMemory** and a dedicated **BaseMemoryService** for storing and retrieving data. This can be used to store embeddings, historical context, or any ephemeral data needed for your workflows.

```ts
import { BaseMemory } from "ai.ntellect/core";

// Example concrete class
class MyMemory extends BaseMemory {
  async init(): Promise<void> {
    /*...*/
  }
  async createMemory(input): Promise<BaseMemoryType | undefined> {
    /*...*/
  }
  async getMemoryById(id, roomId): Promise<BaseMemoryType | null> {
    /*...*/
  }
  // ... other methods
}
```

**Possible storage backends**:

- In-memory
- Redis / Key-value stores
- SQL / NoSQL databases

**Key benefits**:

- Store query embeddings for AI-based search
- Maintain user session context (e.g., conversation flows)
- Rapidly retrieve and update relevant data at runtime

---

## Advanced usage and features

### Subgraphs for modularity

Nodes can delegate execution to a **subgraph**, enabling large workflows to be broken into reusable components:

```ts
const subGraphEngine = new GraphEngine(subGraphDef);
mainGraphEngine.addSubGraph(subGraphEngine, "sub-start", "sub-workflow");
```

**Why subgraphs**:

- **Reusability**: common routines can be maintained independently
- **Maintainability**: isolate large logic in smaller workflows

### Parallel execution

The `executeParallel` method allows you to simultaneously run multiple nodes that don’t have direct dependencies on each other. You can limit concurrency to prevent overwhelming external resources:

```ts
await engine.executeParallel(
  { context: { userId: 42 } },
  ["nodeA", "nodeB", "nodeC"],
  2 // concurrency limit
);
```

### Real-time notifications and events

By attaching a **RealTimeNotifier**, each node’s start, completion, or error can be broadcast to external systems (WebSocket, Slack, logging, etc.):

```ts
const notifier = {
  notify: (event, data) => {
    console.log(`[NOTIFY] ${event}`, data);
  },
};
engine.setNotifier(notifier);
```

### Persistence and error recovery

For long-running or mission-critical workflows, implement a **Persistence** interface:

```ts
const myPersistence = {
  saveState: async (graphName, state, currentNode) => {
    /* store in DB */
  },
  loadState: async () => {
    /* retrieve from DB */ return null;
  },
};
engine.setPersistence(myPersistence);
```

If a workflow fails, you can reload from the last checkpoint and resume execution.

---

## Example: agent workflow with memory

Below is an example `createMainGraph` definition demonstrating how you can structure an AI or chatbot-like agent using a controller node, agenda scheduling, interpretation, and memory storage. This pattern is useful in:

- **Chatbots** handling complex dialogues
- **AI reasoning systems** that need to store partial results
- **Planning agents** that schedule tasks or actions asynchronously

```ts
import { GraphDefinition } from "@/types";
// Assume Agent, MyContext, isNotStopped, shouldRetry, etc. are defined

export const createMainGraph = (
  agent: Agent,
  prompt: string,
  callbacks?: any
): GraphDefinition<MyContext> => ({
  name: "agent",
  entryNode: "orchestrator",
  nodes: {
    orchestrator: {
      name: "orchestrator",
      description: "Make a decision following the current context",
      execute: async () => {
        /* your orchestrator logic */
      },
      condition: (state) => isNotStopped(state) || shouldRetry(state),
      relationships: [
        { name: "controller", description: "Execute multiple workflows" },
        { name: "agenda", description: "Schedule actions for the future" },
        {
          name: "interpreter",
          description: "Interpret the results of actions",
        },
      ],
    },
    controller: {
      name: "controller",
      description: "Execute multiple workflows if available",
      execute: async () => {
        /* handle or queue workflow actions */
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return hasActions(currentState) && isNotStopped(currentState);
      },
      relationships: [{ name: "orchestrator" }],
    },
    agenda: {
      name: "agenda",
      description: "Schedule actions for the future",
      execute: async () => {
        /* handle scheduling logic */
      },
      condition: hasActions,
    },
    interpreter: {
      name: "interpreter",
      description: "Interpret the results of the actions",
      execute: async () => {
        /* interpret results, maybe using memory */
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return (
          isInterpreterDefined(currentState) &&
          isResultsDefined(currentState) &&
          isStopped(currentState)
        );
      },
      relationships: [{ name: "memory", description: "Save memory" }],
    },
    memory: {
      name: "memory",
      description: "Save memory",
      execute: async () => {
        /* store or retrieve conversation states */
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return isResultsDefined(currentState);
      },
    },
  },
});
```

This structure highlights how an **Agent** can leverage the **GraphEngine** for decision-making, scheduling tasks, interpreting outcomes, and ultimately storing relevant data in memory before concluding.

---

## Real-world use cases

1. **Automation**: Orchestrate tasks like file processing, data validation, and uploading in a single graph.
2. **Data pipeline**: Stream logs into a transformation flow with parallel processing and conditional branches.
3. **AI bots**: Manage conversation state, memory, and advanced decision trees for chat-based agents.
4. **Blockchain**: Sequence complex contract interactions, handle parallel on-chain calls, and revert safely on errors.
5. **Task scheduling**: Combine GraphController with multiple workflows to handle enterprise-wide daily or weekly tasks.

---

## Conclusion

@ai.ntellect/core offers a **comprehensive**, **modular**, and **event-driven** environment to model, execute, and extend workflows of any complexity. By leveraging **Graphs** and **Nodes** alongside robust tooling such as **GraphEngine**, **GraphController**, and **Memory** services, you can adapt the framework to fit an array of domains, from classic data pipelines to cutting-edge AI agent systems.

### Key points to remember

- **Graphs** define the structure of your workflow; **Nodes** encapsulate the logic.
- **GraphEngine** executes a single graph, handling state, conditions, and events.
- **GraphController** orchestrates multiple graphs in a higher-level scope.
- **Memory** management supports advanced agent use cases, storing embeddings or conversation history.
- **Parallel execution**, **subgraphs**, **real-time notifications**, and **persistence** provide powerful abstractions to scale with your needs.

For more in-depth guides, examples, or to contribute, visit our repository or consult the extended documentation. If you need specialized solutions—like a custom memory store or a unique scheduling system—**@ai.ntellect/core**’s open architecture makes it straightforward to extend or integrate with your existing stack.

Use it for automation, AI bots, blockchain interactions, or any stateful workflow that demands reliability, flexibility, and clarity.
