import { EmbeddingService } from "../interfaces";
import { cosineSimilarity, embed, EmbeddingModel, embedMany } from "ai";

export class AIEmbeddingService implements EmbeddingService {
  constructor(private readonly model: EmbeddingModel<string>) {}

  async embedText(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.model,
      value: text,
    });
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
    });
    return embeddings;
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return (cosineSimilarity(embedding1, embedding2) + 1) * 50;
  }
}
