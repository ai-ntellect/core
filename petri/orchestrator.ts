import { PetriNet, TransitionResult, GuardLLMExecutor } from './index';
import { TransitionAction } from './types';
import { ToolRegistry } from '../graph/registry';
import { GraphFlow } from '../graph/index';
import { z } from 'zod';
import { compilePlan } from '../graph/compiler';
import logger from '../utils/logger';
import { IntentClassifier } from './intent-classifier';

/**
 * An active orchestration session, binding a PetriNet instance to a user conversation.
 *
 * Each session gets its own cloned PetriNet so concurrent users are fully isolated.
 * The `traceId` is a correlation ID that flows through every log line and token,
 * making distributed traces trivially grep-able.
 */
export interface Session {
  /** Unique session identifier (stable across turns). */
  id: string;
  /** Isolated clone of the orchestrator's PetriNet definition. */
  petriNet: PetriNet;
  /** Mutable shared context updated after every GraphFlow execution. */
  context: Record<string, any>;
  /** Ordered list of raw user messages for turn-history classification. */
  history: string[];
  /** Unix timestamp (ms) of session creation. */
  createdAt: number;
  /** Correlation ID for distributed tracing — propagated to all log entries and tokens. */
  traceId?: string;
  /** Last generated clarification question, if the intent was ambiguous. */
  clarificationQuestion?: string;
}

/**
 * Structured result of an intent classification pass.
 */
export interface IntentResult {
  /** Canonical intent label (e.g. `"FETCH_MAILS"`, `"SUMMARIZE"`). */
  intent: string;
  /** Confidence score in [0, 1]. Values below the configured threshold trigger clarification. */
  confidence: number;
  /** Free-form entity map extracted alongside the intent. */
  entities: Record<string, any>;
}

/**
 * Signature of the intent classifier function injected into the orchestrator.
 *
 * @param message - Raw user message.
 * @param context - Optional context carrying recent turn history for multi-turn awareness.
 * @returns Resolved intent with confidence and entities.
 */
export type IntentClassifierFn = (
  message: string,
  context?: { turnHistory?: string[] }
) => Promise<IntentResult>;

/**
 * CortexFlow Orchestrator — the coordination layer that glues together:
 * - **PetriNet** for deterministic, formally-verified transition control;
 * - **IntentClassifier** for single-LLM-call intent resolution;
 * - **GraphFlow / ToolRegistry** for side-effecting step execution;
 * - **LLM planner** for dynamic plan generation when transitions carry `type: "dynamic"` actions.
 *
 * Architecture principle: the LLM is only called once per user turn (intent classification).
 * All routing decisions are made by the Petri net without further LLM calls, keeping context
 * pollution and latency to a minimum.
 *
 * @example
 * ```ts
 * const orchestrator = new CortexFlowOrchestrator("mail_assistant", registry);
 * orchestrator.setIntentClassifier(IntentClassifier.toFn(classifier), classifier);
 * orchestrator.setLLMCall(llmFn);
 *
 * const sessionId = orchestrator.startSession();
 * const result = await orchestrator.orchestrate("Summarise my last 5 emails", sessionId);
 * ```
 */
export class CortexFlowOrchestrator {
  private petriNet: PetriNet;
  private toolRegistry: ToolRegistry;
  private sessions: Map<string, Session> = new Map();
  private intentClassifier?: IntentClassifierFn;
  private intentClassifierInstance?: IntentClassifier;
  private llmCall?: (prompt: string) => Promise<string>;

  /**
   * @param name - Human-readable name for the PetriNet managed by this orchestrator.
   * @param toolRegistry - Registry of GraphFlow tools available to transition actions.
   *   Defaults to an empty registry if not provided.
   */
  constructor(name: string, toolRegistry?: ToolRegistry) {
    this.petriNet = new PetriNet(name);
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }

  // ---------------------------------------------------------------------------
  // PetriNet access
  // ---------------------------------------------------------------------------

