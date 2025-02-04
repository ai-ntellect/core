"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { MeilisearchAdapter } from "../../memory/adapters/meilisearch";

// Interfaces restent les mêmes
export interface GraphNode {
  id: number;
  name?: string;
  neighbors: GraphNode[];
  links: GraphLink[];
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: number | GraphNode;
  target: number | GraphNode;
  relation?: string;
}
const SPACING_FORCE = -200; // Augmente la répulsion entre les nœuds

async function fetchGraphData() {
  const memoryManager = new MeilisearchAdapter({
    apiKey: process.env.NEXT_PUBLIC_MEILISEARCH_API_KEY,
    host: process.env.NEXT_PUBLIC_MEILISEARCH_HOST,
  });

  const existingNodesMemories = await memoryManager.getAllMemories("nodes");
  const existingEdgesMemories = await memoryManager.getAllMemories("edges");

  let nodes: GraphNode[] = existingNodesMemories.map((memory) => ({
    id: memory.id,
    name: memory.data.name,
    neighbors: [],
    links: [],
  }));

  let nodeMap: Record<string, GraphNode> = {};
  nodes.forEach((node, idx) => {
    nodeMap[existingNodesMemories[idx].id] = node;
  });

  let links: GraphLink[] = existingEdgesMemories
    .map((memory) => {
      const sourceNode = nodeMap[memory.data.source];
      const targetNode = nodeMap[memory.data.target];

      if (!sourceNode || !targetNode) {
        console.warn(
          `⚠️ Relation ignorée : ${memory.data.source} → ${memory.data.relation} → ${memory.data.target}`
        );
        return null;
      }

      return {
        source: sourceNode,
        target: targetNode,
        relation: memory.data.relation,
      };
    })
    .filter((link) => link !== null) as GraphLink[];

  return { nodes, links };
}

const NODE_R = 12;

