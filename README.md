# @ai.ntellect/core

A TypeScript framework for building workflow automation with event-driven architecture.

## Features

- Graph-based workflow execution
- Event-driven node processing
- TypeScript type safety
- Zod schema validation
- Retry mechanisms
- State observation
- AI Agent integration

## Installation

```sh
npm install @ai.ntellect/core zod
```

## Basic Usage

### Building a simple workflow

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext, GraphNodeConfig } from "@ai.ntellect/core/types";

// Define the schema
const Schema = z.object({
  message: z.string(),
});

// Define a node
const greetNode = {
  name: "greet",
  execute: async (context: GraphContext<typeof Schema>) => {
    context.message = "Hello, World!";
  },
};

// Create workflow
const workflow = new GraphFlow({
  name: "hello",
  schema: Schema,
  context: { message: "" },
  nodes: [greetNode],
});

// Execute and observe
const main = async () => {
  // Observe state changes
  workflow
    .observe()
    .state()
    .subscribe((context) => {
      console.log(context);
    });

  // Execute workflow
  await workflow.execute("greet");
};

main();
```

### Handling events in a workflow

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

// Define schema
const OrderSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  amount: z.number(),
});

// Define nodes
const paymentNode: GraphNodeConfig<typeof OrderSchema> = {
  name: "payment",
  when: {
    events: ["payment.received"],
    timeout: 30000,
    strategy: { type: "single" },
  },
  execute: async (context: GraphContext<typeof OrderSchema>) => {
    context.status = "processing";
  },
  next: ["validation"],
};

const validationNode: GraphNodeConfig<typeof OrderSchema> = {
  name: "validation",
  when: {
    events: ["payment.validated", "inventory.checked"],
    timeout: 5000,
    strategy: {
      type: "correlate",
      correlation: (events) => {
        return events.every(
          (e) => e.payload.orderId === events[0].payload.orderId
        );
      },
    },
  },
  execute: async (context: GraphContext<typeof OrderSchema>) => {
    context.status = "validated";
  },
};

// Create workflow
const orderWorkflow = new GraphFlow({
  name: "order",
  schema: OrderSchema,
  context: {
    orderId: "",
    status: "pending",
    amount: 0,
  },
  nodes: [paymentNode, validationNode],
});

// Usage
const main = async () => {
  // Observe state
  orderWorkflow
    .observe()
    .property("status")
    .subscribe((status) => {
      console.log("Status:", status);
    });

  // Start listening for events
  orderWorkflow.execute("payment");

  // Emit event after a short delay
  setTimeout(async () => {
    await orderWorkflow.emit("payment.received", {
      orderId: "123",
      amount: 100,
    });
  }, 100);

  // Observe payment received event
  orderWorkflow
    .observe()
    .event("payment.received")
    .subscribe((event) => {
      console.log("Payment received:", event);
      orderWorkflow.emit("inventory.checked", {
        orderId: event.payload.orderId,
      });
    });

  // Observe inventory checked event
  orderWorkflow
    .observe()
    .event("inventory.checked")
    .subscribe((event) => {
      console.log("Inventory checked:", event);
      orderWorkflow.emit("payment.validated", {
        orderId: event.payload.orderId,
      });
    });

  // Observe payment validated event
  orderWorkflow
    .observe()
    .event("payment.validated")
    .subscribe((event) => {
      console.log("Payment validated:", event);
    });
};

main();
```

### Creating a workflow with Agent

```typescript
import { z } from "zod";
import { GraphFlow, Agent } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const EmailSchema = z.object({
  to: z.string(),
  subject: z.string(),
  content: z.string(),
  status: z.string(),
});

const sendNode = {
  name: "send",
  execute: async (context: GraphContext<typeof EmailSchema>) => {
    context.status = "sending";
    // Email sending implementation
    context.status = "sent";
  },
};

const emailFlow = new GraphFlow({
  name: "email",
  schema: EmailSchema,
  context: {
    to: "",
    subject: "",
    content: "",
    status: "pending",
  },
  nodes: [sendNode],
});

const assistant = new Agent({
  role: "Email Assistant",
  goal: "Help users send emails",
  tools: [emailFlow],
  llmConfig: {
    provider: "openai",
    model: "gpt-4",
    apiKey: process.env.OPENAI_API_KEY,
  },
});

const main = async () => {
  const result = await assistant.process(
    "Send an email to john@example.com about the project update"
  );
  console.log(result);
};

main();
```

## Documentation

See the [documentation](https://ai-ntellect.gitbook.io/core) for detailed usage examples.

## Contributing

Contributions are welcome. Please submit pull requests with tests.

## License

MIT
