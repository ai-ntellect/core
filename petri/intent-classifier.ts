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
  /**
   * Optional list of multiple intents when the message contains several actions.
   * Each entry has its own intent label and confidence.
   * When present, the orchestrator will execute them sequentially.
   */
  intents?: Array<{ intent: string; confidence: number; entities?: Record<string, any> }>;
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

/**
 * Shared interface implemented by both `IntentClassifier` (LLM-backed) and
 * `HybridIntentClassifier` (rules-first, LLM fallback).
 *
 * The orchestrator depends only on this interface, never on a concrete class.
 */
export interface IIntentClassifier {
  classify(message: string, context?: { turnHistory?: string[] }): Promise<IntentResult>;
  generateClarification(originalMessage: string): Promise<string>;
  getConfidenceThreshold(): number;
}

// ---------------------------------------------------------------------------
// Keyword rule type (used by HybridIntentClassifier)
// ---------------------------------------------------------------------------

/**
 * A single keyword rule used by `HybridIntentClassifier`.
 *
 * A rule fires when at least one keyword matches. The confidence is scaled by
 * the fraction of keywords that matched, so rules with more keywords and more
 * matches score higher — making partial matches detectable but less trusted.
 */
export interface KeywordRule {
  /** Intent label to return when this rule matches. */
  intent: string;
  /** Keywords or phrases to look for (case-insensitive substring match). */
  keywords: string[];
  /**
   * Base confidence when ALL keywords match. Partial matches are scored
   * proportionally: `baseConfidence × (matchedCount / keywords.length)`.
   * Defaults to `0.95`.
   */
  confidence?: number;
  /**
   * Optional negation terms. If any negation term is found in the message,
   * this rule is skipped entirely.
   */
  negations?: string[];
}

// ---------------------------------------------------------------------------
// Zod schema for LLM response validation
// ---------------------------------------------------------------------------

/** Zod schema used to validate the raw JSON returned by the LLM. */
const IntentSchema = z.object({
  intent:     z.string(),
  confidence: z.number().min(0).max(1),
  entities:   z.record(z.string(), z.any()).optional(),
  intents:    z.array(z.object({
    intent:     z.string(),
    confidence: z.number().min(0).max(1),
    entities:   z.record(z.string(), z.any()).optional(),
  })).optional(),
});

// ---------------------------------------------------------------------------
// IntentClassifier — pure LLM-backed classifier
// ---------------------------------------------------------------------------

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
export class IntentClassifier implements IIntentClassifier {
  private llmCall: (prompt: string) => Promise<string>;
  private intents: string[];
  private confidenceThreshold: number;

  /**
   * @param llmCall - Function that forwards a prompt to an LLM and returns its text response.
   * @param options.intents - List of valid intent labels the LLM must choose from.
   * @param options.confidenceThreshold - Minimum confidence to avoid triggering clarification.
   *   Defaults to `0.6`.
   */
  constructor(
    llmCall: (prompt: string) => Promise<string>,
    options?: { intents?: string[]; confidenceThreshold?: number }
  ) {
    this.llmCall = llmCall;
    this.intents = options?.intents || [
      'CREATE', 'APPROVE', 'REJECT', 'QUERY', 'CANCEL', 'ESCALATE', 'UNKNOWN',
    ];
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.6;
  }

  /**
   * Classifies a user message into one of the registered intents via one LLM call.
   *
   * Supports multi-intent detection: if the LLM returns an `intents` array,
   * the result will include multiple intents to be executed sequentially.
   *
   * On JSON parse failure or Zod validation error, returns a safe fallback
   * `{ intent: "UNKNOWN", confidence: 0, entities: {} }` rather than throwing.
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

If the user message contains MULTIPLE actions, also include an "intents" array:
{"intent": "MAIN_INTENT", "confidence": 0.0-1.0, "entities": {}, "intents": [{"intent": "ACTION1", "confidence": 0.0-1.0, "entities": {}}, {"intent": "ACTION2", "confidence": 0.0-1.0, "entities": {}}]}

User message: ${message}
${turnHistory.length > 0 ? `Recent history: ${JSON.stringify(turnHistory.slice(-5))}` : ''}

JSON response:`;

    try {
      const response = await this.llmCall(prompt);
      const parsed   = JSON.parse(response);
      const result   = IntentSchema.parse(parsed);

      const intentResult: IntentResult = {
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities || {},
        turnHistory,
      };

      if (result.intents && result.intents.length > 0) {
        intentResult.intents = result.intents.map(i => ({
          intent: i.intent,
          confidence: i.confidence,
          entities: i.entities || {},
        }));
      }

      return intentResult;
    } catch {
      return { intent: 'UNKNOWN', confidence: 0, entities: {}, turnHistory };
    }
  }

  /** Returns the current confidence threshold. */
  getConfidenceThreshold(): number { return this.confidenceThreshold; }

  /** Overrides the confidence threshold at runtime. */
  setConfidenceThreshold(threshold: number): void { this.confidenceThreshold = threshold; }

  /**
   * Converts this classifier instance into a plain `IntentClassifierFn`
   * suitable for `CortexFlowOrchestrator.setIntentClassifier`.
   */
  static toFn(classifier: IIntentClassifier): IntentClassifierFn {
    return (message, context) => classifier.classify(message, context);
  }

