import { ICheckpointAdapter } from "../../interfaces";
import { Checkpoint } from "../../types";

export class InMemoryCheckpointAdapter implements ICheckpointAdapter {
  private storage = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.storage.set(checkpoint.id, structuredClone(checkpoint));
  }

  async load(id: string): Promise<Checkpoint | null> {
    const cp = this.storage.get(id);
    return cp ? structuredClone(cp) : null;
  }

  async list(graphName: string): Promise<Checkpoint[]> {
    return Array.from(this.storage.values())
      .filter((cp) => cp.graphName === graphName)
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  }

  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async clear(graphName?: string): Promise<void> {
    if (!graphName) {
      this.storage.clear();
      return;
    }
    for (const [id, cp] of this.storage) {
      if (cp.graphName === graphName) this.storage.delete(id);
    }
  }
}
