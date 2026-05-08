import { expect } from 'chai';
import { describe, it } from 'mocha';
import { IntentClassifier, IntentClassifierFn } from '../../routing/intent-classifier';

describe('IntentClassifier', () => {
  it('should classify a simple intent', async () => {
    const mockLLM = async (prompt: string) => {
      return JSON.stringify({
        intent: 'APPROVE',
        confidence: 0.95,
        entities: { id: 'task_123' },
      });
    };

    const classifier = new IntentClassifier(mockLLM);
    const result = await classifier.classify('Approve task T-123');

    expect(result.intent).to.equal('APPROVE');
    expect(result.confidence).to.be.above(0.9);
    expect(result.entities).to.deep.equal({ id: 'task_123' });
  });

  it('should return UNKNOWN on LLM failure', async () => {
    const mockLLM = async (prompt: string) => {
      throw new Error('LLM unavailable');
    };

    const classifier = new IntentClassifier(mockLLM);
    const result = await classifier.classify('Some message');

    expect(result.intent).to.equal('UNKNOWN');
    expect(result.confidence).to.equal(0);
  });

  it('should handle low confidence (ambiguity)', async () => {
    const mockLLM = async (prompt: string) => {
      return JSON.stringify({
        intent: 'QUERY',
        confidence: 0.4,
        entities: {},
      });
    };

    const classifier = new IntentClassifier(mockLLM, {
      confidenceThreshold: 0.6,
    });
    const result = await classifier.classify('What is the status?');
    expect(result.confidence).to.be.below(0.6);
    expect(classifier.getConfidenceThreshold()).to.equal(0.6);
  });

  it('should include turn history in context', async () => {
    let capturedPrompt = '';
    const mockLLM = async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        intent: 'CANCEL',
        confidence: 0.85,
        entities: {},
      });
    };

    const classifier = new IntentClassifier(mockLLM);
    await classifier.classify('Cancel my order', {
      turnHistory: ['I want to order', 'Here is your order #456'],
    });

    expect(capturedPrompt).to.include('order #456');
    expect(capturedPrompt).to.include('Recent history');
  });

  it('should use custom intents list', async () => {
    const mockLLM = async (prompt: string) => {
      return JSON.stringify({
        intent: 'GREETING',
        confidence: 0.9,
        entities: {},
      });
    };

    const classifier = new IntentClassifier(mockLLM, {
      intents: ['GREETING', 'FAREWELL', 'UNKNOWN'],
    });
    const result = await classifier.classify('Hello there!');
    expect(result.intent).to.equal('GREETING');
  });

  it('should work as IntentClassifierFn', async () => {
    const mockLLM = async (prompt: string) => {
      return JSON.stringify({
        intent: 'APPROVE',
        confidence: 0.9,
        entities: {},
      });
    };

    const classifier = new IntentClassifier(mockLLM);
    const fn: IntentClassifierFn = IntentClassifier.toFn(classifier);
    const result = await fn('Approve this', { turnHistory: ['Previous message'] });
    expect(result.intent).to.equal('APPROVE');
  });
});
