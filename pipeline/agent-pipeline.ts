import { CortexFlowOrchestrator, Session } from "../routing/orchestrator";
import { TransitionAction } from "../routing";
import { ToolRegistry } from "../execution/registry";
import { GraphFlow } from "../execution";
import { z, ZodSchema } from "zod";
import { IPetriCheckpointAdapter } from "../routing/checkpoint-adapter";
import { EventEmitter } from "events";
import logger from "../utils/logger";

export type AgentFn<T = any> = (ctx: T) => Promise<Partial<T>>;

export interface Stage<T = any> {
  id: string;
  run: AgentFn<T>;
  description?: string;
  inputSchema?: ZodSchema<any>;
  retry?: { max: number; delayMs: number };
}

/**
 * Interface for extensible triggers that can start/stop listening for events.
 * Implement this to create custom triggers (webhook, cron, message queue, etc.)
 * 
 * @example
 * class WebhookTrigger implements Trigger {
 *   type = "webhook";
 *   private server?: any;
 *   
 *   start(listener: (data?: any) => void | Promise<void>): void {
 *     this.server = http.createServer((req, res) => {
 *       listener({ body: req.body });
 *       res.end("ok");
 *     }).listen(3000);
 *   }
 *   
 *   stop(): void {
 *     this.server?.close();
 *   }
 * }
 */
export interface Trigger {
  type: string;
  start(listener: (data?: any) => void | Promise<void>): void;
  stop(): void;
}

