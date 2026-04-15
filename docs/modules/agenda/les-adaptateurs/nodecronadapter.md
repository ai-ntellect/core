---
description: >-
  Le NodeCronAdapter est utilise bibliothèque node-cron pour exécuter des tâches
  à intervalles réguliers.
---

# NodeCronAdapter

`NodeCronAdapter` est une implémentation de l’interface `ICronService` basée sur **node-cron**. Il permet d’exécuter des tâches planifiées selon des expressions cron standards. Cet adaptateur est conçu pour gérer des actions récurrentes sans nécessiter de persistance ni de gestion avancée des exécutions.

Ce type d’adaptateur est particulièrement utile pour les tâches légères et autonomes, telles que la mise à jour de caches, l’exécution périodique de requêtes ou la maintenance automatique.

***

### **Spécificités techniques de NodeCronAdapter**

**Encapsulation de node-cron**

L’adaptateur encapsule `node-cron` en exposant une interface conforme à `ICronService`. Il simplifie l’utilisation en garantissant que chaque tâche planifiée retourne un objet contrôlable avec `start()` et `stop()`.

```ts
schedule(expression: string, callback: () => void): ICronJob {
  const job = cron.schedule(expression, callback);
  return {
    start: () => job.start(),
    stop: () => job.stop(),
  };
}
```

Cela permet d’abstraire `node-cron` et de **remplacer l’implémentation sous-jacente** si nécessaire, sans modifier le reste de l’application.

***

## **Démarrage et arrêt des tâches**

Lorsqu’un job est programmé, il est créé en **état stoppé** par défaut, puis activé via `start()`. Cela permet d’éviter des exécutions accidentelles avant une configuration complète.

```ts
const job = cron.schedule(expression, callback);
job.stop(); // S'assure que le job ne démarre pas immédiatement
```

L’arrêt d’un job via `stop()` suspend son exécution jusqu’à un nouvel appel à `start()`. Cela permet de **désactiver temporairement des tâches** sans les recréer.

***

#### **Limitations et considérations**

#### **Dépendance à node-cron**

L’adaptateur repose entièrement sur **node-cron**, qui fonctionne uniquement sous **Node.js**. Il ne peut pas être utilisé directement **dans un navigateur ou un environnement sans accès au runtime Node.js**.

#### **Planification limitée aux expressions cron**

NodeCronAdapter **ne gère que les expressions cron classiques**. Contrairement à d’autres gestionnaires comme **Agenda.js ou BullMQ**, il ne prend pas en charge :

* La persistance des tâches.
* La gestion des échecs avec retries.
* Le chaînage dynamique d’exécutions.

Si ces fonctionnalités sont nécessaires, un gestionnaire plus avancé peut être requis.

#### **Non persistant**

Les tâches planifiées existent uniquement **en mémoire** et **sont perdues en cas de redémarrage du serveur**.\
Si une **reprise après redémarrage** est nécessaire, les tâches doivent être **stockées en base de données** et **rechargées** au démarrage.

**Solution** : Stocker les jobs dans une base externe (Redis, SQLite) et les restaurer au lancement de l’application.

#### **Précision limitée**

Node-cron **ne garantit pas une exécution milliseconde-précise**.

* Il repose sur **l’horloge système**, donc son exécution peut être affectée par **la charge CPU**.
* Dans un environnement **serverless** (AWS Lambda, Cloud Functions), des retards peuvent apparaître si l’instance est mise en veille.

Pour des tâches nécessitant **une exécution strictement précise**, une alternative comme **Systemd Timers, Quartz Scheduler ou Celery** peut être plus adaptée.

***

### **Cas d’usage adaptés**

**`NodeCronAdapter`** est une solution efficace pour :&#x20;

* **Exécuter des tâches légères** sans persistance.
* **Rafraîchir des caches** périodiquement.
* **Automatiser des mises à jour de données**.
* **Gérer des workflows simples** nécessitant des intervalles définis.

Cependant, pour une gestion avancée (reprise après crash, files d’attente, monitoring), des solutions comme **BullMQ, Agenda.js ou Redis-based task queues** sont recommandées.
