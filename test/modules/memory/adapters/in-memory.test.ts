import { expect } from "chai";
import { InMemoryAdapter } from "../../../memory/adapters/in-memory";
import { BaseMemoryType } from "../../../types";

describe("InMemoryAdapter", () => {
  let inMemoryAdapter: InMemoryAdapter;
  const fixedDate = new Date("2025-01-30T07:43:50.626Z");
  const TEST_ROOM_ID = "test-room";

  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    roomId: TEST_ROOM_ID,
    createdAt: fixedDate,
  };

  beforeEach(async () => {
    inMemoryAdapter = new InMemoryAdapter();
    await inMemoryAdapter.init(TEST_ROOM_ID);
  });

  describe("Initialization", () => {
    it("should initialize storage", async () => {
      await expect(inMemoryAdapter.init("new-room")).to.not.throw;
      const memories = await inMemoryAdapter.getAllMemories("new-room");
      expect(memories).to.be.an("array").that.is.empty;
    });
  });

  describe("Memory Operations", () => {
    it("should create memory", async () => {
      const memory = await inMemoryAdapter.createMemory({
        data: "test data",
        roomId: TEST_ROOM_ID,
        id: "test-id",
        embedding: [0.1, 0.2, 0.3],
      });

      expect(memory).to.have.property("id");
      expect(memory?.data).to.equal("test data");
      expect(memory?.roomId).to.equal(TEST_ROOM_ID);
    });

    it("should not create duplicate memory", async () => {
      // Create first memory
      const memory1 = await inMemoryAdapter.createMemory({
        data: "test data",
        roomId: TEST_ROOM_ID,
        id: "test-id",
      });

      // Try to create duplicate
      const memory2 = await inMemoryAdapter.createMemory({
        data: "test data",
        roomId: TEST_ROOM_ID,
        id: "another-id",
      });

      expect(memory2?.id).to.equal(memory1?.id);
    });

    it("should get memory by ID", async () => {
      await inMemoryAdapter.createMemory({
        data: testMemory.data,
        roomId: testMemory.roomId,
        id: testMemory.id,
        embedding: testMemory.embedding,
      });

      const result = await inMemoryAdapter.getMemoryById(
        "test-id",
        TEST_ROOM_ID
      );
      expect(result).to.have.property("id", "test-id");
    });

    it("should get memories by index", async () => {
      // Create test memories
      await inMemoryAdapter.createMemory({
        data: "test data one",
        roomId: TEST_ROOM_ID,
        id: "test-id-1",
      });
      await inMemoryAdapter.createMemory({
        data: "test data two",
        roomId: TEST_ROOM_ID,
        id: "test-id-2",
      });

      const results = await inMemoryAdapter.getMemoryByIndex("one", {
        roomId: TEST_ROOM_ID,
        limit: 10,
      });

      expect(results).to.be.an("array");
      expect(results).to.have.lengthOf(1);
      expect(results[0].data).to.include("one");
    });

    it("should get all memories", async () => {
      // Create multiple memories
      await inMemoryAdapter.createMemory({
        data: "test data 1",
        roomId: TEST_ROOM_ID,
        id: "test-id-1",
      });
      await inMemoryAdapter.createMemory({
        data: "test data 2",
        roomId: TEST_ROOM_ID,
        id: "test-id-2",
      });

      const results = await inMemoryAdapter.getAllMemories(TEST_ROOM_ID);
      expect(results).to.be.an("array");
      expect(results).to.have.lengthOf(2);
    });

    it("should clear memory by ID", async () => {
      // Create a memory
      await inMemoryAdapter.createMemory({
        data: "test data",
        roomId: TEST_ROOM_ID,
        id: "test-id",
      });

      await inMemoryAdapter.clearMemoryById("test-id", TEST_ROOM_ID);
      const result = await inMemoryAdapter.getMemoryById(
        "test-id",
        TEST_ROOM_ID
      );
      expect(result).to.be.null;
    });

    it("should clear all memories", async () => {
      // Create multiple memories
      await inMemoryAdapter.createMemory({
        data: "test data 1",
        roomId: TEST_ROOM_ID,
        id: "test-id-1",
      });
      await inMemoryAdapter.createMemory({
        data: "test data 2",
        roomId: TEST_ROOM_ID,
        id: "test-id-2",
      });

      await inMemoryAdapter.clearAllMemories();
      const results = await inMemoryAdapter.getAllMemories(TEST_ROOM_ID);
      expect(results).to.be.an("array");
      expect(results).to.have.lengthOf(0);
    });
  });
});