export class PricePollingTrigger implements Trigger {
  type = "price" as const;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private asset: string,
    private low: number,
    private high: number,
    private pollMs: number = 10000
  ) {}

  start(listener: (data?: any) => void | Promise<void>): void {
    this.timer = setInterval(async () => {
      await listener({
        asset: this.asset,
        triggerZone: `${this.low}-${this.high}`,
        triggerPrice: (this.low + this.high) / 2,
      });
    }, this.pollMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  get pollMsValue(): number {
    return this.pollMs;
  }
}

export interface AgentPipelineConfig<T = any> {
  name: string;
  trigger: Trigger;
  stages: Stage<T>[];
  gate?: "human" | "auto";
  onApprove?: (ctx: T) => Promise<void>;
  checkpointAdapter?: IPetriCheckpointAdapter;
  sessionId?: string;
  contextSchema?: ZodSchema<T>;
}

export class AgentPipeline<T extends Record<string, any> = Record<string, any>> {
  private orchestrator: CortexFlowOrchestrator;
  private registry: ToolRegistry;
  private eventEmitter: EventEmitter;
  private config: AgentPipelineConfig<T>;
  private sessionId: string;
  private ctxSchema: ZodSchema<any>;
  private isAwaitingApproval = false;
  private cooldownUntil = 0;
  private executionInProgress = false;
  private cooldownTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: AgentPipelineConfig<T>) {
    this.config = config;
    this.registry = new ToolRegistry();
    this.orchestrator = new CortexFlowOrchestrator(config.name, this.registry);
    this.eventEmitter = new EventEmitter();
    this.sessionId = config.sessionId || `pipeline_${Date.now()}`;

    this.ctxSchema = config.contextSchema || z.record(z.string(), z.unknown());

    this.buildPipeline();
    this.setupCheckpoint(config.checkpointAdapter);
  }

  private buildPipeline(): void {
    const { stages, gate } = this.config;
    const net = this.orchestrator.petri;

    net.addPlace({ id: "idle", type: "initial", tokens: [{ id: "t0", data: {}, createdAt: Date.now() }] });
    net.addPlace({ id: "finished", type: "final", tokens: [] });
    if (gate === "human") {
      net.addPlace({ id: "awaiting_human", type: "normal", tokens: [] });
    }

    this.registerStagesAsTools(stages);

    const places: string[] = ["idle"];
    for (let i = 0; i < stages.length; i++) {
      if (i < stages.length - 1) {
        const placeId = `after_${stages[i].id}`;
        net.addPlace({ id: placeId, type: "normal", tokens: [] });
        places.push(placeId);
      }
    }

    for (let i = 0; i < stages.length; i++) {
      const from = places[i];
      const isLast = i === stages.length - 1;
      const to = isLast
        ? (gate === "human" ? "awaiting_human" : "finished")
        : `after_${stages[i].id}`;

      net.addTransition({
        id: `${stages[i].id}_run`,
        from: [from],
        to: [to],
        action: {
          type: "graphflow",
          name: stages[i].id,
        } satisfies TransitionAction,
      });
    }

    if (gate === "human") {
      net.addTransition({ id: "approve", from: ["awaiting_human"], to: "finished" });
      net.addTransition({ id: "reject", from: ["awaiting_human"], to: "idle" });
    }

    net.addTransition({ id: "reset", from: ["finished"], to: "idle" });

    this.orchestrator.startSession(this.sessionId);
  }

  private registerStagesAsTools(stages: Stage<T>[]): void {
    for (const stage of stages) {
      const stageSchema = stage.inputSchema || this.ctxSchema;
      const graph = new GraphFlow<any>({
        name: stage.id,
        nodes: [
          {
            name: stage.id,
            execute: async (ctx: any) => {
              const result = await this.executeStageWithRetry(stage, ctx);
              return { ...ctx, ...result };
            },
          },
        ],
        schema: stageSchema,
        context: {},
      });
      this.registry.register({
        name: stage.id,
        description: stage.description || `Stage: ${stage.id}`,
        graph,
        startNode: stage.id,
      });
    }
  }

  private async executeStageWithRetry(stage: Stage<T>, ctx: any): Promise<Partial<T>> {
    const maxRetries = stage.retry?.max ?? 0;
    const delayMs = stage.retry?.delayMs ?? 1000;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await stage.run(ctx as T);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          this.emitEvent("stage_retry", { stageId: stage.id, attempt: attempt + 1, error: (err as Error).message });
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    throw lastError;
  }

  private setupCheckpoint(adapter?: IPetriCheckpointAdapter): void {
    if (adapter) {
      this.orchestrator.setPetriCheckpointAdapter(adapter);
    }
  }

  async start(): Promise<void> {
    this.config.trigger.start(async (data) => {
      await this.handleTrigger(data);
    });
    this.emitEvent("pipeline_started", { sessionId: this.sessionId, pipeline: this.config.name });
  }

  private async handleTrigger(data?: any): Promise<void> {
    if (this.executionInProgress || this.isAwaitingApproval) return;

    const session = this.orchestrator.getSession(this.sessionId);
    if (!session) return;

    const currentPlace = this.getCurrentPlace(session);
    if (currentPlace !== "idle" || Date.now() < this.cooldownUntil) return;

    this.executionInProgress = true;

    if (data) {
      session.context = { ...session.context, ...data };
    }
    await this.executePipeline();
  }

  private async executePipeline(): Promise<void> {
    try {
      for (const stage of this.config.stages) {
        await this.fireTransition(`${stage.id}_run`);
      }

      if (this.config.gate === "human") {
        this.isAwaitingApproval = true;
        this.executionInProgress = false;
        this.emitEvent("awaiting_approval", { sessionId: this.sessionId });
        return;
      }

      await this.completeExecution();
    } catch (err: any) {
      this.executionInProgress = false;
      this.emitEvent("pipeline_error", { error: err.message });
      
      // Fatal error: emit pipeline_failed and stop trigger to prevent inconsistent state
      this.emitEvent("pipeline_failed", { sessionId: this.sessionId, error: err.message });
      this.stop();
      
      throw err;
    }
  }

  private async completeExecution(): Promise<void> {
    this.emitEvent("pipeline_completed", { sessionId: this.sessionId });

    const pollMs = this.getPollMs();
    if (pollMs) {
      this.cooldownUntil = Date.now() + pollMs;
      this.scheduleResetAfterCooldown(pollMs);
    } else {
      await this.fireTransition("reset");
      this.executionInProgress = false;
    }
  }

  private getPollMs(): number {
    if (this.config.trigger instanceof PricePollingTrigger) {
      return this.config.trigger.pollMsValue;
    }
    return 0;
  }

  private scheduleResetAfterCooldown(pollMs: number): void {
    this.cooldownTimeout = setTimeout(async () => {
      this.cooldownUntil = 0;
      try {
        await this.fireTransition("reset");
      } catch (err) {
        // Token might already be in idle (after reject)
        logger.warn({ error: (err as Error).message }, "Reset transition failed, might already be in idle");
      }
      this.emitEvent("pipeline_reset", { sessionId: this.sessionId });
      this.executionInProgress = false;
    }, pollMs);
  }

  async approve(ctxUpdate?: Partial<T>): Promise<void> {
    if (!this.isAwaitingApproval) throw new Error("Not awaiting approval");
    this.isAwaitingApproval = false;

    const session = this.orchestrator.getSession(this.sessionId);
    if (!session) throw new Error("Session not found");

    if (ctxUpdate) {
      session.context = { ...session.context, ...ctxUpdate };
    }

    if (this.config.onApprove) {
      await this.config.onApprove(session.context as T);
    }

    await this.fireTransition("approve");
    await this.completeExecution();
  }

  async reject(): Promise<void> {
    if (!this.isAwaitingApproval) throw new Error("Not awaiting approval");
    this.isAwaitingApproval = false;

    await this.fireTransition("reject");
    this.emitEvent("pipeline_rejected", { sessionId: this.sessionId });

    const pollMs = this.getPollMs();
    if (pollMs) {
      this.cooldownUntil = Date.now() + pollMs;
      this.scheduleRestartAfterCooldown(pollMs);
    } else {
      this.executionInProgress = false;
    }
  }

  private scheduleRestartAfterCooldown(pollMs: number): void {
    this.cooldownTimeout = setTimeout(() => {
      this.cooldownUntil = 0;
      this.emitEvent("pipeline_reset", { sessionId: this.sessionId });
      this.executionInProgress = false;
    }, pollMs);
  }

  private async fireTransition(transitionId: string): Promise<void> {
    const session = this.orchestrator.getSession(this.sessionId);
    if (!session) throw new Error("Session not found");

    const result = await this.orchestrator.fire(transitionId, this.sessionId, session.context);
    if (!result.success) throw new Error(`Transition ${transitionId} failed: ${result.error}`);

    this.emitEvent("transition_fired", { transitionId, sessionId: this.sessionId });

    if (this.config.checkpointAdapter) {
      await this.orchestrator.savePetriState(this.sessionId);
    }
  }

  private getCurrentPlace(session: Session): string {
    const marking = (session.petriNet as any).state?.marking;
    if (marking) {
      for (const [id, tokens] of marking.entries()) {
        if (Array.isArray(tokens) && tokens.length > 0) return id;
      }
    }
    return "idle";
  }

  private emitEvent(event: string, data: any): void {
    this.eventEmitter.emit(event, data);
    logger.info({ event, ...data }, `Pipeline event: ${event}`);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  isAwaitingHumanApproval(): boolean {
    return this.isAwaitingApproval;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getContext(): T {
    const session = this.orchestrator.getSession(this.sessionId);
    return session?.context as T;
  }

  stop(): void {
    this.config.trigger.stop();
    if (this.cooldownTimeout) {
      clearTimeout(this.cooldownTimeout);
    }
    this.emitEvent("pipeline_stopped", { pipeline: this.config.name });
  }

  static async resume(
    sessionId: string,
    checkpointAdapter: IPetriCheckpointAdapter,
    config: AgentPipelineConfig<any>
  ): Promise<AgentPipeline<any>> {
    const pipeline = new AgentPipeline(config);
    const restoredSessionId = await pipeline.orchestrator.restorePetriState(sessionId);
    if (restoredSessionId) {
      pipeline.sessionId = restoredSessionId;
      const session = pipeline.orchestrator.getSession(restoredSessionId);
      if (session) {
        const place = pipeline.getCurrentPlace(session);
        if (place === "awaiting_human") {
          pipeline.isAwaitingApproval = true;
        } else if (place === "finished") {
          const pollMs = pipeline.getPollMs();
          if (pollMs) {
            pipeline.cooldownUntil = Date.now() + pollMs;
            pipeline.scheduleResetAfterCooldown(pollMs);
          }
        }
      }
    }
    return pipeline;
  }
}

export function priceZone(asset: string, low: number, high: number, pollMs?: number): PricePollingTrigger {
  return new PricePollingTrigger(asset, low, high, pollMs);
}

// Backward compatibility
export type PriceTrigger = PricePollingTrigger;
