import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { PetriNet } from '../../routing/index';
import { Transition, Token } from '../../routing/types';

describe('PetriNet', () => {
  let net: PetriNet;

  beforeEach(() => {
    net = new PetriNet('test');
  });

  it('should create an empty net', () => {
    expect(net.name).to.equal('test');
    expect(net.places.size).to.equal(0);
  });

  it('should add places and initial tokens', () => {
    net.addPlace({ id: 'start', type: 'initial', tokens: [] });
    net.addPlace({
      id: 'p1',
      type: 'normal',
      tokens: [{ id: 't1', data: {}, createdAt: Date.now() }],
    });
    expect(net.places.get('start')!.tokens).to.be.empty;
    expect(net.places.get('p1')!.tokens).to.have.lengthOf(1);
  });

  it('should fire a transition and move tokens', async () => {
    net.addPlace({
      id: 'start',
      type: 'initial',
      tokens: [{ id: 't0', data: { value: 10 }, createdAt: 0 }],
    });
    net.addPlace({ id: 'end', type: 'final', tokens: [] });
    net.addTransition({ id: 't1', from: ['start'], to: 'end' });

    const res = await net.fireTransition('t1');
    expect(res.success).to.be.true;
    expect(res.consumedTokens).to.have.lengthOf(1);
    expect(res.producedTokens).to.have.lengthOf(1);
    expect(res.producedTokens[0].data).to.deep.equal({ value: 10 });
    expect(net.state.marking.get('start')!).to.be.empty;
    expect(net.state.marking.get('end')!).to.have.lengthOf(1);
  });

  it('should detect deadlock when no transition enabled', () => {
    const net2 = new PetriNet('dead');
    net2.addPlace({
      id: 'p',
      type: 'initial',
      tokens: [{ id: 't', data: {}, createdAt: 0 }],
    });
    expect(net2.detectDeadlock()).to.be.true;
  });

  it('should pass boundedness for a safe workflow', () => {
    net.addPlace({ id: 'start', type: 'initial', tokens: [] });
    net.addPlace({ id: 'p1', type: 'normal', tokens: [] });
    net.addPlace({ id: 'p2', type: 'normal', tokens: [] });
    net.addPlace({ id: 'end', type: 'final', tokens: [] });

    net.addTransition({ id: 't1', from: ['start'], to: ['p1', 'p2'] });
    net.addTransition({ id: 't2', from: ['p1', 'p2'], to: 'end' });

    const result = net.validateBoundedness();
    expect(result.bounded).to.be.true;
  });

  it('should detect unboundedness for a token generator', () => {
    const net2 = new PetriNet('unbounded');
    net2.addPlace({
      id: 'p',
      type: 'normal',
      tokens: [{ id: 't0', data: {}, createdAt: 0 }],
    });
    net2.addTransition({ id: 't1', from: [], to: 'p' });

    const result = net2.validateBoundedness();
    expect(result.bounded).to.be.false;
  });

  it('should evaluate deterministic guard', async () => {
    net.addPlace({
      id: 'start',
      type: 'initial',
      tokens: [{ id: 't0', data: { amount: 500 }, createdAt: 0 }],
    });
    net.addPlace({ id: 'ok', type: 'normal', tokens: [] });
    net.addTransition({
      id: 'check',
      from: ['start'],
      to: 'ok',
      guard: { type: 'deterministic', condition: 'amount > 1000' },
    });

    const res = await net.fireTransition('check');
    expect(res.success).to.be.false;

    net.state.marking.get('start')![0].data.amount = 1500;
    const res2 = await net.fireTransition('check');
    expect(res2.success).to.be.true;
  });

  it('should distribute tokens to multiple output places', async () => {
    net.addPlace({
      id: 'in',
      type: 'initial',
      tokens: [{ id: 't0', data: {}, createdAt: 0 }],
    });
    net.addPlace({ id: 'out1', type: 'normal', tokens: [] });
    net.addPlace({ id: 'out2', type: 'normal', tokens: [] });
    net.addTransition({ id: 'fork', from: ['in'], to: ['out1', 'out2'] });

    await net.fireTransition('fork');
    expect(net.state.marking.get('in')!).to.be.empty;
    expect(net.state.marking.get('out1')!).to.have.lengthOf(1);
    expect(net.state.marking.get('out2')!).to.have.lengthOf(1);
  });

  it('should fire transition with LLM guard and action', async () => {
    net.addPlace({
      id: 'start',
      type: 'initial',
      tokens: [{ id: 't0', data: { msg: 'hello' }, createdAt: 0 }],
    });
    net.addPlace({ id: 'end', type: 'final', tokens: [] });

    const transition: Transition = {
      id: 'process',
      from: ['start'],
      to: 'end',
      guard: { type: 'llm_evaluated', condition: 'Is this valid?' },
      action: { type: 'graphflow', name: 'echo' },
    };
    net.addTransition(transition);

    let actionCalled = false;
    net.setActionExecutor(async (action, ctx) => {
      actionCalled = true;
      expect(action.type).to.equal('graphflow');
      expect(ctx.msg).to.equal('hello');
      return { echoed: ctx.msg };
    });

    net.setLLMExecutor(async (prompt, ctx) => {
      expect(prompt).to.equal('Is this valid?');
      return true;
    });

    const res = await net.fireTransitionWithAction('process');
    expect(res.success).to.be.true;
    expect(actionCalled).to.be.true;
    expect(res.actionResult).to.deep.equal({ echoed: 'hello' });
  });
});
