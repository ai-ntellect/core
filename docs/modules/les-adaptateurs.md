---
description: Dans @ai.ntellect/core, chaque module dispose d'adaptateurs par défaut.
---

# Les adaptateurs

Les modules de `@ai.ntellect/core` proposent des **adaptateurs par défaut** qui couvrent les besoins les plus fréquents. Mais l’architecture du framework permet également de créer et brancher des adaptateurs personnalisés, implémentés en dehors du code source principal.

### Pourquoi des adaptateurs

Le concept d’« adaptateur » sert à séparer la **logique métier** (la logique du module lui-même) de l’**implémentation technique** (accès à une base de données, intégration avec un service de planification, etc.). Un module définit une **interface** (ex. `IMemoryAdapter`, `ICronService`), et chaque adaptateur s’engage à respecter cette interface. Ainsi, on peut :

• Basculer d’un backend à un autre (ex. passer de « in-memory » à « redis ») sans réécrire toute l’application.\
• Développer un adaptateur pour un service ou une base particulière (cloud SaaS, interne à l’entreprise) sans forker ou modifier le cœur du module.

### Adaptateurs par défaut

Les adaptateurs par défaut sont inclus dans le dossier `adapters/` de chaque module. Parmi les exemples courants :

• In-memory (pratique pour les tests et les prototypes)\
• node-cron (permet de planifier des tâches en local)\
• redis ou meilisearch (assure la persistance pour un module Memory)

Ces adaptateurs offrent une solution standard prête à l’emploi, et servent aussi de référence pour comprendre comment en créer d’autres.

### Création d’un adaptateur externe

Si aucun adaptateur par défaut ne répond aux besoins d’une application, il est possible de développer un adaptateur externe dans un projet distinct.&#x20;

L’essentiel est de se conformer à l’interface attendue par le module.&#x20;

Par exemple, un module Memory attend un `IMemoryAdapter` qui définisse les méthodes de création, lecture, suppression, etc.&#x20;

Une fois l’adaptateur codé :

• Il peut être testé et validé de façon indépendante (tests unitaires ciblés).\
• Il est ensuite injecté au module (par exemple, `new Memory(myCustomAdapter)`).\
• L’ensemble du code client continuera de fonctionner normalement, car il dépend de l’interface, pas de l’implémentation sous-jacente.

### Intérêt de la modularité

Grâce à la logique d’adaptateurs, chaque module demeure décorrélé de la technologie employée : un nœud GraphFlow ou un agent IA peut appeler le module Memory ou l’Agenda sans connaître les détails du backend.&#x20;

Les bénéfices principaux sont :

• Flexibilité : on peut démarrer en mode simple (in-memory) et évoluer vers une base plus robuste (redis, SaaS externe) quand le besoin se fait sentir.\
• Maintenabilité : si un adaptateur est défaillant ou nécessite une optimisation, on corrige cette partie sans toucher à la logique métier du module.\
• Personnalisation : toute entreprise ayant un service interne (base de données, moteur d’indexation, service de scheduling) peut l’intégrer en codant un adaptateur conforme à l’interface requise.

### En résumé

Les adaptateurs, qu’ils soient **par défaut** (inclus dans le framework) ou **externes** (développés spécifiquement pour un cas d’usage), offrent une **souplesse** et une **extensibilité** essentielles. En respectant l’interface imposée par le module, il devient possible de changer ou d’ajouter de nouvelles implémentations sans affecter le reste de l’application, ni le cœur du framework. C’est là un élément clé de la philosophie modulaire de `@ai.ntellect/core`.
