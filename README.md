# AI.ntellect Core Framework

## Table of Contents

1. [Main Components](#main-components)
   - [Orchestrator](#orchestrator)
   - [Queue Manager](#queue-manager)
   - [Synthesizer](#synthesizer)
   - [Cache Memory (CAG)](#cache-memory-cag)
2. [Action Creation and Management](#action-creation-and-management)
3. [Workflow Execution](#workflow-execution)
4. [API Calls and Client Side](#api-calls-and-client-side)
5. [WIP (Work in Progress)](#wip-work-in-progress)

---

## 1. Main Components

The system relies on several key components that ensure smooth and efficient management of actions and the overall workflow process.

### Orchestrator

The orchestrator is responsible for managing the execution of actions within a workflow. It analyzes the needs based on inputs (like the user prompt) and decides the order of actions to be performed. It interacts with other components like the cache memory and events to organize the execution of tasks.

- **Main Role**: Organize and direct the execution of actions.
- **Interactions**:
  - Requests actions to be executed.
  - Uses cache memory to avoid redundancy.
  - Emits events to inform other components about the state of the workflow.

### Queue Manager

The queue manager organizes the actions to be executed and manages their execution order. It ensures a smooth flow of execution by adding actions to the queue based on the priorities defined by the orchestrator.

- **Main Role**: Manage the action queue and ensure actions are executed in the correct order.
- **Main Functions**:
  - Add new actions to the queue.
  - Manage action priorities.
  - Ensure proper and timely execution of actions.

### Synthesizer

The synthesizer is responsible for generating responses and analyzing actions based on the results obtained in the workflow. It can create summaries or more complex responses from the raw results obtained during the execution of actions.

- **Main Role**: Transform the results of actions into a comprehensible and structured output.
- **Interactions**:
  - Takes the results of executed actions.
  - Creates summaries or tailored responses.

### Cache Augmented Generation (CAG)

CAG plays a crucial role in optimizing workflows by storing intermediate results from executed actions. This allows them to be reused in future workflows, avoiding unnecessary repetitions and improving the overall system efficiency.

In the context of our project, CAG primarily serves as **procedural memory**, a specific type of memory focused on reusing intermediate results in similar contexts. Unlike other types of memory, such as **episodic** (which stores past experiences) or **semantic** (which stores general knowledge), procedural memory is centered on performing repetitive tasks or previously executed actions.

#### Main Role:

- Save the results of actions for reuse in future executions.

#### Main Functions:

- **Store action results**: Action results are stored in a way that they can be easily accessed when needed.
- **Reuse results**: Results can be provided on demand, avoiding unnecessary recalculations.
- **Optimize workflows**: By reusing previously executed actions, cache memory optimizes workflows by eliminating redundant steps.

Procedural memory enhances the system's efficiency by reducing computation time and ensuring that repetitive processes are handled more quickly and effectively.

---

## 2. Action Creation and Management

Actions are specific tasks to be performed within a workflow. They can involve interactions with APIs, blockchain transactions, or any other necessary operations.

Each action is defined as an object containing a name, description, parameters, and an execution function.

### Example of an Action

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

### How to Define an Action:

1. **Name**: Unique identifier for the action.
2. **Description**: Brief description of what the action does.
3. **Parameters**: Parameters required to execute the action, validated by `zod`.
4. **Execution**: `execute` function that performs the action.

---

## 3. Workflow Execution

The workflow represents the entire process of executing a number of defined actions. When a user sends a prompt, the orchestrator determines which actions to perform based on the needs.

### Example of Creating a Workflow:

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

### Workflow Process:

1. The user’s prompt is analyzed.
2. The orchestrator decides which actions are needed and their order.
3. Actions are executed.
4. Results are synthesized and returned to the user.

---

## 4. API Calls and Client Side

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

## Memory and RAG (Retrieval Augmented Generation)

**Objective**: Create a persistent memory system that retains context across sessions and improves the agent’s learning over time by integrating external knowledge sources.

**Interest**:

- Long-term memory allows the agent to remember past interactions and access relevant external knowledge.
- More contextual and personalized responses.
- Improved efficiency and accuracy of interactions.
- Reduction of incorrect or outdated responses.
- Enables continuous learning and adaptation.

**Steps to Implement**:

**Memory Infrastructure**:

- [x] Integration of a vector database.
- [x] Relevance-based retrieval system.
- [ ] Automatic memory consolidation and cleaning.
- [ ] Memory hierarchy (working/long-term memory).

**Knowledge Integration**:

- [ ] Document processing pipeline.
- [ ] Integration of knowledge base.
- [ ] Source verification system.
- [ ] Contextual retrieval.
- [ ] Semantic search capabilities.

**Memory Types**:

- [ ] Episodic: Past interactions and experiences.
- [ ] Semantic: External knowledge and facts.
- [x] Procedural: Learned models and workflows.

**Status**: Basic implementation with Redis complete, vector database integration and RAG pipeline in progress. Architecture design finalized, with initial implementation launched.

---

## Multi-Agent Collaboration

**Objective**: Enable multiple agents to collaborate on complex tasks with specialization and coordination.

**Interest**: Collaboration between agents allows breaking down complex tasks into specialized subtasks, enhancing the efficiency and quality of results. It also enables better resource management and faster adaptation to changes.

**Steps to Implement**:

- [ ] Task delegation framework.
- [ ] Shared context management.
- [ ] Conflict resolution protocols.

**Status**: Research phase, architectural planning in progress.

---

## Complex On-Chain Interactions Management

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

## Lit Protocol Implementation

**Objective**: Add the ability to execute Lit actions, enabling decentralized and secure calculations on the Lit network.

**Interest**: Integrating the Lit Protocol allows executing Lit actions in a decentralized manner, using cryptographic keys to validate operations. These actions can be used to run JavaScript scripts in a decentralized environment, offering transparency as all interactions are recorded on the blockchain. The main benefit lies in automation and security while preserving user privacy, which enhances trust in on-chain interactions.

**Steps to Implement**:

- [x] Study Lit Protocol documentation, especially the section on Lit actions and their implementation.
- [ ] Integrate the protocol into the existing architecture to allow execution of Lit actions.
- [ ] Develop modules for executing Lit actions, including signature management and secure script execution.
- [ ] Test the integration, security, and transparency of Lit actions to ensure they function properly.

**Status**: Under study to determine feasibility and technical implications, particularly regarding integrating decentralization into the existing system.
