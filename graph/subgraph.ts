import { GraphFlow } from "./index";
import { GraphContext } from "../types";
import { nodeRegistry } from "./registry";

/**
 * Support de sous-graphes (pattern LangGraph)
 * Une branche parallèle peut être un graphe complet
 */
export class SubgraphManager {
  private subgraphs = new Map<string, GraphFlow<any>>();

  /**
   * Enregistrer un sous-graphe
   */
  register(name: string, graph: GraphFlow<any>): void {
    this.subgraphs.set(name, graph);
    // Aussi enregistrer dans le registry global
    nodeRegistry.registerSubgraph(name, graph);
  }

  /**
   * Vérifier si un nom correspond à un sous-graphe
   */
  has(name: string): boolean {
    return this.subgraphs.has(name);
  }

  /**
   * Exécuter un sous-graphe avec un contexte cloné
   */
  async executeSubgraph(
    name: string,
    context: GraphContext<any>
  ): Promise<GraphContext<any>> {
    const graph = this.subgraphs.get(name);
    if (!graph) {
      throw new Error(`Sous-graphe "${name}" non trouvé`);
    }

    // Exécuter le sous-graphe avec le contexte cloné
    const subgraphContext = structuredClone(context);
    await graph.execute(undefined as any, subgraphContext);
    
    return subgraphContext;
  }

  /**
   * Exécuter plusieurs sous-graphes en parallèle (Fork-Join)
   */
  async executeParallel(
    names: string[],
    context: GraphContext<any>
  ): Promise<Array<{ name: string; context: GraphContext<any> }>> {
    const results = await Promise.all(
      names.map(async (name) => {
        const subgraphContext = await this.executeSubgraph(name, context);
        return { name, context: subgraphContext };
      })
    );

    return results;
  }

  /**
   * Supprimer un sous-graphe
   */
  unregister(name: string): boolean {
    return this.subgraphs.delete(name);
  }

  /**
   * Lister tous les sous-graphes enregistrés
   */
  list(): string[] {
    return Array.from(this.subgraphs.keys());
  }

  /**
   * Vider tous les sous-graphes
   */
  clear(): void {
    this.subgraphs.clear();
  }
}

// Export singleton
export const subgraphManager = new SubgraphManager();
