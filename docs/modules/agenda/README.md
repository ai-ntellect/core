---
description: >-
  Le module Agenda offre un moyen de programmer et de gérer l’exécution de
  tâches, souvent appelées jobs. L’idée est de déclencher des actions à un
  horaire précis, ou de manière répétée.
---

# Agenda

La planification de tâches dans un système logiciel est un concept fondamental qui permet de **déclencher des actions à un instant précis ou selon un intervalle défini**, sans intervention humaine.&#x20;

C’est une abstraction clé pour automatiser des processus métier, orchestrer des workflows ou maintenir la cohérence d’un système distribué.

Le module **Agenda** a été conçu pour être **agnostique au moteur de planification** et compatible avec plusieurs services. Grâce à l’interface `ICronService`, il est possible d’intégrer **node-cron, Redis, AWS EventBridge, Temporal**, ou toute autre solution adaptée aux besoins spécifiques d’un projet.

Avec cette architecture modulaire, **Agenda** devient un composant essentiel pour l’automatisation et l’orchestration des workflows, tout en restant **indépendant du moteur de planification** utilisé.

***

### Pourquoi la planification est essentielle

Un système qui repose uniquement sur des actions déclenchées par des utilisateurs est limité par leur disponibilité. La planification permet d'**automatiser l'exécution de tâches récurrentes ou différées**, garantissant ainsi la fluidité et l’autonomie du système.

#### Catégories de planification

Il existe plusieurs formes de planification, chacune répondant à un besoin particulier :

* **Planification ponctuelle** : Une tâche doit s’exécuter à un moment donné.
  * Exemple : Exécuter une opération de maintenance le **1er janvier à minuit**.
* **Planification récurrente** : Une tâche doit s’exécuter périodiquement.
  * Exemple : Mettre à jour les statistiques **chaque jour à 4h du matin**.
* **Planification relative** : Une tâche est déclenchée après un certain délai.
  * Exemple : Envoyer une relance **30 minutes après une interaction utilisateur**.

Ces mécanismes permettent d’implémenter des **workflows autonomes**, indépendants d’une action manuelle immédiate.

***

### Modèles de planification

#### Planification basée sur le temps

Le modèle le plus courant repose sur la définition d’un **instant absolu** (ex. une date et une heure) ou d’une **fréquence** (ex. chaque X secondes/minutes/heures).

Ce type de planification est généralement implémenté via des outils comme :

* **Cron** : Un service Unix permettant de définir des expressions de type `0 8 * * *` (tous les jours à 8h).
* **Timers natifs** (`setTimeout`, `setInterval`) : Utilisés dans des environnements comme Node.js, mais peu adaptés pour une gestion robuste des tâches planifiées à long terme.
* **Services cloud** (AWS EventBridge, Google Cloud Scheduler) : Gérés par des plateformes cloud, utiles pour des tâches distribuées.

#### Planification événementielle

Contrairement à la planification basée sur le temps, certaines actions doivent être déclenchées en **réaction à un événement**.

Exemple :

* Lorsqu’un fichier est ajouté dans un stockage, une tâche de traitement est immédiatement lancée.
* Un agent IA détecte un changement de contexte et déclenche un recalcul asynchrone.

Agenda intègre ces deux approches, combinant **planification temporelle** et **événements déclencheurs** dans une architecture flexible.

***

### Notion de cron et d’expression temporelle

Dans les systèmes Unix, la planification repose souvent sur **cron**, un service qui exécute des commandes à intervalles réguliers selon une syntaxe spécifique. Une expression cron est composée de 5 champs :

```
┌──────── minute (0 - 59)  
│ ┌────── heure (0 - 23)  
│ │ ┌──── jour du mois (1 - 31)  
│ │ │ ┌── mois (1 - 12)  
│ │ │ │ ┌─ jour de la semaine (0 - 6, dimanche = 0 ou 7)  
│ │ │ │ │  
* * * * * commande_a_exécuter  
```

Exemples courants :

| Expression    | Signification               |
| ------------- | --------------------------- |
| `0 8 * * *`   | Tous les jours à 8h         |
| `*/5 * * * *` | Toutes les 5 minutes        |
| `0 0 * * 0`   | Chaque dimanche à minuit    |
| `30 14 1 * *` | Le 1er jour du mois à 14h30 |

Même si **cron est une référence**, il n'est pas suffisant pour certains besoins modernes (redémarrages, gestion distribuée, tâches conditionnelles). C'est pourquoi des solutions comme **Agenda** apportent une flexibilité supplémentaire.

***

### Présentation du module Agenda

Le module **Agenda** de `@ai.ntellect/core` fournit une abstraction pour gérer **la planification et l'exécution de tâches différées ou récurrentes**. Il permet :

1. **D’enregistrer** une tâche (ex. “exécuter un job toutes les 10 minutes”).
2. **De déléguer** la gestion du temps à un moteur de scheduling sous-jacent (`node-cron`, un service externe, etc.).
3. **D’assurer** l’exécution de la tâche au bon moment.
4. **De gérer** l’annulation, la reprise ou la replanification dynamique.

#### Architecture

Agenda repose sur un principe **d’inversion de contrôle** : plutôt que de coder directement une exécution planifiée (`setTimeout` ou un appel API périodique), on enregistre une tâche, et **c’est le moteur de scheduling qui orchestre son déclenchement**.

```
Tâche planifiée → Enregistrement dans Agenda → Gestion du déclenchement par un service (ex. node-cron)  
```

Cela permet d’abstraire **l’implémentation du moteur de scheduling**, et donc de **changer de backend sans réécrire la logique métier**.

***

### Cas d’usage typiques

Agenda est utilisé dans des contextes variés, allant de la simple exécution périodique à l'orchestration avancée d'agents autonomes.

#### Planification de traitements récurrents

* **Génération de rapports** : Calcul et envoi automatique d’un résumé quotidien.
* **Mise à jour d’un système** : Rafraîchissement des données ou vidage de cache toutes les 24h.

#### Orchestration d’agents autonomes

* **Relance automatique** : Une IA envoie un rappel si l’utilisateur ne répond pas après X minutes.
* **Optimisation d’une mémoire IA** : Un agent peut précharger des données pertinentes toutes les nuits.

#### Exécution conditionnelle

* **Replanification dynamique** : Si un événement impacte une tâche (ex. retard sur une exécution), Agenda permet d’adapter dynamiquement le timing.
* **Tâches pilotées par contexte** : Un agent peut déclencher un recalcul en fonction d’un seuil atteint.

***

### En résumé

La planification est un **élément fondamental** pour tout système nécessitant **des actions différées ou récurrentes**.

Le module **Agenda** de **@ai.ntellect/core** apporte :

* **Une gestion centralisée des tâches planifiées** (création, exécution, annulation, suivi).
* **Une compatibilité avec divers moteurs** (cron, timers, services cloud).
* **Une intégration fluide avec d’autres modules** comme la mémoire et GraphFlow.

Grâce à cette approche modulaire, une application peut planifier, gérer et exécuter **des actions autonomes et asynchrones** de manière flexible, sans se lier à un moteur spécifique.
