# AI.ntellect Core Framework

## Table of Contents

1. [Main Components](#main-components)
   - [Orchestrator](#orchestrator)
   - [Queue Manager](#queue-manager)
   - [Synthesizer](#synthesizer)
   - [Evaluator](#evaluator)
   - [Memory](#memory-architecture)
2. [Action Creation and Management](#action-creation-and-management)
3. [Workflow Execution](#workflow-execution)
4. [API Calls and Client Side](#api-calls-and-client-side)
5. [WIP (Work in Progress)](#wip-work-in-progress)

---

## 1. Main components

The system relies on several key components that ensure smooth and efficient management of actions and the overall workflow process.

### Orchestrator

The orchestrator is responsible for managing the execution of actions within a workflow. It analyzes the needs based on inputs (like the user prompt) and decides the order of actions to be performed. It interacts with other components like the cache memory and events to organize the execution of tasks.

- **Main Role**: Organize and direct the execution of actions.
- **Interactions**:
  - Analyzes user prompts to determine required actions
  - Requests actions to be executed
  - Uses cache memory to avoid redundancy
  - Emits events to inform other components about the state of the workflow

### Queue Manager

The queue manager organizes the actions to be executed and manages their execution order. It ensures a smooth flow of execution by adding actions to the queue based on the priorities defined by the orchestrator.

- **Main Role**: Manage the action queue and ensure actions are executed in the correct order.
- **Main Functions**:
  - Add new actions to the queue.
  - Manage action priorities.
  - Ensure proper and timely execution of actions.

### Synthesizer

The synthesizer is responsible for generating responses and analyzing actions based on the results obtained in the workflow. It can create summaries or more complex responses from the raw results obtained during the execution of actions.

- **Main Role**: Transform the results of actions into a comprehensible and structured output
- **Interactions**:
  - Takes the results of executed actions
  - Creates summaries or tailored responses
  - Formats final output for user consumption
  - Can handle streaming responses

### Evaluator

The evaluator is responsible for assessing the results of executed actions and determining if additional actions are needed. It works in conjunction with the orchestrator to ensure all user requirements are met.

- **Main Role**: Evaluate action results and determine next steps
- **Main Functions**:
  - Analyzes results from executed actions
  - Determines if additional actions are needed
  - Suggests next actions to the orchestrator
  - Ensures completion of user requirements
- **Interactions**:
  - Works with orchestrator to manage workflow
  - Processes action results
  - Can trigger additional action cycles

[![Sans-titre-2024-11-08-0220.png](https://i.postimg.cc/nryjsx5y/Sans-titre-2024-11-08-0220.png)](https://postimg.cc/rR9FbBqj)

### Memory

The system implements a sophisticated memory architecture that combines different storage solutions for various types of memory:

#### Installation and setup

##### Meilisearch (Long-term memory)

Meilisearch can be self-hosted for complete control over the agent's long-term memory:

```bash
# Install Meilisearch
curl -L https://install.meilisearch.com | sh

# Launch Meilisearch with a master key
./meilisearch --master-key="YOUR_MASTER_KEY"
```

##### Redis (Short-term memory)

Redis handles the short-term memory components:

```bash
# Using Docker
docker run --name redis -d -p 6379:6379 redis

# Or install locally
sudo apt-get install redis-server
```

2. **Configuration**:
   - Default port: 6379
   - Configure memory limits
   - Enable persistence if needed

#### Memory types

#### Short-term memory (Redis)

1. **Procedural Memory**:

   - Stored in Redis for fast access
   - Contains reusable action sequences and workflows
   - Optimizes performance through caching
   - Example: "Common token approval + swap sequence"

2. **Short-term episodic memory**:
   - Recent messages and interactions
   - Temporary context for ongoing conversations
   - Stored in Redis for quick retrieval
   - Example: "Last 10 messages in current conversation"

#### Long-term memory (Meilisearch)

1. **Semantic memory**:

   - Permanent storage of facts and knowledge
   - Indexed for efficient retrieval
   - Stores relationships between concepts
   - Example: "Token X has contract address Y on network Z"

2. **Long-term episodic Memory**:
   - Historical interactions and experiences
   - Persistent context across sessions
   - Searchable through vector similarity
   - Example: "User X's past successful transactions"

### Cache Augmented Generation (CAG)

CAG optimizes workflow execution through Redis-based caching:

- **Main Role**: Cache frequently used procedural patterns
- **Implementation**:

  - Uses Redis for high-performance storage
  - Stores action sequences and their results
  - Enables quick retrieval of common patterns

- **Benefits**:
  - Reduces computation overhead
  - Speeds up repeated operations
  - Optimizes resource usage

### Retrieval Augmented Generation (RAG)

The RAG system enhances long-term memory access through Meilisearch:

- **Implementation**:

  - Vector-based search for semantic similarity
  - Dual indexing (global and user-specific)
  - Combines with traditional text search

- **Features**:
  - Semantic and episodic memory retrieval
  - Context-aware search capabilities
  - Relevance-based result ranking

---

## 2. Action creation and management

Actions are specific tasks to be performed within a workflow. They can involve interactions with APIs, blockchain transactions, or any other necessary operations.

Each action is defined as an object containing a name, description, parameters, and an execution function.

### Example of an action

```typescript
import { networkConfigs } from "@config/network";
import { parseEther } from "ethers";
import { z } from "zod";

export const prepareTransaction = {
  name: "prepare-transaction",
  description: "Prepare a transfer for the user to sign.",
  parameters: z.object({
    walletAddress: z.string(),
    amount: z.string().describe("Amount to send"),
    networkId: z.string().describe("Target network (e.g., ethereum, arbitrum)"),
  }),
  execute: async ({
    walletAddress,
    amount,
    network,
  }: {
    walletAddress: string;
    amount: string;
    networkId: string;
  }) => {
    try {
      const networkConfig = networkConfigs[networkId];
      if (!networkConfig) {
        throw new Error(`Network ${network} not found`);
      }

      return {
        to: walletAddress,
        value: parseEther(amount).toString(),
        chain: {
          id: networkConfig.id,
          rpc: networkConfig.rpc,
        },
        type: "transfer",
      };
    } catch (error) {
      return "Error preparing the transaction";
    }
  },
};
```

### How to define an action:

1. **Name**: Unique identifier for the action.
2. **Description**: Brief description of what the action does.
3. **Parameters**: Parameters required to execute the action, validated by `zod`.
4. **Execution**: `execute` function that performs the action.

---

## 3. Workflow execution

The workflow represents the entire process of executing a number of defined actions. When a user sends a prompt, the orchestrator determines which actions to perform based on the needs.

### Example of creating a workflow:

```typescript
const tools = [
  prepareEvmTransaction,
  getNews, // Example action to fetch the latest news
];

const orchestrator = new Orchestrator(tools);

const workflow = new Workflow(
  { id: from }, // User ID or context
  { orchestrator, memoryCache, eventEmitter } // Required components
);
```

- **Orchestrator**: Manages the order of actions.
- **MemoryCache**: Reuses previous results.
- **EventEmitter**: Tracks and notifies the state of the workflow.

### Workflow process:

1. The user’s prompt is analyzed.
2. The orchestrator decides which actions are needed and their order.
3. Actions are executed.
4. Results are synthesized and returned to the user.

---

## 4. API calls and client side

```typescript
fastify.post("/api/chat", {
  preHandler: requireAuth,
  handler: async (request, reply) => {
    const { messages, from } = request.body;
    const latestMessage = messages[messages.length - 1];

    const workflow = new Workflow(
      { id: from },
      { orchestrator, memoryCache, eventEmitter }
    );
    return workflow.start(latestMessage.content, messages);
  },
});
```

```typescript
export function Chat({ id, initialMessages }) {
  const { messages, setMessages, handleSubmit, input, setInput } = useChat({
    api: "/api/chat",
    body: { id, from: activeAccount?.address },
  });

  return (
    <div>
      <div>{messages}</div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button onClick={handleSubmit}>Send</button>
    </div>
  );
}
```

---

## 5. WIP (Work in Progress)

Here are the elements currently in development or improvement:

---

## Multi-agent collaboration

**Objective**: Enable multiple agents to collaborate on complex tasks with specialization and coordination.

**Interest**: Collaboration between agents allows breaking down complex tasks into specialized subtasks, enhancing the efficiency and quality of results. It also enables better resource management and faster adaptation to changes.

**Steps to Implement**:

- [ ] Task delegation framework.
- [ ] Shared context management.
- [ ] Conflict resolution protocols.

**Status**: Research phase, architectural planning in progress.

---

## Complex on-chain interactions management

**Objective**: Create a model for recognizing on-chain interactions and creating workflows for complex interactions.

**Interest**: This feature allows the agent to understand and interact with smart contracts more intuitively, facilitating the execution of complex actions on the blockchain. It improves accessibility and efficiency in interacting with smart contracts.

**Steps to Implement**:

- [ ] Extraction and processing of relevant contract ABIs.
- [ ] Filtering of relevant functions.
- [ ] Generation of hypothetical queries in natural language.
- [ ] Conversion of queries into vector embeddings.
- [ ] Storing embeddings and associated queries.
- [ ] Similarity search based on cosine.
- [ ] Ranking results based on relevance.

**Status**: Ongoing study to determine the best approach and technologies to use.

---

## Lit Protocol implementation

**Objective**: Add the ability to execute Lit actions, enabling decentralized and secure calculations on the Lit network.

**Interest**: Integrating the Lit Protocol allows executing Lit actions in a decentralized manner, using cryptographic keys to validate operations. These actions can be used to run JavaScript scripts in a decentralized environment, offering transparency as all interactions are recorded on the blockchain. The main benefit lies in automation and security while preserving user privacy, which enhances trust in on-chain interactions.

**Steps to Implement**:

- [x] Study Lit Protocol documentation, especially the section on Lit actions and their implementation.
- [ ] Integrate the protocol into the existing architecture to allow execution of Lit actions.
- [ ] Develop modules for executing Lit actions, including signature management and secure script execution.
- [ ] Test the integration, security, and transparency of Lit actions to ensure they function properly.

**Status**: Under study to determine feasibility and technical implications, particularly regarding integrating decentralization into the existing system.
