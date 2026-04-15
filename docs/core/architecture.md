---
description: >-
  L'architecture repose sur un système modulaire et événementiel qui permet
  d'exécuter et d'orchestrer des graphes d'exécution en fonction de différentes
  logiques métier.
---

# Architecture

L'architecture repose sur un système **modulaire et événementiel** qui permet d'exécuter et d'orchestrer des graphes d'exécution en fonction de différentes logiques métier.&#x20;

**`GraphFlow`** est responsable de l’exécution d’un seul graphe, tandis que **`GraphController`** permet de gérer plusieurs graphes en parallèle ou en séquence.

***

### Schéma de l'architecture

<figure><img src="../.gitbook/assets/image (6).png" alt=""><figcaption><p>Architecture du framework @ai.ntellect/core</p></figcaption></figure>

***

### **Gestion des graphes**

* **`GraphFlow`** exécute un **graphe unique**, qui peut être :
  * **Séquentiel** : chaque nœud s’exécute les uns après les autres.
  * **Conditionnel** : des décisions déterminent l'exécution des prochains nœuds.
  * **Événementiel** : des nœuds attendent des événements pour s’activer.
* **`GraphController`** gère **plusieurs GraphFlow**, permettant leur exécution :
  * **Séquentielle** : Un graphe démarre après la fin d’un autre.
  * **Parallèle** : Plusieurs graphes s’exécutent simultanément.

***

### **Exécution d’un graphe**

L’exécution d’un graphe dépend de **l’organisation de ses nœuds** et de la manière dont ils sont déclenchés. L'exécution est **dirigée par les dépendances entre nœuds et les événements**.

1. **Un nœud peut être déclenché de plusieurs façons** :
   * **Par un autre nœud** (exécution séquentielle).
   * **Par une condition** (si une variable du contexte a une certaine valeur).
   * **Par un événement** (via **EventEmitter**).
   * **Par un déclencheur externe** (exemple : réponse d’une API).
2. **Un nœud exécute son action** :
   * Récupération ou mise à jour de données.
   * Appel d’un service externe (API, base de données…).
   * Déclenchement d’une tâche planifiée via **Agenda**.
   * Communication avec d'autres graphes via **GraphController**.
3. **Mise à jour du contexte du graphe** :
   * Chaque nœud met à jour un **contexte partagé** qui stocke les informations utiles à l’exécution globale.
   * Cette mise à jour peut influencer le choix du prochain nœud à exécuter.
4. **Détermination du prochain nœud** :
   * Si un nœud suit une logique **séquentielle**, l’exécution continue normalement.
   * Si le nœud **est conditionnel**, le système vérifie dans le contexte quel est le prochain nœud à exécuter.
   * Si le nœud attend un **événement externe**, l’exécution s’arrête en attente de cet événement.
5. **Propagation et fin de l'exécution** :
   * Certains graphes s’exécutent **jusqu’à leur dernier nœud**.
   * D’autres peuvent **attendre des événements externes** et reprendre plus tard.

***

### **Exécution dirigée par les événements**

Le moteur du framework `GraphFlow` adopte une approche événementielle, où certains nœuds s'exécutent en réponse à des événements. Il utilise une interface (**`IEventEmitter`**) pour assurer une intégration fluide avec d'autres systèmes de gestion d'événements, permettant ainsi :

* **L'écoute d'événements externes** pour déclencher des actions spécifiques.
* **La propagation d'événements** entre différents nœuds ou graphes connectés.
* **L'intégration avec des systèmes tiers** (API, bases de données, smart contracts) pour synchroniser l'exécution.

***

### **Interaction avec les services externes**

* **Les nœuds sont les principales entités qui interagissent avec des services externes**.
* Un nœud peut :
  * **Appeler une API** pour récupérer des données.
  * **Lire ou écrire dans une base de données**.
  * **Envoyer un événement** à un autre système.
* **`GraphController` peut également interagir avec des services externes** s’il est utilisé pour orchestrer plusieurs graphes nécessitant des interactions communes.

***

### **Les modules et les adaptateurs**

#### **Modules**

Les **modules** sont utilisés par les **nœuds** pour effectuer des tâches spécifiques :

* [**Mémoire**](../modules/memoire/) : Stocker et récupérer des informations contextuelles.
* [**Agenda**](../modules/agenda/) : Gérer des tâches planifiées.

#### **Adapatateurs**

Les **adaptateurs** sont des implémentations spécifiques d’un module permettant d’utiliser différentes **technologies sous-jacentes.** Chaque **adapter** offre **une implémentation spécifique d'un module**, permettant de changer la technologie utilisée sans modifier les **nœuds** qui utilisent ces modules.

***

### **Exécution multi-graphes**

#### **Orchestration de plusieurs graphes**

* **`GraphController` permet d’exécuter plusieurs `GraphFlow`** indépendamment ou en coordination.
* Il peut gérer des **dépendances entre graphes** et exécuter certains graphes uniquement lorsque d'autres ont terminé.

#### **Interaction entre plusieurs graphes**

* Un graphe peut **envoyer un événement** qui déclenche un autre graphe.
* **`GraphController` peut superviser l’exécution en parallèle et collecter les résultats**.

***

### **Exemple concret d’exécution**

#### **Cas : Traitement d’une commande**

1. **Un client passe une commande**
   * Le premier **nœud (A)** récupère les informations et met à jour le **contexte**.
2. **Vérification de la disponibilité des produits**
   * Un **nœud conditionnel (B)** interroge une **API externe**.
   * S’il manque des produits, il attend un **événement** signalant leur réapprovisionnement.
3. **Confirmation et expédition**
   * Une fois les produits disponibles, un **nœud (C)** planifie l’expédition via **Agenda**.
   * Une notification est envoyée au client.
4. **Fin du traitement**
   * Une fois toutes les étapes complétées, le graphe se termine.
   * **GraphController peut alors enchaîner avec un autre graphe**.

***

### **Avantages de cette architecture**

* **Événementielle** : Les graphes ne suivent pas une simple boucle récursive, mais peuvent réagir dynamiquement aux événements.
* **Flexible** : Chaque nœud peut exécuter du code, attendre des événements ou interagir avec des modules.
* **Modulaire** : Les modules et adaptateurs permettent d’intégrer différents systèmes (bases de données, APIs…).
* **Scalable** : **GraphController** gère plusieurs graphes en parallèle et optimise leur exécution.
