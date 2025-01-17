# AI.ntellect Core Framework

## Table des matières

1. [Composants principaux](#composants-principaux)
   - [Orchestrator](#orchestrator)
   - [Queue Manager](#queue-manager)
   - [Synthétiseur](#synthétiseur)
   - [Évaluateur](#évaluateur)
   - [Mémoire](#architecture-mémoire)
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

### Évaluateur

L'évaluateur est responsable de l'évaluation des résultats des actions exécutées et de la détermination des actions supplémentaires nécessaires. Il travaille en collaboration avec l'orchestrateur pour s'assurer que toutes les exigences de l'utilisateur sont satisfaites.

- **Rôle principal** : Évaluer les résultats des actions et déterminer les prochaines étapes
- **Fonctions principales** :
  - Analyse les résultats des actions exécutées
  - Détermine si des actions supplémentaires sont nécessaires
  - Suggère les prochaines actions à l'orchestrateur
  - Assure la réalisation complète des objectifs
- **Interactions** :
  - Collabore avec l'orchestrateur pour gérer le workflow
  - Traite les résultats des actions
  - Peut déclencher des cycles d'actions supplémentaires

[![Sans-titre-2024-11-08-0220.png](https://i.postimg.cc/nryjsx5y/Sans-titre-2024-11-08-0220.png)](https://postimg.cc/rR9FbBqj)

### Mémoire

Le système implémente une architecture de mémoire qui combine différentes solutions de stockage :

#### Installation et configuration

##### Meilisearch (Mémoire à long terme)

Meilisearch peut être auto-hébergé pour un contrôle total sur la mémoire à long terme de l'agent :

```bash
# Installation de Meilisearch
curl -L https://install.meilisearch.com | sh

# Lancement de Meilisearch avec une clé maître
./meilisearch --master-key="VOTRE_CLE_MAITRE"
```

##### Redis (Mémoire à court terme)

Redis gère les composants de mémoire à court terme :

```bash
# Utilisation de Docker
docker run --name redis -d -p 6379:6379 redis

# Ou installation locale
sudo apt-get install redis-server
```

2. **Configuration** :
   - Port par défaut : 6379
   - Configuration des limites de mémoire
   - Activation de la persistance si nécessaire

#### Types de mémoire

##### Mémoire à court terme (Redis)

1. **Mémoire procédurale** :

   - Stockée dans Redis pour un accès rapide
   - Contient les séquences d'actions et workflows réutilisables
   - Optimise les performances via le cache
   - Exemple : "Séquence commune d'approbation + échange de tokens"

2. **Mémoire épisodique court terme** :
   - Messages et interactions récents
   - Contexte temporaire des conversations en cours
   - Stockée dans Redis pour une récupération rapide
   - Exemple : "10 derniers messages de la conversation actuelle"

##### Mémoire à long terme (Meilisearch)

1. **Mémoire sémantique** :

   - Stockage permanent des faits et connaissances
   - Indexée pour une récupération efficace
   - Stocke les relations entre concepts
   - Exemple : "Le token X a l'adresse de contrat Y sur le réseau Z"

2. **Mémoire épisodique long terme** :
   - Interactions et expériences historiques
   - Contexte persistant entre les sessions
   - Recherchable par similarité vectorielle
   - Exemple : "Transactions réussies passées de l'utilisateur X"

### Cache Augmented Generation (CAG)

Le CAG optimise l'exécution des workflows via le cache Redis :

- **Rôle principal** : Mettre en cache les modèles procéduraux fréquemment utilisés
- **Implémentation** :

  - Utilise Redis pour un stockage haute performance
  - Stocke les séquences d'actions et leurs résultats
  - Permet une récupération rapide des modèles communs

- **Bénéfices** :
  - Réduit la charge de calcul
  - Accélère les opérations répétitives
  - Optimise l'utilisation des ressources

### Retrieval Augmented Generation (RAG)

Le système RAG améliore l'accès à la mémoire à long terme via Meilisearch :

- **Implémentation** :

  - Recherche vectorielle pour la similarité sémantique
  - Double indexation (globale et spécifique à l'utilisateur)
  - Combine avec la recherche textuelle traditionnelle

- **Fonctionnalités** :
  - Récupération de mémoire sémantique et épisodique
  - Capacités de recherche contextuelle
  - Classement des résultats basé sur la pertinence

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
