# AI.ntellect Core Framework

## Table des matières

1. [Composants principaux](#composants-principaux)
   - [Orchestrator](#orchestrator)
   - [Queue Manager](#queue-manager)
   - [Synthétiseur](#synthétiseur)
   - [Mémoire Cache (CAG)](#mémoire-cache-cag)
2. [Création et gestion des actions](#création-et-gestion-des-actions)
3. [Exécution du Workflow](#exécution-du-workflow)
4. [Appels API et côté client](#appels-api-et-côté-client)
5. [WIP (Work in Progress)](#wip-work-in-progress)

---

## 1. Composants principaux

Le système repose sur plusieurs composants clés qui assurent une gestion fluide et efficace des actions et du processus global de workflow.

### Orchestrator

L'orchestrateur est responsable de la gestion de l'exécution des actions dans un workflow. Il analyse les besoins en fonction des entrées (comme le prompt utilisateur) et décide de l'ordre des actions à effectuer. Il interagit avec les autres composants comme la mémoire cache et les événements pour organiser l'exécution des tâches.

- **Rôle principal** : Organiser et diriger l'exécution des actions.
- **Interactions** :
  - Demande des actions à exécuter.
  - Utilise la mémoire cache pour éviter la redondance.
  - Émet des événements pour informer les autres composants de l'état du workflow.

### Queue Manager

Le gestionnaire de la file d'attente (Queue Manager) organise les actions à exécuter et gère leur ordre d'exécution. Il permet de maintenir un flux fluide d'exécution, en ajoutant les actions à la file d'attente selon les priorités définies par l'orchestrateur.

- **Rôle principal** : Gérer la file d'attente des actions et s'assurer qu'elles sont exécutées dans le bon ordre.
- **Fonctions principales** :
  - Ajouter de nouvelles actions à la file d'attente.
  - Gérer les priorités des actions.
  - Assurer une exécution correcte et en temps voulu des actions.

### Synthétiseur

Le synthétiseur est responsable de la génération des réponses et de l'analyse des actions en fonction des résultats obtenus dans le workflow. Il peut créer des résumés ou des réponses plus complexes à partir des résultats bruts obtenus lors de l'exécution des actions.

- **Rôle principal** : Transformer les résultats des actions en une sortie compréhensible et structurée.
- **Interactions** :
  - Prend les résultats des actions exécutées.
  - Crée des résumés ou des réponses adaptées.

### Cache Augmented Generation (CAG)

Le CAG (Cache Augmented Generation) joue un rôle clé dans l'optimisation des workflows en stockant les résultats intermédiaires des actions effectuées. Cela permet de les réutiliser lors des workflows futurs, évitant ainsi des répétitions inutiles et améliorant l'efficacité globale du système.

Dans le contexte de notre projet, le CAG sert principalement de **mémoire procédurale**, un type spécifique de mémoire qui se concentre sur la réutilisation des résultats intermédiaires dans des contextes similaires. Contrairement à d'autres types de mémoire, comme la mémoire **épisodique** (qui conserve les expériences passées) ou la mémoire **sémantique** (qui stocke des connaissances générales), la mémoire procédurale est axée sur l'exécution de tâches répétitives ou d'actions précédemment effectuées.

- **Rôle principal** : Sauvegarder les résultats des actions pour les réutiliser lors d'exécutions futures.

- **Fonctions principales** :
  - **Sauvegarde des résultats des actions** : Les résultats des actions sont stockés de manière à être facilement accessibles lorsque nécessaire.
  - **Réutilisation des résultats** : Les résultats peuvent être fournis à la demande, ce qui évite des recalculs inutiles.
  - **Optimisation des workflows** : En réutilisant des actions déjà exécutées, la mémoire cache optimise les workflows en éliminant les étapes redondantes.

La mémoire procédurale permet de renforcer l'efficacité du système en réduisant le temps de calcul et en garantissant que les processus répétitifs sont traités plus rapidement et plus efficacement.

---

## 2. Création et gestion des actions

Les actions sont des tâches spécifiques à réaliser dans le cadre du workflow. Elles peuvent être des interactions avec des APIs, des transactions blockchain, ou toute autre opération nécessaire.

Chaque action est définie comme un objet contenant un nom, une description, des paramètres, et une fonction d'exécution.

### Exemple d'action

```typescript
import { networkConfigs } from "@config/network";
import { parseEther } from "ethers";
import { z } from "zod";

export const prepareTransaction = {
  name: "prepare-transaction",
  description: "Préparer un transfert pour que l'utilisateur la signe.",
  parameters: z.object({
    walletAddress: z.string(),
    amount: z.string().describe("Montant à envoyer"),
    networkId: z
      .string()
      .describe("Réseau cible (par exemple, ethereum, arbitrum)"),
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
        throw new Error(`Réseau ${network} non trouvé`);
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
      return "Erreur lors de la préparation de la transaction";
    }
  },
};
```

### Comment définir une action :

1. **Nom** : Identifiant unique pour l'action.
2. **Description** : Brève description de ce que fait l'action.
3. **Paramètres** : Les paramètres nécessaires pour l'exécution de l'action, validés par `zod`.
4. **Exécution** : Fonction `execute` qui effectue l'action.

---

## 3. Exécution du workflow

Le workflow représente l'ensemble du processus d'exécution d'un certain nombre d'actions définies. Lorsqu'un utilisateur envoie un prompt, l'orchestrateur détermine les actions à exécuter en fonction des besoins.

### Exemple de création d'un workflow :

```typescript
const tools = [
  prepareEvmTransaction,
  getNews, // Exemple d'action pour obtenir les dernières nouvelles
];

const orchestrator = new Orchestrator(tools);

const workflow = new Workflow(
  { id: from }, // ID utilisateur ou contexte
  { orchestrator, memoryCache, eventEmitter } // Composants nécessaires
);
```

- **Orchestrator** : Gestion de l'ordre des actions.
- **MemoryCache** : Réutilisation des résultats précédents.
- **EventEmitter** : Suivi et notification de l'état du workflow.

### Processus du workflow :

1. Le prompt utilisateur est analysé.
2. L'orchestrateur décide des actions nécessaires et leur ordre.
3. Les actions sont exécutées.
4. Les résultats sont synthétisés et renvoyés à l'utilisateur.

---

## 4. Appels API et côté client

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
      <button onClick={handleSubmit}>Envoyer</button>
    </div>
  );
}
```

---

## 5. WIP (Work in Progress)

Voici les éléments actuellement en développement ou à améliorer :

- Voici la version corrigée avec les titres en minuscules et des checklists en français sous chaque section :

---

## Mémoire et RAG (Retrieval Augmented Generation)

**Objectif** : Créer un système de mémoire persistante qui conserve le contexte à travers les sessions et améliore l'apprentissage de l'agent au fil du temps en intégrant des sources de connaissances externes.

**Intérêt** :

- La mémoire à long terme permet à l'agent de se souvenir des interactions passées et d'accéder à des connaissances externes pertinentes.
- Des réponses plus contextuelles et personnalisées.
- Amélioration de l'efficacité et de la précision des interactions.
- Réduction des réponses incorrectes ou obsolètes.
- Permet un apprentissage et une adaptation continus.

**Étapes à mettre en place** :

**Infrastructure de mémoire** :

- [x] Intégration d'une base de données vectorielle.
- [x] Système de récupération basé sur la pertinence.
- [ ] Consolidation et nettoyage automatique de la mémoire.
- [ ] Hiérarchie de la mémoire (working/long-term memory).

**Intégration des connaissances** :

- [ ] Pipeline de traitement des documents.
- [ ] Intégration de la base de connaissances.
- [ ] Système de vérification des sources.
- [ ] Récupération contextuelle.
- [ ] Capacités de recherche sémantique.

**Types de mémoire** :

- [ ] Épisodique : Interactions et expériences passées.
- [ ] Sémantique : Connaissances et faits externes.
- [x] Procédurale : Modèles et workflows appris.

**Statut** : Implémentation de base avec Redis terminée, intégration de la base de données vectorielle et pipeline RAG en cours. Conception de l'architecture finalisée, avec une implémentation initiale lancée.

---

## Collaboration multi-agent

**Objectif** : Permettre à plusieurs agents de collaborer sur des tâches complexes avec spécialisation et coordination.

**Intérêt** : La collaboration entre agents permet de diviser les tâches complexes en sous-tâches spécialisées, améliorant ainsi l'efficacité et la qualité des résultats. Elle permet également une meilleure gestion des ressources et une adaptation plus rapide aux changements.

**Étapes à réaliser** :

- [ ] Mise en place d'un cadre de délégation des tâches.
- [ ] Gestion partagée du contexte.
- [ ] Établissement de protocoles de résolution des conflits.

**Statut** : Phase de recherche, planification architecturale en cours.

---

## Gestion des interactions complexes on-chain

**Objectif** : Créer un modèle pour la reconnaissance des interactions on-chain et la création de workflows pour des interactions complexes.

**Intérêt** : Cette fonctionnalité permet à l'agent de comprendre et d'interagir avec des contrats intelligents de manière plus intuitive, facilitant ainsi l'exécution d'actions complexes sur la blockchain. Cela améliore l'accessibilité et l'efficacité des interactions avec les contrats intelligents.

**Étapes à réaliser** :

- [ ] Extraction et traitement des ABI des contrats pertinents.
- [ ] Filtrage des fonctions pertinentes.
- [ ] Génération de requêtes hypothétiques en langage naturel.
- [ ] Conversion des requêtes en embeddings vectoriels.
- [ ] Stockage des embeddings et des requêtes associées.
- [ ] Recherche de similarité basée sur le cosine.
- [ ] Classement des résultats en fonction de la pertinence.

**Statut** : Étude en cours pour déterminer la meilleure approche et les technologies à utiliser.

---

## Implémentation du Lit Protocol

**Objectif** : Ajouter la possibilité d'exécuter des actions Lit, permettant de déployer et d'exécuter des calculs décentralisés et sécurisés sur le réseau Lit.

**Intérêt** : L'intégration du Lit Protocol permet d'exécuter des actions Lit de manière décentralisée, en utilisant des clés cryptographiques pour valider les opérations. Ces actions peuvent être utilisées pour exécuter des scripts JavaScript dans un environnement décentralisé, ce qui permet une grande transparence, car toutes les interactions sont enregistrées sur la blockchain. L'un des principaux avantages réside dans l'automatisation et la sécurité des processus tout en préservant la confidentialité des utilisateurs, ce qui renforce la confiance dans les interactions on-chain.

**Étapes à réaliser** :

- [x] Étudier la documentation du Lit Protocol, en particulier la section sur les actions Lit et leur mise en œuvre.
- [ ] Intégrer le protocole dans l'architecture existante pour permettre l'exécution des actions Lit.
- [ ] Développer des modules pour l'exécution des actions Lit, incluant la gestion des signatures et l'exécution des scripts dans un environnement sécurisé.
- [ ] Tester l'intégration, la sécurité et la transparence des actions Lit pour garantir leur bon fonctionnement.

**Statut** : En cours d'étude pour déterminer la faisabilité et les implications techniques, notamment en ce qui concerne l'intégration de la décentralisation dans le système existant.
