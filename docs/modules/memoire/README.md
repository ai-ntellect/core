---
description: >-
  La gestion de la mémoire permet de stocker, organiser et récupérer des
  informations de manière persistante ou temporaire.
---

# Mémoire

Avant de rentrer dans les détails du module, voyons comment la mémoire s’articule avec la cognition, pourquoi elle est essentielle à la notion d’intelligence, et comment les agents intelligents organisent leurs mécanismes de mémorisation.

***

### Qu’est-ce que l’intelligence ?

L’intelligence est un concept complexe et multidimensionnel, qui fait l’objet de nombreuses définitions selon les disciplines (psychologie, philosophie, neurosciences, informatique, etc.). D’une manière générale, on peut la définir comme **la capacité à acquérir et à utiliser des connaissances pour résoudre des problèmes, s’adapter à des situations nouvelles et apprendre de l’expérience**.

1. **Adaptation et flexibilité**\
   L’intelligence implique la faculté de s’adapter rapidement à des environnements changeants, en repérant des patterns et en modifiant ses stratégies d’action.
2. **Raisonnement et planification**\
   Être « intelligent » suppose de pouvoir raisonner, c’est-à-dire enchaîner des opérations mentales ou logiques, et planifier des actions futures en tenant compte des contraintes et des objectifs.
3. **Apprentissage**\
   L’un des piliers de l’intelligence est la capacité à apprendre de l’expérience. Cela suppose qu’un organisme (biologique ou artificiel) puisse retenir des informations et s’en servir ultérieurement.

La mémoire est justement l’outil majeur qui permet cet apprentissage, car sans mémoire, il n’y a pas de persistance de l’information au fil du temps.

***

### La mémoire dans la cognition humaine

#### Approche psychologique et neuroscientifique

Dans la psychologie cognitive, la mémoire humaine est souvent décrite sous forme de systèmes :

* **La mémoire sensorielle** : Retient fugitivement (quelques millisecondes) les informations brutes issues des sens (ex. icône visuelle, écho sonore).
* **La mémoire à court terme (MCT) ou mémoire de travail** : Espace mental transitoire qui limite la quantité d’informations que l’on peut traiter consciemment (souvent estimée à 7 ± 2 unités). La mémoire de travail est cruciale pour raisonner et manipuler l’information en temps réel.
* **La mémoire à long terme (MLT)** : Stocke des connaissances et souvenirs sur des durées plus longues (jours, années, voire toute une vie). Elle se subdivise souvent en mémoire **déclarative** (souvenirs explicitement accessibles, comme la mémoire épisodique ou la mémoire sémantique) et mémoire **non déclarative** (habiletés motrices, conditionnements, etc.).

#### Processus de mémorisation

Le processus de mémorisation se décompose généralement en :

1. **Encodage** : Transformation des informations en traces mémorielles.
2. **Stockage** : Maintien des traces dans un système de stockage.
3. **Récupération** : Accès ultérieur à ces traces lorsque le contexte ou la tâche l’exige.

Ces mécanismes sont soumis à des phénomènes d’**oubli**, de **distorsion** et d’**interférence** (oublier un souvenir, le mélanger avec d’autres, etc.), révélant que la mémoire humaine est à la fois puissante et faillible.

***

### La mémoire en intelligence artificielle

#### Fondements et analogies

Dans le domaine de l’IA, on parle de « mémoire » pour désigner la capacité d’un système à **retenir** et à **réutiliser** des informations sur le long terme (base de connaissances), ou plus temporairement (état d’un agent dans un épisode de décision). Contrairement à l’humain, une IA n’est pas obligée de subir l’oubli ou la distorsion ; mais elle peut rencontrer d’autres limites (capacité de stockage, mise à jour inefficace, surapprentissage, etc.).

#### Mémoires symboliques vs. subsymboliques

