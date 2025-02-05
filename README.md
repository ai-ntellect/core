# **@ai.ntellect/core Documentation**

## **1. Introduction**

The **`@ai.ntellect/core`** framework is a powerful tool designed to **model, execute, and manage dynamic interaction flows** using **graph structures**. Unlike traditional **Directed Acyclic Graphs (DAGs)**, this framework supports cycles, enabling nodes to be executed multiple times and allowing for loop-based workflows.

### **Key Features**

- Dynamic workflow execution
- Cyclic and acyclic graph support
- Strong typing with Zod validation
- Event-driven architecture
- Built-in error handling and retries
- Conditional execution paths
- Parameter validation
- State management

### **Common Use Cases**

- **AI Agents**: Building conversational AI systems that can maintain context and make decisions
- **Transaction Processing**: Managing complex financial workflows with validation chains
- **Task Orchestration**: Coordinating multiple dependent operations
- **Decision Trees**: Implementing complex business logic with multiple branches
- **State Machines**: Managing application state transitions
- **Event Processing**: Handling and responding to system events

## **2. Core Concepts**

### **2.1 Graph Theory Foundation**

A directed graph in our framework is defined as **G = (V, E)** where:

- **V**: Set of nodes (vertices)
- **E**: Set of directed edges

Each node represents an executable action, and edges represent conditional transitions between actions.

#### Example Graph Structure:

```
(ValidateInput) → (ProcessData) → (SaveResult)
       ↓                              ↑
    (RetryInput) ──────────────────────
```

### **2.2 Node Types**

#### **Basic Node**

```typescript
const basicNode: Node<ContextType> = {
  name: "processData",
  execute: async (context) => {
    // Process data
  },
  next: ["saveResult"],
};
```

#### **Conditional Node**

```typescript
const conditionalNode: Node<ContextType> = {
  name: "validateInput",
  condition: (context) => context.isValid,
  execute: async (context) => {
    // Validation logic
  },
  next: ["processData"],
};
```

## **3. Advanced Features**

### **3.1 Event-Driven Execution**

Nodes can respond to system events:

```typescript
const eventNode: Node<ContextType> = {
  name: "handleUserInput",
  events: ["userSubmitted"],
  execute: async (context) => {
    // Handle user input
  },
};
```

### **3.2 Retry Mechanisms**

Built-in retry support for handling transient failures:

```typescript
const retryableNode: Node<ContextType> = {
  name: "apiCall",
  retry: {
    maxAttempts: 3,
    delay: 1000, // ms
  },
  execute: async (context) => {
    // API call logic
  },
};
```

## **4. Real-World Examples**

### **4.1 AI Agent Workflow**

```typescript
const aiAgentGraph = new Graph<AIContextType>("AIAgent", {
  nodes: [
    {
      name: "analyzeInput",
      execute: async (context) => {
        context.intent = await analyzeUserIntent(context.input);
      },
      next: ["selectAction"],
    },
    {
      name: "selectAction",
      execute: async (context) => {
        context.selectedAction = determineNextAction(context.intent);
      },
      next: ["validateResponse"],
    },
    {
      name: "generateResponse",
      execute: async (context) => {
        context.response = await generateAIResponse(context);
      },
      next: ["validateResponse"],
    },
  ],
});
```

### **4.2 Transaction Processing**

```typescript
const transactionGraph = new Graph<TransactionContext>("TransactionProcessor", {
  nodes: [
    {
      name: "validateFunds",
      execute: async (context) => {
        context.hasSufficientFunds = await checkBalance(context.amount);
      },
      next: ["processPayment"],
    },
    {
      name: "processPayment",
      retry: {
        maxAttempts: 3,
        delay: 1000,
      },
      condition: (context) => context.hasSufficientFunds,
      execute: async (context) => {
        await processPayment(context.transactionData);
      },
      next: ["notifyUser"],
    },
  ],
});
```

## **5. Event Listeners**

```typescript
graph.on("nodeStarted", ({ name, context }) => {
  console.log(`Node ${name} started with context:`, context);
});

graph.on("nodeCompleted", ({ name, context }) => {
  console.log(`Node ${name} completed with context:`, context);
});

graph.on("nodeError", ({ name, error }) => {
  console.error(`Error in node ${name}:`, error);
});
```

## **6. Future Developments**

Planned features include:

- Advanced memory management for AI agents
- Graph composition and nesting
- Real-time monitoring dashboard
- Performance analytics
- Distributed execution support

For more information and updates, visit the official documentation or join our community discussions.
