# CLI Interactif

Le CLI offre une interface REPL (Read-Eval-Print Loop) interactive pour exécuter des agents avec gestion de checkpoints et approbation humaine.

## Démarrage

```sh
pnpm cli -p groq -m llama-3.1-8b-instant       # Groq
pnpm cli -p openai -m gpt-4o-mini              # OpenAI
pnpm cli -p ollama -m gemma4:4b                # Local Ollama
```

## Options

- `-p, --provider` — Fournisseur LLM (openai, ollama, groq, openrouter)
- `-m, --model` — Nom du modèle
- `-b, --base-url` — URL de base de l'API
- `--api-key` — Clé API
- `-r, --role` — Rôle de l'agent
- `-g, --goal` — Objectif de l'agent
- `-v, --verbose` — Sortie verbose

## Chargement automatique du .env

Le CLI charge automatiquement le fichier `.env` pour les clés API (`GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`). Aucune dépendance `dotenv` requise.

## Commandes Slash

En mode interactif, utilisez ces commandes:

- `/status` — Affiche l'état d'exécution actuel
- `/history` — Affiche l'historique de conversation
- `/list` — Liste les checkpoints disponibles
- `/resume [cpId]` — Reprend depuis un checkpoint
- `/approve` — Approuve une action en attente
- `/reject` — Rejette une action en attente
- `/modify k=v` — Modifie le contexte avant la reprise
- `/clear` — Efface la conversation
- `/help` — Affiche l'aide
- `/exit` — Quitte

## Breakpoints

Le CLI s'arrête automatiquement avant le nœud `think` (appel LLM) pour révision human-in-the-loop. Configurez des breakpoints personnalisés via `breakpoints: ["nodeName"]` dans la config checkpoint.

## Exemple de session

```
> /role Math Assistant
> What is 25 plus 7?
[LLM thinking...]
The answer is 32.
> /history
[Shows conversation history]
> /exit
```
