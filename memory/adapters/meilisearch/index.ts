import {
  BaseMemoryType,
  CreateMemoryInput,
  MeilisearchConfig,
} from "../../../types";

export class MeilisearchAdapter {
  constructor(private readonly config: MeilisearchConfig) {}

  private async makeRequest(path: string, options?: RequestInit) {
    try {
      const url = `${this.config.host}${path}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${errorBody || response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          `Network error: Unable to connect to Meilisearch at ${this.config.host}`
        );
      }
      throw error;
    }
  }

  async initializeStorage(roomId: string): Promise<void> {
    try {
      let indexExists = false;

      try {
        await this.makeRequest(`/indexes/${roomId}`);
        indexExists = true;
      } catch (error) {
        if (!indexExists) {
          const createResponse = await this.makeRequest("/indexes", {
            method: "POST",
            body: JSON.stringify({
              uid: roomId,
              primaryKey: "id",
            }),
          });

          console.log("✅ Index creation response:", createResponse);
        }
      }

      // Appliquer les settings seulement si l'index existe bien
      await this.makeRequest(`/indexes/${roomId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          searchableAttributes: this.config.searchableAttributes || [
            "data",
            "query",
          ],
          sortableAttributes: this.config.sortableAttributes || ["createdAt"],
        }),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `❌ Error initializing storage for index ${roomId}:`,
        errorMessage
      );
      throw new Error(
        `Failed to initialize storage for index ${roomId}: ${errorMessage}`
      );
    }
  }

  async addDocuments(
    documents: BaseMemoryType[],
    roomId: string
  ): Promise<void> {
    await this.makeRequest(`/indexes/${roomId}/documents`, {
      method: "POST",
      body: JSON.stringify(documents),
    });
  }
  async deleteStorage(roomId: string): Promise<void> {
    await this.makeRequest(`/indexes/${roomId}`, {
      method: "DELETE",
    });
  }

  // Required BaseMemory implementations
  async init(roomId: string): Promise<void> {
    try {
      // Initialize the default "memories" index
      await this.initializeStorage(roomId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to initialize default index:", errorMessage);
      throw new Error(`Failed to initialize default index: ${errorMessage}`);
    }
  }

  async search(
    query: string,
    roomId: string,
    options?: { limit?: number; threshold?: number }
  ): Promise<SearchResult[]> {
    const searchResults = await this.makeRequest(`/indexes/${roomId}/search`, {
      method: "POST",
      body: JSON.stringify({
        q: query,
        limit: options?.limit || 10,
      }),
    });

    return searchResults.hits.map((hit: any) => ({
      document: {
        id: hit.id,
        data: hit.data,
        embedding: hit.embedding,
        roomId: hit.roomId,
        createdAt: hit.createdAt,
      },
      score: hit._score || 0,
    }));
  }

  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    // Initialize storage for this roomId if needed
    await this.initializeStorage(input.roomId);

    // If not found, create new memory
    const memory: BaseMemoryType = {
      id: input.id || crypto.randomUUID(),
      data: input.data,
      embedding: input.embedding || null,
      roomId: input.roomId,
      createdAt: new Date(),
    };

    await this.addDocuments([memory], input.roomId);
    return memory;
  }

  async getMemoryById(
    id: string,
    roomId: string
  ): Promise<BaseMemoryType | null> {
    try {
      const result = await this.makeRequest(
        `/indexes/${roomId}/documents/${id}`
      );
      return result
        ? {
            id: result.id,
            data: result.data,
            embedding: result.embedding,
            roomId: result.roomId,
            createdAt: result.createdAt,
          }
        : null;
    } catch {
      return null;
    }
  }

  async getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]> {
    const results = await this.search(query, options.roomId, {
      limit: options.limit,
    });
    return results
      .filter((result) => result.document.roomId === options.roomId)
      .map((result) => ({
        id: result.document.id,
        data: result.document.data,
        embedding: result.document.embedding,
        roomId: result.document.roomId,
        createdAt: result.document.createdAt,
      }));
  }

  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    const results = await this.makeRequest(`/indexes/${roomId}/documents`);
    if (results.total === 0) {
      return [];
    }

    return results.results.map((doc: any) => ({
      id: doc.id,
      data: doc.data,
      embedding: doc.embedding,
      roomId: doc.roomId,
      createdAt: doc.createdAt,
    }));
  }

  async clearMemoryById(id: string, roomId: string): Promise<void> {
    try {
      // Ensure the index exists before attempting to delete
      await this.initializeStorage(roomId);

      await this.makeRequest(`/indexes/${roomId}/documents/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Error clearing memory ${id} from index ${roomId}:`,
        errorMessage
      );
      throw new Error(
        `Failed to clear memory ${id} from index ${roomId}: ${errorMessage}`
      );
    }
  }

  async clearAllMemories(): Promise<void> {
    try {
      // Get all indexes
      const response = await this.makeRequest("/indexes");
      const indexes = response.results || [];

      // Delete each index
      for (const index of indexes) {
        await this.deleteStorage(index.uid);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to clear all memories: ${errorMessage}`);
    }
  }
}

interface SearchResult {
  document?: any;
  score?: number;
  results?: any[];
}
