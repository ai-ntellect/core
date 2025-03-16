# @ai.ntellect/core

@ai.ntellect/core is a modular and event-driven framework designed to orchestrate and execute intelligent workflows using execution graphs. It enables automation of complex tasks, seamless integration with external services, and the creation of AI-driven agents in a flexible and scalable way.

## Features

- **GraphFlow** – Graph-based execution engine for automating business processes
- **AI Agents** – Built-in support for LLM-powered agents with memory and tools
- **Event-Driven** – Nodes can react to real-time events and trigger actions dynamically
- **Modular** – Plug-and-play modules and adapters for memory, scheduling, and external APIs
- **Extensible** – Custom nodes, adapters, and interactions with third-party services
- **Observable** – Complete state and event monitoring
- **Type-Safe** – Built with TypeScript for robust type checking
- **Schema Validation** – Integrated Zod schema validation
- **Retry Mechanisms** – Built-in retry strategies for resilient workflows
- **Event Correlation** – Advanced event handling with correlation strategies

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

## Quick Start

### 1. Basic Workflow

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { z } from "zod";

// Define schema
const EmailSchema = z.object({
  to: z.string(),
  subject: z.string(),
  content: z.string(),
  status: z.string().default("pending"),
});

// Create workflow
const emailFlow = new GraphFlow("email", {
  name: "email",
  schema: EmailSchema,
  context: {
    to: "",
    subject: "",
    content: "",
    status: "pending",
  },
  nodes: [
    {
      name: "send",
      execute: async (context) => {
        console.log(`Sending email to ${context.to}`);
        // Logic to send email
        context.status = "sent";
      },
    },
  ],
});
```

### 2. AI-Powered Assistant

```typescript
import { Agent } from "@ai.ntellect/core";

const assistant = new Agent({
  role: "Email Assistant",
  goal: "Help users send emails efficiently",
  backstory: "I am an AI assistant specialized in email communications",
  tools: [emailFlow],
  llmConfig: {
    provider: "openai",
    model: "gpt-4",
    apiKey: "YOUR_API_KEY",
  },
});

// Use the assistant
const result = await assistant.process(
  "Send an email to john@example.com about tomorrow's meeting"
);
```

## Advanced Features

### Event Handling

```typescript
const workflow = new GraphFlow("notification", {
  nodes: [
    {
      name: "waitForEvent",
      events: ["emailSent"],
      execute: async (context, event) => {
        console.log(`Email sent to ${event.payload.recipient}`);
      },
    },
  ],
});

// Emit events
workflow.emit("emailSent", { recipient: "john@example.com" });
```

### Retry Mechanisms

```typescript
const node = {
  name: "sendEmail",
  execute: async (context) => {
    // Email sending logic
  },
  retry: {
    maxAttempts: 3,
    delay: 1000,
    onRetryFailed: async (error, context) => {
      console.error(`Failed to send email to ${context.to}`);
    },
  },
};
```

### State Observation

```typescript
// Observe specific properties
workflow
  .observe()
  .property("status")
  .subscribe((status) => {
    console.log(`Email status changed to: ${status}`);
  });

// Observe specific nodes
workflow
  .observe()
  .node("sendEmail")
  .subscribe((state) => {
    console.log(`Send email node state:`, state);
  });
```

## Documentation

For complete documentation, visit our [GitBook](https://ai-ntellect.gitbook.io/core).

## Contributing

We welcome contributions! To get started:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

Join our [Discord community](https://discord.gg/kEc5gWXJ) for discussions and support.

## License

MIT
