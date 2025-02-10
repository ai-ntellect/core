import { embed, EmbeddingModel, embedMany } from "ai";
import { IEmbeddingModel } from "../../../../interfaces";

/**
 * @module AIEmbeddingAdapter
 * @description Adapter implementation for AI-based embedding service.
 * Provides integration with AI models for text embedding generation.
 * @implements {IEmbeddingModel}
 */
export class AIEmbeddingAdapter implements IEmbeddingModel {
  /**
   * Creates an instance of AIEmbeddingAdapter
   * @param {EmbeddingModel<string>} model - The AI embedding model to use
   */
  constructor(private readonly model: EmbeddingModel<string>) {}

  /**
   * Generates an embedding vector for a single text using the AI model
   * @param {string} text - The text to embed
   * @returns {Promise<number[]>} The generated embedding vector
   */
  async embed(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.model,
      value: text,
    });
    return embedding;
  }

  /**
   * Generates embedding vectors for multiple texts using the AI model
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of generated embedding vectors
   */
  async embedMany(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
    });
    return embeddings;
  }
}
