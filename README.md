# AI.ntellect Core Framework

## Table of contents

1. [Main components](#main-components)
   - [Agent](#agent)
   - [Orchestrator](#orchestrator)
   - [Evaluator](#evaluator)
   - [Interpreter](#interpreter)
   - [Memory](#memory-architecture)
2. [Action creation and management](#action-creation-and-management)
3. [Agent processing](#agent-processing)
4. [WIP (Work in Progress)](#wip-work-in-progress)

---

## 1. Main components

The system relies on several key components that ensure smooth and efficient processing of user requests through an AI agent architecture.

### Agent

The agent is the core component that processes user requests and manages the entire interaction flow. It coordinates with other components to understand user needs, execute appropriate actions, and generate relevant responses.

- **Main role**: Process user requests and coordinate system components
- **Key features**:
  - Processes user prompts
  - Manages conversation context
  - Coordinates with orchestrator for action execution
  - Handles response generation
  - Maintains user state and memory

### Orchestrator

The orchestrator works under the agent's direction to manage the execution of actions. It analyzes requirements based on the agent's interpretation of user needs and coordinates the execution of appropriate tools.

- **Main role**: Organize and direct the execution of actions
- **Interactions**:
  - Manages available tools/actions
  - Executes actions based on agent requests
  - Uses memory for context and caching
  - Coordinates with evaluator for result assessment

### Evaluator

The evaluator now collaborates with Interpreters to process action results and determine the next steps in the workflow.

- **Main role**: Evaluate action results and coordinate with appropriate Interpreters
- **Main functions**:
  - Analyzes results from executed actions
  - Determines if additional actions are needed
  - Routes results to appropriate Interpreter
  - Ensures completion of user requirements
- **Interactions**:
  - Works with orchestrator to manage workflow
  - Coordinates with Interpreters for specialized processing
  - Can trigger additional action cycles if needed

### Interpreter

The Interpreter is a specialized component responsible for interpreting action results and generating appropriate responses. Each Interpreter is configured with a specific business context and produces responses in a format adapted to its domain of expertise.

**Key characteristics**:

- Business-specific context configuration
- Domain-adapted response formatting
- Specialized data processing based on context

**Operation flow**:

- Receives action results via the Evaluator
- Analyzes data according to its specific context
- Produces formatted responses following domain rules

Examples of Interpreter implementations:

1. **MarketInterpreter**

   - Specialized in market data analysis
   - Format adapted for financial analysis

2. **SecurityInterpreter**

   - Dedicated to security verifications
   - Optimized format for security reports

3. **GeneralInterpreter**
   - Handles general purpose requests
   - Flexible formatting based on context

These examples demonstrate the system's flexibility, which can be extended with additional Interpreter types as needed.

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

- **Main role**: Cache frequently used procedural patterns
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

## 3. Agent processing

The agent handles the entire process of understanding user requests and coordinating responses. Here's an example of how to use the agent:

```typescript

const persistentMemory = new PersistentMemory({
  host: "http://localhost:7700",
  apiKey: "YOUR_API_KEY",
});
const cacheMemory = new CacheMemory();

const orchestrator = new Orchestrator(
  id: from,
  tools: [/* your actions here */],
  memory: {
    persistent: persistentMemory,
    cache: cacheMemory,
  },
);

const securityInterpreter = new Interpreter("security", securityContext);
const marketInterpreter = new Interpreter("market", marketContext);
const generalInterpreter = new Interpreter("general", generalContext);

const agent = new Agent({
  interpreters: [securityInterpreter, marketInterpreter, generalInterpreter],
  orchestrator,
  memory: {
    persistent: memory,
    cache: cacheMemory,
  },
  stream: false,
  maxEvaluatorIteration: 1,
});

const result = await agent.process("Your prompt here");
```

### Agent process flow:

1. User sends a prompt
2. Agent analyzes the prompt and context
3. Orchestrator executes required tools/actions
4. Evaluator assesses results
5. Agent generates final response

## 4. WIP (Work in Progress)

Here are the elements currently in development or improvement:

---

## Multi-agent collaboration

**Objective**: Enable multiple agents to collaborate on complex tasks with specialization and coordination.

**Interest**: Collaboration between agents allows breaking down complex tasks into specialized subtasks, enhancing the
efficiency and quality of results. It also enables better resource management and faster adaptation to changes.

**Steps to implement**:

- [ ] Task delegation framework.
- [ ] Shared context management.
- [ ] Conflict resolution protocols.

**Status**: Research phase, architectural planning in progress.

---

## Complex on-chain interactions management

**Objective**: Create a model for recognizing on-chain interactions and creating workflows for complex interactions.

**Interest**: This feature allows the agent to understand and interact with smart contracts more intuitively,
facilitating the execution of complex actions on the blockchain. It improves accessibility and efficiency in
interacting with smart contracts.

**Steps to implement**:

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

**Objective**: Add the ability to execute Lit actions, enabling decentralized and secure calculations on the Lit
network.

**Interest**: Integrating the Lit Protocol allows executing Lit actions in a decentralized manner, using cryptographic
keys to validate operations. These actions can be used to run JavaScript scripts in a decentralized environment,
offering transparency as all interactions are recorded on the blockchain. The main benefit lies in automation and
security while preserving user privacy, which enhances trust in on-chain interactions.

**Steps to Implement**:

- [x] Study Lit Protocol documentation, especially the section on Lit actions and their implementation.
- [ ] Integrate the protocol into the existing architecture to allow execution of Lit actions.
- [ ] Develop modules for executing Lit actions, including signature management and secure script execution.
- [ ] Test the integration, security, and transparency of Lit actions to ensure they function properly.

**Status**: Under study to determine feasibility and technical implications, particularly regarding integrating
decentralization into the existing system.
