# @ai.ntellect/core

@ai.ntellect/core is a modular and event-driven framework designed to orchestrate and execute intelligent workflows using execution graphs. It enables automation of complex tasks, seamless integration with external services, and the creation of AI-driven agents in a flexible and scalable way.

## Key features

- **GraphFlow** – A graph-based execution engine for automating business processes.
- **Event-Driven** – Nodes can react to real-time events and trigger actions dynamically.
- **Modular** – Plug-and-play modules and adapters for memory, scheduling, and external APIs.
- **Extensible** – Custom nodes, adapters, and interactions with third-party services.
- **Scalable** – Manage multiple graphs in parallel with GraphController.

## Installation

### Prerequisites

- Node.js (LTS version recommended)
- TypeScript
- Zod (for data validation)

Verify your installation:

```sh
node -v
npm -v
```

If Node.js is not installed, download it from [nodejs.org](https://nodejs.org/).

### Installing the framework

Create a new Node.js project:

```sh
mkdir ai-ntellect-demo
cd ai-ntellect-demo
npm init -y
```

Install TypeScript and Node.js types:

```sh
npm install --save-dev typescript @types/node
npx tsc --init
```

Install @ai.ntellect/core and its dependencies:

```sh
npm install @ai.ntellect/core zod
```

## Verifying the Installation

Create a new file `index.ts`:

```sh
touch index.ts
```

Add the following code to test a simple graph execution:

```ts
import { GraphFlow } from "@ai.ntellect/core";
import { z } from "zod";

const ContextSchema = z.object({
  message: z.string(),
});

type ContextSchema = typeof ContextSchema;

const myGraph = new GraphFlow<ContextSchema>("TestGraph", {
  name: "TestGraph",
  context: { message: "Installation successful!" },
  schema: ContextSchema,
  nodes: [
    {
      name: "printMessage",
      execute: async (context) => {
        console.log(context.message);
      },
      next: [],
    },
  ],
});

(async () => {
  await myGraph.execute("printMessage");
})();
```

Run the test:

```sh
npx ts-node index.ts
```

Expected output:

```
Installation successful!
```

## Core concepts

### GraphFlow

GraphFlow is the core execution engine that automates workflows through graph-based logic. Each node in the graph can:

- Execute a specific action.
- Wait for an event before proceeding.
- Depend on conditional logic.
- Modify a shared execution context.

### GraphController

GraphController orchestrates multiple GraphFlows, enabling:

- Sequential or parallel execution of multiple graphs.
- Inter-graph communication for complex workflows.
- Advanced event-based automation.

### Modules and Adapters

The framework provides modular extensions:

- **Memory Module** – Stores and retrieves contextual information.
- **Scheduler (Agenda)** – Manages task scheduling and timed executions.
- **Adapters** – Integrate with databases, APIs, and external services.

## Tutorials

Step-by-step guides are available for:

- Creating a simple graph
- Adding conditions and handling errors
- Waiting for events and executing multiple graphs
- Building an AI-powered agent with @ai.ntellect/core

Check out the complete documentation at [GitBook](https://ai-ntellect.gitbook.io/core).

## Contributing

Contributions are welcome. To suggest an improvement or report an issue:

- Join our [Discord community](https://discord.gg/kEc5gWXJ)
- Explore the [GitBook documentation](https://ai-ntellect.gitbook.io/core)
- Open an issue on GitHub

## Useful links

- Documentation: [GitBook](https://ai-ntellect.gitbook.io/core)
- Community: [Discord](https://discord.gg/kEc5gWXJ)
- GitHub Repository: [@ai.ntellect/core](https://github.com/ai-ntellect/core)
