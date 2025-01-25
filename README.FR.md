# AI.ntellect Core Framework

## Vue d'ensemble

Ce framework est conçu pour exécuter des workflows complexes à l'aide d'une orchestration avancée, de la gestion de mémoire et d'une intelligence exploitable. Il intègre des outils, des interpréteurs et des systèmes de mémoire pour :

- Analyser les entrées utilisateur dans leur contexte.
- Exécuter des workflows prédéfinis et des actions dynamiques.
- Gérer efficacement la mémoire à court et à long terme.
- Permettre une intégration fluide avec des API et outils externes.

---

## Table des matières

1. [Composants d'architecture](#composants-darchitecture)
   - [Runtime de l'agent](#runtime-de-lagent)
   - [Orchestrateur](#orchestrateur)
   - [Gestionnaire de file d'attente](#gestionnaire-de-file-dattente)
   - [Interpréteur](#interpréteur)
   - [Système de mémoire](#système-de-mémoire)
2. [Définir et exécuter des actions](#définir-et-exécuter-des-actions)
3. [Gestion de l'état et récursivité](#gestion-de-letat-et-recursivité)
4. [Installation et configuration](#installation-et-configuration)
5. [Exemple d'utilisation](#exemple-dutilisation)
6. [Travaux en cours (WIP)](#travaux-en-cours-wip)

---

## Composants d'architecture

### Runtime de l'agent

Le `AgentRuntime` est le moteur principal qui coordonne le workflow global. Il connecte tous les composants et garantit que les tâches sont exécutées efficacement.

**Responsabilités :**

- Construire un contexte pour l'état actuel à l'aide des systèmes de mémoire (RAG et CAG).
- Orchestrer les actions à l'aide du gestionnaire de file d'attente.
- Exploiter les interpréteurs pour analyser les résultats et générer des réponses.

#### Construction du contexte

La méthode `buildContext` crée un contexte complet en :

1. Ajoutant les outils et les demandes utilisateur.
2. Récupérant les actions récentes via la mémoire cache (CAG).
3. Cherchant les connaissances pertinentes dans la mémoire persistante (RAG).
4. Incluant les interpréteurs disponibles pour la demande.

#### Traitement des workflows

La méthode `process` :

1. Génère des réponses basées sur le contexte à l'aide d'un modèle de langage.
2. Gère les workflows récursifs pour l'exécution des actions.
3. Sélectionne les interpréteurs appropriés pour analyser les résultats.

---

### Orchestrateur

L'**orchestrateur** dirige les workflows en analysant les entrées utilisateur et en planifiant les actions. Il interagit avec les outils, les systèmes de mémoire et les interpréteurs pour garantir une exécution logique.

**Caractéristiques clés :**

- Sélection dynamique des actions en fonction du contexte.
- Gestion des interactions mémoire pour les opérations RAG et CAG.
- Gestion des workflows multi-étapes avec affinage itératif.

---

### Gestionnaire de file d'attente

Le **gestionnaire de file d'attente** est chargé d'organiser et d'exécuter les actions dans le bon ordre, qu'elles soient séquentielles ou parallèles. Il agit comme le mécanisme central pour gérer les workflows, en s'assurant que chaque action est correctement mise en file d'attente, validée et exécutée.

**Responsabilités principales :**

1. **Mise en file d'attente des actions :**

   - Les actions sont ajoutées à une file pour exécution, individuellement ou en lot.
   - Prise en charge des journaux pour le débogage et la traçabilité.

2. **Traitement des actions :**

   - Exécute les actions en maintenant le bon ordre.
   - Respecte les dépendances entre les actions.
   - Gère les erreurs ou confirmations via des rappels.

3. **Gestion des confirmations :**
   - Prend en charge les invites de confirmation pour les actions critiques.
   - S'appuie sur des rappels pour décider de poursuivre des actions spécifiques.

**Exemple :**

```typescript
import { ActionQueueManager } from "@ai-ntellect/core";
import { actions, callbacks } from "@ai-ntellect/core/examples";

const queueManager = new ActionQueueManager(actions, callbacks);
queueManager.addToQueue([{ name: "fetch-data", parameters: [...] }]);
const results = await queueManager.processQueue();
console.log("Résultats :", results);
```

---

### Interpréteur

L'**interpréteur** se spécialise dans l'analyse des résultats et la génération d'informations spécifiques à un domaine. Chaque interpréteur est adapté à un cas d'utilisation particulier et utilise sa propre configuration de caractère.

**Exemples :**

1. **MarketInterpreter** : Analyse des données financières de marché.
2. **SecurityInterpreter** : Vérification de la sécurité.
3. **GeneralInterpreter** : Traitement des demandes générales.

#### Workflow d'interprétation

1. Construit un contexte avec l'état actuel, y compris les résultats et les demandes utilisateur.
2. Utilise le modèle de langage pour générer des informations exploitables.
3. Fournit des réponses détaillées pour l'utilisateur final.

---

### Système de mémoire

L'architecture mémoire combine une mémoire à court terme et une mémoire à long terme pour fournir un traitement contextuel.

#### Types de mémoire

1. **Mémoire cache (Redis) :**
   - Stocke des données temporaires pour un accès rapide.
   - Exemples : Actions récentes, données de session.
2. **Mémoire persistante (Meilisearch) :**
   - Stocke des données à long terme comme les interactions historiques et les connaissances.
   - Permet des recherches sémantiques et des récupérations basées sur des vecteurs.

---

## Définir et exécuter des actions

### Qu'est-ce qu'une action ?

Les actions sont les tâches fondamentales exécutées par le framework. Chaque action comprend :

- Un nom et une description uniques.
- Des paramètres d'entrée validés à l'aide de schémas.
- Une logique d'exécution encapsulée dans la méthode `execute`.

### Exemple d'action

```typescript
import { z } from "zod";
import { parseEther } from "ethers";

export const prepareTransaction = {
  name: "prepare-transaction",
  description: "Prépare un transfert de token pour approbation utilisateur.",
  parameters: z.object({
    walletAddress: z.string(),
    amount: z.string(),
    networkId: z.string(),
  }),
  execute: async ({ walletAddress, amount, networkId }) => {
    return {
      to: walletAddress,
      value: parseEther(amount).toString(),
      network: networkId,
    };
  },
};
```

---

## Gestion de l'état et récursivité

L'agent gère l'état et les workflows récursifs pour s'assurer que les actions sont exécutées de manière ordonnée et jusqu'à leur achèvement, tout en respectant un maximum d'itérations pour éviter les boucles infinies.

### Gestion de l'état

L'état (`State`) contient :

- `currentContext` : Contexte actuel de la requête utilisateur.
- `previousActions` : Liste des actions exécutées précédemment.

Lorsqu'une action est terminée, l'état est mis à jour pour inclure :

- Les résultats des actions précédentes.
- Le contexte restant à traiter.

### Récursivité contrôlée

Pour éviter les boucles infinies, le système limite le nombre d'itérations via la configuration `maxIterations`.

**Fonctionnement :**

1. **Initialisation :** À chaque itération, l'agent :

   - Exécute les actions dans la file d'attente.
   - Met à jour l'état avec les nouveaux résultats.

2. **Validation des limites :**

   - Si le nombre d'itérations dépasse `maxIterations`, le traitement est interrompu avec un message "Max iterations reached".

3. **Récursivité :**
   - Si des actions restent à exécuter, l'agent appelle récursivement la méthode `process` avec le nouvel état.

**Exemple de gestion d'état et récursivité :**

```typescript
const updatedNextState: State = {
  ...state,
  currentContext: state.currentContext,
  previousActions: [...(state.previousActions || []), ...(results || [])],
};

if (countIterations < this.config.maxIterations) {
  return this.process(updatedNextState);
} else {
  console.log("Max iterations reached");
  response.shouldContinue = false;
}
```

---

## Installation et configuration

### Installer les dépendances

```bash
npm install
```

### Configurer les services externes

#### Redis (Mémoire cache)

```bash
docker run --name redis -d -p 6379:6379 redis
```

#### Meilisearch (Mémoire persistante)

```bash
curl -L https://install.meilisearch.com | sh
./meilisearch --master-key="VOTRE_CLÉ_MAÎTRE"
```

---

## Exemple d'utilisation

### Initialiser l'agent

```typescript
import { deepseek } from "@ai-ntellect/core";
import { Agent } from "@ai-ntellect/core";
import { checkHoneypot, fetchMarkPrice } from "@ai-ntellect/core/actions";
import {
  generalInterpreterCharacter,
  marketInterpreterCharacter,
  securityInterpreterCharacter,
} from "@ai-ntellect/core/interpreter/context";

const model = deepseek("deepseek-reasoner");

const agent = new Agent({
  orchestrator: {
    model,
    tools: [checkHoneypot, fetchMarkPrice],
  },
  interpreters: [
    new Interpreter({
      name: "security",
      model,
      character: securityInterpreterCharacter,
    }),
    new Interpreter({
      name: "market",
      model,
      character: marketInterpreterCharacter,
    }),
    new Interpreter({
      name: "general",
      model,
      character: generalInterpreterCharacter,
    }),
  ],
  memoryManager: {
    model,
  },
  maxIterations: 3,
});
```

### Traiter une demande

```typescript
const state = {
  currentContext: "Analyse des tendances de marché XRP/USD",
  previousActions: [],
};

const result = await agent.process(state);
console.log("Résultat :", result);
```
