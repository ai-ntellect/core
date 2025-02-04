import { MeilisearchAdapter } from "../memory/adapters/meilisearch";
import { AIEmbeddingService } from "../services/embedding";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const experimentalGraphRag = async (context: {
  prompt: string;
  results: any;
}) => {
  if (!process.env.MEILISEARCH_API_KEY)
    throw new Error("MEILISEARCH_API_KEY is not set");
  if (!process.env.MEILISEARCH_HOST)
    throw new Error("MEILISEARCH_HOST is not set");

  const memoryManager = new MeilisearchAdapter({
    apiKey: process.env.MEILISEARCH_API_KEY,
    host: process.env.MEILISEARCH_HOST,
  });
  await memoryManager.init("nodes");
  await memoryManager.init("edges");
  const { existingNodes } = await retrieveExistingRelations(
    memoryManager,
    "nodes"
  );
  const prompt = `
      User asked: ${context.prompt}
      Results: ${JSON.stringify(context.results, null, 2)}
      Existing nodes: ${JSON.stringify(existingNodes, null, 2)}
      `;
  console.log("🔍 Prompt:", prompt);
  const llmMemory = await generateObject({
    model: openai("gpt-4o"),
    prompt,
    schema: z.object({
      nodes: z.array(
        z.object({
          name: z.string(), // Nom de l'entité (ex: Adresse, ETH, Transaction ID)
          metadata: z.record(z.string(), z.any()), // Métadonnées associées
        })
      ),
      edges: z.array(
        z.object({
          source: z.string(), // ID de l'entité source
          target: z.string(), // ID de l'entité cible
          relation: z.string(), // Type de relation (ex: "sent", "received", "on_chain")
        })
      ),
    }),
    system: `
       You are an **AI memory manager** for a crypto wallet assistant.
  
  ## Rules:
  - Nodes are entities like user, networks, tokens...etc
  - Relations are edges like sent, uses, supported_on, loves, has_website...etc
  - Ensure NO DUPLICATE RELATIONS.
  - Standardize all relations using Cypher language.

  Return the structured memory in JSON format, ensuring it follows the schema.

        Generate structured graph data accordingly.

        Format the output as a JSON object :
        {
          nodes: [
            {
              name: string,
              metadata: Record<string, any>,
            },
          ],
          edges: [
            {
              source: string,
              target: string,
              relation: string,
            },
          ],
        }
        `,
  });

  console.log("🔍 LLM memory (graph-based):");
  console.log("Nodes:");
  console.dir(llmMemory.object.nodes, { depth: null, colors: true });
  console.log("Edges:");
  console.dir(llmMemory.object.edges, { depth: null, colors: true });

  const embeddingManager = new AIEmbeddingService(
    openai.embedding("text-embedding-3-small")
  );
  const embedding = await embeddingManager.embedText(context.prompt);
  let nodesNameToId: Record<string, string> = {};
  for (const node of llmMemory.object.nodes) {
    // Search for existing memory with same data and query
    const searchResults = await memoryManager.search(node.name, "nodes", {
      limit: 1,
    });
    const existingMemory = searchResults.find(
      (result) =>
        result.document.data.name === node.name &&
        result.document.roomId === "nodes"
    );

    // If found, return existing memory
    if (existingMemory) {
      nodesNameToId[node.name] = existingMemory.document.id;
    } else {
      const nodesMemory = await memoryManager.createMemory({
        data: node,
        embedding,
        roomId: "nodes",
      });
      nodesNameToId[node.name] = nodesMemory?.id || "";
    }
  }
  for (const edge of llmMemory.object.edges) {
    // Verify if source and target already exist in memory
    const searchResults = await memoryManager.search(
      nodesNameToId[edge.source],
      "edges",
      {
        limit: 100,
      }
    );
    const existingEdge = searchResults.find(
      (result) =>
        result.document.data.source === nodesNameToId[edge.source] &&
        result.document.data.target === nodesNameToId[edge.target] &&
        result.document.data.relation === edge.relation
    );
    if (existingEdge) {
    } else {
      await memoryManager.createMemory({
        data: {
          source: nodesNameToId[edge.source],
          target: nodesNameToId[edge.target],
          relation: edge.relation,
        },
        embedding,
        roomId: "edges",
      });
    }
  }
};

async function retrieveExistingRelations(
  memoryManager: MeilisearchAdapter,
  roomId: string
) {
  const existingNodesMemories = await memoryManager.getAllMemories("nodes");
  const existingEdgesMemories = await memoryManager.getAllMemories("edges");
  let existingNodes: any[] = [];
  let existingEdges: any[] = [];

  if (existingNodesMemories.length > 0) {
    existingNodes = existingNodesMemories.flatMap((memory) => {
      return {
        id: memory.id,
        data: memory.data,
      };
    });
  }
  if (existingEdgesMemories.length > 0) {
    existingEdges = existingEdgesMemories.flatMap(
      (memory) => memory.data || []
    );
  }

  return { existingNodes, existingEdges };
}
