# Tutoriel: File Editor Workflow

Dans ce tutoriel, nous allons créer un **workflow complet** pour lire, modifier et sauvegarder des fichiers.

## Le problème

Lire un fichier c'est bien, mais souvent on veut:
- **Lire** un fichier
- **Modifier** son contenu
- **Sauvegarder** les changements

Un outil qui fait juste "lire" n'est pas très utile. Un **workflow complet** qui enchaîne les opérations oui.

## Résultat attendu

```
User: "Remplace 'version: 0.9.0' par 'version: 0.9.1' dans config.json"

Workflow:
1. [READ] Lit config.json
2. [PROCESS] Remplace le texte
3. [WRITE] Sauvegarde config.json

Response: "J'ai modifié config.json: version mise à jour vers 0.9.1"
```

## Schema

```typescript
import { z } from "zod";

const FileEditorSchema = z.object({
  path: z.string().describe("Chemin du fichier à modifier"),
  operation: z.enum(["read", "replace", "append"])
    .describe("Type d'opération: read (lecture), replace (remplacement), append (ajout)"),
  search: z.string().optional()
    .describe("Texte à chercher (requis pour replace)"),
  replace: z.string().optional()
    .describe("Texte de remplacement"),
  content: z.string().optional()
    .describe("Contenu lu ou modifié"),
  success: z.boolean().optional()
    .describe("Si l'opération a réussi"),
});
```

**Important:** Le `.describe()` est lu par le LLM pour comprendre quand utiliser chaque paramètre.

## Workflow complet (3 noeuds)

```typescript
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const fileEditorFlow = new GraphFlow({
  name: "file_editor",
  schema: FileEditorSchema,
  context: { path: "", operation: "read", success: false },
  nodes: [
    // ============================================
    // NOEUD 1: Lire le fichier
    // ============================================
    {
      name: "read_file",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        const fs = await import("fs/promises");
        try {
          ctx.content = await fs.readFile(ctx.path, "utf-8");
          console.log(`[READ] ${ctx.path}: ${ctx.content.split("\n").length} lignes`);
        } catch (err: any) {
          ctx.content = undefined;
          ctx.success = false;
          console.log(`[READ] Erreur: ${err.message}`);
        }
      },
      // Toujours passer au noeud suivant après lecture
      next: ["process_content"],
    },

    // ============================================
    // NOEUD 2: Traiter selon l'opération
    // ============================================
    {
      name: "process_content",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        switch (ctx.operation) {
          case "read":
            // Simple lecture, rien à modifier
            ctx.success = true;
            console.log(`[PROCESS] Lecture seule`);
            break;

          case "replace":
            // Remplacement de texte
            if (!ctx.search) {
              ctx.success = false;
              console.log(`[PROCESS] Erreur: search requis pour replace`);
              break;
            }
            if (!ctx.content?.includes(ctx.search)) {
              ctx.success = false;
              console.log(`[PROCESS] Texte "${ctx.search}" non trouvé`);
              break;
            }
            ctx.content = ctx.content.replace(ctx.search, ctx.replace || "");
            ctx.success = true;
            console.log(`[PROCESS] Remplacement effectué`);
            break;

          case "append":
            // Ajouter du texte à la fin
            ctx.content = (ctx.content || "") + "\n" + (ctx.replace || "");
            ctx.success = true;
            console.log(`[PROCESS] Texte ajouté`);
            break;
        }
      },
      // CONDITIONNEL: Sauvegarder seulement si modification réussie
      next: (ctx) => {
        if (ctx.operation === "read" || !ctx.success) {
          return []; // Fin du workflow
        }
        return ["write_file"]; // Passer à la sauvegarde
      },
    },

    // ============================================
    // NOEUD 3: Sauvegarder (uniquement si modifié)
    // ============================================
    {
      name: "write_file",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        if (!ctx.content) return;
        const fs = await import("fs/promises");
        await fs.writeFile(ctx.path, ctx.content, "utf-8");
        console.log(`[WRITE] ${ctx.path} sauvegardé`);
      },
    },
  ],
});
```

## Utilisation

### Sans agent (test direct)

```typescript
// Test 1: Lecture seule
await fileEditorFlow.execute("read_file", {
  path: "package.json",
  operation: "read",
});
console.log(fileEditorFlow.getContext().content);

// Test 2: Remplacement
await fileEditorFlow.execute("read_file", {
  path: "package.json",
  operation: "replace",
  search: '"version": "0.9.0"',
  replace: '"version": "0.9.1"',
});
console.log(fileEditorFlow.getContext().success); // true
```

