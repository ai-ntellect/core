import { expect } from "chai";
import { IMemoryAdapter } from "../../../interfaces";
import { Memory } from "../../../modules/memory";
import { BaseMemoryType, CreateMemoryInput } from "../../../types";

/**
 * @module MemoryTests
 * @description Test suite for the Memory service implementation.
 * Tests the core functionality of memory management including:
 * - Initialization
 * - Memory creation
 * - Memory retrieval
 * - Memory deletion
 */

describe("Memory", () => {
  let memory: Memory;
  let mockAdapter: IMemoryAdapter;
  const TEST_ROOM_ID = "test-room";

  /**
   * Test data fixture
   * @type {BaseMemoryType}
   */
  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    embedding: [0.1, 0.2, 0.3],
    roomId: TEST_ROOM_ID,
    createdAt: new Date(),
  };

  /**
   * Set up test environment before each test
   * Creates a mock adapter and initializes the memory service
   */
  beforeEach(() => {
    // Create mock implementation of IMemoryAdapter
    mockAdapter = {
      init: async () => Promise.resolve(),
      createMemory: async (input: CreateMemoryInput) => ({
        ...testMemory,
        data: input.data,
        embedding: input.embedding,
      }),
      getMemoryById: async () => testMemory,
      getMemoryByIndex: async () => [testMemory],
      getAllMemories: async () => [testMemory],
      clearMemoryById: async () => Promise.resolve(),
      clearAllMemories: async () => Promise.resolve(),
    };

    memory = new Memory(mockAdapter);
  });

  /**
   * Test suite for initialization functionality
   */
  describe("Initialization", () => {
    /**
     * Test case: Verify adapter initialization
     */
    it("should initialize the memory adapter", async () => {
      let initCalled = false;
      mockAdapter.init = async () => {
        initCalled = true;
      };

      await memory.init();
      expect(initCalled).to.be.true;
    });
  });

  /**
   * Test suite for memory creation functionality
   */
  describe("Memory Creation", () => {
    /**
     * Test case: Verify memory creation with valid input
     */
    it("should create a new memory entry", async () => {
      const input = {
        data: "test data",
        roomId: TEST_ROOM_ID,
      };

      const result = await memory.createMemory(input);
      expect(result).to.deep.include(input);
    });

    /**
     * Test case: Verify memory creation with embedding
     */
    it("should create a memory entry with embedding", async () => {
      const input = {
        data: "test data",
        roomId: TEST_ROOM_ID,
        embedding: [0.1, 0.2, 0.3],
      };

      const result = await memory.createMemory(input);
      expect(result).to.deep.include(input);
    });
  });

  /**
   * Test suite for memory retrieval functionality
   */
  describe("Memory Retrieval", () => {
    /**
     * Test case: Verify memory retrieval by ID
     */
    it("should retrieve a memory by ID", async () => {
      const result = await memory.getMemoryById("test-id", TEST_ROOM_ID);
      expect(result).to.deep.equal(testMemory);
    });

    /**
     * Test case: Verify memory retrieval by index
     */
    it("should retrieve memories by index", async () => {
      const result = await memory.getMemoryByIndex("test", {
        roomId: TEST_ROOM_ID,
      });
      expect(result).to.deep.equal([testMemory]);
    });

    /**
     * Test case: Verify retrieval of all memories
     */
    it("should retrieve all memories", async () => {
      const result = await memory.getAllMemories(TEST_ROOM_ID);
      expect(result).to.deep.equal([testMemory]);
    });
  });

  /**
   * Test suite for memory deletion functionality
   */
  describe("Memory Deletion", () => {
    /**
     * Test case: Verify memory deletion by ID
     */
    it("should delete a memory by ID", async () => {
      let deleteCalled = false;
      mockAdapter.clearMemoryById = async () => {
        deleteCalled = true;
      };

      await memory.clearMemoryById("test-id", TEST_ROOM_ID);
      expect(deleteCalled).to.be.true;
    });

    /**
     * Test case: Verify deletion of all memories
     */
    it("should clear all memories", async () => {
      let clearAllCalled = false;
      mockAdapter.clearAllMemories = async () => {
        clearAllCalled = true;
      };

      await memory.clearAllMemories();
      expect(clearAllCalled).to.be.true;
    });
  });

  describe("Error Handling", () => {
    it("should handle errors during memory creation", async () => {
      mockAdapter.createMemory = async () => {
        throw new Error("Creation failed");
      };

      try {
        await memory.createMemory({
          data: "test",
          roomId: TEST_ROOM_ID,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("Creation failed");
      }
    });

    it("should handle errors during memory retrieval", async () => {
      mockAdapter.getMemoryById = async () => {
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
      mockAdapter.getMemoryByIndex = async () => [];

      const results = await memory.getMemoryByIndex("nonexistent", {
        roomId: "test-room",
      });
      expect(results).to.be.an("array").that.is.empty;
    });

    it("should handle non-existent memory ID", async () => {
      mockAdapter.getMemoryById = async () => null;

      const result = await memory.getMemoryById("nonexistent", TEST_ROOM_ID);
      expect(result).to.be.null;
    });
  });
});
