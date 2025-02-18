import { z, ZodSchema } from "zod";
import { GraphNodeConfig } from "../types";
import { GraphFlow } from "./index";

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
                .replace(/.*=> /, "")
                .replace(/ctx\./g, "")
                .replace(/[{}]/g, "")
                .replace(/\|\|/g, " or ")
                .replace(/&&/g, " and ")
                .replace(/!/g, "not ");

              this.edges.push({
                from: nodeName,
                to: nextNode.node,
                condition: conditionStr,
              });
            }
          });
        } else if (typeof node.next === "string") {
          this.edges.push({ from: nodeName, to: node.next });
        }
      }
    });
  }

  /**
   * Generates a Mermaid flowchart representation of the graph
   */
  public toMermaid(): string {
    let mmd = "flowchart TD\n";

    // Add nodes with context changes
    this.nodes.forEach((node) => {
      let nodeLabel = node.label;
      if (node.contextChanges?.length) {
        nodeLabel += `\nSet: ${node.contextChanges.join(", ")}`;
      }
      if (node.events?.length) {
        // Créer des nœuds d'événements externes
        node.events.forEach((event) => {
          mmd += `    ${event}((${event}))\n`;
          mmd += `    ${event} -.->|event| ${node.id}\n`;
        });
      }
      mmd += `    ${node.id}["${nodeLabel}"]\n`;
    });

    // Add edges with escaped conditions
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

// Example usage
const graph = new GraphFlow("CryptoTradeAssistant", {
  name: "CryptoTradeAssistant",
  entryNode: "Initialize",
  nodes: [
    {
      name: "Initialize",
      execute: async (context) => {
        context.walletBalance = 1000;
        context.targetPrice = 2000;
        context.gasFees = 50;
        context.isWalletConnected = false;
        console.log("Initializing crypto assistant");
      },
      next: ["ConnectWallet"],
    },
    {
      name: "ConnectWallet",
      execute: async (context) => {
        context.isWalletConnected = true;
        console.log("Connecting wallet");
      },
      next: ["CheckMarketConditions"],
      events: ["walletConnected"],
    },
    {
      name: "CheckMarketConditions",
      execute: async (context) => {
        context.currentPrice = 1950;
        context.marketVolatility = "low";
        context.hasLiquidity = true;
        console.log("Checking market conditions");
      },
      next: [
        {
          node: "PrepareTransaction",
          condition: (ctx) =>
            ctx.isWalletConnected &&
            ctx.currentPrice < ctx.targetPrice &&
            ctx.hasLiquidity,
        },
        {
          node: "WaitForBetterConditions",
          condition: (ctx) =>
            !ctx.hasLiquidity || ctx.currentPrice >= ctx.targetPrice,
        },
      ],
      events: ["priceUpdate", "liquidityUpdate"],
    },
    {
      name: "WaitForBetterConditions",
      execute: async () => console.log("Waiting for better conditions"),
      next: ["CheckMarketConditions"],
      events: ["marketUpdate"],
    },
    {
      name: "PrepareTransaction",
      execute: async (context) => {
        context.txHash = "0x123...";
        context.estimatedGas = 45;
        console.log("Preparing transaction");
      },
      next: [
        {
          node: "ExecuteTransaction",
          condition: (ctx) => ctx.estimatedGas < ctx.gasFees,
        },
        {
          node: "WaitForBetterConditions",
          condition: (ctx) => ctx.estimatedGas >= ctx.gasFees,
        },
      ],
    },
    {
      name: "ExecuteTransaction",
      execute: async (context) => {
        context.txStatus = "pending";
        console.log("Executing transaction");
      },
      next: ["MonitorTransaction"],
      events: ["txSubmitted"],
    },
    {
      name: "MonitorTransaction",
      execute: async (context) => {
        context.txStatus = "confirmed";
        context.walletBalance = context.walletBalance - context.currentPrice;
        console.log("Monitoring transaction");
      },
      next: ["NotifyUser"],
      events: ["txConfirmed", "txFailed"],
    },
    {
      name: "NotifyUser",
      execute: async (context) => {
        context.notificationSent = true;
        console.log("Notifying user");
      },
      next: ["CheckMarketConditions"],
    },
  ],
  context: {},
  schema: z.object({
    walletBalance: z.number().optional(),
    targetPrice: z.number().optional(),
    currentPrice: z.number().optional(),
    gasFees: z.number().optional(),
    estimatedGas: z.number().optional(),
    isWalletConnected: z.boolean().optional(),
    marketVolatility: z.string().optional(),
    hasLiquidity: z.boolean().optional(),
    txHash: z.string().optional(),
    txStatus: z.string().optional(),
    notificationSent: z.boolean().optional(),
  }),
});

const visualizer = graph.createVisualizer();
console.log(visualizer.toMermaid());
