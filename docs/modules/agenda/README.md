# Module Agenda

Planification de tâches cron.

## Installation

```sh
pnpm add @ai.ntellect/core
```

## Utilisation

```typescript
import { Agenda } from "@ai.ntellect/core";
import { NodeCronAdapter } from "@ai.ntellect/core/modules/agenda/adapters/node-cron";

const agenda = new Agenda(new NodeCronAdapter());

agenda.schedule("* * * * *", async () => {
  console.log("Exécuté chaque minute");
});

agenda.schedule("0 8 * * *", async () => {
  console.log("Exécuté à 8h chaque jour");
});
```

## Expressions cron

```
┌────────── minute (0-59)
│ ┌──────── heure (0-23)
│ │ ┌────── jour (1-31)
│ │ │ ┌──── mois (1-12)
│ │ │ │ ┌── jour semaine (0-6)
* * * * *
```

| Expression | Description |
|------------|-------------|
| `* * * * *` | Chaque minute |
| `*/5 * * * *` | Toutes les 5 minutes |
| `0 8 * * *` | 8h chaque jour |
| `0 0 * * 0` | Minuit dimanche |

## API

```typescript
agenda.schedule(cronExpression: string, handler: () => void | Promise<void>): void
agenda.cancel(): void
```
