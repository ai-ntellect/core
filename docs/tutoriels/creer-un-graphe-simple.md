---
description: >-
  Définissez un graphe avec des nœuds de base, enchaînez les étapes et exécutez
  votre premier workflow automatisé.
---

# Créer un graphe simple

Dans ce tutoriel, nous allons voir comment :

1. **Définir un contexte** pour stocker des données.
2. **Créer des nœuds** qui exécutent des actions spécifiques.
3. **Construire un graphe** pour connecter ces nœuds.
4. **Exécuter le graphe** et observer le résultat.

***

### **Définition du contexte**

Dans **GraphFlow**, un **contexte** est un espace de stockage partagé entre tous les nœuds du graphe. Nous allons utiliser **Zod** pour définir un **schéma de données** qui spécifie quelles informations seront manipulées par nos nœuds.

```ts
import { GraphFlow, GraphNodeConfig } from "@ai.ntellect/core";
import { z } from "zod";

// Définition du contexte avec un schéma Zod
const schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});Explication :
```

* `input` : La donnée initiale à traiter.
* `processed` : La version modifiée de `input`.
* `result` : Le résultat final après transformation.

***

### **Création des nœuds**

Un **nœud** est une unité d’exécution dans **GraphFlow**. Chaque nœud possède :

* Un **nom** (ex : `retrieveData`).
* Une **fonction `execute`** qui effectue une action sur le contexte.
* Une **liste `next`** pour définir quels nœuds seront exécutés après.

#### **1. Récupérer une donnée**

Le premier nœud stocke une donnée initiale dans `context.input` :

```ts
const retrieveData: GraphNodeConfig<typeof schema> = {
  name: "retrieveData",
  execute: async (context) => {
    context.input = "Hello, GraphFlow!";
    console.log("Donnée récupérée :", context.input);
  },
  next: ["processData"],
};
```

#### **2. Transformer la donnée**

Ce nœud transforme `context.input` en majuscules et stocke le résultat dans `context.processed` :

```ts
const processData: GraphNodeConfig<typeof schema> = {
  name: "processData",
  execute: async (context) => {
    context.processed = context.input.toUpperCase();
    console.log("Donnée transformée :", context.processed);
  },
  next: ["logResult"],
};
```

#### **3. Afficher le résultat**

Le dernier nœud affiche le résultat final dans la console :

```ts
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    context.result = `Résultat final: ${context.processed}`;
    console.log(context.result);
  },
};
```

***

### **Construction du graphe**

Nous devons maintenant assembler ces nœuds dans un **graphe** :

```ts
const graphDefinition = {
  name: "SimpleGraph",
  nodes: [retrieveData, processData, logResult],
  context: { input: "" }, // Valeur initiale du contexte
  schema, // Schéma de validation des données
  entryNode: "retrieveData", // Point d'entrée du graphe
};
```

**Explication** :

* Le **nom** du graphe est `"SimpleGraph"`.
* Les **nœuds** sont listés dans `nodes`.
* Le **contexte initial** ne contient qu’une chaîne vide (`input: ""`).
* `entryNode` indique que l'exécution commence par `retrieveData`.

***

### **Exécution du graphe**

Enfin, nous allons instancier **GraphFlow** et exécuter notre graphe :

```ts
const graph = new GraphFlow("SimpleGraph", graphDefinition);

(async () => {
  try {
    console.log("Exécution du graphe...");
    await graph.execute("retrieveData"); // Lancement depuis le premier nœud
    console.log("Graphe terminé !");
  } catch (error) {
    console.error("Erreur :", error);
  }
})();
```

***

### **Code complet**

Voici le code complet du tutoriel, regroupé en un seul fichier :

```ts
import { GraphFlow, GraphNodeConfig } from "@ai.ntellect/core";
import { z } from "zod";

// Définition du contexte avec un schéma Zod
const schema = z.object({
  input: z.string(),
  processed: z.string().optional(),
  result: z.string().optional(),
});

// Nœud 1 : Récupérer une donnée
const retrieveData: GraphNodeConfig<typeof schema> = {
  name: "retrieveData",
  execute: async (context) => {
    context.input = "Hello, GraphFlow!";
    console.log("Donnée récupérée :", context.input);
  },
  next: ["processData"],
};

// Nœud 2 : Transformer la donnée
const processData: GraphNodeConfig<typeof schema> = {
  name: "processData",
  execute: async (context) => {
    context.processed = context.input.toUpperCase();
    console.log("Donnée transformée :", context.processed);
  },
  next: ["logResult"],
};

// Nœud 3 : Afficher le résultat
const logResult: GraphNodeConfig<typeof schema> = {
  name: "logResult",
  execute: async (context) => {
    context.result = `Résultat final: ${context.processed}`;
    console.log(context.result);
  },
};

// Définition du graphe
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

Ce fichier peut être exécuté tel quel pour tester le fonctionnement du graphe.

### **Résultat attendu**

Lorsque l'on exécute ce script, voici ce qui s'affichera dans la console :

```sh
Exécution du graphe...
Donnée récupérée : Hello, GraphFlow!
Donnée transformée : HELLO, GRAPHFLOW!
Résultat final: HELLO, GRAPHFLOW!
Graphe terminé !
```

### **Récapitulatif**

Ce que nous avons appris :

* **Définir un contexte** avec **Zod** pour structurer les données.
* **Créer des nœuds** (`retrieveData`, `processData`, `logResult`).
* **Connecter les nœuds** dans un **graphe exécutable**.
* **Lancer et observer l'exécution** du graphe.

Ce tutoriel vous donne une **base solide** pour explorer des graphes plus complexes, incluant **conditions, parallélisation et interopérabilité avec des services externes**.

**Prochaines étapes** :

* Ajouter un **nœud conditionnel** pour modifier le flux d’exécution.
* Intégrer une **interaction avec une API externe**.
* Stocker et récupérer des données avec un **module mémoire**.

***
