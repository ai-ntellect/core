# AI.ntellect Core Framework

## Overview

This framework is designed to execute complex workflows using advanced orchestration, memory management, and actionable intelligence. It integrates tools, interpreters, and memory systems to:

- Contextually analyze user inputs.
- Execute predefined workflows and dynamic actions.
- Efficiently manage short-term and long-term memory.
- Seamlessly integrate with external APIs and tools.

---

## Table of contents

1. [Architecture components](#architecture-components)
   - [Agent runtime](#agent-runtime)
   - [Orchestrator](#orchestrator)
   - [Queue manager](#queue-manager)
   - [Interpreter](#interpreter)
   - [Memory system](#memory-system)
2. [Defining and executing actions](#defining-and-executing-actions)
3. [State management and recursion](#state-management-and-recursion)
4. [Installation and setup](#installation-and-setup)
5. [Example usage](#example-usage)
6. [Work in progress (WIP)](#work-in-progress)

---

## Architecture components

### Agent runtime

The `AgentRuntime` is the core engine that coordinates the global workflow. It connects all components and ensures tasks are executed efficiently.

**Responsibilities:**

- Build context for the current state using memory systems (RAG and CAG).
- Orchestrate actions using the Queue Manager.
- Leverage interpreters to analyze results and generate responses.

#### Context building

The `buildContext` method constructs a comprehensive context by:

1. Adding tools and user requests.
2. Retrieving recent actions using cache memory (CAG).
3. Fetching relevant knowledge from persistent memory (RAG).
4. Including available interpreters for the request.

#### Processing workflows

The `process` method:

1. Generates responses based on the context using a language model.
2. Handles recursive workflows for action execution.
3. Selects appropriate interpreters for result analysis.

---

### Orchestrator

The **orchestrator** directs workflows by analyzing user inputs and planning actions. It interacts with tools, memory systems, and interpreters to ensure logical execution.

**Key features:**

- Dynamic selection of actions based on context.
- Management of memory interactions for RAG and CAG operations.
- Multi-step workflow handling with iterative refinement.

---

### Queue manager

The **queue manager** organizes and executes actions in the correct order, whether sequentially or in parallel. It acts as the central mechanism for managing workflows, ensuring that each action is properly queued, validated, and executed.

**Responsibilities:**

1. **Queueing actions:**

   - Actions are added to a queue for execution, either individually or as a batch.
   - Logs queued actions for debugging and traceability.

2. **Processing actions:**

   - Executes actions in the queue while maintaining the correct order.
   - Ensures dependencies between actions are respected.
   - Handles errors or confirmations via callbacks.

3. **Confirmation handling:**
   - Supports confirmation prompts for critical actions.
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

The **interpreter** specializes in analyzing results and generating domain-specific insights. Each interpreter is tailored to a specific use case and uses its own character configuration.

**Examples:**

1. **MarketInterpreter**: Analyzes financial market data.
2. **SecurityInterpreter**: Conducts security checks.
3. **GeneralInterpreter**: Processes general-purpose requests.

#### Interpretation workflow

1. Builds context with the current state, including results and user requests.
2. Uses the language model to generate actionable insights.
3. Provides detailed responses for the final user.

---

### Memory system

The memory architecture combines short-term and long-term memory to provide contextual processing.

#### Types of memory

1. **Cache memory (Redis):**
   - Stores temporary data for fast retrieval.
   - Examples: Recent actions, session data.
2. **Persistent memory (Meilisearch):**
   - Stores long-term data such as historical interactions and knowledge.
   - Enables semantic searches and vector-based retrieval.

---

## Defining and executing actions

### What are actions?

Actions are fundamental tasks executed by the framework. Each action includes:

- A unique name and description.
- Input parameters validated using schemas.
- Execution logic encapsulated in the `execute` method.

### Example action

```typescript
import { z } from "zod";
import { parseEther } from "ethers";

export const prepareTransaction = {
  name: "prepare-transaction",
  description: "Prepare a token transfer for user approval.",
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

## State management and recursion

The agent manages state and recursive workflows to ensure actions are executed in an orderly manner until completion, while respecting a maximum iteration limit to avoid infinite loops.

### State management

The state (`State`) includes:

- `currentContext`: Current context of the user request.
- `previousActions`: List of previously executed actions.

When an action is completed, the state is updated to include:

- Results of previous actions.
- Remaining context to process.

### Controlled recursion

To prevent infinite loops, the system limits the number of iterations using the `maxIterations` configuration.

**Workflow:**

1. **Initialization:** At each iteration, the agent:

   - Executes actions in the queue.
   - Updates the state with new results.

2. **Limit validation:**

   - If the iteration count exceeds `maxIterations`, processing is stopped with a "Max iterations reached" message.

3. **Recursion:**
   - If actions remain to be executed, the agent recursively calls the `process` method with the updated state.

**Example:**

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

## Installation and setup

### Install dependencies

```bash
npm install
```

### Configure external services

#### Redis (cache memory)

```bash
docker run --name redis -d -p 6379:6379 redis
```

#### Meilisearch (persistent memory)

```bash
curl -L https://install.meilisearch.com | sh
./meilisearch --master-key="YOUR_MASTER_KEY"
```

---

## Example usage

### Initialize the agent

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

### Process a request

```typescript
const state = {
  currentContext: "Analyze XRP/USD market trends",
  previousActions: [],
};

const result = await agent.process(state);
console.log("Result:", result);
```