### Avec un agent

```typescript
const agent = new Agent({
  role: "File Editor",
  goal: "Lire et modifier des fichiers",
  tools: [fileEditorFlow],
  llmConfig: getLLMConfig(),
  verbose: true,
});

// Le LLM comprend automatiquement:
// - Quelle opération faire (read/replace/append)
// - Quels paramètres fournir
await agent.process("Lis le fichier config.json");
await agent.process("Remplace 'debug: true' par 'debug: false' dans config.json");
await agent.process("Ajoute '# Notes' à la fin de todo.md");
```

## Exemple complet testable

```typescript
// examples/file-editor.ts

import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";
import { GraphContext } from "@ai.ntellect/core/types";

const FileEditorSchema = z.object({
  path: z.string(),
  operation: z.enum(["read", "replace", "append"]),
  search: z.string().optional(),
  replace: z.string().optional(),
  content: z.string().optional(),
  success: z.boolean().optional(),
});

const fileEditorFlow = new GraphFlow({
  name: "file_editor",
  schema: FileEditorSchema,
  context: { path: "", operation: "read", success: false },
  nodes: [
    {
      name: "read_file",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        const fs = await import("fs/promises");
        ctx.content = await fs.readFile(ctx.path, "utf-8");
      },
      next: ["process_content"],
    },
    {
      name: "process_content",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        if (ctx.operation === "read") {
          ctx.success = true;
        } else if (ctx.operation === "replace" && ctx.search) {
          if (ctx.content?.includes(ctx.search)) {
            ctx.content = ctx.content.replace(ctx.search, ctx.replace || "");
            ctx.success = true;
          }
        }
      },
      next: (ctx) => ctx.operation !== "read" && ctx.success ? ["write_file"] : [],
    },
    {
      name: "write_file",
      execute: async (ctx: GraphContext<typeof FileEditorSchema>) => {
        const fs = await import("fs/promises");
        await fs.writeFile(ctx.path, ctx.content || "", "utf-8");
      },
    },
  ],
});

// Tests
async function test() {
  // Créer un fichier test
  const fs = await import("fs/promises");
  await fs.writeFile("test.txt", "Hello World\n", "utf-8");

  // Lire
  await fileEditorFlow.execute("read_file", {
    path: "test.txt",
    operation: "read",
  });
  console.log("Lu:", fileEditorFlow.getContext().content);

  // Modifier
  await fileEditorFlow.execute("read_file", {
    path: "test.txt",
    operation: "replace",
    search: "World",
    replace: "Universe",
  });
  console.log("Succès:", fileEditorFlow.getContext().success);

  // Vérifier
  const content = await fs.readFile("test.txt", "utf-8");
  console.log("Résultat:", content); // "Hello Universe\n"

  // Nettoyer
  await fs.unlink("test.txt");
}

test();
```

## Concepts clés

### 1. `next` conditionnel

```typescript
next: (ctx) => ctx.operation !== "read" && ctx.success ? ["write_file"] : []
```

- Si `operation !== "read"` ET `success === true` → aller à `write_file`
- Sinon → fin du workflow

### 2. Context modifié entre noeuds

```typescript
// Noeud 1: read_file
ctx.content = await fs.readFile(...)

// Noeud 2: process_content
ctx.content = ctx.content.replace(...) // Modifie ce qui a été lu

// Noeud 3: write_file
await fs.writeFile(ctx.path, ctx.content) // Utilise le contenu modifié
```

### 3. Le schema guide le LLM

```typescript
operation: z.enum(["read", "replace", "append"])
  .describe("Type d'opération: ...")
```

Le LLM voit "read, replace, append" et comprend quand utiliser chaque option.

## Pour aller plus loin

### Vérifier avant d'écraser

Ajoutez un noeud de confirmation:

```typescript
{
  name: "confirm_overwrite",
  execute: async (ctx) => {
    if (ctx.operation === "replace") {
      // Créer un backup
      const fs = await import("fs/promises");
      await fs.writeFile(ctx.path + ".backup", ctx.content!, "utf-8");
    }
  },
  next: ["write_file"],
},
```

### Traitement batch

```typescript
{
  name: "process_multiple",
  execute: async (ctx) => {
    const replacements = JSON.parse(ctx.search || "[]");
    for (const { search, replace } of replacements) {
      ctx.content = ctx.content?.replace(search, replace);
    }
    ctx.success = true;
  },
}
```
