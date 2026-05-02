import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { PetriNet, TransitionAction } from '../../petri/index';
import { CortexFlowOrchestrator } from '../../petri/orchestrator';
import { ToolRegistry } from '../../graph/registry';
import { GraphFlow } from '../../graph/index';
import { z } from 'zod';

describe('CortexFlow Integration - Mail Assistant', () => {
  let orchestrator: CortexFlowOrchestrator;
  let toolRegistry: ToolRegistry;
  let net: PetriNet;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    orchestrator = new CortexFlowOrchestrator('mail_assistant', toolRegistry);

    net = orchestrator.petri;
    net.addPlace({ id: 'idle', type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
    net.addPlace({ id: 'fetched', type: 'normal', tokens: [] });
    net.addPlace({ id: 'summarized', type: 'normal', tokens: [] });
    net.addPlace({ id: 'done', type: 'final', tokens: [] });
    net.addPlace({ id: 'error', type: 'final', tokens: [] });

    net.addTransition({
      id: 'fetch',
      from: ['idle'],
      to: 'fetched',
      action: {
        type: 'graphflow',
        name: 'fetch_and_summarize',
        contextMapper: (ctx) => ({ maxMails: ctx.maxMails || 5 }),
      } as TransitionAction,
    });

    net.addTransition({
      id: 'summarize',
      from: ['fetched'],
      to: 'summarized',
      action: {
        type: 'graphflow',
        name: 'fetch_and_summarize',
        contextMapper: (ctx) => ({ mails: ctx.fetchedMails }),
      } as TransitionAction,
    });

    net.addTransition({
      id: 'complete',
      from: ['summarized'],
      to: 'done',
    });

    net.addTransition({
      id: 'fail',
      from: ['fetched', 'summarized'],
      to: 'error',
    });
  });

  it('should execute a simple GraphFlow action via Petri transition', async () => {
    let mailsFetched = false;
    let summaryGenerated = false;

    const fetchGraph = new GraphFlow<any>({
      name: 'fetch_mails',
      context: { maxMails: 5 },
      schema: z.object({ maxMails: z.number() }).passthrough(),
      nodes: [
        {
          name: 'fetch_mails',
          execute: async (ctx: any) => {
            mailsFetched = true;
            ctx.fetchedMails = [
              { id: 1, subject: 'Hello', body: 'World' },
              { id: 2, subject: 'Test', body: 'Content' },
            ];
          },
          next: 'summarize_mail',
        },
        {
          name: 'summarize_mail',
          execute: async (ctx: any) => {
            summaryGenerated = true;
            ctx.summary = `Summary of ${ctx.fetchedMails.length} mails`;
          },
        },
      ],
      entryNode: 'fetch_mails',
    });

    toolRegistry.register({
      name: 'fetch_and_summarize',
      description: 'Fetch and summarize mails',
      graph: fetchGraph,
      startNode: 'fetch_mails',
    });

    const sessionId = orchestrator.startSession();
    const result = await orchestrator.fire('fetch', sessionId, { maxMails: 5 });

    expect(result.success).to.be.true;
    expect(mailsFetched).to.be.true;
    expect(summaryGenerated).to.be.true;
    expect(result.actionResult).to.have.property('summary');

    // Check the session's PetriNet (not the original)
    const session = orchestrator.getSession(sessionId)!;
    expect(session.petriNet.state.marking.get('fetched')).to.have.lengthOf(1);
  });

  it('should handle GraphFlow timeout', async () => {
    const slowGraph = new GraphFlow<any>({
      name: 'slow_graph',
      context: {},
      schema: z.object({}).passthrough(),
      nodes: [
        {
          name: 'slow_node',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));
          },
        },
      ],
      entryNode: 'slow_node',
    });

    toolRegistry.register({
      name: 'slow_action',
      description: 'A slow action',
      graph: slowGraph,
      startNode: 'slow_node',
    });

    net.addTransition({
      id: 'slow_transition',
      from: ['idle'],
      to: 'done',
      action: {
        type: 'graphflow',
        name: 'slow_action',
        timeout: 100,
      } as any,
    });

    const sessionId = orchestrator.startSession();
    try {
      await orchestrator.fire('slow_transition', sessionId);
      expect.fail('Should have thrown timeout error');
    } catch (error: any) {
      expect(error.message).to.include('timeout');
    }
  });

  it('should handle GraphFlow execution error', async () => {
    const errorGraph = new GraphFlow<any>({
      name: 'error_graph',
      context: {},
      schema: z.object({}).passthrough(),
      nodes: [
        {
          name: 'error_node',
          execute: async () => {
            throw new Error('Simulated failure');
          },
        },
      ],
      entryNode: 'error_node',
    });

    toolRegistry.register({
      name: 'error_action',
      description: 'An action that fails',
      graph: errorGraph,
      startNode: 'error_node',
    });

    net.addTransition({
      id: 'error_transition',
      from: ['idle'],
      to: 'done',
      action: {
        type: 'graphflow',
        name: 'error_action',
      } as TransitionAction,
    });

    const sessionId = orchestrator.startSession();
    const result = await orchestrator.fire('error_transition', sessionId);

    expect(result.success).to.be.false;
    expect(result.error).to.include('Simulated failure');
  });

  it('should not detect deadlock with event-driven transitions', () => {
    const eventNet = new PetriNet('event_test');
    eventNet.addPlace({ id: 'start', type: 'initial', tokens: [{ id: 't0', data: {}, createdAt: 0 }] });
    eventNet.addPlace({ id: 'waiting', type: 'normal', tokens: [] });

    eventNet.addTransition({
      id: 'wait_for_approval',
      from: ['start'],
      to: 'waiting',
      when: { events: ['human_approved'], timeout: 30000 },
    });

    expect(eventNet.detectDeadlock()).to.be.false;
  });

  it('should execute dynamic action with LLM mock', async () => {
    let llmCalled = false;

    orchestrator.setLLMCall(async (prompt: string) => {
      llmCalled = true;
      return JSON.stringify({
        goal: 'Process request',
        steps: [{ node: 'echo', params: { message: 'processed' } }],
      });
    });

    const echoGraph = new GraphFlow<any>({
      name: 'echo_graph',
      context: {},
      schema: z.object({}).passthrough(),
      nodes: [
        {
          name: 'echo',
          execute: async (ctx: any) => {
            ctx.result = ctx.message;
          },
        },
      ],
      entryNode: 'echo',
    });

    toolRegistry.register({
      name: 'echo',
      description: 'Echo action',
      graph: echoGraph,
      startNode: 'echo',
    });

    net.addTransition({
      id: 'dynamic_transition',
      from: ['idle'],
      to: 'done',
      action: {
        type: 'dynamic',
        prompt: 'Process this request',
        maxSteps: 1,
        timeout: 5000,
      } as TransitionAction,
    });

    const sessionId = orchestrator.startSession();
    const result = await orchestrator.fire('dynamic_transition', sessionId);

    expect(result.success).to.be.true;
    expect(llmCalled).to.be.true;
    expect(result.actionResult).to.have.property('result', 'processed');
  });
});