  /**
   * Generates a short clarifying question when the user's intent is ambiguous.
   *
   * Falls back to a generic question listing available intents if the LLM call fails.
   */
  async generateClarification(originalMessage: string): Promise<string> {
    const prompt = `User said: "${originalMessage}". Possible intents: ${this.intents.join(', ')}.
Ask a short clarifying question to understand which action the user wants. Only return the question, nothing else.`;

    try {
      return (await this.llmCall(prompt)).trim();
    } catch {
      const options = this.intents.filter(i => i !== 'UNKNOWN').join(', ');
      return `I didn't understand. Possible actions: ${options}. Which one do you want?`;
    }
  }
}

// ---------------------------------------------------------------------------
// HybridIntentClassifier — keyword-first, LLM fallback
// ---------------------------------------------------------------------------

/**
 * A hybrid intent classifier that tries keyword rules first and only invokes
 * the LLM when no rule reaches the configured confidence threshold.
 *
 * **Why this matters for performance**: intent classification is on the
 * critical path of every user turn. For well-defined, unambiguous commands
 * ("fetch my mails", "archive all newsletters") keyword rules resolve in
 * microseconds at confidence ≥ 0.9, eliminating the first LLM call entirely.
 * The LLM is reserved for genuinely ambiguous messages.
 *
 * The confidence of a rule is computed as:
 * `baseConfidence × (matchedKeywords / totalKeywords)`.
 * This means a rule with 4 keywords where 3 match scores 0.95 × 0.75 = 0.71,
 * which may still exceed the threshold for coarse intents.
 *
 * @example
 * ```ts
 * const classifier = new HybridIntentClassifier(
 *   [
 *     { intent: 'TRIAGE_MAILS', keywords: ['fetch', 'mail', 'urgent', 'archive'], confidence: 0.95 },
 *     { intent: 'FETCH_MAILS',  keywords: ['fetch', 'email'],                     confidence: 0.90 },
 *   ],
 *   { intents: ['TRIAGE_MAILS', 'FETCH_MAILS', 'UNKNOWN'], confidenceThreshold: 0.6 },
 *   llmFn, // optional — omit for pure keyword mode
 * );
 *
 * // "Fetch my 5 mails and flag the urgent ones" → keyword match, 0 LLM calls
 * // "Do the thing with the emails maybe?"       → LLM fallback
 * ```
 */
export class HybridIntentClassifier implements IIntentClassifier {
  private rules: KeywordRule[];
  private confidenceThreshold: number;
  private intents: string[];
  private llmClassifier?: IntentClassifier;

  /**
   * @param rules - Ordered list of keyword rules. Rules are evaluated in order;
   *   the highest-scoring match wins.
   * @param options.intents - Valid intent labels (used for LLM fallback prompt and clarification).
   * @param options.confidenceThreshold - Minimum confidence to accept a result without LLM fallback.
   * @param llmFn - Optional LLM function. If omitted, unmatched messages return `UNKNOWN`.
   */
  constructor(
    rules: KeywordRule[],
    options: { intents: string[]; confidenceThreshold?: number },
    llmFn?: (prompt: string) => Promise<string>
  ) {
    this.rules               = rules;
    this.intents             = options.intents;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.6;
    if (llmFn) {
      this.llmClassifier = new IntentClassifier(llmFn, options);
    }
  }

  /** Returns the current confidence threshold. */
  getConfidenceThreshold(): number { return this.confidenceThreshold; }

  /**
   * Classifies a message using keyword rules first.
   *
   * If the best keyword rule score meets the threshold, the result is returned
   * immediately — no LLM call is made. Otherwise, the LLM classifier is invoked
   * as a fallback (if configured). Messages that match no rule and have no LLM
   * fallback return `UNKNOWN` with confidence 0.
   */
  async classify(
    message: string,
    context?: { turnHistory?: string[] }
  ): Promise<IntentResult> {
    const ruleResult = this.applyRules(message, context?.turnHistory ?? []);

    if (ruleResult && ruleResult.confidence >= this.confidenceThreshold) {
      return ruleResult;
    }

    if (this.llmClassifier) {
      return this.llmClassifier.classify(message, context);
    }

    return ruleResult ?? { intent: 'UNKNOWN', confidence: 0, entities: {}, turnHistory: context?.turnHistory ?? [] };
  }

  /**
   * Generates a clarifying question for ambiguous messages.
   * Delegates to the LLM classifier if available; otherwise returns a generic
   * question listing the known intents.
   */
  async generateClarification(originalMessage: string): Promise<string> {
    if (this.llmClassifier) {
      return this.llmClassifier.generateClarification(originalMessage);
    }
    const options = this.intents.filter(i => i !== 'UNKNOWN').join(', ');
    return `I didn't understand. Possible actions: ${options}. Which one do you want?`;
  }

  /**
   * Converts this classifier into a plain `IntentClassifierFn`.
   * Works identically to `IntentClassifier.toFn`.
   */
  static toFn(classifier: IIntentClassifier): IntentClassifierFn {
    return (message, context) => classifier.classify(message, context);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private applyRules(message: string, turnHistory: string[]): IntentResult | null {
    const lower = message.toLowerCase();
    let best: { intent: string; score: number } | null = null;

    for (const rule of this.rules) {
      // Skip if any negation term is present
      if (rule.negations?.some(n => lower.includes(n.toLowerCase()))) continue;

      const matched = rule.keywords.filter(kw => lower.includes(kw.toLowerCase()));
      if (matched.length === 0) continue;

      // Partial match: score scales with the fraction of keywords matched
      const score = (rule.confidence ?? 0.95) * (matched.length / rule.keywords.length);
      if (!best || score > best.score) {
        best = { intent: rule.intent, score };
      }
    }

    if (!best) return null;
    return { intent: best.intent, confidence: best.score, entities: {}, turnHistory };
  }
}
