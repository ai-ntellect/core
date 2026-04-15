---
description: >-
  L’adaptateur Redis utilise une base de données clé-valeur en mémoire, idéale
  pour des stockages rapides et temporaires.
---

# RedisAdapter

`RedisAdapter` intègre **Redis** comme moteur de stockage pour la mémoire des systèmes.&#x20;

Redis permet un **accès instantané** aux données grâce à un modèle **clé-valeur**, tout en offrant des fonctionnalités avancées comme **la persistance**, **le TTL (Time-To-Live)** et **la réplication distribuée**.

Ce type d’adaptateur est particulièrement adapté aux agents qui nécessitent **des accès ultra-rapides** et une **gestion fine du cycle de vie des mémoires**.

***

### **Spécificités techniques du RedisAdapter**

#### **Stockage sous forme de clés structurées**

Chaque mémoire est stockée dans Redis avec une clé formée comme suit :

```plaintext
<memory_prefix>:<room_id>:<memory_id>
```

Cela permet de **segmenter les mémoires** par `roomId` et d’éviter les collisions.

Exemple de stockage d’une mémoire :

```typescript
const key = `${this.cachePrefix}${memory.roomId}:${memory.id}`;
await this.redis.set(key, JSON.stringify(memory), { EX: this.cacheTTL });
```

L’option `{ EX: this.cacheTTL }` définit **une expiration automatique** après un temps défini, évitant ainsi l’accumulation de données obsolètes.

***

#### **Initialisation et connexion au serveur Redis**

L’adaptateur doit établir une connexion avec un serveur Redis, qui peut être **local, distant ou géré via un service cloud**.

```typescript
constructor(
  private readonly redisUrl: string,
  options: { cachePrefix?: string; cacheTTL?: number }
) {
  this.cachePrefix = options.cachePrefix || "memory:";
  this.cacheTTL = options.cacheTTL || 3600;
  this.redis = createClient({ url: redisUrl });
}
```

* `cachePrefix` permet de **différencier plusieurs types de données** stockées dans Redis.
* `cacheTTL` définit **le temps de rétention** des mémoires (en secondes).

**Avantage :** Un système utilisant Redis peut fonctionner sans base de données persistante, en exploitant uniquement la mémoire vive du serveur.

***

#### **Création et récupération des mémoires**

**Stockage d’une nouvelle mémoire**

Chaque entrée est **convertie en JSON** et stockée sous une clé unique dans Redis.

```typescript
async createMemory(input: CreateMemoryInput & { embedding?: number[] }): Promise<BaseMemoryType | undefined> {
  const memory: BaseMemoryType = {
    id: input.id || crypto.randomUUID(),
    data: input.data,
    embedding: input.embedding,
    roomId: input.roomId,
    createdAt: new Date(),
  };

  const key = `${this.cachePrefix}${memory.roomId}:${memory.id}`;
  await this.redis.set(key, JSON.stringify(memory), { EX: this.cacheTTL });

  return memory;
}
```

💡 **Optimisation :** Redis étant une base en RAM, **éviter de stocker des objets volumineux** pour limiter l’impact sur la mémoire.

***

**Récupération d’une mémoire**

Les entrées sont récupérées en **temps constant** grâce à l’accès clé-valeur.

```typescript
async getMemoryById(id: string, roomId: string): Promise<BaseMemoryType | null> {
  const key = `${this.cachePrefix}${roomId}:${id}`;
  const data = await this.redis.get(key);
  return data ? JSON.parse(data) : null;
}
```

**Temps d’accès :** \~ **1 ms**, bien plus rapide qu’une base de données traditionnelle.

***

#### **Recherche et indexation dans Redis**

Redis ne supporte pas nativement **les recherches full-text**, mais il est possible de **simuler une indexation** en utilisant **les clés et SCAN MATCH**.

```typescript
async getMemoryByIndex(query: string, options: { roomId: string; limit?: number }): Promise<BaseMemoryType[]> {
  const pattern = `${this.cachePrefix}${options.roomId}:*`;
  const keys = await this.redis.keys(pattern);

  const memories = await Promise.all(
    keys.map(async (key) => {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    })
  );

  return memories.filter(Boolean).slice(0, options.limit || 10);
}
```

