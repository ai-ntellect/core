---
description: >-
  L'interface IMemory définit une abstraction pour stocker, rechercher et gérer
  des entrées mémorielles
---

# Interface IMemory

L'interface `IMemory` définit une abstraction pour **stocker, rechercher et gérer des entrées mémorielles** dans un environnement où un agent doit retenir des informations sur le long terme ou pour des sessions temporaires.

Ce module suit une **approche modulaire et agnostique** du backend, permettant d’être implémenté avec différents moteurs de stockage :

* **Stockage en mémoire** (`InMemoryAdapter`)
* **Base de données** (`MeilisearchAdapter`, `RedisAdapter`, `PostgreSQLAdapter`)
* **Stockage distribué** (`VectorDBAdapter`, `PineconeAdapter`)

***

### **Objectif de l'interface**

L'interface `IMemory` doit permettre :

* **Le stockage structuré et sécurisé d'informations** persistantes ou temporaires.
* **Une récupération rapide** avec support des **requêtes sémantiques** (recherche par similarité).
* **La gestion dynamique du cycle de vie des mémoires** (création, expiration, suppression).
* **L’adaptabilité à différents backends**, grâce aux `IMemoryAdapter` interchangeables.

***

### **Définition de l’interface**

```typescript
/**
 * Interface pour la gestion de la mémoire d'un agent
 */
export interface IMemory {
  /**
   * Initialise le service mémoire avec les configurations requises
   * @returns {Promise<void>}
   */
  init(): Promise<void>;

  /**
   * Crée une nouvelle entrée mémoire.
   * @param {MemoryInput} input - Données de la mémoire à enregistrer.
   * @returns {Promise<MemoryEntry | undefined>} Retourne l’entrée créée, ou `undefined` en cas d’échec.
   */
  createMemory(input: MemoryInput): Promise<MemoryEntry | undefined>;

  /**
   * Récupère une entrée mémoire par son identifiant.
   * @param {string} id - Identifiant unique de la mémoire.
   * @param {string} roomId - Identifiant de la session ou du contexte.
   * @returns {Promise<MemoryEntry | null>} Retourne l'entrée mémoire si trouvée, sinon `null`.
   */
  getMemoryById(id: string, roomId: string): Promise<MemoryEntry | null>;

  /**
   * Effectue une recherche d’entrées mémoire selon une requête textuelle.
   * @param {string} query - Texte de la requête.
   * @param {MemorySearchOptions} options - Options de recherche.
   * @returns {Promise<MemoryEntry[]>} Retourne une liste d'entrées mémorielles correspondantes.
   */
  searchMemory(
    query: string,
    options: MemorySearchOptions
  ): Promise<MemoryEntry[]>;

  /**
   * Récupère toutes les mémoires associées à un `roomId`.
   * @param {string} roomId - Identifiant de la session.
   * @returns {Promise<MemoryEntry[]>} Liste des entrées mémorielles.
   */
  getAllMemories(roomId: string): Promise<MemoryEntry[]>;

  /**
   * Supprime une entrée mémoire spécifique.
   * @param {string} id - Identifiant de la mémoire.
   * @param {string} roomId - Identifiant de la session.
   * @returns {Promise<void>}
   */
  deleteMemoryById(id: string, roomId: string): Promise<void>;

  /**
   * Supprime toutes les entrées mémorielles d'un `roomId`.
   * @param {string} roomId - Identifiant de la session.
   * @returns {Promise<void>}
   */
  clearMemories(roomId: string): Promise<void>;
}
```

***

### **Interfaces associées**

#### **1. `MemoryInput` : Données pour une nouvelle entrée mémoire**

Lorsqu’une nouvelle mémoire est créée, elle doit suivre une structure bien définie.

```typescript
/**
 * Données nécessaires pour créer une mémoire
 */
export interface MemoryInput {
  /** Identifiant unique de la mémoire (optionnel, généré si absent) */
  id?: string;
  /** Contenu textuel de la mémoire */
  data: string;
  /** Identifiant de la session ou du contexte */
  roomId: string;
  /** (Optionnel) Vecteur d’embedding pour recherche sémantique */
  embedding?: number[];
  /** Date d’expiration (TTL) */
  expiresAt?: Date;
}
```

#### **2. `MemoryEntry` : Représentation d’une mémoire stockée**

Une mémoire active stockée doit être représentée sous cette forme.

```typescript
/**
 * Représentation d'une mémoire stockée
 */
export interface MemoryEntry extends MemoryInput {
  /** Identifiant unique attribué à la mémoire */
  id: string;
  /** Date de création de la mémoire */
  createdAt: Date;
}
```

#### **3. `MemorySearchOptions` : Options de recherche avancées**

La recherche mémoire peut inclure des critères supplémentaires pour affiner les résultats.

```typescript
/**
 * Options de recherche pour requêtes mémoire
 */
export interface MemorySearchOptions {
  /** Identifiant du contexte de recherche */
  roomId: string;
  /** Nombre maximal de résultats */
  limit?: number;
  /** Score minimal de similarité si une recherche sémantique est utilisée */
  minSimilarity?: number;
}
```

***

### **Pourquoi cette interface ?**

L’interface `IMemory` permet une **gestion optimisée et évolutive** des données mémoire :

1. **Abstraction complète du moteur de stockage**
   * Permet d’implémenter `IMemory` avec **n’importe quel backend** (`Redis`, `PostgreSQL`, `VectorDB`, etc.).
   * Découple la **logique métier** de la **logique de persistance**.
2. **Support des recherches sémantiques**
   * Les données peuvent être indexées sous forme de **vecteurs** (`embedding`).
   * Permet des recherches avancées **par similarité** et non uniquement par mots-clés.
3. **Modèle flexible et dynamique**
   * Gestion **multi-sessions (`roomId`)** pour segmenter la mémoire selon les contextes.
   * Prise en charge d’un **TTL** (`expiresAt`) pour éviter l’accumulation inutile de données.
4. **Extensibilité via des adaptateurs (`IMemoryAdapter`)**
   * Compatible avec **des moteurs de stockage externes** (`Meilisearch`, `Pinecone`, etc.).
   * Possibilité d’intégrer **plusieurs sources de mémoire** (ex: mémoire immédiate + historique long-terme).

***

### **Cas d’usage**

L’interface `IMemory` peut être utilisée dans plusieurs scénarios :

| **Cas d'usage**                   | **Exemple**                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| Stockage d’historique utilisateur | Mémorisation des interactions d’un chatbot avec un utilisateur.  |
| Recherche sémantique              | Trouver des documents ou réponses similaires à une requête.      |
| Maintien du contexte              | Conserver un état conversationnel pour un agent autonome.        |
| Mémoire dynamique                 | Stocker temporairement des informations utiles dans un `roomId`. |
