import { BaseMemoryService } from "@/interfaces";
import { MeilisearchAdapter } from "@/memory/adapters/meilisearch";
import { BaseMemoryType } from "@/types";
import { expect } from "chai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

describe("MeilisearchAdapter", () => {
  let meilisearchAdapter: MeilisearchAdapter;
  let mockBaseMemoryService: BaseMemoryService;
  const TEST_ROOM_ID = "test-room";

  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    query: "test query",
    embedding: [0.1, 0.2, 0.3],
    roomId: "test-room",
    createdAt: new Date(),
  };

  beforeEach(() => {
    // Use real Meilisearch if environment variables are set, otherwise mock
    if (process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY) {
      // Real Meilisearch configuration
      // console.log("Real Meilisearch configuration");
      meilisearchAdapter = new MeilisearchAdapter(
        {
          host: process.env.MEILISEARCH_HOST,
          apiKey: process.env.MEILISEARCH_API_KEY,
          searchableAttributes: ["content"],
          sortableAttributes: ["createdAt"],
        },
        mockBaseMemoryService
      );
    } else {
      // Mock fetch implementation
      // console.log("Mock Meilisearch configuration");
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();

        // Mock for index check/creation
        if (url.includes("/indexes")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ taskUid: 1 }));
          }
          if (url.endsWith("/indexes")) {
            return new Response(JSON.stringify({ results: [] }));
          }
          // Mock for specific index check
          if (url.includes(`/indexes/${TEST_ROOM_ID}`)) {
            return new Response(
              JSON.stringify({
                uid: TEST_ROOM_ID,
                primaryKey: "id",
              })
            );
          }
          if (url.includes("/indexes/memories")) {
            return new Response(
              JSON.stringify({
                uid: "memories",
                primaryKey: "id",
              })
            );
          }
        }

        // Mock for settings
        if (url.includes("/settings")) {
          return new Response(JSON.stringify({ acknowledged: true }));
        }

        // Mock for documents
        if (url.includes("/documents")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ taskUid: 2 }));
          }
          if (init?.method === "DELETE") {
            return new Response(JSON.stringify({ taskUid: 3 }));
          }
          return new Response(JSON.stringify([testMemory]));
        }

        return new Response(JSON.stringify({}));
      };

      mockBaseMemoryService = {
        initializeConnection: async () => {},
        createMemory: async () => {},
        getMemoryById: async () => testMemory,
        getMemoryByIndex: async () => [testMemory],
        getAllMemories: async () => [testMemory],
        clearMemoryById: async () => {},
        clearAllMemories: async () => {},
      };

      meilisearchAdapter = new MeilisearchAdapter(
        {
          host: "http://localhost:7700",
          apiKey: "aSampleMasterKey",
          searchableAttributes: ["content"],
          sortableAttributes: ["createdAt"],
        },
        mockBaseMemoryService
      );
    }
  });

  describe("Initialization", () => {
    it("should initialize storage", async () => {
      await expect(meilisearchAdapter.init()).to.not.throw;
    });
  });

  describe("Memory Operations", () => {
    beforeEach(async () => {
      // Reset fetch mock for each test
      if (!process.env.MEILISEARCH_HOST) {
        global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input.toString();

          // Mock for index check/creation
          if (url.includes("/indexes")) {
            if (init?.method === "POST") {
              return new Response(JSON.stringify({ taskUid: 1 }));
            }
            if (url.endsWith("/indexes")) {
              return new Response(JSON.stringify({ results: [] }));
            }
            // Mock for specific index check
            if (url.includes(`/indexes/${TEST_ROOM_ID}`)) {
              return new Response(
                JSON.stringify({
                  uid: TEST_ROOM_ID,
                  primaryKey: "id",
                })
              );
            }
            if (url.includes("/indexes/memories")) {
              return new Response(
                JSON.stringify({
                  uid: "memories",
                  primaryKey: "id",
                })
              );
            }
          }

          // Mock for settings
          if (url.includes("/settings")) {
            return new Response(JSON.stringify({ acknowledged: true }));
          }

          // Mock for documents
          if (url.includes("/documents")) {
            if (init?.method === "POST") {
              return new Response(JSON.stringify({ taskUid: 2 }));
            }
            if (init?.method === "DELETE") {
              return new Response(JSON.stringify({ taskUid: 3 }));
            }
            return new Response(JSON.stringify([testMemory]));
          }

          return new Response(JSON.stringify({}));
        };
      }

      try {
        await meilisearchAdapter.init();
        await meilisearchAdapter.initializeStorage(TEST_ROOM_ID);
      } catch (error) {
        console.error("Failed to initialize:", error);
        throw error;
      }
    });

    it("should create memory", async () => {
      const result = await meilisearchAdapter.createMemory({
        data: "test data",
        query: "test query",
        roomId: TEST_ROOM_ID,
      });

      expect(result).to.exist;
      expect(result?.data).to.equal("test data");
      expect(result?.embedding).to.be.null;
    });

    it("should search memories", async () => {
      const results = await meilisearchAdapter.getMemoryByIndex("test", {
        roomId: TEST_ROOM_ID,
        limit: 10,
      });

      expect(results).to.be.an("array");
      if (results.length > 0) {
        const result = results[0];
        if (result) {
          result.createdAt = new Date(result.createdAt);
        }
        expect(result).to.deep.equal(testMemory);
      }
    });

    it("should handle memory retrieval by ID", async () => {
      global.fetch = async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes(`/indexes/${TEST_ROOM_ID}/documents/test-id`)) {
          return new Response(
            JSON.stringify({
              ...testMemory,
              createdAt: testMemory.createdAt.toISOString(),
            })
          );
        }
        return new Response(JSON.stringify({}));
      };

      const result = await meilisearchAdapter.getMemoryById(
        "test-id",
        TEST_ROOM_ID
      );
      if (result) {
        result.createdAt = new Date(result.createdAt);
      }
      expect(result).to.deep.equal(testMemory);
    });

    it("should handle non-existent memory", async () => {
      global.fetch = async (): Promise<Response> => {
        throw new Error("Not found");
      };

      const result = await meilisearchAdapter.getMemoryById(
        "non-existent",
        TEST_ROOM_ID
      );
      expect(result).to.be.null;
    });

    it("should clear all memories", async () => {
      await expect(meilisearchAdapter.clearAllMemories()).to.not.throw;
    });

    it("should not create duplicate memory with same data", async () => {
      // Create first memory
      const firstMemory = await meilisearchAdapter.createMemory({
        data: "test data",
        query: "test query",
        roomId: TEST_ROOM_ID,
      });

      // Try to create second memory with same data
      const secondMemory = await meilisearchAdapter.createMemory({
        data: "test data",
        query: "test query",
        roomId: TEST_ROOM_ID,
      });

      expect(secondMemory).to.exist;
      expect(secondMemory?.id).to.equal(firstMemory?.id);
      expect(secondMemory?.data).to.equal(firstMemory?.data);
      expect(secondMemory?.query).to.equal(firstMemory?.query);
      expect(secondMemory?.roomId).to.equal(firstMemory?.roomId);
    });

    it("should initialize storage", async () => {
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();

        // Mock pour la vérification de l'existence de l'index
        if (url.includes(`/indexes/${TEST_ROOM_ID}`)) {
          return new Response(
            JSON.stringify({
              uid: TEST_ROOM_ID,
              primaryKey: "id",
            })
          );
        }

        // Mock pour les settings
        if (url.includes("/settings")) {
          return new Response(JSON.stringify({ acknowledged: true }));
        }

        return new Response(JSON.stringify({}));
      };

      await expect(meilisearchAdapter.initializeStorage(TEST_ROOM_ID)).to.not
        .throw;
    });
  });
});
