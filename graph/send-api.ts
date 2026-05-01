import { GraphContext } from "../types";
import { Send } from "./types.parallel";

/**
 * Send API pour fan-out dynamique (pattern LangGraph)
 * Permet de créer N branches au runtime selon les données
 */
export class SendAPI {
  /**
   * Traite un tableau de Send et prépare l'exécution parallèle
   */
  static async processSends(
    sends: Send[],
    context: GraphContext<any>,
    executor: (nodeName: string, ctx: any) => Promise<void>
  ): Promise<Array<{ branchId: string; context: any }>> {
    const results = await Promise.all(
      sends.map(async (send) => {
        const branchContext = {
          ...structuredClone(context),
          ...send.input,
          _branchId: send.branchId || send.to,
        };
        
        await executor(send.to, branchContext);
        
        return {
          branchId: send.branchId || send.to,
          context: branchContext,
        };
      })
    );
    
    return results;
  }

  /**
   * Helper pour créer un Send vers un node
   */
  static to(nodeName: string, input: any, branchId?: string): Send {
    return { to: nodeName, input, branchId };
  }

  /**
   * Helper pour fan-out sur une liste (comme map())
   */
  static map<T>(
    nodeName: string,
    items: T[],
    mapFn?: (item: T, index: number) => any
  ): Send[] {
    return items.map((item, i) => ({
      to: nodeName,
      input: mapFn ? mapFn(item, i) : { item, index: i },
      branchId: `${nodeName}_${i}`,
    }));
  }
}
