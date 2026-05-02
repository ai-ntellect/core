import { PetriNet, TransitionResult } from "./index";

export type PipelinePlace = "idle" | "awaiting_human" | "executing" | "completed" | "cooldown" | string;

export interface PipelineStage {
  id: string;
  run: (ctx: Record<string, any>) => Promise<Record<string, any>>;
}

export interface AgentPipelineConfig {
  name: string;
  stages: PipelineStage[];
  gate?: "human" | "auto";
  onApprove?: (ctx: Record<string, any>) => Promise<void>;
  onReject?: (ctx: Record<string, any>) => void;
}

export class AgentPipeline {
  private net: PetriNet;
  private place: PipelinePlace = "idle";

  constructor(private config: AgentPipelineConfig) {
    this.net = this.buildNet();
    this.net.state.marking.set("idle", [{ id: "t0", data: {}, createdAt: Date.now() }]);
  }

  private buildNet(): PetriNet {
    const net = new PetriNet(this.config.name);
    const { stages, gate } = this.config;

    // Places
    net.addPlace({ id: "idle", type: "initial", tokens: [] });
    stages.forEach(s => net.addPlace({ id: s.id, type: "normal", tokens: [] }));
    if (gate === "human") net.addPlace({ id: "awaiting_human", type: "normal", tokens: [] });
    net.addPlace({ id: "executing", type: "normal", tokens: [] });
    net.addPlace({ id: "completed", type: "final", tokens: [] });
    net.addPlace({ id: "cooldown", type: "normal", tokens: [] });

    // Transitions
    net.addTransition({ id: "trigger", from: ["idle"], to: stages[0].id });
    for (let i = 0; i < stages.length; i++) {
      const from = i === 0 ? "idle" : stages[i - 1].id;
      net.addTransition({ id: `${stages[i].id}_done`, from: [from], to: stages[i].id });
    }
    const last = stages[stages.length - 1].id;
    if (gate === "human") {
      net.addTransition({ id: "to_human", from: [last], to: "awaiting_human" });
      net.addTransition({ id: "approve", from: ["awaiting_human"], to: "executing" });
      net.addTransition({ id: "reject", from: ["awaiting_human"], to: "cooldown" });
    } else {
      net.addTransition({ id: "to_execute", from: [last], to: "executing" });
    }
    net.addTransition({ id: "done", from: ["executing"], to: "completed" });
    net.addTransition({ id: "reset", from: ["completed", "cooldown"], to: "idle" });

    return net;
  }

  async run(ctx: Record<string, any> = {}): Promise<Record<string, any>> {
    await this.fire("trigger");
    for (const stage of this.config.stages) {
      const result = await stage.run(ctx);
      Object.assign(ctx, result);
      await this.fire(`${stage.id}_done`);
    }

    if (this.config.gate === "human") {
      await this.fire("to_human");
      if (this.config.onApprove) await this.config.onApprove(ctx);
      await this.fire("approve");
    } else {
      await this.fire("to_execute");
    }

    await this.fire("done");
    return ctx;
  }

  private async fire(id: string): Promise<void> {
    const r = await this.net.fireTransition(id);
    if (!r.success) throw new Error(`Transition ${id} failed: ${r.error}`);
    this.place = this.currentPlace();
  }

  private currentPlace(): PipelinePlace {
    for (const [id, tokens] of this.net.state.marking.entries()) {
      if (tokens.length > 0) return id as PipelinePlace;
    }
    return "idle";
  }

  getNet(): PetriNet { return this.net; }
  getPlace(): PipelinePlace { return this.place; }
}
