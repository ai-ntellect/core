# Module Agenda

Planification de tâches récurrentes avec expressions cron. L'agenda s'exécute en processus — quand le cron correspond, votre fonction de tâche s'exécute.

## Installation

Le module est inclus dans le package principal:

```typescript
import { Agenda } from "@ai.ntellect/core";
```

## Utilisation de base

```typescript
import { Agenda, NodeCronAdapter } from "@ai.ntellect/core";

const agenda = new Agenda(new NodeCronAdapter());

// Toutes les heures
agenda.schedule("0 * * * *", async () => {
  console.log("Tâche horaire en cours");
});

// Tâche nommée pour annulation
agenda.schedule("daily_cleanup", "0 0 * * *", async () => {
  console.log("Nettoyage quotidien");
});
```

## Syntaxe cron

Utilise `node-cron` en arrière-plan. La syntaxe suit les conventions cron standard:

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └── Jour de la semaine (0-7, 0 et 7 = dimanche)
│ │ │ │ └──── Mois (1-12)
│ │ │ └────── Jour du mois (1-31)
│ │ └──────── Heure (0-23)
│ └────────── Minute (0-59)
└──────────── Seconde (0-59, optionnel)
```

## API

- `schedule(cronExpression: string, task: Function): void`
- `schedule(name: string, cronExpression: string, task: Function): void`
- `cancel(name: string): void`

## Intégration avec l'Agent

L'agent peut utiliser l'agenda pour planifier des réveils:

```typescript
const agent = new Agent({
  role: "Assistant",
  enableSchedule: true,
  agenda: agenda,
  // ...
});
```
