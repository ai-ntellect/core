---
description: >-
  Un adaptateur d’Agenda est un composant permettant de gérer la persistance et
  la récupération des tâches planifiées selon le moteur de stockage sous-jacent.
---

# Les adaptateurs

### **Qu’est-ce qu’un adaptateur Agenda ?**

Un **adaptateur Agenda** est un composant permettant de gérer **la planification et la persistance des tâches planifiées** en fonction du moteur sous-jacent.

Il encapsule :

* **Le moteur d'exécution des tâches** (**ICronService**) : responsable du déclenchement effectif des tâches.
* **Le moteur de stockage des tâches** (**IMemoryAdapter**) : garantit la persistance et la récupération des tâches planifiées.

Grâce aux adaptateurs, **l’agent peut changer de moteur sans modifier sa logique métier**.

***

### **Fonctionnement des adaptateurs Agenda**

Tous les adaptateurs doivent implémenter **deux interfaces clés** :

#### **ICronService : Gestion de l'exécution des tâches**

```ts
/**
 * Interface pour le service de planification des tâches
 */
export interface ICronService {
  /**
   * Planifie une tâche en utilisant une expression cron.
   * @param {string} expression - Expression cron définissant l’exécution
   * @param {Function} callback - Fonction exécutée lors du déclenchement
   * @returns {ICronJob} Interface de gestion de la tâche
   */
  schedule(expression: string, callback: () => void): ICronJob;
}

/**
 * Interface pour contrôler une tâche planifiée
 */
export interface ICronJob {
  /**
   * Démarre la tâche planifiée
   */
  start(): void;

  /**
   * Arrête la tâche planifiée
   */
  stop(): void;
}
```

#### **IMemoryAdapter : Persistance des tâches planifiées**

```ts
/**
 * Interface pour la gestion de la persistance des tâches d'Agenda
 */
export interface IMemoryAdapter {
  init(roomId?: string): Promise<void>;

  saveJob(id: string, job: ICronJob): Promise<void>;
  saveRequest(id: string, request: ScheduledRequest): Promise<void>;

  getJob(id: string): Promise<ICronJob | undefined>;
  getRequest(id: string): Promise<ScheduledRequest | undefined>;

  deleteJob(id: string): Promise<void>;
  deleteRequest(id: string): Promise<void>;

  getAllRequests(): Promise<ScheduledRequest[]>;
  clear(): Promise<void>;
}
```

Ainsi, **les adaptateurs permettent d'intégrer plusieurs moteurs sans modifier l'agent.**

***

### **Adaptateurs intégrés (par défaut)**

Le framework propose plusieurs adaptateurs intégrés.

#### **1. NodeCronAdapter (exécution des tâches)**

* Basé sur la bibliothèque **node-cron**.
* Idéal pour **exécuter des tâches en local sans dépendance externe**.

```ts
import cron from "node-cron";
import { ICronJob, ICronService } from "../../../../interfaces";

/**
 * @module NodeCronAdapter
 * @description Adaptateur utilisant node-cron pour exécuter des tâches planifiées.
 */
export class NodeCronAdapter implements ICronService {
  schedule(expression: string, callback: () => void): ICronJob {
    const job = cron.schedule(expression, callback);

    return {
      start: () => job.start(),
      stop: () => job.stop(),
    };
  }
}
```

***

#### **2. InMemoryAdapter (stockage en mémoire)**

* Stocke les tâches planifiées **en RAM** via une `Map`.
* **Non persistant** : les tâches sont perdues après un redémarrage.
* Idéal pour **les tests et le prototypage**.

```ts
import { IMemoryAdapter } from "../../../../interfaces";
import { ScheduledRequest } from "../../../../types";

/**
 * @module InMemoryAdapter
 * @description Adaptateur mémoire stockant les tâches planifiées en RAM.
 */
export class InMemoryAdapter implements IMemoryAdapter {
  private storage: Map<string, ScheduledRequest> = new Map();

  async saveRequest(id: string, request: ScheduledRequest): Promise<void> {
    this.storage.set(id, request);
  }

  async getRequest(id: string): Promise<ScheduledRequest | undefined> {
    return this.storage.get(id);
  }

  async deleteRequest(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async getAllRequests(): Promise<ScheduledRequest[]> {
    return Array.from(this.storage.values());
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}
```

***

### **Créer un nouvel adaptateur : Exemple avec Redis**

Si on veut **persister les tâches avec Redis**, on peut créer un nouvel adaptateur.

#### **1. Installer la dépendance**

```sh
npm install ioredis
```

#### **2. Implémenter l’adaptateur**

```ts
import { IMemoryAdapter } from "../../../../interfaces";
import Redis from "ioredis";
import { ScheduledRequest } from "../../../../types";

/**
 * @module RedisAdapter
 * @description Adaptateur stockant les tâches planifiées dans Redis.
 */
export class RedisAdapter implements IMemoryAdapter {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async saveRequest(id: string, request: ScheduledRequest): Promise<void> {
    await this.redis.set(id, JSON.stringify(request));
  }

  async getRequest(id: string): Promise<ScheduledRequest | undefined> {
    const data = await this.redis.get(id);
    return data ? JSON.parse(data) : undefined;
  }

  async deleteRequest(id: string): Promise<void> {
    await this.redis.del(id);
  }

  async getAllRequests(): Promise<ScheduledRequest[]> {
    const keys = await this.redis.keys("*");
    const requests = await Promise.all(keys.map((key) => this.getRequest(key)));
    return requests.filter((req) => req !== undefined) as ScheduledRequest[];
  }

  async clear(): Promise<void> {
    await this.redis.flushall();
  }
}
```

***

### **Intégrer un adaptateur dans l’Agenda**

Une fois l’adaptateur Redis implémenté, on peut l’intégrer **dans le module Agenda**.

```ts
import { Agenda } from "../modules/agenda";
import { NodeCronAdapter } from "../modules/agenda/adapters/cron/node-cron";
import { RedisAdapter } from "../modules/memory/adapters/redis";

// Initialisation avec Redis et NodeCron
const cronService = new NodeCronAdapter();
const jobStorage = new RedisAdapter("redis://localhost:6379");
const agenda = new Agenda(cronService, jobStorage);

async function run() {
  await agenda.scheduleRequest({
    originalRequest: "Générer un rapport",
    cronExpression: "0 9 * * *",
  });

  const tasks = await agenda.getScheduledRequests();
  console.log("Tâches planifiées :", tasks);
}

run();
```
