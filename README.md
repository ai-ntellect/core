# @ai.ntellect/core

@ai.ntellect/core is a modular and event-driven framework designed to orchestrate and execute intelligent workflows using execution graphs. It enables automation of complex tasks, seamless integration with external services, and the creation of AI-driven agents in a flexible and scalable way.

## Features

- **GraphFlow** – Graph-based execution engine for automating business processes
- **Event-Driven** – Nodes can react to real-time events and trigger actions dynamically
- **Modular** – Plug-and-play modules and adapters for memory, scheduling, and external APIs
- **Extensible** – Custom nodes, adapters, and interactions with third-party services
- **Observable** – Complete state and event monitoring

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

### Installing the framework

```sh
npm install @ai.ntellect/core zod
```

## Example

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// Define context schema
const ContextSchema = z.object({
  message: z.string(),
  counter: z.number(),
});

// Create graph instance
const graph = new GraphFlow<typeof ContextSchema>("MyGraph", {
  name: "MyGraph",
  schema: ContextSchema,
  context: { message: "Hello", counter: 0 },
  nodes: [
    {
      name: "incrementCounter",
      execute: async (context) => {
        context.counter++;
      },
      next: ["checkThreshold"],
    },
    {
      name: "checkThreshold",
      condition: (context) => context.counter < 5,
      execute: async (context) => {
        if (context.counter >= 5) {
          context.message = "Threshold reached!";
        }
      },
      next: ["incrementCounter"],
      retry: {
        maxAttempts: 3,
        delay: 1000,
      },
    },
  ],
});

// Observe state changes
(async () => {
  // Execute the graph
  graph.execute("incrementCounter");
  graph.observe().state().subscribe(console.log);
})();
```

## Features

### Event handling

```typescript
// Event-driven node
{
  name: "waitForEvent",
  events: ["dataReceived"],
  execute: async (context, event) => {
    context.data = event.payload;
  }
}

// Emit events
graph.emit("dataReceived", { value: 42 });
```

### State observation

```typescript
// Observe specific node
graph.observe().node("myNode").subscribe(console.log);

// Observe specific properties
graph.observe().property("counter").subscribe(console.log);

// Observe events
graph.observe().event("nodeCompleted").subscribe(console.log);
```

## Documentation

For complete documentation, visit our [GitBook](https://ai-ntellect.gitbook.io/core).

## Contributing

Contributions are welcome! To suggest an improvement or report an issue:

- Join our [Discord community](https://discord.gg/kEc5gWXJ)
- Explore the [GitBook documentation](https://ai-ntellect.gitbook.io/core)
- Open an issue on GitHub

## Useful links

- Documentation: [GitBook](https://ai-ntellect.gitbook.io/core)
- Community: [Discord](https://discord.gg/kEc5gWXJ)
- GitHub Repository: [@ai.ntellect/core](https://github.com/ai-ntellect/core)