const HighlightGraph = () => {
  const fgRef = useRef<any>(null);
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [highlightNodes, setHighlightNodes] = useState(new Set<GraphNode>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<GraphLink>());
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const graphData = await fetchGraphData();
        setData(graphData);
      } catch (error) {
        console.error("❌ Erreur lors de la récupération du graphe :", error);
      }
    };

    loadGraphData();
  }, []);

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      fgRef.current.d3Force("charge")?.strength(-200);
      fgRef.current.d3Force("link")?.distance(200);
    }
  }, [data]);

  useMemo(() => {
    data.links.forEach((link) => {
      const a =
        typeof link.source === "object"
          ? link.source
          : data.nodes.find((node) => node.id === link.source);
      const b =
        typeof link.target === "object"
          ? link.target
          : data.nodes.find((node) => node.id === link.target);

      if (!a || !b) return;

      if (!a.neighbors.includes(b)) a.neighbors.push(b);
      if (!b.neighbors.includes(a)) b.neighbors.push(a);
      if (!a.links.includes(link)) a.links.push(link);
      if (!b.links.includes(link)) b.links.push(link);
    });
  }, [data]);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    // Mise à jour des nœuds et liens en surbrillance
    const newHighlightNodes = new Set<GraphNode>([node, ...node.neighbors]);
    const newHighlightLinks = new Set<GraphLink>(node.links);

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
    setSelectedNode(node);

    if (node.x !== undefined && node.y !== undefined && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
    }
  }, []);

  const getNodeColor = useCallback(
    (node: GraphNode) => {
      if (selectedNode?.id === node.id) {
        return "#3b82f6"; // Bleu vif pour le nœud sélectionné
      }
      if (highlightNodes.has(node)) {
        return "#60a5fa"; // Bleu clair pour les voisins
      }
      return selectedNode ? "#1e3a8a" : "#1d4ed8"; // Assombri si non connecté, normal sinon
    },
    [selectedNode, highlightNodes]
  );

  const paintRing = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Effet de lueur pour les nœuds en surbrillance
      if (highlightNodes.has(node)) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_R + 4, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(147, 197, 253, 0.3)"; // Lueur bleue
        ctx.fill();
      }

      // Nœud principal
      ctx.beginPath();
      ctx.arc(x, y, NODE_R, 0, 2 * Math.PI);
      ctx.fillStyle = getNodeColor(node);
      ctx.fill();

      // Bordure
      ctx.strokeStyle = highlightNodes.has(node) ? "#ffffff" : "#94a3b8";
      ctx.lineWidth = highlightNodes.has(node) ? 2.5 : 2.5;
      ctx.stroke();

      // Label
      const label = node.name ?? `Node ${node.id}`;
      ctx.font = "14px Inter, system-ui, sans-serif";
      const textWidth = ctx.measureText(label).width;

      // Fond du label
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x - textWidth / 2 - 6, y - NODE_R - 24, textWidth + 12, 22);
      ctx.globalAlpha = 1;

      // Texte
      ctx.textAlign = "center";
      ctx.fillStyle = "white";
      ctx.fillText(label, x, y - NODE_R - 8);
    },
    [hoverNode, selectedNode, highlightNodes, getNodeColor]
  );

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  return (
    <div className="drawer">
      <input
        id="my-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={selectedNode !== null}
        onChange={(e) => !e.target.checked && clearSelection()}
      />
      <div
        className="drawer-content"
        style={{ height: "100vh", background: "#0f172a" }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          nodeRelSize={NODE_R}
          autoPauseRedraw={false}
          linkWidth={(link) => (highlightLinks.has(link as GraphLink) ? 5 : 2)}
          linkColor={(link) =>
            highlightLinks.has(link as GraphLink) ? "#60a5fa" : "#64748b"
          }
          linkDirectionalParticles={4}
          linkDirectionalParticleWidth={(link) =>
            highlightLinks.has(link as GraphLink) ? 6 : 2
          }
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleColor={(link) =>
            highlightLinks.has(link as GraphLink) ? "#93c5fd" : "#94a3b8"
          }
          nodeCanvasObjectMode={() => "before"}
          nodeCanvasObject={paintRing}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          linkLabel={(link: GraphLink) => link.relation ?? ""}
          backgroundColor="#0f172a"
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(
            link: GraphLink,
            ctx: CanvasRenderingContext2D
          ) => {
            const start = link.source as GraphNode;
            const end = link.target as GraphNode;
            const textPos = {
              x: start.x! + (end.x! - start.x!) * 0.5,
              y: start.y! + (end.y! - start.y!) * 0.5,
            };

            if (!textPos.x || !textPos.y) return;

            // Fond du label
            const label = link.relation || "";
            ctx.font = "12px Inter";
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = "#000000";
            ctx.globalAlpha = 0.8;
            ctx.fillRect(
              textPos.x - textWidth / 2 - 4,
              textPos.y - 8,
              textWidth + 8,
              16
            );
            ctx.globalAlpha = 1;

            // Texte de la relation
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = highlightLinks.has(link) ? "#93c5fd" : "#ffffff";
            ctx.fillText(label, textPos.x, textPos.y);
          }}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.2}
        />
      </div>
      <div className="drawer-side">
        <label htmlFor="my-drawer" className="drawer-overlay"></label>
        <div className="bg-slate-900 text-white min-h-full w-80 p-6 shadow-xl">
          {selectedNode ? (
            <div className="space-y-6">
              <h3 className="text-xl font-bold border-b border-slate-700 pb-2">
                {selectedNode.name || `Node ${selectedNode.id}`}
              </h3>
              <div>
                <h4 className="text-lg font-semibold mb-3">Connexions</h4>
                <ul className="space-y-2">
                  {selectedNode.neighbors.map((neighbor) => (
                    <li
                      key={neighbor.id}
                      className="pl-2 border-l-2 border-blue-500"
                    >
                      <button
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={() => handleNodeClick(neighbor)}
                      >
                        {neighbor.name || `Node ${neighbor.id}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                className="w-full px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                onClick={clearSelection}
              >
                Fermer
              </button>
            </div>
          ) : (
            <p className="text-slate-400">
              Sélectionnez un nœud pour voir ses détails
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  return <HighlightGraph />;
}
