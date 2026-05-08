import { StateReducer } from "./types.parallel";

/**
 * Implémentation des State Reducers (pattern LangGraph)
 * Gère le merge des contextes après exécution parallèle
 */

// Fonction de deep merge simple (sans dépendance externe)
export function deepMerge<T extends Record<string, any>>(...objects: T[]): T {
  const result: any = {};

  for (const obj of objects) {
    if (obj === null || obj === undefined) continue;
    
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        // Objet : merge récursif
        result[key] = deepMerge(result[key] || {}, val);
      } else if (Array.isArray(val) && Array.isArray(result[key])) {
        // Array : concaténation
        result[key] = [...result[key], ...val];
      } else {
        // Primitive ou nouvel objet : remplacement
        result[key] = val;
      }
    }
  }

  return result as T;
}

export type ReducerFunction<T = any> = (acc: T, value: T) => T;

export const Reducers = {
  // Concatène les arrays
  append: <T>(acc: T[], value: T[]): T[] => [...acc, ...value],
  
  // Merge profond
  deepMerge: <T>(acc: T, value: T): T => deepMerge(acc as any, value as any) as T,
  
  // Dernière valeur gagne
  lastWins: <T>(_acc: T, value: T): T => value,
  
  // Somme (pour nombres)
  sum: (acc: number, value: number): number => acc + value,
  
  // Pour les branches isolées (ctx.branch_0, ctx.branch_1, ...)
  isolated: (acc: Record<string, any>, value: any, branchId: string): Record<string, any> => {
    acc[`branch_${branchId}`] = value;
    return acc;
  },
};

export function applyReducers(
  context: any,
  branchResults: Array<{ context: any; branchId: string }>,
  reducers: StateReducer[] = []
): any {
  if (reducers.length === 0) {
    // Deep merge par défaut
    return deepMerge(context, ...branchResults.map(br => br.context));
  }

  const result = { ...context };  
  for (const reducer of reducers) {
    const values = branchResults.map(br => br.context[reducer.key]);
    result[reducer.key] = values.reduce(reducer.reducer, reducer.initial);
  }
  
  return result;
}
