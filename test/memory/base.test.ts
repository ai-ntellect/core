import { BaseMemoryService } from "@/interfaces";
import { BaseMemory } from "@/memory";
import { BaseMemoryType, CreateMemoryInput } from "@/types";
import { expect } from "chai";

/**
 * Test suite for the BaseMemory service
 * This suite tests the memory management system that handles storage and retrieval of memory entries
 */

// Classe concrète pour tester BaseMemory
class TestMemory extends BaseMemory {
  async init(): Promise<void> {
    await this.cacheService.initializeConnection();
  }

  async createMemory(
    input: CreateMemoryInput & { embedding?: number[] }
  ): Promise<BaseMemoryType | undefined> {
    const memory: BaseMemoryType = {
      id: crypto.randomUUID(),
      data: input.data,
      query: input.query,
      embedding: input.embedding || null,
      roomId: input.roomId,
      createdAt: new Date(),
    };
    await this.cacheService.createMemory(memory, input.ttl);
    return memory;
  }

  async getMemoryById(
    id: string,
    roomId: string
  ): Promise<BaseMemoryType | null> {
    return this.cacheService.getMemoryById(id);
  }

  async getMemoryByIndex(
    query: string,
    options: { roomId: string; limit?: number }
  ): Promise<BaseMemoryType[]> {
    return this.cacheService.getMemoryByIndex(query, options);
  }

  async getAllMemories(roomId: string): Promise<BaseMemoryType[]> {
    return this.cacheService.getAllMemories();
  }

  async clearMemoryById(id: string, roomId: string): Promise<void> {
    await this.cacheService.clearMemoryById(id);
  }

  async clearAllMemories(): Promise<void> {
    await this.cacheService.clearAllMemories();
  }
}

describe("BaseMemory", () => {
  let memory: TestMemory;
  let mockMemoryService: BaseMemoryService;
  const TEST_ROOM_ID = "test-room";

  // Mock data for testing
  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    query: "test query",
    embedding: [0.1, 0.2, 0.3],
    roomId: "test-room",
    createdAt: new Date(),
  };

  beforeEach(() => {
    // Create mock implementation of BaseMemoryService
    mockMemoryService = {
      initializeConnection: async () => Promise.resolve(),
      createMemory: async (memory: BaseMemoryType) => Promise.resolve(),
      getMemoryById: async (id: string) => Promise.resolve(testMemory),
      getMemoryByIndex: async (query: string, options: any) =>
        Promise.resolve([testMemory]),
      getAllMemories: async () => Promise.resolve([testMemory]),
      clearMemoryById: async (id: string) => Promise.resolve(),
      clearAllMemories: async () => Promise.resolve(),
    };

    memory = new TestMemory(mockMemoryService);
  });

  describe("Initialization", () => {
    it("should initialize the memory service", async () => {
      let initCalled = false;
      mockMemoryService.initializeConnection = async () => {
        initCalled = true;
      };

      await memory.init();
      expect(initCalled).to.be.true;
    });
  });

  describe("Memory Creation", () => {
    it("should create a new memory entry", async () => {
      const input = {
        data: "test data",
        query: "test query",
        roomId: "test-room",
        ttl: 3600,
      };

      const result = await memory.createMemory(input);

      expect(result).to.exist;
      expect(result?.data).to.equal(input.data);
      expect(result?.query).to.equal(input.query);
      expect(result?.roomId).to.equal(input.roomId);
      expect(result?.id).to.be.a("string");
    });

    it("should create memory with embedding", async () => {
      const input = {
        data: "test data",
        query: "test query",
        roomId: "test-room",
        embedding: [0.1, 0.2, 0.3],
      };

      const result = await memory.createMemory(input);

      expect(result?.embedding).to.deep.equal(input.embedding);
    });
  });

  describe("Memory Retrieval", () => {
    it("should retrieve memory by ID", async () => {
      const result = await memory.getMemoryById("test-id", TEST_ROOM_ID);
      expect(result).to.deep.equal(testMemory);
    });

    it("should retrieve memories by index", async () => {
      const results = await memory.getMemoryByIndex("test query", {
        roomId: "test-room",
        limit: 10,
      });

      expect(results).to.be.an("array");
      expect(results[0]).to.deep.equal(testMemory);
    });

    it("should retrieve all memories", async () => {
      const results = await memory.getAllMemories(TEST_ROOM_ID);
      expect(results).to.be.an("array");
    });
  });

  describe("Memory Clearing", () => {
    it("should clear memory by ID", async () => {
      await memory.clearMemoryById("test-id", TEST_ROOM_ID);
    });

    it("should clear all memories", async () => {
      await memory.clearAllMemories();
    });
  });

  describe("Error Handling", () => {
    it("should handle errors during memory creation", async () => {
      mockMemoryService.createMemory = async () => {
        throw new Error("Creation failed");
      };

      try {
        await memory.createMemory({
          data: "test",
          query: "test",
          roomId: "test",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("Creation failed");
      }
    });

    it("should handle errors during memory retrieval", async () => {
      mockMemoryService.getMemoryById = async () => {
        throw new Error("Retrieval failed");
      };

      try {
        await memory.getMemoryById("test-id", TEST_ROOM_ID);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("Retrieval failed");
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined embedding", async () => {
      const input = {
        data: "test data",
        query: "test query",
        roomId: "test-room",
        embedding: undefined,
      };

      const result = await memory.createMemory(input);
      expect(result?.embedding).to.be.null;
    });

    it("should handle empty query results", async () => {
      mockMemoryService.getMemoryByIndex = async () => [];

      const results = await memory.getMemoryByIndex("nonexistent", {
        roomId: "test-room",
      });
      expect(results).to.be.an("array").that.is.empty;
    });

    it("should handle non-existent memory ID", async () => {
      mockMemoryService.getMemoryById = async () => null;

      const result = await memory.getMemoryById("nonexistent", TEST_ROOM_ID);
      expect(result).to.be.null;
    });
  });
});
