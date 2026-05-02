import { PetriNet } from './index';
import { Session } from './orchestrator';
import { IPetriCheckpointAdapter } from './checkpoint-adapter';

export interface PostgresCheckpointAdapterOptions {
  connectionString: string;
  tableName?: string;
}

export class PostgresPetriCheckpointAdapter implements IPetriCheckpointAdapter {
  private connectionString: string;
  private tableName: string;
  private pool: any = null;
  private initialized: boolean = false;

  constructor(options: PostgresCheckpointAdapterOptions) {
    this.connectionString = options.connectionString;
    this.tableName = options.tableName || 'petri_checkpoints';
  }

  private async initPool(): Promise<void> {
    if (this.initialized) return;

    try {
      const pg = await (Function('moduleName', 'return import(moduleName)') as any)('pg');
      const { Pool } = pg;
      this.pool = new Pool({ connectionString: this.connectionString });

      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id VARCHAR(255) PRIMARY KEY,
            timestamp BIGINT NOT NULL,
            session_id VARCHAR(255),
            data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session ON ${this.tableName}(session_id);
          CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp DESC);
        `);
      } finally {
        client.release();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(
        'PostgreSQL adapter requires "pg" package. Install it with: pnpm add pg @types/pg'
      );
    }
  }

  async save(net: PetriNet, session?: Session): Promise<string> {
    await this.initPool();

    const checkpointId = `petri-cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const marking = (net as any).state.marking as Map<string, any[]>;
    const serializedMarking: any[] = [];
    for (const [pid, tokens] of marking) {
      serializedMarking.push({
        placeId: pid,
        tokens: tokens.map((t: any) => ({ id: t.id, data: t.data, createdAt: t.createdAt })),
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

    const sql = `
      INSERT INTO ${this.tableName} (id, timestamp, session_id, data)
      VALUES ($1, $2, $3, $4)
    `;
    await this.pool.query(sql, [
      checkpointId,
      checkpoint.timestamp,
      checkpoint.sessionId || null,
      JSON.stringify(checkpoint),
    ]);

    return checkpointId;
  }

  async load(checkpointId: string): Promise<{ net: PetriNet; session?: Session } | null> {
    await this.initPool();

    const sql = `SELECT data FROM ${this.tableName} WHERE id = $1`;
    const result = await this.pool.query(sql, [checkpointId]);

    if (result.rows.length === 0) return null;

    const cp = result.rows[0].data;
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
    await this.initPool();

    const sql = `
      SELECT id, timestamp, session_id as "sessionId"
      FROM ${this.tableName}
      ORDER BY timestamp DESC
    `;
    const result = await this.pool.query(sql);
    return result.rows.map((row: any) => ({
      id: row.id,
      timestamp: parseInt(row.timestamp),
      sessionId: row.sessionId,
    }));
  }

  async delete(checkpointId: string): Promise<void> {
    await this.initPool();
    const sql = `DELETE FROM ${this.tableName} WHERE id = $1`;
    await this.pool.query(sql, [checkpointId]);
  }

  async listBySession(sessionId: string): Promise<Array<{ id: string; timestamp: number }>> {
    await this.initPool();

    const sql = `
      SELECT id, timestamp
      FROM ${this.tableName}
      WHERE session_id = $1
      ORDER BY timestamp DESC
    `;
    const result = await this.pool.query(sql, [sessionId]);
    return result.rows.map((row: any) => ({
      id: row.id,
      timestamp: parseInt(row.timestamp),
    }));
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
    }
  }
}
