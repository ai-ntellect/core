---
description: >-
  Avant de plonger dans les détails du framework, il est essentiel de comprendre
  les bases de l’automatisation, des agents et de l’IA.
---

# Concepts clés

À l'ère moderne, l'intelligence artificielle s'est infiltrée dans presque tous les secteurs : **santé, éducation, transport, finance, communication**, et bien d’autres encore.&#x20;

Ces technologies promettent **une transformation profonde de notre manière d’interagir avec le monde** et d’optimiser notre efficacité au quotidien.

### **Des applications invisibles mais omniprésentes**

Dans notre quotidien, nous utilisons l’IA, parfois, **sans même nous en rendre compte :**

* **Dans la communication** → Les outils de traduction automatique brisent les barrières linguistiques et facilitent la compréhension entre cultures.
* **Dans la finance** → Les algorithmes analysent des millions de transactions pour détecter les fraudes bancaires et sécuriser les comptes.
* **Dans les transports** → Les GPS intelligents optimisent les itinéraires en fonction du trafic en temps réel, évitant les embouteillages.
* **Dans nos emails** → Les filtres anti-spam bloquent les menaces potentielles en triant les messages suspects.

L’IA ne se contente pas d’exécuter des tâches, **elle apprend, s’adapte et optimise nos processus**.

Mais une question fondamentale se pose : **comment ces systèmes sont-ils organisés pour gérer des tâches de plus en plus complexes ?**

***

### **Automatiser et orchestrer : quelle différence ?**

L’automatisation et l’orchestration sont **deux concepts fondamentaux** en intelligence artificielle et en informatique. Bien qu'ils soient souvent confondus, ils ont des rôles distincts :

**Automatiser, c’est exécuter une tâche prévisible**

L’automatisation repose sur des règles fixes. Par exemple, si tu configures une boîte mail pour **classer automatiquement les factures**, tu viens de créer **une automatisation simple**.

Mais que se passe-t-il quand **les tâches deviennent complexes, interconnectées et doivent s’adapter aux événements extérieurs** ?

C’est là qu’intervient **l’orchestration**.

**Orchestrer, c’est gérer des processus dynamiques**

L’orchestration va **au-delà de l’automatisation** en permettant :&#x20;

* **La gestion de plusieurs processus simultanément**.
* **L’adaptation en fonction du contexte** (exécution conditionnelle).
* **La coordination entre différents systèmes et services**.

Exemple :

* **Automatisation** → Une notification de paiement est envoyée après un achat.
* **Orchestration** → Vérification du stock → Validation du paiement → Expédition → Mise à jour de la base de données → Envoi d’une confirmation au client.

**@ai.ntellect/core est un framework d’orchestration** : il ne se contente pas d’automatiser une action unique, il **connecte et synchronise plusieurs processus intelligents.**

***

### **Les agents**

L’automatisation repose souvent sur des règles **fixes**, tandis qu’un agent peut **réagir et s’adapter** à son environnement.

#### **Qu’est-ce qu’un agent ?**

Un **agent**, c’est une **entité autonome** qui prend **des décisions** en fonction des informations qu’il reçoit et des objectifs qu’il doit atteindre. Contrairement à un simple programme automatisé, un agent peut :

* **Évaluer une situation**.
* **Prendre une décision adaptée**.
* **Interagir avec d’autres agents ou services**.
* **Mémoriser et apprendre de ses expériences passées**.

**Dans @ai.ntellect/core, un agent est défini sous forme de graphe**, où chaque nœud représente une **action, une décision ou une interaction avec un service externe**.

#### **Différences entre automatisation et agent**

| Automatisation                                | Agent                                            |
| --------------------------------------------- | ------------------------------------------------ |
| Suit des règles prédéfinies                   | Peut adapter ses actions selon le contexte       |
| Exécute des tâches simples et répétitives     | Gère des processus évolutifs et complexes        |
| Dépend entièrement de ses paramètres initiaux | Peut apprendre ou s’appuyer sur des modèles d’IA |

### **Qu’est-ce qu’un graphe et comment il structure un agent ?**

Un agent intelligent doit pouvoir **exécuter plusieurs actions de manière dynamique**, avec des décisions conditionnelles et des interactions complexes.

**C’est ici que les graphes entrent en jeu.**

Un **graphe** est une structure de données **qui représente des relations entre différentes entités**.

Dans **@ai.ntellect/core**, les agents sont modélisés comme des **graphes d’exécution**, où :

* **Chaque nœud est une action, une décision ou un événement**.
* **Les liens entre les nœuds définissent l’ordre et la logique d’exécution**.

Exemple : **Exécution d’un paiement sur la blockchain**

```
[ Vérifier le solde ]  
        ↓  
[ Décision : Solde suffisant ? ] → Non → [ Fin ]  
        ↓ Oui  
[ Exécuter la transaction ]  
```

Ce modèle permet de **structurer intelligemment les workflows et les agents**, en permettant :&#x20;

* **L’ajout de nouvelles actions sans casser le système**.
* **L’exécution conditionnelle et parallèle**.
* **Une orchestration fluide et évolutive**.

### **Pourquoi utiliser un graphe pour structurer un agent ?**

1. **Il peut représenter une manière de raisonner** (logique conditionnelle, prise de décision).
2. **Il permet d’exécuter une liste de tâches** (workflow intelligent, automatisation flexible).&#x20;
3. **Chaque nœud peut réagir à des événements** (attente d’un signal avant d’agir, adaptation en fonction du contexte).

**Un graphe permet donc non seulement d’exécuter des tâches, mais aussi de structurer une logique décisionnelle.**
