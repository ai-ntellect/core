import { cosineSimilarity } from "ai";
import { IEmbeddingModel, IEmbeddingModule } from "../../interfaces";

/**
 * @module Embedding
 * @description A module for generating and managing text embeddings.
 * Provides functionality for converting text into vector representations
 * and calculating similarities between embeddings.
 * @implements {IEmbeddingModule}
 */
export class Embedding implements IEmbeddingModule {
  /**
   * Creates an instance of Embedding
   * @param {IEmbeddingModel} embeddingModel - The embedding model implementation to use
   */
  constructor(private readonly embeddingModel: IEmbeddingModel) {}

  /**
   * Generates an embedding vector for a single text
   * @param {string} text - The text to embed
   * @returns {Promise<number[]>} The embedding vector
   */
  async embedText(text: string): Promise<number[]> {
    return this.embeddingModel.embed(text);
  }

  /**
   * Generates embedding vectors for multiple texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedMany(texts: string[]): Promise<number[][]> {
    return this.embeddingModel.embedMany(texts);
  }

  /**
   * Calculates the similarity score between two embeddings
   * @param {number[]} embedding1 - First embedding vector
   * @param {number[]} embedding2 - Second embedding vector
   * @returns {number} Similarity score between 0 and 100
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return (cosineSimilarity(embedding1, embedding2) + 1) * 50;
  }
}
