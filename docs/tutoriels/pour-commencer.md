---
description: >-
  Configurez votre environnement et installez les dépendances nécessaires pour
  utiliser GraphFlow. Découvrez les bases du framework et comment initialiser un
  projet.
---

# Pour commencer

Avant d’utiliser **@ai.ntellect/core**, cette section vous guide à travers **l’installation des outils nécessaires** et la **configuration initiale du projet**.

***

### **Outils et prérequis**

#### **Node.js et npm**

**@ai.ntellect/core** fonctionne dans un environnement **Node.js**. Nous recommandons d’installer la version **LTS (Long Term Support)** pour assurer stabilité et compatibilité.

**Vérifiez votre installation avec** :

```sh
node -v
npm -v
```

Si Node.js n’est pas installé, téléchargez-le depuis [nodejs.org](https://nodejs.org/).

***

#### **TypeScript et Zod**

**@ai.ntellect/core** utilise **TypeScript** pour garantir un code structuré et sécurisé, facilitant la gestion des types et l’intégration des workflows.

Le framework repose également sur **Zod** pour la validation des données, assurant une cohérence stricte des structures de contexte et des interactions entre les nœuds d’exécution.

***

### **Installation du framework**

#### **Création d’un projet Node.js**

Commencez par créer un **nouveau projet Node.js** :

```sh
mkdir ai-ntellect-demo
cd ai-ntellect-demo
npm init -y
```

Ajoutez **TypeScript et les types Node.js** :

```sh
npm install --save-dev typescript @types/node
npx tsc --init
```

***

#### **Installation de @ai.ntellect/core**

Ajoutez le framework et ses dépendances :

```sh
npm install @ai.ntellect/core zod
```

***

### **Vérification de l’installation**

Une fois l’installation terminée, vérifions que tout fonctionne correctement en créant un premier fichier de test.

Dans le dossier de votre projet, créez un fichier `index.ts` :

```sh
touch index.ts
```

***

#### **Ajout du code de vérification**

Ajoutez le code suivant dans **`index.ts`** pour créer et exécuter un **GraphFlow simple** :

```ts
import { GraphFlow } from "@ai.ntellect/core";
import { z } from "zod";

// Définition du schéma du contexte
const ContextSchema = z.object({
  message: z.string(),
});

type ContextSchema = typeof ContextSchema;

// Création d’un GraphFlow simple
const myGraph = new GraphFlow<ContextSchema>("TestGraph", {
  name: "TestGraph",
  context: { message: "Installation réussie !" },
  schema: ContextSchema,
  nodes: [
    {
      name: "printMessage",
      execute: async (context) => {
        console.log(context.message);
      },
      next: [],
    },
  ],
});

// Exécution du graphe
(async () => {
  await myGraph.execute("printMessage");
})();
```

***

### **Exécution du test**

Exécutez le fichier avec la commande suivante :

```sh
npx ts-node index.ts
```

#### **Sortie console attendue :**

```
Installation réussie !
```

Si ce message s’affiche, cela signifie que **l’installation est réussie** et que votre environnement est prêt.

Dans la prochaine section, nous verrons **comment créer un premier graphe d’exécution** et automatiser des workflows intelligents avec **@ai.ntellect/core**.
