---
description: >-
  Assemblez un graphe cognitif pour la prise de décision et des graphes
  d'actions pour l'exécution pour créer un agent.
---

# Agent On-Chain

Dans ce tutoriel, nous allons voir comment créer un agent on-chain intelligent basé sur le framework **@ai.ntellect/core** . L'agent sera capable de **prendre des décisions**, **exécuter des actions sur la blockchain**, **mémoriser des informations** et **interagir avec un LLM** comme OpenAI.

***

### **Prérequis**

Avant de commencer, assurez-vous d'avoir installé les dépendances suivantes :

```bash
npm install @ai-sdk/openai ai dotenv viem zod @ai.ntellect/core
```

#### **Variables d'environnement**

Vous aurez besoin d'un fichier **.env** contenant les informations suivantes :

```
OPENAI_API_KEY=your_openai_api_key
MEILISEARCH_API_KEY=your_meilisearch_api_key
MEILISEARCH_HOST=your_meilisearch_host
PRIVATE_KEY=your_private_key
```

Ces informations sont utilisées pour :

* **OpenAI** : Génération de texte et embeddings pour les décisions de l'agent.
* **Meilisearch** : Stockage des connaissances de l'agent.
* **Viem** : Gestion des transactions blockchain.

***

### **Définition du contexte**

Nous devons définir **les réseaux blockchain** et le **contexte** de notre agent.

```typescript
import { Chain } from "viem";
import * as chains from "viem/chains";

// Génération dynamique des configurations de réseaux blockchain
const buildNetworkConfigs = () => {
  const availableChains = Object.entries(chains).reduce(
    (acc, [name, chain]) => {
      if (typeof chain === "object" && "id" in chain) {
        const networkName = name.toLowerCase();
        acc[networkName] = {
          chain: chain as Chain,
          rpc:
            process.env[`${networkName.toUpperCase()}_RPC_URL`] ||
            chain.rpcUrls.default.http[0],
        };
      }
      return acc;
    },
    {} as Record<string, { chain: Chain; rpc: string }>
  );

  return availableChains;
};

const networkConfigs = buildNetworkConfigs();
```

***

### **Création du contexte de l'agent**

Nous utilisons **Zod** pour définir un schéma de validation.

```typescript
import { z } from "zod";

const contextSchema = z.object({
  prompt: z.object({
    raw: z.string(),
    embedding: z.array(z.number()).optional(),
  }),
  actions: z.array(
    z.object({
      name: z.string(),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.any(),
        })
      ),
    })
  ),
  executedGraphs: z.array(z.string()),
  knowledge: z.string().optional(),
  response: z.string().optional(),
});

type ContextType = GraphContext<typeof contextSchema>;
```

***

### **Définition d'un GraphFlow pour une transaction EVM**

Nous créons un **GraphFlow** permettant de :

1. Vérifier le **solde du compte** avant d'envoyer une transaction.
2. **Envoyer une transaction** si le solde est suffisant.

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const prepareEvmTransactionNodeSchema = z.object({
  to: z.string(),
  value: z.string(),
  chainName: z.string(),
});

const prepareEvmTransactionContextSchema = z.object({
  balance: z.string(),
  to: z.string(),
  value: z.string(),
  network: z.object({
    chain: z.any(),
    rpc: z.string(),
  }),
  type: z.string(),
  transactionHash: z.string().optional(),
});

