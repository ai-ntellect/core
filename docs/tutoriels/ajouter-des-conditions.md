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

1. **Convertit un texte en majuscules**.
2. **Vérifie la longueur du texte**.
3. **Si le texte fait plus de 10 caractères**, il est marqué comme **"LONG"**.
4. **Sinon**, il est marqué comme **"COURT"**.

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

// Nœud 1 : Convertir le texte en majuscules
const processText: GraphNodeConfig<typeof schema> = {
  name: "processText",
  execute: async (context) => {
    context.processed = context.input.toUpperCase();
    console.log("Texte transformé :", context.processed);
  },
  next: (context) => {
    return (context.processed?.length ?? 0) > 10
      ? ["longTextHandler"]
      : ["shortTextHandler"];
  },
};

// Nœud 2A : Gérer un texte long
const longTextHandler: GraphNodeConfig<typeof schema> = {
  name: "longTextHandler",
  execute: async (context) => {
    context.result = `LONG: ${context.processed}`;
    console.log("Le texte est long :", context.result);
  },
  next: ["logResult"],
};

// Nœud 2B : Gérer un texte court
const shortTextHandler: GraphNodeConfig<typeof schema> = {
  name: "shortTextHandler",
  execute: async (context) => {
    context.result = `COURT: ${context.processed}`;
    console.log("Le texte est court :", context.result);
  },
  next: ["logResult"],
};

// Nœud final : Afficher le résultat
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    console.log("Résultat final :", context.result);
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
  console.log("Exécution avec un texte court");
  await graph.execute("processText", { input: "Hello" });

  console.log("Exécution avec un texte long");
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
* `shortTextHandler` marque le texte comme **"COURT"**.
* Le `logResult` affiche le **résultat final**.

***

### **Résultat attendu**

#### Cas 1 : **Texte court**

```
Exécution avec un texte court
Texte transformé : HELLO
Le texte est court : COURT: HELLO
Résultat final : COURT: HELLO
```

#### Cas 2 : **Texte long**

```
Exécution avec un texte long
Texte transformé : HELLO GRAPHFLOW!
Le texte est long : LONG: HELLO GRAPHFLOW!
Résultat final : LONG: HELLO GRAPHFLOW!
```
