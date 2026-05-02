---
description: >-
  Ajoutez des conditions pour orienter l'exécution en fonction des données du
  contexte. Créez des branches conditionnelles pour adapter le parcours.
---

# Ajouter des conditions

Dans ce tutoriel, nous allons apprendre **comment prendre des décisions dynamiques** dans un **GraphFlow**. Nous allons modifier notre graphe pour **choisir un chemin d'exécution** en fonction des données du contexte.

Cela permet de :

* **Modifier le flux d'exécution** en fonction des entrées.
* **Créer des branches conditionnelles** (ex : Si `x > 10`, alors `A`, sinon `B`).
* **Améliorer la flexibilité du graphe** en lui permettant de s'adapter aux données.

***

### **Ajouter des conditions à un graphe**

Nous allons **ajouter une logique conditionnelle** qui :

1. **Convert text to uppercase**.
2. **Check text length**.
3. **If text length > 10**, mark as **"LONG"**.
4. **Else**, mark as **"SHORT"**.

Nous utiliserons **une fonction `next` dynamique** qui **choisit** la prochaine étape en fonction des données.

***

### **Implémentation du graphe avec logique conditionnelle**

Nous allons modifier **notre précédent GraphFlow** pour ajouter **deux branches conditionnelles**.

```typescript
import { GraphFlow, GraphNodeConfig } from "@ai.ntellect/core";
import { z } from "zod";

// Définition du schéma du contexte
const schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});

// Node 1: Convert text to uppercase
const processText: GraphNodeConfig<typeof schema> = {
  name: "processText",
  execute: async (context) => {
    context.processed = context.input.toUpperCase();
    console.log("Text transformed:", context.processed);
  },
  next: (context) => {
    return (context.processed?.length ?? 0) > 10
      ? ["longTextHandler"]
      : ["shortTextHandler"];
  },
};

// Node 2A: Handle long text
const longTextHandler: GraphNodeConfig<typeof schema> = {
  name: "longTextHandler",
  execute: async (context) => {
    context.result = `LONG: ${context.processed}`;
    console.log("Long text:", context.result);
  },
  next: ["logResult"],
};

// Node 2B: Handle short text
const shortTextHandler: GraphNodeConfig<typeof schema> = {
  name: "shortTextHandler",
  execute: async (context) => {
    context.result = `COURT: ${context.processed}`;
    console.log("Short text:", context.result);
  },
  next: ["logResult"],
};

// Final node: Display result
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    console.log("Final result:", context.result);
  },
};

// Création du graphe
const graph = new GraphFlow("GraphWithDecision", {
  name: "GraphWithDecision",
  nodes: [processText, longTextHandler, shortTextHandler, logResult],
  context: { input: "" },
  schema,
  entryNode: "processText",
});

// Exécution du graphe avec différents inputs
(async () => {
    console.log("Execution with short text");
    // ...
    console.log("Execution with long text");
  await graph.execute("processText", { input: "Hello GraphFlow!" });
})();
```

***

### **Explication du code**

#### **Ajout d’un `next` dynamique**

```typescript
next: (context) => {
  return (context.processed?.length ?? 0) > 10
    ? ["longTextHandler"]
    : ["shortTextHandler"];
},
```

* **Si le texte est long** (`> 10 caractères`), on va vers **`longTextHandler`**.
* **Sinon**, on va vers **`shortTextHandler`**.

#### **Affichage du résultat final**

* `longTextHandler` marque le texte comme **"LONG"**.
* `shortTextHandler` marque le texte comme **"SHORT"**.
* Le `logResult` affiche le **résultat final**.

***

### **Résultat attendu**

#### Cas 1 : **Texte court**

```
Execution with short text
Text transformed: HELLO
Short text: COURT: HELLO
Final result: COURT: HELLO
```

#### Cas 2 : **Long text**

```
Execution with long text
Text transformed: HELLO GRAPHFLOW!
Long text: LONG: HELLO GRAPHFLOW!
Final result: LONG: HELLO GRAPHFLOW!
```
