---
description: >-
  Un graphe est une structure de données utilisée pour représenter des relations
  entre des éléments appelés nœuds.
---

# GraphFlow

`GraphFlow` est un moteur de workflows conçu pour structurer et automatiser l'exécution de processus complexes. Il permet de modéliser des enchaînements d’actions sous forme de graphes.

### Rappels : Qu’est-ce qu’un graphe ?

***

#### Définition générale

Un **graphe** est une structure de données composée de :

* **Nœuds (nodes)** : Représentent des points (ou états) spécifiques.
* **Arêtes (edges)** : Représentent des liens entre les nœuds, indiquant comment on peut passer de l’un à l’autre.

En mathématiques, on utilise un graphe pour modéliser un ensemble d’objets (les nœuds) et les relations qui existent entre eux (les arêtes). Dans un cadre de workflow, l’idée est similaire :

* Chaque nœud correspond à une **étape du processus**.
* Les arêtes définissent **l’ordre** ou les **conditions** pour se déplacer d’une étape à une autre.

### Pourquoi un graphe pour orchestrer un workflow ?

Contrairement à un simple enchaînement linéaire (A → B → C), un graphe offre :

1. **Branchements multiples** : À la fin du nœud A, on peut aller à B ou C en fonction de conditions.
2. **Boucles ou retours** : Possibilité de repasser par des étapes déjà visitées, par exemple pour réessayer un processus ou organiser un cycle (A → B → A).
3. **Parallélisation** : Plusieurs chemins peuvent s’exécuter simultanément (ou indépendamment).

Cela permet de modéliser des flux métiers complexes et adaptatifs, où l’on peut gérer facilement des **conditions**, des **événements** et des **branches** multiples.

***

### Concepts de base dans `GraphFlow`

#### Les nœuds (Nodes)

Dans le framework, un **nœud** est une entité qui contient :

* Un **nom** unique (ex. `nodeA`).
* Une **fonction d’exécution** (`execute`) qui décrit ce que le nœud fait lorsque le workflow y arrive.
* Des **conditions** ou une logique permettant de vérifier si ce nœud doit s’exécuter (optionnel).
* Des **événements** qui peuvent déclencher l’exécution du nœud (ex. “onUserClick” ou “customEvent”).
* Des **liaisons vers d’autres nœuds** (ex. `next: ["nodeB", "nodeC"]`).

#### Les arêtes et le chaînage

Chaque nœud peut pointer vers un ou plusieurs **nœuds suivants**. On définit ainsi un chaînage dans le graph :

* **Arête linéaire** : Un nœud A pointe vers un unique nœud B.
* **Arête conditionnelle** : Un nœud A peut pointer vers B **si** une condition est remplie, sinon vers C.
* **Arête parallèle** : Un nœud A peut avoir plusieurs successeurs (B et C) exécutés (ou testés) en parallèle ou à la suite.

#### Le contexte

Au cœur du framework, on utilise souvent un **contexte** global (ou local) qui stocke des données partagées entre les nœuds. Lorsqu’un nœud s’exécute, il peut :

* Lire et modifier ce contexte (ex. incrémenter un compteur).
* Valider ou transformer les données avant de les transmettre au nœud suivant.

***

### Rôle du moteur GraphFlow

#### Gestion de l’exécution

Le moteur **`GraphFlow`** orchestre la navigation d’un nœud à l’autre en tenant compte :

* Des **conditions** éventuelles (si `condition(context) === true`).
* Des **événements** (si un nœud est lié à un événement particulier).
* Des **erreurs** (et potentiellement des mécanismes de retry ou de fallback).

On peut donc dire qu’il exécute la “logique de flux” : en partant d’un nœud de départ (entry node), il va progresser dans le graphe en suivant les règles établies.

#### Validation et introspection

En plus de l’exécution, GraphFlow peut assurer :

* **La validation** des données (inputs/outputs) via des schémas (ex. Zod).
* **L’émission d’événements** pour suivre ce qui se passe (ex. `nodeStarted`, `nodeCompleted`, `nodeError`).
* **Le stockage du contexte** tout au long du parcours.

#### Approche déclarative

Grâce à cette structure en graph, on déclare **à l’avance** : “Voici mes nœuds, mes conditions, mes transitions possibles”. Le moteur se charge ensuite de naviguer et d’exécuter le code associé. C’est plus lisible et maintenable qu’un code procédural plein de `if/else` et de boucles imbriquées.

***

### Exemples concrets

1.  **Workflow de validation** : <br>

    <figure><img src="../.gitbook/assets/image (4).png" alt=""><figcaption><p>Workflow de validation</p></figcaption></figure>

    **Explication :**&#x20;

    * Un document arrive dans la file d’attente (nœud `NewDocument`).
    * Le document est validé → `ValidateDocument`, puis en fonction d’un champ (`valid` ou `invalid`), on bascule vers → `PublishDocument` ou →`RejectDocument`.
2.  **Chatbot conversationnel** : <br>

    <figure><img src="../.gitbook/assets/image (3).png" alt=""><figcaption><p>Chatbot conversationnel</p></figcaption></figure>

    **Explication :**&#x20;

    * Détecter l’intention → `IntentDetection`.
    * Choisir le LLM adaptée (→ `LLMNode1` ou → LLM`Node2`) selon la classification.
    * Gérer la réponse → `SendReply`<br>
3.  **Orchestration de microservices** : <br>

    <figure><img src="../.gitbook/assets/image (1).png" alt=""><figcaption><p>Orchestration de microservices</p></figcaption></figure>

    **Explication :**&#x20;

    * Appeler un service → `FetchDataFromServiceA`.
    * Parallèlement, appeler un autre service → `FetchDataFromServiceB`.
    * Fusionner les résultats → `CombineResults`.
    * Si tout est bon → `NotifyUser`; sinon → `HandleError.`

Dans chacun de ces cas, le graphe offre une vision claire des **étapes**, des **transitions** possibles et des **conditions** d’exécution.

***

### Bénéfices de l’approche graphe

1. **Lisibilité** : On visualise aisément la séquence et les embranchements.
2. **Modularité** : Chaque nœud est une brique autonome (une action, une condition).
3. **Facilité d’évolution** : Ajouter un nouveau nœud ou une branche se fait sans casser la structure existante.
4. **Debug et traçabilité** : On peut logguer l’entrée/sortie de chaque nœud, détecter où ça coince.
5. **Réutilisation** : Un même nœud peut être réutilisé dans plusieurs flux (ex. `SendEmailNode`).

***

### Notions clés

#### Condition vs. Événement

* **Condition** : Vérifiée **au moment** où le flux atteint le nœud. Par exemple, `condition: (ctx) => ctx.value > 10`.
* **Événement** : Permet de déclencher un nœud **de façon asynchrone** ou non linéaire. Par exemple, si un événement `UserConfirmed` est émis, on lance l’exécution du nœud `WaitUserConfirmation`.

#### Nœuds enchaînés vs. nœuds parallèles

* **Enchaînement linéaire** : Le nœud A mène à B, puis B mène à C.
* **Branches parallèles** : Le nœud A peut enchaîner vers B et C simultanément, ou lancer B et C dans des contextes séparés puis fusionner les résultats.

#### Retours en arrière et boucles

* **Boucles** : On peut avoir un nœud D qui renvoie à A pour recommencer le cycle (sous certaines conditions).
* **Gestion de l’infini** : On doit prévoir une condition de sortie pour ne pas rester bloqué dans une boucle infinie.
