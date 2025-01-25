# AI.ntellect Core Framework

## Overview

This framework is designed to execute complex workflows using advanced orchestration, memory management, and actionable intelligence. It integrates tools, interpreters, and memory systems to:

- Analyze user inputs in their context.
- Execute predefined workflows and dynamic actions.
- Efficiently manage short-term and long-term memory.
- Enable seamless integration with external APIs and tools.

---

## Table of Contents

1. [Architecture Components](#architecture-components)
   - [Agent Runtime](#agent-runtime)
   - [Orchestrator](#orchestrator)
   - [Queue Manager](#queue-manager)
   - [Interpreter](#interpreter)
   - [Memory System](#memory-system)
   - [Listeners](#listeners)
   - [Schedulers](#schedulers)
2. [Defining and Executing Actions](#defining-and-executing-actions)
3. [State Management and Recursion](#state-management-and-recursion)
4. [Installation and Configuration](#installation-and-configuration)
5. [Usage Example](#usage-example)
6. [Work in Progress (WIP)](#work-in-progress-wip)

---

## Architecture Components

### Agent Runtime

The `AgentRuntime` is the main engine coordinating the overall workflow. It connects all components and ensures tasks are executed efficiently.

**Responsibilities:**

- Build context for the current state using memory systems (RAG and CAG).
- Orchestrate actions using the queue manager.
- Leverage interpreters to analyze results and generate responses.

#### Context Building

The `buildContext` method creates a complete context by:

1. Adding tools and user requests.
2. Retrieving recent actions via cache memory (CAG).
3. Fetching relevant knowledge from persistent memory (RAG).
4. Including available interpreters for the request.

#### Workflow Processing

The `process` method:

1. Generates responses based on context using a language model.
2. Handles recursive workflows for action execution.
3. Selects appropriate interpreters to analyze results.

---

### Orchestrator

The **orchestrator** directs workflows by analyzing user inputs and planning actions. It interacts with tools, memory systems, and interpreters to ensure logical execution.

**Key Features:**

- Dynamic action selection based on context.
- Memory interaction management for RAG and CAG operations.
- Multi-step workflow management with iterative refinement.

---

### Queue Manager

The **queue manager** is responsible for organizing and executing actions in the correct order, whether sequential or parallel. It acts as the central mechanism for managing workflows, ensuring each action is properly queued, validated, and executed.

**Main Responsibilities:**

1. **Action Queueing:**

   - Actions are added to a queue for execution, individually or in batches.
   - Includes logging support for debugging and traceability.

2. **Action Processing:**

   - Executes actions while maintaining correct order.
   - Respects dependencies between actions.
   - Handles errors or confirmations via callbacks.

3. **Confirmation Management:**
   - Supports prompts for critical actions.
   - Relies on callbacks to decide whether to proceed with specific actions.

**Example:**

```typescript
import { ActionQueueManager } from "@ai-ntellect/core";
import { actions, callbacks } from "@ai-ntellect/core/examples";

const queueManager = new ActionQueueManager(actions, callbacks);
queueManager.addToQueue([{ name: "fetch-data", parameters: [...] }]);
const results = await queueManager.processQueue();
console.log("Results:", results);
```

---

### Interpreter

The **interpreter** specializes in analyzing results and generating domain-specific insights. Each interpreter is tailored for a specific use case and uses its own character configuration.

**Examples:**

1. **MarketInterpreter**: Analyzes financial market data.
2. **SecurityInterpreter**: Performs security checks.
3. **GeneralInterpreter**: Processes general-purpose requests.

#### Interpretation Workflow

1. Builds context with the current state, including results and user requests.
2. Uses the language model to generate actionable insights.
3. Provides detailed responses for the end user.

---

### Memory System

The memory architecture combines short-term and long-term memory to provide contextual processing.

#### Memory Types

1. **Cache Memory (Redis):**
   - Stores temporary data for quick access.
   - Examples: Recent actions, session data.
2. **Persistent Memory (Meilisearch):**
   - Stores long-term data such as historical interactions and knowledge.
   - Supports semantic searches and vector-based retrievals.

---

### Listeners

**Listeners** connect to external events via WebSocket. They listen for real-time updates and trigger specific actions or callbacks in response to events.

**Key Features:**

- Connect to WebSockets to listen for events.
- Manage subscriptions with custom messages.
- Trigger callbacks to process received data.

**Usage Example:**

```typescript
agent.addListener(
  "listener-id",
  "wss://example.com/socket",
  () => JSON.stringify({ action: "subscribe" }),
  async (data) => {
    console.log("Received data:", data);
  }
);
```

---

### Schedulers

**Schedulers** allow tasks or actions to be scheduled for later execution. They use cron expressions to define scheduling intervals.

**Key Features:**

- Cron-based scheduling.
- Support for recurring and non-recurring tasks.
- Management and cancellation of scheduled tasks.

**Usage Example:**

```typescript
const scheduler = new TaskScheduler(agentRuntime, redisCache);

const taskId = await scheduler.scheduleRequest({
  originalRequest: "Market analysis",
  cronExpression: "0 9 * * *", // Every day at 9 AM
});

console.log(`Task scheduled with ID: ${taskId}`);

// Cancel the task if needed
scheduler.cancelScheduledRequest(taskId);
```

---

## Defining and Executing Actions

### What is an Action?

Actions are the fundamental tasks executed by the framework. Each action includes:

- A unique name and description.
- Input parameters validated using schemas.
- Execution logic encapsulated in the `execute` method.

### Action Example

```typescript
import { z } from "zod";
import { parseEther } from "ethers";

export const prepareTransaction = {
  name: "prepare-transaction",
  description: "Prepares a token transfer for user approval.",
  parameters: z.object({
    walletAddress: z.string(),
    amount: z.string(),
    networkId: z.string(),
  }),
  execute: async ({ walletAddress, amount, networkId }) => {
    return {
      to: walletAddress,
      value: parseEther(amount).toString(),
      network: networkId,
    };
  },
};
```

---

## State Management and Recursion

The agent manages state and recursive workflows to ensure actions are executed in an orderly manner and to completion, while adhering to a maximum number of iterations to avoid infinite loops.

### State Management

The state (`State`) includes:

- `currentContext`: The current context of the user request.
- `previousActions`: A list of previously executed actions.

When an action is completed, the state is updated to include:

- Results from previous actions.
- Remaining context to be processed.

### Controlled Recursion

To prevent infinite loops, the system limits the number of iterations via the `maxIterations` configuration.

**Workflow:**

1. **Initialization:** At each iteration, the agent:

   - Executes actions in the queue.
   - Updates the state with new results.

2. **Limit Validation:**

   - If the number of iterations exceeds `maxIterations`, processing is stopped with a "Max iterations reached" message.

3. **Recursion:**
   - If actions remain to be executed, the agent recursively calls the `process` method with the updated state.

**State and Recursion Example:**

```typescript
const updatedNextState: State = {
  ...state,
  currentContext: state.currentContext,
  previousActions: [...(state.previousActions || []), ...(results || [])],
};

if (countIterations < this.config.maxIterations) {
  return this.process(updatedNextState);
} else {
  console.log("Max iterations reached");
  response.shouldContinue = false;
}
```

---

## Installation and Configuration

### Install Dependencies

```bash
npm install
```

### Configure External Services

#### Redis (Cache Memory)

```bash
docker run --name redis -d -p 6379:6379 redis
```

#### Meilisearch (Persistent Memory)

```bash
curl -L https://install.meilisearch.com | sh
./meilisearch --master-key="YOUR_MASTER_KEY"
```

---

## Usage Example

### Initialize the Agent

```typescript
import { deepseek } from "@ai-ntellect/core";
import { Agent } from "@ai-ntellect/core";
import { checkHoneypot, fetchMarkPrice } from "@ai-ntellect/core/actions";
import {
  generalInterpreterCharacter,
  marketInterpreterCharacter,
  securityInterpreterCharacter,
} from "@ai-ntellect/core/interpreter/context";

const model = deepseek("deepseek-reasoner");

const agent = new Agent({
  orchestrator: {
    model,
    tools: [checkHoneypot, fetchMarkPrice],
  },
  interpreters: [
    new Interpreter({
      name: "security",
      model,
      character: securityInterpreterCharacter,
    }),
    new Interpreter({
      name: "market",
      model,
      character: marketInterpreterCharacter,
    }),
    new Interpreter({
      name: "general",
      model,
      character: generalInterpreterCharacter,
    }),
  ],
  memoryManager: {
    model,
  },
  maxIterations: 3,
});
```

### Process a Request

```typescript
const state = {
  currentContext: "Analyze XRP/USD market trends",
  previousActions: [],
};

const result = await agent.process(state);
console.log("Result:", result);
```
