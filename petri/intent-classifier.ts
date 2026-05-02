import { z } from 'zod';

/**
 * Structured result returned by an intent classification pass.
 */
export interface IntentResult {
  /** Canonical intent label (one of the registered intents, or `"UNKNOWN"`). */
  intent: string;
  /** Confidence score in [0, 1]. Values below the configured threshold trigger clarification. */
  confidence: number;
  /** Free-form entity map extracted alongside the intent. */
  entities: Record<string, any>;
  /** Turn history that was fed to the classifier, useful for debugging. */
  turnHistory?: string[];
}

/**
 * Function-form of an intent classifier, compatible with `CortexFlowOrchestrator.setIntentClassifier`.
 *
 * @param message - Raw user message.
 * @param context - Optional context carrying recent turn history.
 * @returns Resolved intent result.
 */
export type IntentClassifierFn = (
  message: string,
  context?: { turnHistory?: string[] }
) => Promise<IntentResult>;

/** Zod schema used to validate the raw JSON returned by the LLM. */
const IntentSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string(), z.any()).optional(),
});

/**
 * LLM-backed intent classifier for the CortexFlow orchestration layer.
 *
 * The classifier sends a single prompt to an LLM and expects a JSON reply
 * conforming to `{ intent, confidence, entities }`. The response is validated
 * with Zod; any parse failure falls back to `UNKNOWN` with zero confidence.
 *
 * Keeping classification to **one LLM call per user turn** is a core design
 * principle — all subsequent routing is done deterministically by the Petri net.
 *
 * @example
 * ```ts
 * const classifier = new IntentClassifier(llmFn, {
 *   intents: ['FETCH_MAILS', 'SUMMARIZE', 'ARCHIVE'],
 *   confidenceThreshold: 0.7,
 * });
 *
 * const result = await classifier.classify('Please fetch my latest 5 emails');
 * // { intent: 'FETCH_MAILS', confidence: 0.95, entities: { maxMails: 5 } }
 * ```
 */
export class IntentClassifier {
  private llmCall: (prompt: string) => Promise<string>;
  private intents: string[];
  private confidenceThreshold: number;

  /**
   * @param llmCall - Function that forwards a prompt to an LLM and returns its text response.
   * @param options.intents - List of valid intent labels the LLM must choose from.
   *   Defaults to common workflow intents if not provided.
   * @param options.confidenceThreshold - Minimum confidence to avoid triggering clarification.
   *   Defaults to `0.6`.
   */
  constructor(
    llmCall: (prompt: string) => Promise<string>,
    options?: {
      intents?: string[];
      confidenceThreshold?: number;
    }
  ) {
    this.llmCall = llmCall;
    this.intents = options?.intents || [
      'CREATE', 'APPROVE', 'REJECT', 'QUERY', 'CANCEL', 'ESCALATE', 'UNKNOWN',
    ];
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.6;
  }

  /**
   * Classifies a user message into one of the registered intents.
   *
   * On JSON parse failure or Zod validation error, returns a safe fallback
   * `{ intent: "UNKNOWN", confidence: 0, entities: {} }` rather than throwing.
   *
   * @param message - Raw user message.
   * @param context - Optional context with recent turn history for multi-turn awareness.
   * @returns Validated intent result.
   */
  async classify(
    message: string,
    context?: { turnHistory?: string[] }
  ): Promise<IntentResult> {
    const turnHistory = context?.turnHistory || [];

    const prompt = `You are an intent classifier for a workflow system.
Available intents: ${this.intents.join(', ')}

Respond with JSON only in this format:
{"intent": "INTENT_NAME", "confidence": 0.0-1.0, "entities": {}}

User message: ${message}
${turnHistory.length > 0 ? `Recent history: ${JSON.stringify(turnHistory.slice(-5))}` : ''}

JSON response:`;

    try {
      const response = await this.llmCall(prompt);
      const parsed = JSON.parse(response);
      const result = IntentSchema.parse(parsed);

      return {
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities || {},
        turnHistory,
      };
    } catch {
      return { intent: 'UNKNOWN', confidence: 0, entities: {}, turnHistory };
    }
  }

  /** Returns the current confidence threshold. */
  getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  /** Overrides the confidence threshold at runtime. */
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = threshold;
  }

  /**
   * Converts this classifier instance into a plain `IntentClassifierFn`
   * suitable for `CortexFlowOrchestrator.setIntentClassifier`.
   *
   * @param classifier - Classifier instance to wrap.
   * @returns Functional form bound to the given instance.
   */
  static toFn(classifier: IntentClassifier): IntentClassifierFn {
    return (message, context) => classifier.classify(message, context);
  }

  /**
   * Generates a short clarifying question when the user's intent is ambiguous.
   *
   * Falls back to a generic question listing available intents if the LLM call fails.
   *
   * @param originalMessage - The user's original message that could not be classified.
   * @returns A single clarifying question string.
   */
  async generateClarification(originalMessage: string): Promise<string> {
    const prompt = `User said: "${originalMessage}". Possible intents: ${this.intents.join(', ')}.
Ask a short clarifying question to understand which action the user wants. Only return the question, nothing else.`;

    try {
      const response = await this.llmCall(prompt);
      return response.trim();
    } catch {
      const options = this.intents.filter(i => i !== 'UNKNOWN').join(', ');
      return `I didn't understand. Possible actions: ${options}. Which one do you want?`;
    }
  }
}
