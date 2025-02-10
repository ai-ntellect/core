import { openai } from "@ai-sdk/openai";
import { expect } from "chai";
import { Embedding } from "../../../modules/embedding";
import { AIEmbeddingAdapter } from "../../../modules/embedding/adapters/ai";

describe("EmbeddingModule", () => {
  let embeddingModule: Embedding;

  before(function () {
    this.timeout(10000);
  });

  beforeEach(() => {
    const model = openai.embedding("text-embedding-3-small");
    const embeddingModel = new AIEmbeddingAdapter(model);
    embeddingModule = new Embedding(embeddingModel);
  });

  it("should embed text", async function () {
    try {
      const embedding = await embeddingModule.embedText("Hello, world!");
      expect(embedding).to.be.an("array");
      expect(embedding.length).to.be.greaterThan(0);
      expect(embedding[0]).to.be.a("number");
    } catch (error) {
      console.error("Error in embedText:", error);
      throw error;
    }
  });

  it("should embed many texts", async function () {
    try {
      const embeddings = await embeddingModule.embedMany([
        "Hello, world!",
        "Another test text",
      ]);
      expect(embeddings).to.be.an("array");
      expect(embeddings.length).to.equal(2);
      expect(embeddings[0]).to.be.an("array");
      expect(embeddings[0][0]).to.be.a("number");
    } catch (error) {
      console.error("Error in embedMany:", error);
      throw error;
    }
  });

  it("should calculate similarity between two embeddings", () => {
    const embedding1 = [1, 2, 3];
    const embedding2 = [4, 5, 6];
    const similarity = embeddingModule.calculateSimilarity(
      embedding1,
      embedding2
    );
    expect(similarity).to.be.a("number");
    expect(similarity).to.be.within(0, 100);
  });

  it("should handle embedding errors gracefully", async function () {
    const mockEmbeddingAdapter = {
      embed: async () => {
        throw new Error("Mock embedding error");
      },
      embedMany: async () => {
        throw new Error("Mock embedding error");
      },
    };

    const mockEmbeddingModule = new Embedding(mockEmbeddingAdapter);

    try {
      await mockEmbeddingModule.embedText("test");
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).to.exist;
      expect((error as Error).message).to.equal("Mock embedding error");
    }
  });
});
