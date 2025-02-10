import { Node } from "types";
import { z } from "zod";
import { GraphController, GraphFlow } from "./index";

// 🏗 Définition des schémas pour chaque graphe
const schemaA = z.object({
  input: z.string(),
  result: z.string().optional(),
});

const schemaB = z.object({
  number: z.number(),
  result: z.number().optional(),
});

// 🔹 **Graph A** : Convertit une chaîne en majuscules
const processText: Node<typeof schemaA> = {
  name: "processText",
  execute: async (context) => {
    context.result = context.input.toUpperCase();
    console.log("📢 Graphe A : Texte transformé →", context.result);
  },
};

// 🔹 **Graph B** : Multiplie un nombre par 10
const multiplyNumber: Node<typeof schemaB> = {
  name: "multiplyNumber",
  execute: async (context) => {
    context.result = context.number * 10;
    console.log("🔢 Graphe B : Nombre multiplié →", context.result);
  },
};

// 🔗 **Création des graphes**
const graphA = new GraphFlow("GraphA", {
  name: "GraphA",
  nodes: [processText],
  context: { input: "" },
  schema: schemaA,
});

const graphB = new GraphFlow("GraphB", {
  name: "GraphB",
  nodes: [multiplyNumber],
  context: { number: 0 },
  schema: schemaB,
});

(async () => {
  try {
    console.log("🚀 **Exécution Séquentielle** des graphes...");
    const sequentialResults = await GraphController.executeSequential(
      [graphA, graphB],
      ["processText", "multiplyNumber"],
      [{ input: "hello world" }, { number: 5 }]
    );

    console.log("🟢 **Résultats Séquentiels :**", sequentialResults);

    console.log(
      "\n⚡ **Exécution Parallèle** avec limitation de concurrence..."
    );
    const parallelResults = await GraphController.executeParallel(
      [graphA, graphB],
      ["processText", "multiplyNumber"],
      1, // ⚠️ Limite de concurrence (1 à la fois)
      [{ input: "parallel execution" }, { number: 7 }]
    );

    console.log("🟢 **Résultats Parallèles :**", parallelResults);
  } catch (error) {
    console.error("❌ Erreur lors de l’exécution :", error);
  }
})();
