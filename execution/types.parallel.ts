import { ZodSchema } from "zod";
import { GraphContext, GraphNodeConfig } from "../types";

// ====== FORK-JOIN MODEL ======

export type ParallelConfig = {
  /** Active le parallélisme Fork-Join */
  enabled: boolean;
  /** Point de convergence (node qui attend toutes les branches) */
  joinNode?: string;
  /** Stratégie de merge (utilise les reducers si non spécifié) */
  mergeStrategy?: "reducer" | "deep-merge" | "isolated";
  /** Timeout pour toutes les branches */
  timeout?: number;
};

// ====== SEND API (Fan-out dynamique) ======

export type Send = {
  /** Node cible (peut être un sous-graphe) */
  to: string;
  /** Contexte initial pour cette branche */
  input: any;
  /** ID unique de la branche (pour le suivi) */
  branchId?: string;
};

export type SendFunction = (context: GraphContext<any>) => Send[];

// ====== COMMAND PATTERN (Handoff) ======

export type Command = {
  /** Node cible pour le handoff */
  goto: string;
  /** Mise à jour de l'état avant le handoff */
  update?: Record<string, any>;
  /** Graph parent (pour handoff inter-graphes) */
  graph?: "PARENT" | string;
  /** Métadonnées (pour traçage) */
  metadata?: Record<string, any>;
};

// ====== STATE REDUCERS ======

export type ReducerFunction<T = any> = (acc: T, branchResult: T) => T;

export type StateReducer = {
  /** Clé du contexte */
  key: string;
  /** Fonction de réduction (ex: concat, merge, sum) */
  reducer: ReducerFunction;
  /** Valeur initiale */
  initial?: any;
};

// ====== WORKER CONFIG ======

export type WorkerConfig = {
  /** Utiliser un worker thread (pour CPU-bound uniquement) */
  useWorker: boolean;
  /** Worker script personnalisé */
  workerScript?: string;
  /** Timeout worker */
  timeout?: number;
};

// ====== TYPES ÉTENDUS ======

export interface ParallelNodeConfig<T extends ZodSchema, P = any>
  extends GraphNodeConfig<T, P> {
  /** Configuration parallèle */
  parallel?: ParallelConfig;
  /** Send API pour fan-out dynamique (retourne plusieurs Send) */
  send?: SendFunction;
  /** Worker pour CPU-bound */
  worker?: WorkerConfig;
  /** Reducers pour ce node */
  reducers?: StateReducer[];
  /** Handoff via retour Command */
  handoff?: boolean;
}
