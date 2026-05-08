import { ZodSchema } from "zod";
import { GraphNodeConfig } from "../types";

interface NodeVisualData {
  id: string;
  label: string;
  type?: string;
  events?: string[];
  contextChanges?: string[];
}

interface EdgeVisualData {
  from: string;
  to: string;
  condition?: string;
}

interface NextNode {
  node: string;
  condition: (context: any) => boolean;
}

export class GraphVisualizer<T extends ZodSchema> {
  private nodes: NodeVisualData[] = [];
  private edges: EdgeVisualData[] = [];

  constructor(private graphNodes: Map<string, GraphNodeConfig<T, any>>) {
    this.processNodes();
  }

  private humanizeCondition(condition: string): string {
    return (
      condition
        // Remplacer les opérateurs logiques
        .replace(/\|\|/g, "or")
        .replace(/&&/g, "and")
        .replace(/!/g, "not")
        // Remplacer les opérateurs de comparaison
        .replace(/>=/g, "is greater or equal to")
        .replace(/<=/g, "is less or equal to ")
        .replace(/>/g, "is greater than")
        .replace(/</g, "is less than")
        .replace(/===/g, "equals")
        .replace(/==/g, "equals")
        .replace(/!==?/g, "is not")
        // Nettoyer la syntaxe
        .replace(/ctx\./g, "")
        .replace(/context\./g, "")
        .replace(/[{}]/g, "")
        .trim()
    );
  }

  private processNodes(): void {
    this.graphNodes.forEach((node, nodeName) => {
      // Extraire les modifications de contexte depuis la fonction execute
      const contextChanges: string[] = [];
      const executeStr = node.execute.toString();
      const contextAssignments = executeStr.match(/context\.\w+\s*=/g) || [];
      contextAssignments.forEach((assignment) => {
        const variable = assignment
          .replace("context.", "")
          .replace("=", "")
          .trim();
        contextChanges.push(variable);
      });

      this.nodes.push({
        id: nodeName,
        label: nodeName,
        events: node.events,
        contextChanges,
      });

      if (node.next) {
        if (Array.isArray(node.next)) {
          node.next.forEach((nextNode: string | NextNode) => {
            if (typeof nextNode === "string") {
              this.edges.push({ from: nodeName, to: nextNode });
            } else {
              const conditionStr = nextNode.condition
                .toString()
                .replace(/.*=> /, "");

              this.edges.push({
                from: nodeName,
                to: nextNode.node,
                condition: this.humanizeCondition(conditionStr),
              });
            }
          });
        } else if (typeof node.next === "string") {
          this.edges.push({ from: nodeName, to: node.next });
        } else if (typeof node.next === "function") {
          // Gérer le cas où next est une fonction
          const nextStr = node.next.toString();
          if (nextStr.includes("=>")) {
            const conditionPart = nextStr.split("=>")[1].trim();
            this.edges.push({
              from: nodeName,
              to: "nextNode", // Il faudrait extraire le vrai nom du nœud suivant
              condition: this.humanizeCondition(conditionPart),
            });
          }
        }
      }
    });
  }

  /**
   * Generates a Mermaid flowchart representation of the graph
   */
  public toMermaid(): string {
    let mmd = "flowchart TD\n";

    // Ajouter les nœuds avec leurs modifications de contexte
    this.nodes.forEach((node) => {
      let nodeLabel = node.label;

      // Améliorer l'affichage des modifications de contexte
      if (node.contextChanges?.length) {
        nodeLabel += `\nUpdates:`;
        node.contextChanges.forEach((change) => {
          nodeLabel += `\n• ${change}`;
        });
      }

      // Améliorer l'affichage des événements
      if (node.events?.length) {
        node.events.forEach((event) => {
          mmd += `    ${event}((${event}))\n`;
          mmd += `    ${node.id} -.->|listens to| ${event}\n`;
        });
      }

      mmd += `    ${node.id}["${nodeLabel}"]\n`;
    });

    // Ajouter les connexions avec les conditions humanisées
    this.edges.forEach((edge) => {
      const escapedCondition = edge.condition?.replace(/[|]/g, "\\|");
      const arrow = escapedCondition ? `-->|${escapedCondition}|` : "-->";
      mmd += `    ${edge.from} ${arrow} ${edge.to}\n`;
    });

    return mmd;
  }

  /**
   * Returns the nodes and edges data
   */
  public getVisualizationData() {
    return {
      nodes: this.nodes,
      edges: this.edges,
    };
  }
}
