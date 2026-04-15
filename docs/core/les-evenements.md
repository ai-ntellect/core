---
description: >-
  Le moteur GraphFlow inclut un mécanisme d’événements permettant de créer des
  workflows asynchrones et réactifs.
---

# Les événements

Le moteur **`GraphFlow`** inclut un mécanisme d’événements permettant de créer des **workflows asynchrones et réactifs**. Cette approche permet de déclencher l’exécution de nœuds en réponse à des signaux internes ou externes.

`GraphFlow` repose sur un **EventEmitter**, ou tout objet conforme à l’interface `IEventEmitter`. Cette interface définit les méthodes nécessaires à la gestion des événements dans un environnement découplé, garantissant ainsi la flexibilité et la compatibilité avec d'autres implémentations d'émetteurs d'événements.

***

### L'interface `IEventEmitter`

GraphFlow ne dépend pas exclusivement d’une implémentation spécifique de l'EventEmitter. Il utilise une **interface** (`IEventEmitter`) pour assurer la compatibilité avec d'autres systèmes de gestion d'événements.&#x20;

Voici la définition de cette interface :

```typescript
export interface IEventEmitter {
  /**
   * Émet un événement avec des arguments optionnels.
   * @param {string} event - Nom de l’événement.
   * @param {...any[]} args - Arguments associés à l’événement.
   * @returns {boolean} Indique si l’événement a été écouté.
   */
  emit(event: string, ...args: any[]): boolean;

  /**
   * Enregistre un écouteur pour un événement donné.
   * @param {string} event - Nom de l’événement.
   * @param {Function} listener - Fonction exécutée lorsque l’événement est émis.
   */
  on(event: string, listener: (...args: any[]) => void): void;

  /**
   * Supprime tous les écouteurs d’un événement spécifique ou de tous les événements.
   * @param {string} [event] - Nom de l’événement à nettoyer (optionnel).
   */
  removeAllListeners(event?: string): void;

  /**
   * Retourne les écouteurs associés à un événement donné.
   * @param {string} event - Nom de l’événement.
   * @returns {Function[]} Tableau des fonctions écouteurs.
   */
  rawListeners(event: string): Function[];
}
```

**Cette interface définit un contrat clair, permettant aux développeurs de fournir leur propre implémentation d’un gestionnaire d’événements** tout en assurant une compatibilité avec `GraphFlow`.&#x20;

Il est ainsi **possible d’utiliser une alternative à l’EventEmitter natif de Node.js** ou d’adapter le mécanisme d’émission d’événements aux contraintes d’un environnement spécifique.

***

### Les événements dans GraphFlow

`GraphFlow` utilise une instance conforme à `IEventEmitter` pour gérer les interactions entre **nœuds**, **événements système** et **événements personnalisés**. Cela permet de :

1. **Gérer des événements internes** comme :
   * `graphStarted`, `graphCompleted`, `graphError` : liés au cycle de vie du workflow.
   * `nodeStarted`, `nodeCompleted`, `nodeError` : pour suivre l’exécution des nœuds individuels.
2. **Déclencher des nœuds via des événements personnalisés**.\
   Un graphe ou un nœud peut déclarer une liste d’événements (`events: ["userConfirmed"]`), et ne s’exécutera que lorsque `graphFlow.emit("userConfirmed")` est appelé.

L’utilisation d’une interface permet d’intégrer **facilement des systèmes de messagerie ou des gestionnaires d’événements externes** (exemple : WebSockets, Redis Pub/Sub, RabbitMQ) en fournissant simplement une implémentation personnalisée de `IEventEmitter`.

***

### Écouter et émettre des événements

#### Utilisation d’un `EventEmitter` conforme à `IEventEmitter`

Avant d'utiliser les événements dans GraphFlow, il faut créer un gestionnaire conforme à `IEventEmitter` :

```typescript
import { EventEmitter } from "events";

const eventEmitter: IEventEmitter = new EventEmitter();
```

Ce gestionnaire peut ensuite être passé à **GraphFlow** lors de son initialisation :

```typescript
const graph = new GraphFlow("TestGraph", {
  name: "TestGraph",
  nodes: [],
  context: { value: 0 },
  schema: TestSchema,
  eventEmitter: eventEmitter,
  events: ["userClicked"],
});
```

GraphFlow pourra ainsi utiliser cet objet pour **émettre** et **écouter** des événements.

***

#### Écoute des événements internes

GraphFlow expose la méthode `on(eventName, callback)`, qui permet d’attacher un écouteur à un événement spécifique :

```typescript
graphFlow.on("graphStarted", ({ name }) => {
  console.log(`Le graphe ${name} a démarré.`);
});

graphFlow.on("nodeCompleted", ({ name, context }) => {
  console.log(`Le nœud ${name} a terminé avec le contexte:`, context);
});
```

Ces événements permettent d’ajouter des **fonctionnalités de monitoring et de logging** sans modifier le fonctionnement du moteur.

***

#### Déclencher un événement personnalisé

Pour exécuter un nœud en réponse à un événement :

```typescript
await graphFlow.emit("userClicked", { userId: 123 });
```

Cet appel déclenche l’exécution **de tous les nœuds** écoutant `"userClicked"`. Chaque nœud reçoit un **contexte cloné**, fusionné avec les données passées à `emit()`.

***

### Avantages de l’interface `IEventEmitter`

L’utilisation d’une interface dédiée offre plusieurs avantages :

1. **Découplage** : GraphFlow ne dépend pas d’une implémentation spécifique et peut s’adapter à différents environnements.
2. **Extensibilité** : Il est possible de brancher un système de gestion d’événements externe sans modifier le moteur.
3. **Interopérabilité** : Les applications peuvent intégrer GraphFlow avec des outils tiers via des systèmes de messagerie asynchrones.
4. **Testabilité** : L’interface permet d’injecter une implémentation factice (`mock`) pour écrire des tests unitaires indépendants de la logique événementielle.
