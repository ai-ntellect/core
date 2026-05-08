import { Command } from "../execution/types.parallel";
import { GraphContext } from "../types";

/**
 * Crée un outil de handoff pour les agents (pattern Google ADK Command)
 * Permet à un agent de transférer le contrôle à un autre agent
 */
export function createHandoffTool(agentRegistry?: Map<string, any>) {
  return {
    name: "handoff",
    description: "Transfère le contrôle à un autre agent avec mise à jour d'état",
    
    execute: async (ctx: GraphContext<any>): Promise<Command | void> => {
      const { agentName, task, update } = ctx.handoffInput || {};
      
      if (!agentName) {
        console.warn("Handoff: agentName non spécifié");
        return;
      }
      
      // Vérifier si l'agent cible existe (si registry fourni)
      if (agentRegistry && !agentRegistry.has(agentName)) {
        throw new Error(`Agent "${agentName}" non trouvé dans le registry`);
      }
      
      // Créer le Command pour handoff
      const command: Command = {
        goto: agentName,
        update: update || { handoffTask: task },
        graph: "PARENT", // Handoff vers le graphe parent
        metadata: {
          sourceAgent: ctx._agentName || "unknown",
          handoffTime: Date.now(),
        },
      };
      
      return command;
    },
  };
}

/**
 * Traite le résultat d'un node pour détecter un Command (handoff)
 * À appeler après l'exécution d'un node qui peut retourner un Command
 */
export function handleCommandResult(
  result: any,
  context: GraphContext<any>
): Command | null {
  if (result && typeof result === "object" && result.goto) {
    const command: Command = result;
    
    // Mettre à jour le contexte avec les données du handoff
    if (command.update) {
      Object.assign(context, command.update);
    }
    
    // Marquer le handoff dans le contexte
    context._handoff = {
      goto: command.goto,
      graph: command.graph,
      metadata: command.metadata,
    };
    
    return command;
  }
  
  return null;
}

/**
 * Helper pour créer un Command de handoff (pour utilisation directe dans les nodes)
 */
export function createCommand(
  goto: string,
  update?: Record<string, any>,
  metadata?: Record<string, any>
): Command {
  return {
    goto,
    update,
    graph: "PARENT",
    metadata: {
      ...metadata,
      timestamp: Date.now(),
    },
  };
}
