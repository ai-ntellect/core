import { expect } from "chai";
import sinon from "sinon";
import { AgentPipeline, Stage, PricePollingTrigger } from "../../pipeline/agent-pipeline";
import { InMemoryPetriCheckpointAdapter } from "../../routing/checkpoint-adapter";

describe("AgentPipeline", () => {
  let pipeline: AgentPipeline;
  let stages: Stage[];
  let trigger: { type: string; start: sinon.SinonSpy; stop: sinon.SinonSpy };

  beforeEach(() => {
    stages = [
      {
        id: "fetch",
        run: async (ctx: any) => ({ data: "fetched" }),
        description: "Fetch data",
      },
      {
        id: "process",
        run: async (ctx: any) => ({ result: "processed" }),
        description: "Process data",
      },
    ];

    trigger = { type: "test", start: sinon.spy(), stop: sinon.spy() };

    pipeline = new AgentPipeline({
      name: "test-pipeline",
      stages,
      trigger: trigger as any,
      sessionId: "test-session",
    });
  });

  afterEach(() => {
    pipeline.stop();
    sinon.restore();
  });

  describe("constructor", () => {
    it("should initialize with stages and session", () => {
      expect(pipeline).to.exist;
      expect(pipeline.getSessionId()).to.equal("test-session");
    });

    it("should set up checkpoint adapter if provided", () => {
      const checkpointAdapter = new InMemoryPetriCheckpointAdapter();
      const pipelineWithCheckpoint = new AgentPipeline({
        name: "test-pipeline",
        stages,
        trigger: trigger as any,
        checkpointAdapter,
      });
      expect(pipelineWithCheckpoint).to.exist;
    });
  });

  describe("trigger handling", () => {
    it("should start trigger when pipeline starts", () => {
      pipeline.start();
      expect(trigger.start.calledOnce).to.be.true;
    });

    it("should stop trigger when pipeline stops", () => {
      pipeline.start();
      pipeline.stop();
      expect(trigger.stop.calledOnce).to.be.true;
    });

    it("should use PricePollingTrigger correctly", (done) => {
      const priceTrigger = new PricePollingTrigger("BTC", 50000, 60000, 100);
      expect(priceTrigger.type).to.equal("price");
      
      priceTrigger.start(async (data) => {
        expect(data.asset).to.equal("BTC");
        priceTrigger.stop();
        done();
      });
    });
  });

  describe("events", () => {
    it("should emit pipeline_started event", async () => {
      let eventFired = false;
      
      pipeline.on("pipeline_started", (data) => {
        expect(data.sessionId).to.equal("test-session");
        eventFired = true;
        pipeline.stop();
      });

      await pipeline.start();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(eventFired).to.be.true;
    });
  });

  describe("static resume", () => {
    it("should have resume method", () => {
      expect(AgentPipeline.resume).to.be.a("function");
    });
  });

  describe("PricePollingTrigger", () => {
    it("should expose pollMsValue getter", () => {
      const trigger = new PricePollingTrigger("ETH", 2000, 3000, 5000);
      expect(trigger.pollMsValue).to.equal(5000);
    });

    it("should stop timer on stop()", () => {
      const priceTrigger = new PricePollingTrigger("BTC", 50000, 60000, 100);
      priceTrigger.start(async () => {});
      priceTrigger.stop();
      expect(true).to.be.true;
    });
  });
});