  /** Exposes the underlying PetriNet so callers can add places and transitions. */
  get petri(): PetriNet {
    return this.petriNet;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Registers the intent classifier used during `orchestrate()`.
   *
   * @param classifier - Functional classifier (`(msg, ctx) => Promise<IntentResult>`).
   * @param instance - Optional `IntentClassifier` instance used to generate clarification
   *   questions when confidence is below the threshold.
   */
  setIntentClassifier(classifier: IntentClassifierFn, instance?: IntentClassifier): void {
    this.intentClassifier = classifier;
    this.intentClassifierInstance = instance;
  }

  /**
   * Wires up an LLM call for:
   * - LLM-based guard evaluation in the PetriNet;
   * - Dynamic plan generation for `type: "dynamic"` transition actions.
   *
   * @param llmCall - Function that sends a prompt to an LLM and returns its raw text response.
   */
  setLLMCall(llmCall: (prompt: string) => Promise<string>): void {
    this.llmCall = llmCall;
    this.petriNet.setLLMExecutor(async (prompt, ctx) => {
      const result = await llmCall(
        `You are a guard evaluator. Context: ${JSON.stringify(ctx)}. ${prompt} Answer only 'yes' or 'no'.`
      );
      return result.toLowerCase().includes('yes');
    });
  }

  // ---------------------------------------------------------------------------
  // Intent classification
  // ---------------------------------------------------------------------------

  /**
   * Classifies a user message into a structured intent.
   *
   * Falls back to `{ intent: "UNKNOWN", confidence: 0, entities: {} }` when no
   * classifier has been configured.
   *
   * @param message - Raw user message to classify.
   * @param sessionId - Optional session ID used to inject turn history into the prompt.
   */
  async classifyIntent(
    message: string,
    sessionId?: string
  ): Promise<IntentResult> {
    if (!this.intentClassifier) {
      return { intent: 'UNKNOWN', confidence: 0, entities: {} };
    }

    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const turnHistory = session?.history || [];

    return this.intentClassifier(message, { turnHistory });
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /**
   * Creates a new isolated session backed by a cloned PetriNet.
   *
   * The clone ensures that concurrent sessions never share token state.
   * A `traceId` is generated and attached to every subsequent log entry.
   *
   * @param sessionId - Optional deterministic ID; defaults to `session_<timestamp>`.
   * @returns The session ID to pass to subsequent `fire()` / `orchestrate()` calls.
   */
  startSession(sessionId?: string): string {
    const id = sessionId || `session_${Date.now()}`;
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const net = new PetriNet(this.petriNet.name);
    net.places = new Map(this.petriNet.places);
    net.transitions = new Map(this.petriNet.transitions);
    net.state = {
      marking: new Map(
        Array.from(this.petriNet.state.marking.entries()).map(([k, v]) => [
          k,
          v.map(t => ({ ...t })),
        ])
      ),
      history: [],
    };

    this.sessions.set(id, {
      id,
      petriNet: net,
      context: {},
      history: [],
      createdAt: Date.now(),
      traceId,
    });

    logger.info({ sessionId: id, traceId }, 'Session started');
    return id;
  }

  /**
   * Returns the session object for `sessionId`, or `undefined` if not found.
   *
   * @param sessionId - Session ID returned by `startSession()`.
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  // ---------------------------------------------------------------------------
  // Transition firing
  // ---------------------------------------------------------------------------

  /**
   * Fires a PetriNet transition and executes its associated action (if any).
   *
   * Flow:
   * 1. Consume tokens from input places (guarded by the transition's guards).
   * 2. If the transition carries an action (`graphflow` or `dynamic`), execute it.
   * 3. Merge the action result into `session.context`.
   *
   * @param transitionId - ID of the transition to fire.
   * @param sessionId - Target session.
   * @param tokenData - Optional data injected into the produced token and the action context.
   * @returns The fire result enriched with an optional `actionResult` from the executed action.
   * @throws If the session or transition is not found.
   */
  async fire(
    transitionId: string,
    sessionId: string,
    tokenData?: Record<string, any>
  ): Promise<TransitionResult & { actionResult?: any }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const log = logger.child({ sessionId, traceId: session.traceId });

    const transition = session.petriNet.transitions.get(transitionId);
    if (!transition) {
      throw new Error(`Transition ${transitionId} not found`);
    }

    log.info({ transitionId }, 'Firing transition');
    const result = await session.petriNet.fireTransition(transitionId, tokenData);

    if (!result.success) {
      log.warn({ transitionId, result }, 'Transition failed');
      return result as any;
    }

    if (transition.action) {
      try {
        log.info({ transitionId, actionType: (transition as any).action?.type }, 'Executing action');
        const actionResult = await this.executeAction(
          transition.action,
          tokenData || session.context,
          session
        );
        log.info({ transitionId, actionResult }, 'Action completed');
        return { ...result, actionResult };
      } catch (error) {
        log.error({ transitionId, error }, 'Action failed');
        return {
          ...result,
          success: false,
          error: (error as Error).message,
          actionResult: undefined,
        } as any;
      }
    }

    return result as any;
  }

  // ---------------------------------------------------------------------------
  // Action execution (private)
  // ---------------------------------------------------------------------------

  private async executeAction(
    action: TransitionAction,
    context: Record<string, any>,
    session: Session
  ): Promise<any> {
    if (action.type === 'graphflow') {
      return this.executeGraphFlowAction(action, context, session);
    }

    if (action.type === 'dynamic') {
      return this.executeDynamicAction(action, context, session);
    }

    return undefined;
  }

  /**
   * Executes a registered GraphFlow tool, wrapping it with a step-count guard and a
   * hard timeout so a misbehaving graph cannot stall the Petri net indefinitely.
   */
  private async executeGraphFlowAction(
    action: TransitionAction,
    context: Record<string, any>,
    session: Session
  ): Promise<any> {
    if (!action.name) {
      throw new Error('GraphFlow action missing tool name');
    }

    const tool = this.toolRegistry.get(action.name);
    if (!tool) {
      throw new Error(`Tool ${action.name} not registered`);
    }

    const flowContext = action.contextMapper ? action.contextMapper(context) : context;
    const timeoutMs = (action as any).timeout || 30000;
    const maxSteps = (action as any).maxSteps || 10;

    let steps = 0;
    const originalExecute = tool.graph.execute.bind(tool.graph);
    const wrappedExecute = async (startNode: string, ctx: any) => {
      steps++;
      if (steps > maxSteps) {
        throw new Error(`GraphFlow exceeded max steps: ${maxSteps}`);
      }
      return originalExecute(startNode, ctx);
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`GraphFlow timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      const result = await Promise.race([wrappedExecute(tool.startNode, flowContext), timeout]);
      session.context = { ...session.context, ...result };
      return result;
    } catch (error) {
      session.context = { ...session.context, lastError: (error as Error).message };
      throw error;
    }
  }

  /**
   * Generates a dynamic plan via the LLM, compiles it to a GraphFlow, and executes it.
   *
   * The generated plan is Zod-validated before execution to prevent malformed LLM output
   * from corrupting the workflow state.
   */
  private async executeDynamicAction(
    action: TransitionAction,
    context: Record<string, any>,
    session: Session
  ): Promise<any> {
    if (!this.llmCall) {
      throw new Error('LLM call not configured for dynamic action');
    }

    if (!action.prompt) {
      throw new Error('Dynamic action missing prompt');
    }

    const maxSteps = action.maxSteps || 5;
    const plan = await this.generateDynamicPlan(action.prompt, context, maxSteps, session.traceId);
    const { graph, startNode } = this.compilePlan(plan);

    const timeoutMs = (action as any).timeout || 30000;
    let steps = 0;
    const originalExecute = graph.execute.bind(graph);
    const wrappedExecute = async (node: string, ctx: any) => {
      steps++;
      if (steps > maxSteps) {
        throw new Error(`Dynamic plan exceeded max steps: ${maxSteps}`);
      }
      return originalExecute(node, ctx);
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Dynamic action timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      const result = await Promise.race([wrappedExecute(startNode, context), timeout]);
      session.context = { ...session.context, ...result };
      return result;
    } catch (error) {
      session.context = { ...session.context, lastError: (error as Error).message };
      logger.warn({ traceId: session.traceId, error }, 'Dynamic action failed');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Plan generation & compilation (private)
  // ---------------------------------------------------------------------------

  private readonly PlanSchema = z.object({
    goal: z.string(),
    steps: z.array(
      z.object({
        node: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      })
    ),
  });

  /**
   * Asks the LLM to produce a structured execution plan for the given prompt, then
   * validates it with Zod before returning.
   *
   * @throws If the LLM response cannot be parsed as JSON or fails schema validation.
   */
  private async generateDynamicPlan(
    prompt: string,
    context: Record<string, any>,
    maxSteps: number,
    traceId?: string
  ): Promise<{ goal: string; steps: { node: string; params?: any }[] }> {
    if (!this.llmCall) {
      throw new Error('LLM call not configured for dynamic action');
    }

    const availableTools = this.toolRegistry.list();
    const log = logger.child({ traceId });

    const llmPrompt = `You are a workflow planner. Generate a structured plan as JSON with "goal" (string) and "steps" (array of { node: string, params?: Record<string, any> }).
Only use tools from the available list. Max ${maxSteps} steps.

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

User intent: ${prompt}
Context: ${JSON.stringify(context)}

Respond with valid JSON only.`;

    const response = await this.llmCall(llmPrompt);
    const rawPlan = JSON.parse(response);

    try {
      const plan = this.PlanSchema.parse(rawPlan);

      if (plan.steps.length > maxSteps) {
        throw new Error(`Plan exceeds max steps: ${plan.steps.length} > ${maxSteps}`);
      }

      log.info({ plan }, 'Dynamic plan validated');
      return { goal: plan.goal || prompt, steps: plan.steps };
    } catch (error) {
      log.warn({ rawPlan, error, prompt }, 'Dynamic plan rejected by Zod validation');
      throw error;
    }
  }

  private compilePlan(plan: {
    goal: string;
    steps: { node: string; params?: any }[];
  }): { graph: GraphFlow<any>; startNode: string } {
    return compilePlan(plan, this.toolRegistry);
  }

  // ---------------------------------------------------------------------------
  // Main orchestration entry point
  // ---------------------------------------------------------------------------

  /**
   * Full orchestration pipeline for a single user turn:
   *
   * 1. Ensure a session exists (creates one if `sessionId` is unknown).
   * 2. Classify the user message into an intent.
   * 3. If confidence is below the threshold, ask a clarifying question and return early.
   * 4. Retrieve the first enabled transition matching the intent.
   * 5. Fire the transition (consuming / producing tokens, running the action).
   * 6. Return the structured result including the fired transition output.
   *
   * The method never throws — failures from steps 4-5 surface as
   * `transitionResult.success === false` so callers can handle them gracefully.
   *
   * @param message - Raw user message for this turn.
   * @param sessionId - Optional existing session; a new session is created if omitted or unknown.
   * @returns Orchestration result containing intent, optional transition result, and
   *   clarification request when the intent was ambiguous.
   */
  async orchestrate(
    message: string,
    sessionId?: string
  ): Promise<{
    intent: IntentResult;
    transitionResult?: TransitionResult & { actionResult?: any };
    sessionId: string;
    needsClarification?: boolean;
    clarificationQuestion?: string;
  }> {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const resolvedSessionId = session ? session.id : this.startSession(sessionId);
    const sessionObj = this.sessions.get(resolvedSessionId)!;
    const log = logger.child({ sessionId: resolvedSessionId, traceId: sessionObj.traceId });

    log.info({ message }, 'Orchestration started');

    const intent = await this.classifyIntent(message, resolvedSessionId);
    sessionObj.history.push(message);
    log.info({ intent }, 'Intent classified');

    // Low-confidence guard: request clarification before touching the Petri net.
    if (intent.confidence < 0.6) {
      log.warn({ intent }, 'Low confidence — needs clarification');
      const clarificationQuestion = await this.tryGenerateClarification(message, sessionObj, log);
      return { intent, sessionId: resolvedSessionId, needsClarification: true, clarificationQuestion };
    }

    const enabledTransitions = sessionObj.petriNet.getEnabledTransitions({
      intent: intent.intent,
      confidence: intent.confidence,
      ...intent.entities,
    });

    if (enabledTransitions.length === 0) {
      log.warn({ intent }, 'No enabled transitions — needs clarification');
      const clarificationQuestion = await this.tryGenerateClarification(message, sessionObj, log);
      return { intent, sessionId: resolvedSessionId, needsClarification: true, clarificationQuestion };
    }

    const transitionId = enabledTransitions[0];
    log.info({ transitionId }, 'Firing enabled transition');

    const result = await this.fire(transitionId, resolvedSessionId, {
      intent: intent.intent,
      ...intent.entities,
      traceId: sessionObj.traceId,
    });

    log.info({ result }, 'Orchestration completed');
    return { intent, transitionResult: result, sessionId: resolvedSessionId, needsClarification: false };
  }

  /**
   * Attempts to generate a clarification question via the LLM.
   * Silently swallows errors — worst case returns `undefined`.
   */
  private async tryGenerateClarification(
    message: string,
    session: Session,
    log: { warn: (obj: object, msg: string) => void }
  ): Promise<string | undefined> {
    if (!this.intentClassifierInstance) return undefined;
    try {
      const question = await (this.intentClassifierInstance as any).generateClarification(message);
      session.clarificationQuestion = question;
      return question;
    } catch (error) {
      log.warn({ error }, 'Failed to generate clarification question');
      return undefined;
    }
  }
}
