# Génération de Documentation Vivante

CortexFlow permet de générer automatiquement la documentation des Petri Nets sous forme de diagrammes Mermaid, de fichiers Markdown et de pages HTML interactives.

## Génération via CLI

```bash
npx ts-node scripts/generate-petri-docs.ts <petri-net.json> [output-dir]
```

**Exemple** :
```bash
npx ts-node scripts/generate-petri-docs.ts examples/my-workflow.json ./docs/petri
```

**Sortie** (dans `./docs/petri/` ou dossier spécifié) :
- `my-workflow.md` — Documentation Markdown
- `my-workflow-diagram.mmd` — Diagramme Mermaid
- `my-workflow.html` — Prévisualisation HTML avec rendu Mermaid

## Format de fichier Petri Net (JSON)

```json
{
  "name": "mon-workflow",
  "places": [
    { "id": "idle", "type": "initial", "tokens": [] },
    { "id": "processing", "type": "normal", "tokens": [] },
    { "id": "done", "type": "final", "tokens": [] }
  ],
  "transitions": [
    {
      "id": "start",
      "from": ["idle"],
      "to": ["processing"],
      "description": "Démarrer le traitement"
    }
  ]
}
```

## Génération programmatique

```typescript
import { PetriDocumentationGenerator } from "@ai.ntellect/core/petri/documentation-generator";
import { PetriNet } from "@ai.ntellect/core/petri/index";

const net = new PetriNet("mon-workflow");
// ... configurer le réseau

const generator = new PetriDocumentationGenerator();
await generator.generateForPetri(net, {
  outputDir: "./docs/petri",
  format: "all", // "markdown" ou "all" (inclut HTML)
  includeHistory: true,
  includeState: true,
});
```

## Documentation de session

Pour générer la documentation d'une session en cours (avec l'état actuel) :

```typescript
await generator.generateForSession(
  orchestrator,
  sessionId,
  { outputDir: "./docs/sessions", format: "markdown" }
);
```

**Fichiers générés** :
- `session-<id>-state.md` — État actuel (marquage, transitions activées)
- `session-<id>-state.mmd` — Diagramme avec surbrillance de l'état
- `session-<id>-report.md` — Rapport complet de la session

## Intégration dans le CLI Dev

Le CLI `cli-dev.ts` inclut une commande `dot` pour exporter le graphe au format DOT :

```bash
npx ts-node cli-dev.ts mon-workflow.json
> dot
# Affiche le graphe au format DOT (utilisable avec Graphviz)
```

## Avantages

- **Toujours à jour** — La documentation est générée directement depuis le code
- **Visualisation** — Diagrammes Mermaid intégrables dans n'importe quel Markdown
- **Debugging** — L'état actuel est inclus dans la documentation de session
- **Partage** — Le HTML auto-suffisant peut être partagé sans dépendances
