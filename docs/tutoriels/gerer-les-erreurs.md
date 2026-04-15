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

// Étape 1 : Récupérer une donnée (avec erreur simulée)
const retrieveData: GraphNodeConfig<typeof schema> = {
  name: "retrieveData",
  execute: async (context) => {
    console.log("Tentative de récupération de la donnée...");
    if (Math.random() < 0.7) {
      throw new Error("Erreur simulée lors de la récupération des données !");
    }
    context.input = "Hello, GraphFlow!";
    console.log("Donnée récupérée :", context.input);
  },
  retry: {
    maxAttempts: 2, // On tente 2 fois avant d'abandonner
    delay: 2000, // 2 secondes d'attente entre chaque tentative
    onRetryFailed: async (error) => {
      console.log("❌ Retry échoué :", error.message);
    },
    continueOnFailed: true, // On continue l'exécution même en cas d'échec
  },
  next: ["processData"],
};

// Étape 2 : Transformer la donnée
const processData: GraphNodeConfig<typeof schema> = {
  name: "processData",
  execute: async (context) => {
    if (!context.input) {
      console.log("Aucune donnée récupérée, transformation impossible.");
      return;
    }
    context.processed = context.input.toUpperCase();
    console.log("Donnée transformée :", context.processed);
  },
  next: ["logResult"],
};

// Étape 3 : Afficher le résultat
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    if (!context.processed) {
      console.log("Aucun résultat à afficher.");
      return;
    }
    context.result = `Résultat Final: ${context.processed}`;
    console.log(context.result);
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
    console.log("Exécution du graphe...");
    await graph.execute("retrieveData");
    console.log("Graphe terminé !");
  } catch (error) {
    console.error("Erreur :", error);
  }
})();
```

***

### **Explication des changements**

1. **Erreur simulée dans `retrieveData`** : 70% de chances d'échouer.
2. **Retry automatique** : Jusqu'à 2 tentatives avec un **délai de 2 secondes**.
3. **Si le retry échoue**, un message est affiché (`onRetryFailed`).
4. **On continue l'exécution** même si `retrieveData` a échoué (`continueOnFailed: true`).
5. **Si la récupération des données échoue complètement**, `processData` et `logResult` s'exécutent mais affichent un avertissement.

**Important** : Le graphe peut avoir **différents comportements** en fonction de si l'erreur est résolue ou non après les retries.

***

### **Récapitulatif**

Dans ce tutoriel, nous avons appris :&#x20;

* **Comment gérer les erreurs** dans un nœud.
* **Comment ajouter des retries** avec un nombre maximum de tentatives.
* **Comment continuer l'exécution** même après un échec.
* **Comment gérer les cas où une donnée n'est pas disponible**.
