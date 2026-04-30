# Module NLP

Le module NLP enveloppe `@nlpjs/basic` comme nœuds de graphe pour le traitement du langage naturel.

## Installation

Le module est inclus dans le package principal:

```typescript
import { NLPEngine } from "@ai.ntellect/core";
```

## Utilisation de base

```typescript
import { NLPEngine } from "@ai.ntellect/core";

const nlp = new NLPEngine();

// Entraîner le moteur
await nlp.train([
  { intent: "greeting", utterances: ["hello", "hi", "hey"], answer: "Hello! How can I help?" },
  { intent: "goodbye", utterances: ["bye", "see you"], answer: "Goodbye!" },
]);
```

## Utilisation comme nœud de graphe

```typescript
{
  name: "process_input",
  execute: async (ctx) => {
    const result = await nlp.process(ctx.userInput);
    ctx.intent = result.intent;
    ctx.answer = result.answer;
  },
}
```

## Cas d'usage

- **Chatbots** — Détection d'intention sur les entrées utilisateur
- **Classification** — Catégoriser du texte
- **Réponses automatiques** — Réponses basées sur des règles simples
