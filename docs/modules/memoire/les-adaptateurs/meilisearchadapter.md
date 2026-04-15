---
description: >-
  L'adaptateur Meilisearch est conçu pour offrir une indexation rapide et une
  recherche avancée sur les données en mémoire.
---

# MeiliSearchAdapter

`MeilisearchAdapter` intègre Meilisearch comme moteur de stockage et de recherche pour la mémoire des systèmes.&#x20;

Ce type d’adaptateur est particulièrement adapté aux cas où un système doit retrouver rapidement des informations contextuelles à partir d’une **grande quantité de données**.

***

### **Spécificités techniques du MeilisearchAdapter**

#### **Stockage sous forme d’index dans Meilisearch**

L’adaptateur crée un index distinct pour chaque `roomId`. Un index est l’équivalent d’une **collection de documents** dans une base NoSQL, permettant une **recherche optimisée**.

```typescript
private async initializeStorage(roomId: string): Promise<void> {
  try {
    await this.makeRequest(`/indexes/${roomId}`);
  } catch {
    await this.makeRequest("/indexes", {
      method: "POST",
      body: JSON.stringify({ uid: roomId, primaryKey: "id" }),
    });
  }
}
```

Si l’index n’existe pas encore, il est automatiquement créé, évitant toute configuration manuelle.

***

#### **Indexation et recherche avancée**

Meilisearch permet des **requêtes de recherche floues** avec un **scoring** de pertinence. Les résultats sont classés en fonction de leur **similarité avec la requête**, ce qui est idéal pour une mémoire adaptative.

**Indexation d’une nouvelle mémoire**

```typescript
async createMemory(input: CreateMemoryInput & { embedding?: number[] }): Promise<BaseMemoryType | undefined> {
  await this.initializeStorage(input.roomId);

  const existingMemory = await this.search(input.data, input.roomId, { limit: 1 });
  if (existingMemory.length > 0) {
    return existingMemory[0].document;
  }

  const memory: BaseMemoryType = {
    id: input.id || crypto.randomUUID(),
    data: input.data,
    embedding: input.embedding,
    roomId: input.roomId,
    createdAt: new Date(),
  };

  await this.addDocuments([memory], input.roomId);
  return memory;
}
```

Chaque mémoire ajoutée est immédiatement indexée et accessible via **une recherche contextuelle rapide**.

***

#### **Optimisation de la recherche et scoring de pertinence**

Contrairement à une recherche brute basée sur une correspondance exacte, Meilisearch évalue **le degré de similarité** des documents avec la requête. Cela permet d’améliorer la compréhension contextuelle du système.

```typescript
private async search(query: string, roomId: string, options?: { limit?: number; threshold?: number }): Promise<SearchResult[]> {
  const searchResults = await this.makeRequest(`/indexes/${roomId}/search`, {
    method: "POST",
    body: JSON.stringify({
      q: query,
      limit: options?.limit || 10,
    }),
  });

  if (!searchResults.hits) return [];

  return searchResults.hits.map((hit: any) => ({
    document: {
      id: hit.id,
      data: hit.data,
      embedding: hit.embedding,
      roomId: hit.roomId,
      createdAt: hit.createdAt,
    },
    score: hit._score || 0,
  }));
}
```

Les résultats retournés sont **triés par pertinence**, avec un score de similarité permettant d'ajuster dynamiquement les réponses du système.

***

#### **Suppression et nettoyage d’index**

L’adaptateur permet d’effacer **sélectivement** une mémoire spécifique ou **de supprimer un index complet**, ce qui est utile lorsque la mémoire devient obsolète ou que l’on veut réinitialiser un contexte.

**Suppression d’une mémoire spécifique**

```typescript
async clearMemoryById(id: string, roomId: string): Promise<void> {
  await this.makeRequest(`/indexes/${roomId}/documents/${id}`, { method: "DELETE" });
}
```

**Suppression de toutes les mémoires d’un index**

```typescript
private async deleteStorage(roomId: string): Promise<void> {
  await this.makeRequest(`/indexes/${roomId}`, { method: "DELETE" });
}
```

***

### **Limitations et considérations**

#### **Dépendance à un service externe**

Meilisearch nécessite une instance serveur active. Un système exécuté localement doit donc **se connecter à une base distante** ou à **une instance en auto-hébergement**.

#### **Latence réseau**

Les performances dépendent de la latence du serveur Meilisearch. Pour des besoins de faible latence, une solution comme **Redis** peut être plus adaptée.

#### **Consommation mémoire et stockage**

Les index doivent être **nettoyés régulièrement**, en particulier si l’agent génère un **grand volume de données**.

***

### **Cas d’usage**&#x20;

**`MeilisearchAdapter`** est idéal pour :

* **La recherche avancée en langage naturel** dans les logs de l’agent.
* **L’historisation et la récupération d’interactions** sur le long terme.
* **La gestion d’une base de connaissances structurée** pour un agent conversationnel.
