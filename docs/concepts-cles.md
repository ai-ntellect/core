# Concepts clés

## Orchestration vs Automatisation

**Automatisation**: exécution de tâches prévisibles avec des règles fixes.

**Orchestration**: coordination de processus multiples, adaptation au contexte, coordination entre systèmes.

`@ai.ntellect/core` est un framework d'orchestration.

## Agents

Un agent:
- Reçoit une entrée
- Utilise un LLM pour décider
- Exécute des actions via des GraphFlow
- Retourne une réponse

## Graphes

Les agents sont structurés en graphes où:
- Chaque noeud = une action, décision, ou événement
- Les liens = ordre et logique d'exécution

## Workflow Engine

`GraphFlow` orchestre:
- Noeuds séquentiels et parallèles
- Conditions et branchements
- Événements asynchrones
- Observation de l'état
