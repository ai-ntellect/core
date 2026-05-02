---
description: >-
  Les modules permettent une approche modulaire où chaque fonctionnalité est
  indépendante et réutilisable.
---

# Introduction

Dans `@ai.ntellect/core`, les **modules** viennent enrichir le framework en offrant des fonctionnalités supplémentaires :

* [**Mémoire**](memoire/) : Gestion et recherche de données (ex. stockage d’historique, de connaissances, de logs).
* [**Agenda**](agenda/) : Planification de tâches (par exemple, exécuter un workflow à intervalles réguliers).

***

### Qu’est-ce qu’un module ?

Un **module** est une brique logicielle **optionnelle** qui **étend** les capacités de `@ai.ntellect/core` sans en faire partie intégrante du coeur du système. Chaque module :

1. Fournit une **fonctionnalité ciblée** (ex. planification, persistance, traitement NLP).
2. Est conçu selon une **interface** ou des **interfaces** précises.
3. Peut être activé ou non, selon les besoins de l’application.

L'objectif est de **modulariser** le code : séparer les fonctionnalités (Memory, Agenda, NLP, etc.) dans des composants autonomes, afin que vous puissiez facilement :

* **Remplacer** un module par un autre (ex. changer l’adaptateur mémoire).
* **Évoluer** selon les besoins (ajout de nouveaux adaptateurs ou services).
* **Test** et **maintenance** plus simples, car chaque module a son domaine de responsabilité.

***

### Les principes de conception

#### 1. Responsabilité unique

Chaque module se consacre à un **domaine précis**. Par exemple :

* **Memory** gère tout ce qui touche à la persistance de données et à la recherche (via des adaptateurs).
* **Agenda** est responsable de la dimension « **temporelle** » : planification et exécution automatique de tâches.
* **NLP** permet d'intégrer du traitement du langage naturel dans vos workflows.

#### 2. Inversion de dépendances (IoC)

Chacun de ces modules :

* **Reçoit** une implémentation (adaptateur, service, modèle) via son **constructeur** (ex. `new Memory(adapter)`).
* S’appuie sur des **interfaces** pour éviter de dépendre directement d’un outil particulier.

Cela permet de **changer** de solution interne (par ex. un nouveau service NLP, un autre service cron) sans casser le code existant.

#### 3. Cohérence avec GraphFlow et le “core”

Les modules interagissent souvent avec :

* **GraphFlow** : ex. un nœud de workflow peut appeler le module Memory pour sauvegarder des informations, ou planifier un “run” via l’Agenda.
* **Mémoire** : un agent conversationnel peut utiliser les embeddings stockés en mémoire pour une recherche sémantique.

Ainsi, la **logique d’application** peut facilement orchestrer ces différents modules pour créer des **agents** ou **workflows** vraiment complets et autonomes.

***

### Exemples de modules

#### 1. Memory

Le module **Memory** gère le **stockage** et la **recherche** d’informations dans votre application :

* Stocker l’historique de conversation.
* Enregistrer des documents et les retrouver via un moteur de recherche.
* Organiser des données (via des “rooms” ou contextes séparés).

**Points clés :**

* **Adapter** : L’interface `IMemoryAdapter` permet de brancher un backend précis (in-memory, MeiliSearch, base SQL...).
* **CRUD simplifié** : Créer, lire, rechercher, supprimer.
* **Intégration** : Un nœud GraphFlow peut lire ou écrire dans la mémoire ; un agent conversationnel peut y puiser son contexte.

#### 2. Agenda

L’**Agenda** s’occupe de la **planification** de tâches (tâches planifiées ou “scheduled tasks”) :

* Définir quand exécuter une action (ex. tous les matins, ou dans 10 minutes).
* Possibilité de gérer des tâches **ponctuelles** ou **récurrentes**.
* Intégration possible avec GraphFlow pour déclencher l’exécution d’un nœud à intervalle régulier.

**Points clés :**

* **Interface `ICronService`** : On peut utiliser une librairie Node.js ou un service cloud.
* **Map interne** : L’Agenda conserve la liste des tâches créées, permet de les annuler, de les lister.
* **Flexible** : On peut brancher différents adaptateurs en fonction du besoin (node-cron, un orchestrateur externe...).

#### 3. NLP

Le module **NLP** permet d'intégrer du traitement du langage naturel dans vos workflows via @nlpjs.

**Points clés :**

* **Interface simple** : Intégration de modèles NLP pré-entraînés.
* **Cas d'usage** : Analyse de sentiment, classification de texte, extraction d'entités.
* **Intégration** : Utilisable directement dans vos nœuds GraphFlow.

***

### Comment travailler avec ces modules ?

1. **Importer** le module (ex. `import { Memory } from "@ai.ntellect/core/memory"`).
2. **Fournir** une implémentation (ex. un adaptateur mémoire, un cron service).
3. **Utiliser** ses méthodes pour résoudre le problème : planifier une tâche, stocker une info, etc.
4. **Intégrer** dans votre logique (ex. nœud GraphFlow, agent, API) afin de **centraliser** la gestion du workflow, des données, et de la planification.

***

### En résumé

Les **modules** dans `@ai.ntellect/core` sont conçus pour apporter des **services spécialisés**, tout en restant **remplaçables** ou **configurables** grâce à l’injection d’adaptateurs ou de services. Cette approche facilite :

* **L'évolution** du projet (changer d'outil de recherche, de service NLP, etc. sans recoder toute la logique).
* **La cohérence** (chacun des modules respecte la même philosophie : interfaces, IoC, séparation claire des responsabilités).
* **La collaboration** (l’équipe peut travailler sur un module sans bouleverser les autres).

Chaque module devient ainsi une **brique** que vous pouvez combiner, selon vos besoins, pour construire un agent ou un système **intelligent** et **automatisé** de bout en bout.