* **Mémoire symbolique** : Les informations sont structurées et indexées sous forme de symboles (logique, règles, bases de faits). L’IA peut interroger cette base via des algorithmes de recherche ou d’inférence.
* **Mémoire subsymbolique** : Les réseaux de neurones apprennent de grandes quantités de données et stockent implicitement l’information dans les poids synaptiques. Cela permet une généralisation, mais rend l’explicitation de la « mémoire » plus ardue.

#### Embeddings, vecteurs et recherche de similarité

Une tendance forte en IA moderne (et dans le **Machine Learning**) est de représenter des informations (textes, images) sous forme de **vecteurs** (ou embeddings). Les moteurs de recherche vectorielle permettent alors de retrouver des contenus « proches » sémantiquement, enrichissant la capacité de mémoire « compréhensive » de l’agent.

***

### Pourquoi la mémoire est-elle essentielle à l’intelligence ?

1. **Apprentissage et réutilisation**\
   Sans mémoire, un agent ne peut pas accumuler d’expérience ni améliorer sa prise de décision. Tout apprentissage suppose de stocker quelque part les résultats de cet apprentissage (les modifications de poids, les règles, les données, etc.).
2. **Contexte et cohérence**\
   Que ce soit dans une conversation ou dans une séquence de tâches, la mémoire permet de garder la cohérence. Un chatbot sans mémoire serait incapable de se souvenir de ce dont il était question quelques phrases plus tôt.
3. **Génération de connaissances**\
   Une IA (ou un humain) appuie son raisonnement sur des informations stockées antérieurement. La mémoire alimente donc le processus de création ou de découverte de nouvelles connaissances en reliant des informations déjà acquises.

***

### Organisation de la mémoire pour un système intelligent

#### Mémoires multiples et hiérarchiques

De nombreux système implémentent plusieurs « couches » de mémoire, par analogie à la cognition humaine :

* Une **mémoire de travail** dynamique, stockant l’état courant de l’agent (objectif actuel, conversation en cours).
* Une **mémoire à plus long terme** (persistante), pouvant inclure des documents, des connaissances indexées, des embeddings.

#### Mécanismes de mise à jour et de rappel

Pour qu’un système gère efficacement sa mémoire, il doit :

* **Indexer et tagger** les nouvelles données (temps, contexte, importance).
* **Rechercher** les éléments pertinents en fonction d’un indice (requête textuelle, vectorielle, etc.).
* **Élaguer** ou archiver les informations peu utiles, afin d’éviter une explosion de la base et de maintenir des performances raisonnables.

#### Gestion des conflits et de l’oubli

Les systèmes sophistiqués doivent parfois gérer la **cohérence** entre informations contradictoires ou obsolètes. Certains frameworks intègrent des mécanismes d’oubli planifié ou de versioning pour conserver l’historique tout en privilégiant la version la plus récente.

***

### Perspectives d’évolution

1. **Mémoire distributive** : Les futures IA collaboratives pourraient partager leur mémoire (cloud distribué), tout en maintenant des index locaux pour la vitesse et la confidentialité.
2. **Mémoire neurosymbolique** : Des approches hybrides combinent la précision des représentations symboliques et la robustesse des approches neuronales pour une mémoire plus « compréhensible » et plus flexible.
3. **Auto-correction** : Les systèmes capables de détecter leurs propres contradictions et de rectifier ou annuler des informations obsolètes seront de plus en plus courants.

***

### En résumé

La mémoire est un **pilier fondamental** de l’intelligence, qu’elle soit biologique ou artificielle. Elle permet de conserver le fruit des expériences passées, de contextualiser les actions présentes et de préparer les décisions futures. En IA, les mécanismes de mémoire prennent des formes variées (bases de faits, embeddings vectoriels, stockage distribué), mais partagent l’objectif commun de **préserver et d’exploiter** l’information de manière pertinente.

Dans le cadre de ce framework, la mémoire est donc conçue pour fournir au système un accès rapide et cohérent aux informations utiles, tout en restant flexible quant aux **méthodes de stockage et d’indexation** (in-memory, Meilisearch, etc.).&#x20;