**Limite :** Redis ne propose pas de scoring de pertinence comme Meilisearch. Les recherches sont basées sur **des correspondances exactes** ou **un filtrage par clé**.

***

#### **Suppression et nettoyage de la mémoire**

Redis permet une suppression instantanée d’une mémoire spécifique ou d’un ensemble de mémoires.

**Suppression d’une mémoire individuelle**

```typescript
async clearMemoryById(id: string, roomId: string): Promise<void> {
  const key = `${this.cachePrefix}${roomId}:${id}`;
  await this.redis.del(key);
}
```

**Suppression de toutes les mémoires d’un agent**

```typescript
async clearAllMemories(): Promise<void> {
  const keys = await this.redis.keys(`${this.cachePrefix}*`);
  if (keys.length > 0) {
    await this.redis.del(keys);
  }
}
```

**Attention :** Cette opération peut être coûteuse si le volume de données est important.

***

### **Limitations et considérations**

#### **Dépendance à un service en mémoire volatile**

Redis fonctionne en **RAM**, ce qui signifie que **sans mécanisme de persistance activé**, les mémoires stockées peuvent être **perdues en cas de redémarrage**. Par défaut, Redis offre **deux modes de persistance** :

* **RDB (Redis Database Snapshot)** : Sauvegarde périodique en dur.
* **AOF (Append-Only File)** : Journalisation des opérations pour rejouer l’état en cas de crash.\
  Si la mémoire de l’agent doit être **persistante sur le long terme**, il est recommandé d’associer Redis avec **une base durable** comme PostgreSQL ou Meilisearch.

#### **Latence ultra-faible mais dépendance au réseau**

Redis est **extrêmement rapide** (accès en **O(1)**), mais cette rapidité dépend de **l’emplacement du serveur**.

* Un **Redis local** offre **des performances optimales**.
* Un **Redis distant** introduit une **latence liée au réseau**.\
  Si l’agent est déployé dans un environnement distribué, il est préférable d’**héberger Redis proche de l’instance exécutant l’agent**.

#### **Consommation mémoire et TTL obligatoire**

Redis stocke **tout en RAM**, ce qui peut poser un problème si un système génère un **grand volume de données**.

⚠ **Sans expiration (TTL), les mémoires s’accumulent et saturent Redis**.

Il est **recommandé de fixer une politique d’expiration** (exemple : **stockage des mémoires pour X heures**).

Exemple de gestion du TTL :

```typescript
await this.redis.set(key, JSON.stringify(memory), { EX: 3600 }); // Expire après 1h
```

Si l’agent doit **conserver son historique sur le long terme**, une solution **persistante (Meilisearch, SQL, stockage objet)** est plus adaptée.

#### **Absence de moteur de recherche avancé**

Redis **ne supporte pas nativement les recherches full-text ou vectorielles**.

* Pour **des recherches sémantiques**, il est préférable d’utiliser **Meilisearch**.
* Pour **des recherches par similarité**, Redis **peut stocker des embeddings**, mais un moteur spécialisé comme **FAISS ou Weaviate** est plus efficace.

#### **Non adapté aux grosses bases historiques**

Si le système doit **retrouver des informations sur plusieurs mois/années**, Redis n’est pas une solution idéale.\
**Recommandation** : Utiliser Redis pour **le stockage temporaire** et exporter les anciennes données vers une **base durable** (Meilisearch/PostgreSQL).

***

### **Cas d’usage adaptés**

**`RedisAdapter`** est particulièrement utile pour :&#x20;

* **Le caching des réponses d’un agent** pour réduire les appels aux LLMs.
* **Les sessions temporaires**, où l’état mémoire doit expirer après une période définie.
* **Les interactions en temps réel**, nécessitant des accès ultra-rapides.
* **Le stockage intermédiaire** avant synchronisation avec une base plus durable.
