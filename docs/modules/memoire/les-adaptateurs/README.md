---
description: >-
  Un adaptateur mémoire est un composant permettant de gérer la persistance et
  la récupération des données de l'agent en fonction du moteur sous-jacent.
---

# Les adaptateurs

### **Qu’est-ce qu’un adaptateur mémoire ?**

Un **adaptateur mémoire** est un composant permettant de gérer la **persistance et la récupération** des données de l'agent en fonction du moteur sous-jacent.

Il sert d'interface entre le système et le stockage, en encapsulant les spécificités d’un moteur (base de données, cache, indexation…).

Grâce aux adaptateurs, **le système peut changer de moteur de stockage sans modifier son code**.

***

### **Fonctionnement des adaptateurs mémoire**

Tous les adaptateurs doivent implémenter une interface commune **`IMemoryAdapter`**, garantissant une API standardisée.

#### **Méthodes essentielles d’un adaptateur**

| Méthode                                                                        | Description                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| `init(roomId: string)`                                                         | Initialise le stockage pour une salle donnée |
| `createMemory(input: CreateMemoryInput)`                                       | Stocke une nouvelle mémoire                  |
| `getMemoryById(id: string, roomId: string)`                                    | Récupère une mémoire spécifique              |
| `getMemoryByIndex(query: string, options: { roomId: string; limit?: number })` | Recherche des mémoires par indexation        |
| `getAllMemories(roomId: string)`                                               | Récupère toutes les mémoires d’une salle     |
| `clearMemoryById(id: string, roomId: string)`                                  | Supprime une mémoire spécifique              |
| `clearAllMemories()`                                                           | Vide toutes les mémoires                     |

Ainsi, un adaptateur peut être **changé ou ajouté dynamiquement**, sans modifier l'agent.

***

### **Adaptateurs intégrés (par défaut)**

Le framework propose **plusieurs adaptateurs intégrés** :

| Adaptateur             | Type de stockage     | Cas d’usage                     |
| ---------------------- | -------------------- | ------------------------------- |
| **InMemoryAdapter**    | RAM (non persistant) | Cache rapide, temporaire        |
| **MeilisearchAdapter** | Moteur de recherche  | Recherche avancée et indexation |
| **RedisAdapter**       | Stockage clé-valeur  | Cache persistant avec TTL       |

***

### **Créer un nouvel adaptateur : Exemple avec SQLite**

Si on veut utiliser **SQLite** comme moteur de stockage mémoire, on doit créer un nouvel adaptateur.

#### **1. Installer la dépendance**

On utilise [BetterSQLite3](https://github.com/WiseLibs/better-sqlite3) pour des accès rapides et synchrones.

```sh
npm install better-sqlite3
```

#### **2. Implémenter l’adaptateur**

On crée un fichier `BetterSQLiteAdapter.ts` qui respecte l’interface `IMemoryAdapter`.

```typescript
import Database from "better-sqlite3";
import { IMemoryAdapter } from "../interfaces";
import { BaseMemoryType, CreateMemoryInput } from "../types";

/**
 * @module BetterSQLiteAdapter
 * @description Adaptateur SQLite pour le stockage persistant des mémoires.
 */
export class BetterSQLiteAdapter implements IMemoryAdapter {
  private db: Database.Database;

  /**
   * Initialise l'adaptateur avec une base SQLite.
   * @param {string} dbPath - Chemin vers le fichier SQLite
   */
  constructor(dbPath: string = "./memory.db") {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  /**
   * Initialise la table SQLite si elle n'existe pas
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        roomId TEXT,
        data TEXT,
        createdAt TEXT
      )
    `);
  }

  /**
   * Initialise le stockage pour une salle spécifique (non nécessaire pour SQLite).
   */
  async init(_roomId: string): Promise<void> {
    return;
  }

  /**
   * Stocke une nouvelle mémoire dans la base SQLite.
   * @param {CreateMemoryInput} input - Données de la mémoire
   * @returns {Promise<BaseMemoryType>} - Mémoire créée
   */
  async createMemory(input: CreateMemoryInput): Promise<BaseMemoryType> {
    const memory: BaseMemoryType = {
      id: input.id || crypto.randomUUID(),
      data: input.data,
      roomId: input.roomId,
      createdAt: new Date(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (id, roomId, data, createdAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(memory.id, memory.roomId, memory.data, memory.createdAt.toISOString());

    return memory;
  }

  /**
   * Récupère une mémoire par ID et salle.
   * @param {string} id - Identifiant de la mémoire
   * @param {string} roomId - Identifiant de la salle
   * @returns {Promise<BaseMemoryType | null>} - Mémoire trouvée ou null
   */
  async getMemoryById(id: string, roomId: string): Promise<BaseMemoryType | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE id = ? AND roomId = ?
    `);
    const row = stmt.get(id, roomId);
    return row ? { ...row, createdAt: new Date(row.createdAt) } : null;
  }

  /**
   * Recherche des mémoires contenant un mot-clé.
   */
  async getMemoryByIndex(query: string, options: { roomId: string; limit?: number }): Promise<BaseMemoryType[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE roomId = ? AND data LIKE ? LIMIT ?
    `);
    return stmt.all(options.roomId, `%${query}%`, options.limit || 10);
  }

  /**
   * Récupère toutes les mémoires d'une salle.
   */
  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE roomId = ?
    `);
    return stmt.all(roomId);
  }

  /**
   * Supprime une mémoire spécifique.
   */
  async clearMemoryById(id: string, roomId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM memories WHERE id = ? AND roomId = ?
    `);
    stmt.run(id, roomId);
  }

  /**
   * Supprime toutes les mémoires.
   */
  async clearAllMemories(): Promise<void> {
    this.db.exec(`DELETE FROM memories`);
  }
}
```

***

### **Intégrer le nouvel adaptateur**

Une fois le nouvel adaptateur implémenté, on peut l’intégrer dans l’agent :

```typescript
import { BetterSQLiteAdapter } from "./BetterSQLiteAdapter";
import { Memory } from "../modules/memory";

// Initialisation avec SQLite
const memoryAdapter = new BetterSQLiteAdapter("./agent-memory.db");
const memoryModule = new Memory(memoryAdapter);

async function run() {
  await memoryModule.createMemory({
    data: "Ceci est un test",
    roomId: "chat-session-1",
  });

  const memories = await memoryModule.getAllMemories("chat-session-1");
  console.log("Mémoires récupérées :", memories);
}

run();
```
