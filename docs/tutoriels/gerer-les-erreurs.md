---
description: >-
  Implémentez des stratégies de gestion d'erreurs, définissez des tentatives de
  reprise et assurez-vous que votre graphe réagit aux échecs de manière
  contrôlée.
---

# Gérer les erreurs

Dans ce tutoriel, nous allons voir **comment gérer les erreurs et les retries** dans un graphe **GraphFlow**.

L'objectif est de :

* **Détecter une erreur** et l'afficher.
* **Mettre en place un retry automatique** en cas d'échec d'un nœud.
* **Continuer l'exécution même après un échec** si nécessaire.

***

### **Ajouter une gestion des erreurs et retries**

Nous allons **modifier le nœud `retrieveData`** pour qu'il **puisse échouer** et **être retenté automatiquement**.

#### **Modification :**

* On ajoute une **erreur simulée** dans `retrieveData`.
* On active un **retry** avec `maxAttempts: 2` et un délai de 2 secondes.
* Si le retry échoue, on affiche un message et on continue l'exécution.

Voici **le code complet avec cette nouvelle gestion** :

```typescript
import { GraphFlow, GraphNodeConfig } from "@ai.ntellect/core";
import { z } from "zod";

// Définition du contexte
const schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});

// Step 1: Retrieve data (with simulated error)
const retrieveData: GraphNodeConfig<typeof schema> = {
  name: "retrieveData",
  execute: async (context) => {
    console.log("Attempting to retrieve data...");
    if (Math.random() < 0.7) {
      throw new Error("Simulated error during data retrieval!");
    }
    context.input = "Hello, GraphFlow!";
      console.log("Data retrieved:", context.input);
  },
  retry: {
    maxAttempts: 2, // On tente 2 fois avant d'abandonner
    delay: 2000, // 2 secondes d'attente entre chaque tentative
    onRetryFailed: async (error) => {
      console.log("❌ Retry failed:", error.message);
    },
    continueOnFailed: true, // On continue l'exécution même en cas d'échec
  },
  next: ["processData"],
};

// Step 2: Transform data
const processData: GraphNodeConfig<typeof schema> = {
  name: "processData",
  execute: async (context) => {
    if (!context.input) {
      console.log("No data retrieved, cannot transform.");
      return;
    }
    context.processed = context.input.toUpperCase();
    console.log("Data transformed:", context.processed);
  },
  next: ["logResult"],
};

// Step 3: Display result
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    if (!context.processed) {
       console.log("No result to display.");
      return;
    }
    console.log("Final Result:", context.result);
  },
};

// Construction du graphe
const graphDefinition = {
  name: "SimpleGraph",
  nodes: [retrieveData, processData, logResult],
  context: { input: "" },
  schema,
  entryNode: "retrieveData",
};

// Exécution du graphe
const graph = new GraphFlow("SimpleGraph", graphDefinition);

(async () => {
  try {
    console.log("Executing graph...");
    await graph.execute("retrieveData");
     console.log("Graph completed!");
  } catch (error) {
     console.error("Error:", error);
  }
})();
```

***

### **Explication des changements**

1. **Simulated error in `retrieveData`** : 70% chance of failure.
2. **Automatic retry** : Up to 2 attempts with **2 second delay**.
3. **If retry fails**, a message is displayed (`onRetryFailed`).
4. **Continue execution** even if `retrieveData` fails (`continueOnFailed: true`).
5. **If data retrieval completely fails**, `processData` and `logResult` execute but display a warning.

**Important** : Le graphe peut avoir **différents comportements** en fonction de si l'erreur est résolue ou non après les retries.
