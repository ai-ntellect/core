---
description: >-
  InMemoryAdapter est l'implémentation la plus simple d'un adaptateur mémoire.
  Il stocke les données en RAM.
---

# InMemoryAdapter

`InMemoryAdapter` est une implémentation simple et efficace de l’interface **IMemoryAdapter**. Il repose sur une structure **Map** pour stocker des entrées mémoire **en RAM** et ne conserve aucune donnée une fois le processus arrêté.

Ce type d’adaptateur est particulièrement adapté aux cas où la mémoire doit être temporaire, avec un accès très rapide, sans nécessiter de persistance durable.

***

### **Spécificités techniques de l’InMemoryAdapter**

#### **Stockage en mémoire via une Map**

L’adaptateur utilise une **Map TypeScript**, qui associe un `roomId` à une liste de mémoires. Contrairement à une base de données, les opérations de lecture et d’écriture sont exécutées en **temps constant O(1)** pour l’insertion et l’accès direct par clé.

```typescript
private storage: Map<string, BaseMemoryType[]> = new Map();
```

Chaque **room** représente une instance de mémoire séparée. Cela permet d’isoler les données par contexte, tout en bénéficiant d’une récupération rapide.

***

#### **Initialisation et création dynamique des rooms**

Lorsqu’un système accède à la mémoire pour la première fois, une **vérification est effectuée** afin de s’assurer que le `roomId` existe bien dans la **Map**. Si ce n’est pas le cas, un espace de stockage est créé dynamiquement.

```typescript
async init(roomId: string): Promise<void> {
  if (!this.storage.has(roomId)) {
    this.storage.set(roomId, []);
  }
}
```

Ce mécanisme permet une allocation **à la demande**, évitant tout stockage inutile en mémoire.

***

#### **Optimisation des recherches**

`InMemoryAdapter` ne permet pas d’indexation avancée comme une base de données. La recherche est effectuée **par filtrage séquentiel** dans la liste des mémoires associées à une room.

```typescript
async getMemoryByIndex(query: string, options: { roomId: string; limit?: number })
  : Promise<BaseMemoryType[]> {
  const memories = this.storage.get(options.roomId) || [];
  return memories.filter((m) => m.data.includes(query)).slice(0, options.limit || 10);
}
```

Ce type de recherche est suffisant pour un usage **temporaire ou de prototypage**, mais il devient inefficace sur **de grands volumes de données**.

***

#### **Effacement ciblé et suppression totale**

`InMemoryAdapter` permet de supprimer des entrées individuelles ou de réinitialiser l’ensemble des données en **effaçant directement les références stockées**.

**Suppression d’une mémoire spécifique**

```typescript
async clearMemoryById(id: string, roomId: string): Promise<void> {
  const memories = this.storage.get(roomId) || [];
  this.storage.set(roomId, memories.filter((m) => m.id !== id));
}
```

**Réinitialisation complète de toutes les rooms**

```typescript
async clearAllMemories(): Promise<void> {
  this.storage.clear();
}
```

Ces opérations sont **instantanées**, mais elles **ne permettent pas d’annulation** (contrairement à une base de données transactionnelle).

***

### **Limitations et considérations**

#### **Absence de persistance**

`InMemoryAdapter` est **volatile** : les données disparaissent dès l’arrêt du processus. Pour des systèmes nécessitant un historique persistant, un adaptateur basé sur un stockage externe (comme **Redis**, **SQLite**, ou **Meilisearch**) est recommandé.

#### **Consommation mémoire**

Le stockage en **RAM** signifie que la quantité de mémoire disponible limite la capacité de stockage. **Une accumulation non contrôlée peut entraîner des fuites mémoire et un crash de l’application**.

#### **Performances sur de gros volumes**

Les accès directs via `roomId` sont rapides, mais la **recherche textuelle est inefficace** sur de grands ensembles de données, car elle repose sur une **parcours linéaire**.

***

### **Cas d’usage**&#x20;

`InMemoryAdapter` est une solution pertinente pour :

* **Stockage temporaire d’interactions utilisateur** dans des agents conversationnels.
* **Tests et prototypage rapide** sans configurer de base de données.
* **Cache léger** pour éviter des appels répétés à des services externes.

Pour une application en production ou nécessitant des recherches complexes, une alternative **persistance** est nécessaire.&#x20;
