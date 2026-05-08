import { PetriNet } from './index';
import { Session } from './orchestrator';
import { IPetriCheckpointAdapter } from './checkpoint-adapter';
import { createClient, RedisClientType } from 'redis';

export interface RedisCheckpointAdapterOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  keyPrefix?: string;
}

export class RedisPetriCheckpointAdapter implements IPetriCheckpointAdapter {
  private client: RedisClientType;
  private keyPrefix: string;
  private connected: boolean = false;

  constructor(options?: RedisCheckpointAdapterOptions) {
    this.keyPrefix = options?.keyPrefix || 'petri:cp:';

    if (options?.url) {
      this.client = createClient({ url: options.url }) as RedisClientType;
    } else {
      this.client = createClient({
        socket: {
          host: options?.host || 'localhost',
          port: options?.port || 6379,
        },
        password: options?.password,
      }) as RedisClientType;
    }

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async save(net: PetriNet, session?: Session): Promise<string> {
    await this.ensureConnected();

    const checkpointId = `petri-cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const marking = (net as any).state.marking as Map<string, any[]>;
    const serializedMarking: any[] = [];
    for (const [pid, tokens] of marking) {
      serializedMarking.push({
        placeId: pid,
        tokens: tokens.map(t => ({ id: t.id, data: t.data, createdAt: t.createdAt })),
      });
    }

    const checkpoint = {
      id: checkpointId,
      timestamp: Date.now(),
      sessionId: session?.id,
      marking: serializedMarking,
      history: (net as any).state.history || [],
      sessionContext: (session as any)?.context,
      sessionTraceId: session?.traceId,
      sessionCreatedAt: session?.createdAt,
      sessionHistory: session?.history || [],
    };

    const key = `${this.keyPrefix}${checkpointId}`;
    await this.client.set(key, JSON.stringify(checkpoint));

    const indexKey = `${this.keyPrefix}index`;
    await this.client.zAdd(indexKey, { score: checkpoint.timestamp, value: checkpointId });

    if (session?.id) {
      const sessionKey = `${this.keyPrefix}session:${session.id}`;
      await this.client.sAdd(sessionKey, checkpointId);
    }

    return checkpointId;
  }

  async load(checkpointId: string): Promise<{ net: PetriNet; session?: Session } | null> {
    await this.ensureConnected();

    const key = `${this.keyPrefix}${checkpointId}`;
    const data = await this.client.get(key);

    if (!data) return null;

    const cp = JSON.parse(data);
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
        history: cp.sessionHistory || [],
        createdAt: cp.sessionCreatedAt || cp.timestamp,
        traceId: cp.sessionTraceId || `trace-restored-${Date.now()}`,
      } as Session;
    }

    return { net, session };
  }

  async list(): Promise<Array<{ id: string; timestamp: number; sessionId?: string }>> {
    await this.ensureConnected();

    const indexKey = `${this.keyPrefix}index`;
    const ids = await this.client.zRange(indexKey, 0, -1, { REV: true });

    const results = [];
    for (const id of ids) {
      const key = `${this.keyPrefix}${id}`;
      const data = await this.client.get(key);
      if (data) {
        const cp = JSON.parse(data);
        results.push({
          id: cp.id,
          timestamp: cp.timestamp,
          sessionId: cp.sessionId,
        });
      }
    }

    return results;
  }

  async delete(checkpointId: string): Promise<void> {
    await this.ensureConnected();

    const key = `${this.keyPrefix}${checkpointId}`;
    const data = await this.client.get(key);

    if (data) {
      const cp = JSON.parse(data);
      if (cp.sessionId) {
        const sessionKey = `${this.keyPrefix}session:${cp.sessionId}`;
        await this.client.sRem(sessionKey, checkpointId);
      }
    }

    await this.client.del(key);

    const indexKey = `${this.keyPrefix}index`;
    await this.client.zRem(indexKey, checkpointId);
  }

  async listBySession(sessionId: string): Promise<Array<{ id: string; timestamp: number }>> {
    await this.ensureConnected();

    const sessionKey = `${this.keyPrefix}session:${sessionId}`;
    const ids = await this.client.sMembers(sessionKey);

    const results = [];
    for (const id of ids) {
      const key = `${this.keyPrefix}${id}`;
      const data = await this.client.get(key);
      if (data) {
        const cp = JSON.parse(data);
        results.push({ id: cp.id, timestamp: cp.timestamp });
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}
