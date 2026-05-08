import { PetriNet } from '../routing/index';
import { Session } from '../routing/orchestrator';

export interface IPetriCheckpointAdapter {
  save(net: PetriNet, session?: Session): Promise<string>;
  load(checkpointId: string): Promise<{ net: PetriNet; session?: Session } | null>;
  list(): Promise<Array<{ id: string; timestamp: number; sessionId?: string }>>;
  delete(checkpointId: string): Promise<void>;
}

export class InMemoryPetriCheckpointAdapter implements IPetriCheckpointAdapter {
  private checkpoints: Map<string, any> = new Map();

  async save(net: PetriNet, session?: Session): Promise<string> {
    const checkpointId = `petri-cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Serialize marking
    const marking = (net as any).state.marking as Map<string, any[]>;
    const serializedMarking: any[] = [];
    for (const [pid, tokens] of marking) {
      serializedMarking.push({
        placeId: pid,
        tokens: tokens.map(t => ({ id: t.id, data: t.data, createdAt: t.createdAt }))
      });
    }

    const checkpoint = {
      id: checkpointId,
      timestamp: Date.now(),
      sessionId: session?.id,
      marking: serializedMarking,
      history: (net as any).state.history || [],
      sessionContext: (session as any)?.context,
    };

    this.checkpoints.set(checkpointId, checkpoint);
    return checkpointId;
  }

  async load(checkpointId: string): Promise<{ net: PetriNet; session?: Session } | null> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) return null;

    const net = new PetriNet(cp.id);
    const marking = (net as any).state.marking as Map<string, any[]>;
    
    for (const item of cp.marking) {
      marking.set(item.placeId, item.tokens.map((t: any) => ({ ...t })));
    }

    (net as any).state.history = [...cp.history];

    let session: Session | undefined;
    if (cp.sessionId) {
      session = {
        id: cp.sessionId,
        petriNet: net,
        context: cp.sessionContext || {},
        history: [...cp.history],
        createdAt: cp.timestamp,
        traceId: `trace-restored-${Date.now()}`,
      } as any;
    }

    return { net, session };
  }

  async list(): Promise<Array<{ id: string; timestamp: number; sessionId?: string }>> {
    return Array.from(this.checkpoints.values()).map((cp: any) => ({
      id: cp.id,
      timestamp: cp.timestamp,
      sessionId: cp.sessionId,
    })).sort((a: any, b: any) => b.timestamp - a.timestamp);
  }

  async delete(checkpointId: string): Promise<void> {
    this.checkpoints.delete(checkpointId);
  }
}