const prepareEvmTransaction = new GraphFlow("prepareEvmTransaction", {
  name: "prepareEvmTransaction",
  nodes: [
    {
      name: "checkBalance",
      inputs: prepareEvmTransactionNodeSchema,
      execute: async (context, inputs) => {
        const networkName = inputs.chainName.toLowerCase();
        const networkConfig = networkConfigs[networkName];

        if (!networkConfig) {
          throw new Error(`Network ${inputs.chainName} not found.`);
        }

        const publicClient = createPublicClient({
          chain: networkConfig.chain,
          transport: http(networkConfig.rpc),
        });

        context.network = {
          chain: networkConfig.chain,
          rpc: networkConfig.rpc,
        };

        const account = privateKeyToAccount(
          `0x${process.env.PRIVATE_KEY}` as `0x${string}`
        );
        const balance = await publicClient.getBalance({
          address: account.address,
        });

        context.balance = balance.toString();
        context.value = (BigInt(inputs.value) * BigInt(1e18)).toString();

        if (BigInt(context.balance) < BigInt(context.value)) {
          throw new Error("Insufficient balance");
        }
      },
      next(context) {
        return BigInt(context.balance) > BigInt(context.value)
          ? ["sendTransaction"]
          : [];
      },
    },
    {
      name: "sendTransaction",
      execute: async (context) => {
        const account = privateKeyToAccount(
          `0x${process.env.PRIVATE_KEY}` as `0x${string}`
        );

        const walletClient = createWalletClient({
          account,
          chain: networkConfigs[context.network.chain.name.toLowerCase()].chain,
          transport: http(context.network.rpc),
        });

        const hash = await walletClient.sendTransaction({
          to: context.to as `0x${string}`,
          value: BigInt(context.value),
        });

        console.log(`Transaction sent! Hash: ${hash}`);
        context.transactionHash = hash;
      },
    },
  ],
  context: {
    balance: "0",
    to: "",
    value: "",
    network: { chain: null, rpc: "" },
    type: "",
    transactionHash: "",
  },
  schema: prepareEvmTransactionContextSchema,
});
```

***

### **Récupération des connaissances en mémoire**

L'agent doit être capable de **mémoriser des interactions passées** pour améliorer ses réponses.

```typescript
import {
  AIEmbeddingAdapter,
  EmbeddingManager,
  GraphContext,
  MeilisearchAdapter,
} from "@ai.ntellect/core";
import { configDotenv } from "dotenv";

configDotenv();

const retrieveKnowledge = async (context: ContextType): Promise<void> => {
  const memoryManager = new MeilisearchAdapter({
    apiKey: process.env.MEILISEARCH_API_KEY!,
    host: process.env.MEILISEARCH_HOST!,
  });
  await memoryManager.init("memories");

  const embeddingAdapter = new AIEmbeddingAdapter(
    openai.embedding("text-embedding-3-small")
  );
  const embeddingManager = new EmbeddingManager(embeddingAdapter);
  const embedding = await embeddingManager.embedText(context.prompt.raw);
  context.prompt.embedding = embedding;
};
```

### **Prise de décision**

Un **agent intelligent** doit connaître les **actions disponibles** avant de prendre une décision. Dans notre cas, l'agent utilise un **LLM** pour raisonner et choisir la bonne action.

**Mais comment sait-il quelles actions il peut exécuter ?**\
Il ne peut pas les deviner ! Nous devons lui **fournir une liste structurée** de toutes les actions disponibles.

C'est ici qu'intervient la méthode **`generateActionSchema`**.

La méthode `generateActionSchema` sert à **générer dynamiquement une documentation des actions disponibles** pour l'agent.

**Son rôle :**

* Extraire les **actions** disponibles à partir des workflows enregistrés.
* Générer une **description de chaque action** et de ses **paramètres**.
* Construire un **prompt structuré** que l'IA peut comprendre.

Lorsqu'on initialise l'agent, on lui **fournit une liste de workflows (`GraphFlow`)** qui correspondent à des actions possibles.

Lorsqu'il doit prendre une décision, il utilise `generateActionSchema` pour **lister ces actions** dans son prompt.\
Il peut alors **choisir la meilleure action** à exécuter en fonction de la requête de l'utilisateur.

L'agent récupère toutes les actions disponibles grâce à `generateActionSchema`, il les **convertit en une liste d'actions claires**, il **envoie cette liste au LLM** sous forme d'un **prompt structuré** et le **LLM analyse la requête utilisateur** et choisit **quelle action exécuter**.

Si nous avons les actions suivantes :

```typescript
const availableGraphs = new Map();
availableGraphs.set("prepareEvmTransaction", prepareEvmTransaction);
```

L'agent construira un **prompt comme ceci** :

```
## Available actions:
Action: prepareEvmTransaction
Parameters: z.object({ to: z.string(), value: z.string(), chainName: z.string() })
```

Si l'utilisateur demande : **"Send 0.5 ETH to 0x123 on Sepolia"**,

L'agent pourrait produire ce type de **réponse** :

```json
{
  "actions": [
    {
      "name": "prepareEvmTransaction",
      "parameters": [
        { "name": "to", "value": "0x123" },
        { "name": "value", "value": "0.5" },
        { "name": "chainName", "value": "sepolia" }
      ]
    }
  ],
  "response": "Your transaction has been prepared."
}
```

Grâce à `generateActionSchema`, notre agent **sait exactement ce qu'il peut faire** et **peut guider le LLM** dans sa prise de décision.

Voici un exemple avec **GPT-4o** pour analyser la situation et choisir la meilleure action.

```typescript
import {
  AIEmbeddingAdapter,
  EmbeddingManager,
  GraphContext,
  MeilisearchAdapter,
  GraphFlow
} from "@ai.ntellect/core";
import { openai } from "@ai-sdk/openai";
import { configDotenv } from "dotenv";

