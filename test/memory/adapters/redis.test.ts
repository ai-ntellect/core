import { BaseMemoryService } from "@/interfaces";
import { RedisAdapter } from "@/memory/adapters/redis";
import { BaseMemoryType } from "@/types";
import { expect } from "chai";
import dotenv from "dotenv";
import Redis from "ioredis";

// Load environment variables
dotenv.config();

describe("RedisAdapter", () => {
  before(function () {
    this.timeout(15000);
  });

  let redisAdapter: RedisAdapter;
  let mockBaseMemoryService: BaseMemoryService;
  let redisClient: Redis | null = null;
  const fixedDate = new Date("2025-01-30T07:43:50.626Z");

  const testMemory: BaseMemoryType = {
    id: "test-id",
    data: "test data",
    query: "test query",
    embedding: [0.1, 0.2, 0.3],
    roomId: "test-room",
    createdAt: fixedDate,
  };

  beforeEach(async () => {
    mockBaseMemoryService = {
      initializeConnection: async () => {},
      createMemory: async () => {},
      getMemoryById: async () => testMemory,
      getMemoryByIndex: async () => [testMemory],
      getAllMemories: async () => [testMemory],
      clearMemoryById: async () => {},
      clearAllMemories: async () => {},
    };

    // Use real Redis if environment variables are set, otherwise mock
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL);
      redisAdapter = new RedisAdapter(process.env.REDIS_URL, {
        cachePrefix: "test-prefix",
        cacheTTL: 3600,
      });
    } else {
      // Mock Redis implementation
      const mockRedis = {
        connect: async () => {},
        disconnect: async () => {},
        set: async (key: string, value: string) => "OK",
        get: async (key: string) => {
          if (key.includes("test-id")) {
            return JSON.stringify({
              ...testMemory,
              createdAt: fixedDate.toISOString(),
            });
          }
          return null;
        },
        keys: async (pattern: string) => {
          return [`${pattern}test-id`];
        },
        mget: async (keys: string[]) => {
          return keys.map(() =>
            JSON.stringify({
              ...testMemory,
              createdAt: fixedDate.toISOString(),
            })
          );
        },
        del: async () => 1,
        flushall: async () => "OK",
        quit: async () => {},
      };

      redisAdapter = new RedisAdapter(mockRedis as any, {
        cachePrefix: "test-prefix",
        cacheTTL: 3600,
      });
    }

    await redisAdapter.initializeConnection();
  });

  afterEach(async () => {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    // @ts-ignore pour éviter l'erreur de typage
    await redisAdapter?.quit?.();
  });

  describe("Initialization", () => {
    it("should initialize storage", async () => {
      await expect(redisAdapter.initializeConnection()).to.not.throw;
    });
  });

  describe("Memory Operations", () => {
    const TEST_ROOM_ID = "test-room";

    it("should create memory", async () => {
      await expect(
        redisAdapter.createMemory({
          data: "test data",
          query: "test query",
          roomId: TEST_ROOM_ID,
          id: "test-id",
          embedding: [0.1, 0.2, 0.3],
          createdAt: fixedDate,
        })
      ).to.not.throw;
    });

    it("should get memory by ID", async () => {
      const result = await redisAdapter.getMemoryById("test-id", TEST_ROOM_ID);
      if (result) {
        result.createdAt = new Date(result.createdAt);
      }
      expect(result).to.deep.equal({
        ...testMemory,
        createdAt: testMemory.createdAt,
      });
    });

    it("should get memories by index", async () => {
      const results = await redisAdapter.getMemoryByIndex("test", {
        roomId: TEST_ROOM_ID,
        limit: 10,
      });

      expect(results).to.be.an("array");
      if (results[0]) {
        results[0].createdAt = new Date(results[0].createdAt);
      }
      expect(results[0]).to.deep.equal(testMemory);
    });

    it("should get all memories", async () => {
      const results = await redisAdapter.getAllMemories();
      expect(results).to.be.an("array");
      if (results[0]) {
        results[0].createdAt = new Date(results[0].createdAt);
      }
      expect(results[0]).to.deep.equal(testMemory);
    });

    it("should clear memory by ID", async () => {
      await expect(redisAdapter.clearMemoryById("test-id")).to.not.throw;
    });

    it("should clear all memories", async () => {
      await expect(redisAdapter.clearAllMemories()).to.not.throw;
    });
  });
});
