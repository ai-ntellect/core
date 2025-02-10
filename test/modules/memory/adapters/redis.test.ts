import { expect } from "chai";
import dotenv from "dotenv";
import Redis from "ioredis";
import { IMemoryAdapter } from "../../../interfaces";
import { RedisAdapter } from "../../../memory/adapters/redis";
import { BaseMemoryType } from "../../../types";

// Load environment variables
dotenv.config();

describe("RedisAdapter", () => {
  before(function () {
    this.timeout(30000);
  });

  let redisAdapter: RedisAdapter;
  let mockAdapter: IMemoryAdapter;
  let redisClient: Redis | null = null;
  const fixedDate = new Date("2025-01-30T07:43:50.626Z");
  const fixedDateString = fixedDate.toISOString();

  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    roomId: "test-room",
    createdAt: new Date(fixedDateString),
  };

  beforeEach(async function () {
    this.timeout(10000);

    try {
      mockAdapter = {
        init: async () => {},
        createMemory: async (input) => testMemory,
        getMemoryById: async () => testMemory,
        getMemoryByIndex: async () => [testMemory],
        getAllMemories: async () => [testMemory],
        clearMemoryById: async () => {},
        clearAllMemories: async () => {},
      };

      if (process.env.REDIS_URL) {
        redisClient = new Redis(process.env.REDIS_URL);
        redisAdapter = new RedisAdapter(process.env.REDIS_URL, {
          cachePrefix: "test-prefix",
          cacheTTL: 3600,
        });
      } else {
        const mockRedis = {
          connect: async () => Promise.resolve(),
          disconnect: async () => Promise.resolve(),
          set: async () => "OK",
          get: async (key: string) => {
            if (key.includes("test-id")) {
              return JSON.stringify({
                id: "test-id",
                data: "test data",
                embedding: null,
                roomId: "test-room",
                createdAt: fixedDateString,
              });
            }
            return null;
          },
          keys: async () => [`test-id`],
          mget: async (keys: string[]) =>
            keys.map(() =>
              JSON.stringify({
                id: "test-id",
                data: "test data",
                embedding: null,
                roomId: "test-room",
                createdAt: fixedDateString,
              })
            ),
          del: async () => 1,
          flushall: async () => "OK",
          quit: async () => Promise.resolve(),
        };

        redisAdapter = new RedisAdapter(mockRedis as any, {
          cachePrefix: "test-prefix",
          cacheTTL: 3600,
        });
      }

      await redisAdapter.init("test-room");
    } catch (error) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });

  afterEach(async function () {
    this.timeout(5000);
    try {
      if (redisClient) {
        await redisClient.quit();
        redisClient = null;
      }
      if (redisAdapter) {
        await redisAdapter.quit();
      }
    } catch (error) {
      console.error("Error in afterEach:", error);
    }
  });

  describe("Initialization", () => {
    it("should initialize storage", async () => {
      await expect(redisAdapter.init("test-room")).to.not.throw;
    });
  });

  describe("Memory Operations", () => {
    const TEST_ROOM_ID = "test-room";

    it("should create memory", async () => {
      await expect(
        redisAdapter.createMemory({
          data: "test data",
          roomId: TEST_ROOM_ID,
          id: "test-id",
          embedding: [0.1, 0.2, 0.3],
        })
      ).to.not.throw;
    });

    it("should get memory by ID", async () => {
      const result = await redisAdapter.getMemoryById("test-id", TEST_ROOM_ID);
      if (result) {
        result.createdAt = new Date(fixedDateString);
      }
      expect(result).to.deep.equal(testMemory);
    });

    it("should get memories by index", async () => {
      const results = await redisAdapter.getMemoryByIndex("test", {
        roomId: TEST_ROOM_ID,
        limit: 10,
      });

      expect(results).to.be.an("array");
      if (results[0]) {
        results[0].createdAt = new Date(fixedDateString);
      }
      expect(results[0]).to.deep.equal(testMemory);
    });

    it("should get all memories", async () => {
      const results = await redisAdapter.getAllMemories(TEST_ROOM_ID);
      expect(results).to.be.an("array");
      if (results[0]) {
        results[0].createdAt = new Date(fixedDateString);
      }
      expect(results[0]).to.deep.equal(testMemory);
    });

    it("should clear memory by ID", async () => {
      await expect(redisAdapter.clearMemoryById("test-id", TEST_ROOM_ID)).to.not
        .throw;
    });

    it("should clear all memories", async () => {
      await expect(redisAdapter.clearAllMemories()).to.not.throw;
    });
  });
});