configDotenv()

const makeDecision =
  (availableGraphs: Map<string, GraphFlow<any>>) =>
  async (context: ContextType): Promise<void> => {
    const availableActionSchemas = Array.from(availableGraphs.values());

    // Exemple de prompt système
    const systemPrompt = `
## ROLE
You are an AI Assistant.

${context.knowledge ? `## KNOWLEDGE: ${context.knowledge}` : ""}

## PAST ACTIONS (never execute the same action multiple times):
${JSON.stringify(context.executedGraphs, null, 2)}

## AVAILABLE ACTIONS:
${generateActionSchema(availableActionSchemas)}

## AVAILABLE NETWORKS:
${buildNetworkConfigs()}

## INSTRUCTIONS:
- Let empty the actions array if the past actions are enough to answer the user request.
- Based on the user request, decide the next action to execute.
- If more information is needed, ask the user for clarification.
- Answer the user naturally like if is the first time, like "your goal was to X and i have done Y, here is the proof Z",

## OUTPUT EXAMPLES:
{
  "actions": [
    {
      "name": "",
      "parameters": [{ "name": "", "value": ""}, { "name": "", "value": "" }]
    }
  ],
  "response": ""
}
`;

    console.log({ systemPrompt });

    const llmResponse = await generateObject({
      model: openai("gpt-4o"),
      prompt: context.prompt.raw,
      system: systemPrompt,
      schema: z.object({
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.array(
              z.object({
                name: z.string(),
                value: z.any(),
              })
            ),
          })
        ),
        response: z.string(),
      }),
    });

    context.response = llmResponse.object.response;
    context.actions = llmResponse.object.actions;
    console.log("Agent response:");
    console.log(context.response);
    console.log("Actions takens:");
    console.dir(context.actions, { depth: null });
  };
```

***

### **Exécution des actions**

Un problème qu'on peut rencontrer lorsqu'on automatise un agent avec un **LLM** est qu'il peut **réexécuter des actions déjà effectuées**. Selon les cas d'utilisation, ce n'est pas forcément un souci, mais dans certains scénarios (comme des transactions blockchain), cela peut poser problème.

Une manière d'éviter ce comportement est d'utiliser un **historique des actions passées** pour informer l'agent de ce qui a déjà été fait.

Dans cet exemple, on stocke ces actions dans **`executedGraphs`**. Cette variable permet à l'agent de **garder une trace des workflows déjà exécutés** et d'ajuster ses décisions en conséquence.

L'historique des actions intervient à **plusieurs moments** du processus :

1. **Lors de la prise de décision (`makeDecision`)**

Avant de proposer une nouvelle action, l'agent regarde **ce qu'il a déjà fait**. Cela lui permet :

* **D'éviter de refaire une action identique** (exemple : renvoyer une transaction déjà exécutée).
* **D'adapter sa réponse** en fonction des actions passées.
* **De demander des précisions à l'utilisateur** si l'historique ne permet pas encore de conclure.

👉 **Extrait du prompt donné au LLM :**

```typescript
## Past actions (never execute the same action multiple times):
${JSON.stringify(context.executedGraphs, null, 2)}
```

Ainsi, lorsqu'on demande à l'agent **"Envoie 1 ETH à 0x123"**, il peut voir s'il a déjà exécuté une transaction similaire et éviter de la refaire.

2. **Lors de l'exécution des actions (`executeActions`)**

Après qu'une action a été validée et exécutée, **on l'ajoute à l'historique** :

```typescript
context.executedGraphs.push(action.name);
```

Cela garantit que lors du prochain cycle, cette action sera prise en compte dans la prise de décision.

```typescript
import {
  GraphFlow,
  GraphContext
} from "@ai.ntellect/core";

const executeActions =
  (availableGraphs: Map<string, GraphFlow<any>>) =>
  async (context: ContextType): Promise<void> => {
    const workflowsToExecute: GraphFlow<any>[] = [];
    const startNodes: string[] = [];
    const inputs: any[] = [];

    for (const action of context.actions) {
      const workflow = availableGraphs.get(action.name);
      if (!workflow) continue;

      workflowsToExecute.push(workflow);
      startNodes.push(workflow.getNodes()[0].name);
      const actionInputs = action.parameters.reduce((acc, param) => {
        acc[param.name] = param.value;
        return acc;
      }, {} as Record<string, any>);
      inputs.push(actionInputs);
    }

    if (workflowsToExecute.length > 0) {
      const results = await GraphController.executeParallel(
        workflowsToExecute,
        startNodes,
        1,
        inputs
      );
      const assistantActions = Array.from(results.entries()).map(
        ([workflowName, result]) => ({
          workflow: workflowName,
          output: result,
        })
      );

      // Après qu'une action a été validée et exécutée, on l'ajoute à l'historique
      context.executedGraphs.push(JSON.stringify(assistantActions));
    }
  };


```

***

### **Définition de l'agent**

Enfin, nous assemblons notre **agent intelligent** en combinant nos graphes.

Dans cet exemple, notre **agent** est basé sur **deux types de graphes** distincts :

1. **Un graphe cognitif** (`cognitiveGraph`) : Responsable du **raisonnement** et de la prise de décision.
2. **Des graphes d'actions** (`actionsGraph`) : Contient **toutes les actions exécutables** par l'agent.

Ces deux niveaux permettent à l'agent de fonctionner en **pensant d'abord** avant d'exécuter des actions.

Cela s'apparente au mode de raisonnement humain : **analyser une situation avant d'agir**.

Nous définissons un **graph cognitif principal** qui :

1. **Récupère des connaissances** stockées.
2. **Prend une décision** basée sur ces connaissances et les actions disponibles.
3. **Exécute les actions** si nécessaire.
4. **Apprend de ses actions** pour prendre une nouvelle décision (si nécessaire) et éviter les répétitions.

Chaque action est stockée dans un **graphe d'actions**, permettant d'exécuter uniquement des tâches validées.

Le **graphe cognitif** (`cognitiveGraph`) est le **cerveau** de l'agent. Il analyse **le contexte** avant d'exécuter une action.Il peut **refuser d'agir** s'il détecte qu'une action a déjà été exécutée.

**Les graphes d'actions ne sont déclenchés que par une validation.** Un graphe d'action ne peut être exécuté **que si le graphe cognitif le valide**. Cela empêche l'agent d'effectuer des actions **non autorisées** ou **non demandées**.

**L'agent apprend, donc, en mémorisant ses actions :**

Grâce à la variable, `executedGraphs`, injectée dans son contexte, l'agent sait **ce qu'il a déjà fait** et évite de répéter des actions inutiles.

```typescript
class WalletAssistant {
  private cognitiveGraph: GraphFlow<typeof contextSchema>;
  private actions: Map<string, GraphFlow<any>>;

  constructor(actionGraphs: GraphFlow<any>[]) {
    this.actions = new Map(actionGraphs.map((graph) => [graph.name, graph]));

    this.cognitiveGraph = new GraphFlow<typeof contextSchema>("walletAssistant", {
      name: "walletAssistant",
      nodes: [
        {
          name: "retrieveKnowledge",
          execute: retrieveKnowledge,
          next: ["makeDecision"],
        },
        {
          name: "makeDecision",
          execute: makeDecision(this.actions),
          next: (context) => {
            return context.actions.length > 0 ? ["executeActions"] : [];
          },
        },
        {
          name: "executeActions",
          execute: executeActions(this.actions),
          next: (context) => {
            return context.executedGraphs.length > 0
              ? ["saveMemory", "makeDecision"]
              : [];
          },
        },
        { name: "saveMemory", execute: saveMemory },
      ],
      context: {
        prompt: { raw: "", embedding: [] },
        actions: [],
        executedGraphs: [],
        knowledge: "",
        response: "",
      },
      schema: contextSchema,
    });
  }

  async run(prompt: string) {
    return this.cognitiveGraph.execute("retrieveKnowledge", {
      prompt: { raw: prompt },
    });
  }
}
```

***

### Code complet

Nous allons maintenant assembler toutes les pièces du puzzle. Voici le code complet :

```typescript
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { configDotenv } from "dotenv";
import { Chain, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import { z } from "zod";
import {
  AIEmbeddingAdapter,
  EmbeddingManager,
  GraphContext,
  GraphController,
  GraphFlow,
  MeilisearchAdapter,
  generateActionSchema,
} from "@ai.ntellect/core";

configDotenv();

const buildNetworkConfigs = () => {
  const availableChains = Object.entries(chains).reduce(
    (acc, [name, chain]) => {
      // Vérifier si c'est une chaîne valide
      if (typeof chain === "object" && "id" in chain) {
        const networkName = name.toLowerCase();
        acc[networkName] = {
          chain: chain as Chain,
          rpc:
            process.env[`${networkName.toUpperCase()}_RPC_URL`] ||
            chain.rpcUrls.default.http[0],
        };
      }
      return acc;
    },
    {} as Record<
      string,
      {
        chain: Chain;
        rpc: string;
      }
    >
  );

  return availableChains;
};

const networkConfigs = buildNetworkConfigs();

const prepareEvmTransactionNodeSchema = z.object({
  to: z.string(),
  value: z.string(),
  chainName: z.string(),
});

const prepareEvmTransactionContextSchema = z.object({
  balance: z.string(),
  to: z.string(),
  value: z.string(),
  network: z.object({
    chain: z.any(),
    rpc: z.string(),
  }),
  type: z.string(),
  transactionHash: z.string().optional(),
});
const prepareEvmTransaction = new GraphFlow("prepareEvmTransaction", {
  name: "prepareEvmTransaction",
  nodes: [
    {
      name: "checkBalance",
      execute: async (context, inputs) => {
        const networkName = inputs.chainName.toLowerCase();
        const networkConfig = networkConfigs[networkName];
        console.log({ networkConfig });
        if (!networkConfig) {
          throw new Error(
            `Network ${
              inputs.chainName
            } not found. Available networks: ${Object.keys(networkConfigs).join(
              ", "
            )}`
          );
        }

        const publicClient = createPublicClient({
          chain: networkConfig.chain,
          transport: http(networkConfig.rpc),
        });

        console.log("private key", process.env.PRIVATE_KEY);

        context.network = {
          chain: networkConfig.chain,
          rpc: networkConfig.rpc,
        };

        // Vérifier le solde de l'adresse de départ
        const account = privateKeyToAccount(
          `0x${process.env.PRIVATE_KEY}` as `0x${string}`
        );
        const balance = await publicClient.getBalance({
          address: account.address,
        });

        context.balance = balance.toString();
        const valueInWei = BigInt(Math.floor(parseFloat(inputs.value) * 1e18));
        context.value = valueInWei.toString();

        if (BigInt(context.balance) < valueInWei) {
          throw new Error("Insufficient balance");
        }
        if (BigInt(context.balance) > valueInWei) {
          console.log("Good. You have enough balance to send the transaction.");
        }
      },
      next(context) {
        return BigInt(context.balance.toString()) > BigInt(context.value)
          ? ["sendTransaction"]
          : [];
      },
    },
    {
      name: "sendTransaction",
      execute: async (context) => {
        console.log("Sending transaction...");

        const account = privateKeyToAccount(
          `0x${process.env.PRIVATE_KEY}` as `0x${string}`
        );
        const walletClient = createWalletClient({
          account,
          chain: networkConfigs[context.network.chain.name.toLowerCase()].chain,
          transport: http(context.network.rpc),
        });

        const hash = await walletClient.sendTransaction({
          to: context.to as `0x${string}`,
          value: BigInt(context.value),
        });

        console.log(
          `Congratulations! Check on ${context.network.chain.blockExplorers.default.url}/tx/${hash}`
        );
        context.transactionHash = hash;
      },
    },
  ],
  context: {
    balance: "0",
    to: "",
    value: "",
    network: { chain: null, rpc: "" },
    type: "",
    transactionHash: "",
  },
  schema: prepareEvmTransactionContextSchema,
});

// Définition du contexte de l'agent
const contextSchema = z.object({
  prompt: z.object({
    raw: z.string(),
    embedding: z.array(z.number()).optional(),
  }),
  actions: z.array(
    z.object({
      name: z.string(),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.any(),
        })
      ),
    })
  ),
  executedGraphs: z.array(z.string()),
  knowledge: z.string().optional(),
  response: z.string().optional(),
});

type ContextType = GraphContext<typeof contextSchema>;

// Étape 1 : Récupérer les connaissances en mémoire
const retrieveKnowledge = async (context: ContextType): Promise<void> => {
  // Skip if no prompt text
  if (!context.prompt.raw.trim()) {
    return;
  }

  const memoryManager = new MeilisearchAdapter({
    apiKey: process.env.MEILISEARCH_API_KEY!,
    host: process.env.MEILISEARCH_HOST!,
  });
  await memoryManager.init("memories");

  const embeddingAdapter = new AIEmbeddingAdapter(
    openai.embedding("text-embedding-3-small")
  );
  const embeddingManager = new EmbeddingManager(embeddingAdapter);

  try {
    const embedding = await embeddingManager.embedText(context.prompt.raw);
    context.prompt.embedding = embedding;

    const memories = await memoryManager.getAllMemories("memories");
    for (const memory of memories) {
      if (!memory.embedding) continue;
      const similarity = await embeddingManager.calculateSimilarity(
        embedding,
        memory.embedding
      );
      if (similarity > 95) {
        context.knowledge = memory.data;
        return;
      }
    }
  } catch (error) {
    console.error("Error creating embedding:", error);
    // Don't throw, just continue without embedding
  }
};

// Étape 2 : Prendre une décision avec un LLM
const makeDecision =
  (availableGraphs: Map<string, GraphFlow<any>>) =>
  async (context: ContextType): Promise<void> => {
    const availableActionSchemas = Array.from(availableGraphs.values());

    // Exemple de prompt système
    const systemPrompt = `
## ROLE
You are an AI Assistant.

${context.knowledge ? `## KNOWLEDGE: ${context.knowledge}` : ""}

## PAST ACTIONS (never execute the same action multiple times):
${JSON.stringify(context.executedGraphs, null, 2)}

## AVAILABLE ACTIONS:
${generateActionSchema(availableActionSchemas)}

## AVAILABLE NETWORKS:
${buildNetworkConfigs()}

## INSTRUCTIONS:
- Let empty the actions array if the past actions are enough to answer the user request.
- Based on the user request, decide the next action to execute.
- If more information is needed, ask the user for clarification.
- Answer the user naturally like if is the first time, like "your goal was to X and i have done Y, here is the proof Z",

## OUTPUT EXAMPLES:
{
  "actions": [
    {
      "name": "",
      "parameters": [{ "name": "", "value": ""}, { "name": "", "value": "" }]
    }
  ],
  "response": ""
}
`;

    console.log({ systemPrompt });

    const llmResponse = await generateObject({
      model: openai("gpt-4o"),
      prompt: context.prompt.raw,
      system: systemPrompt,
      schema: z.object({
        actions: z.array(
          z.object({
            name: z.string(),
            parameters: z.array(
              z.object({
                name: z.string(),
                value: z.any(),
              })
            ),
          })
        ),
        response: z.string(),
      }),
    });

    context.response = llmResponse.object.response;
    context.actions = llmResponse.object.actions;
    console.log("Agent response:");
    console.log(context.response);
    console.log("Actions takens:");
    console.dir(context.actions, { depth: null });
  };

// Étape 3 : Exécuter les actions décidées
const executeActions =
  (availableGraphs: Map<string, GraphFlow<any>>) =>
  async (context: ContextType): Promise<void> => {
    const workflowsToExecute: GraphFlow<any>[] = [];
    const startNodes: string[] = [];
    const inputs: any[] = [];

    for (const action of context.actions) {
      const workflow = availableGraphs.get(action.name);
      if (!workflow) continue;

      workflowsToExecute.push(workflow);
      startNodes.push(workflow.getNodes()[0].name);
      const actionInputs = action.parameters.reduce(
        (acc: Record<string, any>, param: any) => {
          acc[param.name] = param.value;
          return acc;
        },
        {}
      );
      inputs.push(actionInputs);
    }

    if (workflowsToExecute.length > 0) {
      const results = await GraphController.executeParallel(
        workflowsToExecute,
        startNodes,
        1,
        inputs
      );
      const assistantActions = Array.from(results.entries()).map(
        ([workflowName, result]) => ({
          workflow: workflowName,
          output: result,
        })
      );

      context.executedGraphs.push(JSON.stringify(assistantActions));
    }
  };

// Étape 4 : Sauvegarder les connaissances pour les prochaines interactions
const saveMemory = async (context: ContextType): Promise<void> => {
  if (!context.response) return;

  const memoryManager = new MeilisearchAdapter({
    apiKey: process.env.MEILISEARCH_API_KEY!,
    host: process.env.MEILISEARCH_HOST!,
  });
  await memoryManager.init("memories");

  await memoryManager.createMemory({
    data: context.executedGraphs.join(", "),
    roomId: "memories",
    embedding: context.prompt.embedding,
  });
};

// Définition du GraphFlow de l'agent
class WalletAssistant {
  private workflow: GraphFlow<typeof contextSchema>;
  private availableGraphs: Map<string, GraphFlow<any>>;

  constructor(graphs: GraphFlow<any>[]) {
    this.availableGraphs = new Map(graphs.map((graph) => [graph.name, graph]));

    this.workflow = new GraphFlow<typeof contextSchema>("walletAssistant", {
      name: "walletAssistant",
      nodes: [
        {
          name: "retrieveKnowledge",
          execute: retrieveKnowledge,
          next: ["makeDecision"],
        },
        {
          name: "makeDecision",
          execute: makeDecision(this.availableGraphs),
          next: (context) => {
            return context.actions.length > 0 ? ["executeActions"] : [];
          },
        },
        {
          name: "executeActions",
          execute: executeActions(this.availableGraphs),
          next: (context) => {
            return context.executedGraphs.length > 0
              ? ["saveMemory", "makeDecision"]
              : [];
          },
        },
        { name: "saveMemory", execute: saveMemory },
      ],
      context: {
        prompt: { raw: "" },
        actions: [],
        executedGraphs: [],
        knowledge: "",
        response: "",
      },
      schema: contextSchema,
    });
  }

  async run(prompt: string) {
    if (!prompt.trim()) {
      throw new Error("Prompt cannot be empty");
    }
    return this.workflow.execute("retrieveKnowledge", {
      prompt: { raw: prompt },
      actions: [],
      executedGraphs: [],
      knowledge: "",
      response: "",
    });
  }
}

const availableGraphs = [
  prepareEvmTransaction, // Graph pour envoyer des transactions EVM
  //anotherWorkflow, // Un autre workflow d'exécution
  // On peut ajouter d'autres workflows ici
];

const walletAssistant = new WalletAssistant(availableGraphs);

(async () => {
  await walletAssistant.run(
    "Send 0.0000001 ETH to 0xf520cEd3b7FdA050a3A44486C160BEAb15ED3285 on sepolia..."
  );
})();

```

**Félicitations ! Vous avez créé un agent capable d'interagir et d'exécuter des transactions blockchain !**

### **Tester l'agent**

L'agent peut gérer **plusieurs workflows en parallèle** grâce à `availableGraphs`.\
Ce tableau permet de **répertorier** toutes les **actions possibles** que l'agent peut exécuter.

```typescript
const availableGraphs = [
  prepareEvmTransaction, // Graph pour envoyer des transactions EVM
  anotherWorkflow,       // Un autre workflow d'exécution
  // On peut ajouter d'autres workflows ici
];

const walletAssistant = new WalletAssistant(availableGraphs);
```

Maintenant que l'agent est défini, nous pouvons l'utiliser pour **exécuter une action** :

```typescript
(async () => {
  await walletAssistant.run(
    "Send 0.0000001 ETH to 0xf520cEd3b7FdA050a3A44486C160BEAb15ED3285 on sepolia..."
  );
})();
```

* L'agent **détecte la demande** et **choisit le bon graph d'action**.
* Il **évite les actions déjà réalisées** grâce à `executedGraphs`.
* Il **mémorise l'historique** et peut **apprendre** de ses actions.

### **Récapitulatif**

Nous avons vu comment exploiter la puissance du framework **@ai.ntellect/core** en combinant :

* **Un graph cognitif** pour structurer le raisonnement.
* **Des graphes d'actions** pour exécuter des tâches spécifiques.

Cette architecture **modulaire et évolutive** permet d'ajouter de nouvelles actions et d'adapter l'agent à différents cas d'usage.

**Ce n'est qu'un exemple parmi d'autres** : chacun peut créer son propre **graphe cognitif** et ses **graphes d'actions** en fonction de ses besoins spécifiques.
