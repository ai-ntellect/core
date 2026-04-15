---
description: >-
  L’interface IAgenda définit les fonctionnalités essentielles pour planifier,
  exécuter et gérer des tâches dans un système de workflows automatisés.
---

# Interface IAgenda

L’interface **IAgenda** définit les fonctionnalités essentielles pour **planifier, exécuter et gérer des tâches** dans un système automatisé.

Ce module suit une approche **agnostique du moteur**, permettant une intégration avec **différents services de planification** (**Node-Cron, Redis, AWS EventBridge**) ainsi qu’un **stockage persistant des tâches** via **IMemoryAdapter**.

***

### **Objectif de l'interface**

L'interface **IAgenda** doit permettre :

* **Planification dynamique** de tâches périodiques ou ponctuelles.
* **Stockage et récupération** des tâches planifiées via **IMemoryAdapter**.
* **Gestion complète du cycle de vie** des tâches (**création, exécution, annulation**).
* **Intégration avec un moteur de planification configurable** (**ICronService**).
* **Persistance des tâches après redémarrage** via un stockage mémoire.
* **Interopérabilité avec plusieurs moteurs de planification** (local, distribué, cloud).

***

### **Définition de l’interface**

```ts
/**
 * Interface pour la gestion des tâches planifiées
 */
export interface IAgenda {
  /**
   * Planifie une tâche à exécuter périodiquement ou une seule fois.
   * @param {ScheduledTaskInput} request - Configuration de la tâche à planifier.
   * @param {ScheduledTaskCallbacks} [callbacks] - Callbacks pour suivre l’exécution.
   * @returns {Promise<string>} ID unique de la tâche planifiée.
   */
  scheduleTask(
    request: ScheduledTaskInput,
    callbacks?: ScheduledTaskCallbacks
  ): Promise<string>;

  /**
   * Annule une tâche planifiée en fonction de son ID.
   * @param {string} taskId - ID de la tâche à annuler.
   * @returns {Promise<boolean>} `true` si la tâche a été annulée, sinon `false`.
   */
  cancelTask(taskId: string): Promise<boolean>;

  /**
   * Récupère toutes les tâches planifiées stockées en mémoire.
   * @returns {Promise<ScheduledTask[]>} Liste des tâches stockées.
   */
  getScheduledTasks(): Promise<ScheduledTask[]>;

  /**
   * Annule toutes les tâches planifiées.
   * @returns {Promise<void>}
   */
  cancelAllTasks(): Promise<void>;

  /**
   * Arrête l’ensemble des tâches et libère les ressources.
   * @returns {Promise<void>}
   */
  shutdown(): Promise<void>;
}
```

***

### **Interfaces associées**

#### **ScheduledTaskInput : Définition d’une tâche planifiée**

```ts
/**
 * Configuration d'une tâche planifiée
 */
export interface ScheduledTaskInput {
  /** ID unique de la tâche (optionnel) */
  id?: string;
  /** Requête ou action à exécuter */
  originalRequest: string;
  /** Expression `cron` définissant la récurrence */
  cronExpression: string;
  /** Indique si la tâche est récurrente */
  isRecurring?: boolean;
  /** Date de début d’exécution (optionnel) */
  startDate?: Date;
}
```

***

#### **ScheduledTask : Représentation d’une tâche active**

```ts
/**
 * Représentation d'une tâche planifiée
 */
export interface ScheduledTask extends ScheduledTaskInput {
  /** ID unique attribué à la tâche */
  id: string;
  /** Date de création de la tâche */
  createdAt: Date;
}
```

***

#### **ScheduledTaskCallbacks : Suivi de l’exécution**

```ts
/**
 * Callbacks pour suivre l'exécution d'une tâche planifiée
 */
export interface ScheduledTaskCallbacks {
  /** Appelé lorsque la tâche est planifiée */
  onScheduled?: (id: string) => void;
  /** Appelé lorsque la tâche est exécutée */
  onExecuted?: (id: string, originalRequest: string) => void;
}
```

***

### **Pourquoi cette interface ?**

L’interface **IAgenda** offre plusieurs avantages en termes de conception et d’extensibilité :

#### **Indépendance du moteur de planification**

* Compatible avec **Node-Cron, Redis, AWS EventBridge**, et d’autres solutions.
* Séparation claire entre **la logique métier** et **le moteur de tâches**.

#### **Persistance des tâches**

* Intégration avec **IMemoryAdapter** pour **stocker les tâches planifiées** même après un redémarrage.
* Permet une **synchronisation avec des bases de données** (**Redis, Meilisearch, SQLite, etc.**).

#### **Gestion avancée du cycle de vie**

* **Annulation, exécution immédiate, reprogrammation dynamique**.
* Suivi des exécutions via des **callbacks événementiels**.

***

### **Cas d’usage**

L’interface **IAgenda** est conçue pour gérer **la planification automatique des tâches**, avec des cas d’usage variés :

#### **Tâches périodiques et planification automatique**

* Exécution de **mises à jour programmées** toutes les nuits.
* **Relances automatiques** en cas d’échec.

#### **Orchestration de workflows distribués**

* Utilisation d’un **adaptateur Redis** pour **synchroniser plusieurs agents**.
* Planification de tâches sur **AWS EventBridge** pour **déclencher des workflows serverless**.

#### **Persistance et reprise après redémarrage**

* **Sauvegarde des tâches planifiées** dans **Meilisearch ou Redis**.
* Reprise automatique après un **redémarrage du système**.

