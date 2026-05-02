import { PetriNet, TransitionResult, GuardLLMExecutor } from './index';
import { TransitionAction } from './types';
import { ToolRegistry } from '../graph/registry';
import { GraphFlow } from '../graph/index';
import { z } from 'zod';
import { compilePlan } from '../graph/compiler';
import logger from '../utils/logger';
import { IntentClassifier } from './intent-classifier';
import { IPetriCheckpointAdapter } from './checkpoint-adapter';

export interface Session {
  id: string;
  petriNet: PetriNet;
  context: Record<string, any>;
  history: string[];
  createdAt: number;
  traceId?: string;
  clarificationQuestion?: string;
  inFallbackMode?: boolean;
  fallbackContext?: {
    conversationHistory: string[];
    lastFallbackResponse?: string;
  };
}

export type FallbackLLM = (
  message: string,
  session: Session,
  toolRegistry?: ToolRegistry
) => Promise<{ response: string; shouldReenterPetri?: boolean; reinterpretMessage?: string }>;

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  intents?: Array<{ intent: string; confidence: number; entities?: Record<string, any> }>;
}

export type IntentClassifierFn = (
  message: string,
  context?: { turnHistory?: string[] }
) => Promise<IntentResult>;

export class CortexFlowOrchestrator {
  private petriNet: PetriNet;
  private toolRegistry: ToolRegistry;
  private sessions: Map<string, Session> = new Map();
  private intentClassifier?: IntentClassifierFn;
  private intentClassifierInstance?: IntentClassifier;
  private llmCall?: (prompt: string) => Promise<string>;
  private petriCheckpointAdapter?: IPetriCheckpointAdapter;
  private fallbackLLM?: FallbackLLM;
  private confidenceThreshold: number = 0.6;

  constructor(name: string, toolRegistry?: ToolRegistry) {
    this.petriNet = new PetriNet(name);
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }

  setFallbackLLM(fn: FallbackLLM): void {
    this.fallbackLLM = fn;
  }

  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = threshold;
  }

  getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  get petri(): PetriNet {
    return this.petriNet;
  }

  setPetriCheckpointAdapter(adapter: IPetriCheckpointAdapter): void {
    this.petriCheckpointAdapter = adapter;
  }

  async savePetriState(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !this.petriCheckpointAdapter) return null;
    try {
      const checkpointId = await this.petriCheckpointAdapter.save(session.petriNet, session);
      logger.info({ sessionId, checkpointId }, 'Petri state saved');
      return checkpointId;
    } catch (error) {
      logger.error({ sessionId, error }, 'Failed to save Petri state');
      return null;
    }
  }

  async restorePetriState(checkpointId: string): Promise<string | null> {
    if (!this.petriCheckpointAdapter) return null;
    try {
      const result = await this.petriCheckpointAdapter.load(checkpointId);
      if (!result) return null;
      const { net, session: restoredSession } = result;
      if (restoredSession) {
        this.sessions.set(restoredSession.id, restoredSession);
        return restoredSession.id;
      }
      const newSessionId = `session_${Date.now()}`;
      const newSession: Session = {
        id: newSessionId,
        petriNet: net,
        context: {},
        history: [],
        createdAt: Date.now(),
        traceId: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      this.sessions.set(newSessionId, newSession);
      return newSessionId;
    } catch (error) {
      logger.error({ checkpointId, error }, 'Failed to restore Petri state');
      return null;
    }
  }

  async listPetriCheckpoints() {
    if (!this.petriCheckpointAdapter) return [];
    return this.petriCheckpointAdapter.list();
  }

  setIntentClassifier(classifier: IntentClassifierFn, instance?: IntentClassifier): void {
    this.intentClassifier = classifier;
    this.intentClassifierInstance = instance;
  }

  setLLMCall(llmCall: (prompt: string) => Promise<string>): void {
    this.llmCall = llmCall;
    this.petriNet.setLLMExecutor(async (prompt, ctx) => {
      const result = await llmCall(
        `You are a guard evaluator. Context: ${JSON.stringify(ctx)}. ${prompt} Answer only 'yes' or 'no'.`
      );
      return result.toLowerCase().includes('yes');
    });
  }

  async classifyIntent(message: string, sessionId?: string): Promise<IntentResult> {
    if (!this.intentClassifier) {
      return { intent: 'UNKNOWN', confidence: 0, entities: {} };
    }
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const turnHistory = session?.history || [];
    return this.intentClassifier(message, { turnHistory });
  }

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

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  async fire(transitionId: string, sessionId: string, tokenData?: Record<string, any>): Promise<TransitionResult & { actionResult?: any }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const log = logger.child({ sessionId, traceId: session.traceId });
    const transition = session.petriNet.transitions.get(transitionId);
    if (!transition) throw new Error(`Transition ${transitionId} not found`);
    log.info({ transitionId }, 'Firing transition');
    const result = await session.petriNet.fireTransition(transitionId, tokenData);
    if (!result.success) {
      log.warn({ transitionId, result }, 'Transition failed');
      return result as any;
    }
    if (transition.action) {
      try {
        log.info({ transitionId, actionType: (transition as any).action?.type }, 'Executing action');
        const actionResult = await this.executeAction(transition.action, tokenData || session.context, session);
        log.info({ transitionId, actionResult }, 'Action completed');
        return { ...result, actionResult };
      } catch (error) {
        log.error({ transitionId, error }, 'Action failed');
        return { ...result, success: false, error: (error as Error).message, actionResult: undefined } as any;
      }
    }
    return result as any;
  }

  private async executeAction(action: TransitionAction, context: Record<string, any>, session: Session): Promise<any> {
    if (action.type === 'graphflow') return this.executeGraphFlowAction(action, context, session);
    if (action.type === 'dynamic') return this.executeDynamicAction(action, context, session);
    return undefined;
  }

  private async executeGraphFlowAction(action: TransitionAction, context: Record<string, any>, session: Session): Promise<any> {
    if (!action.name) throw new Error('GraphFlow action missing tool name');
    const tool = this.toolRegistry.get(action.name);
    if (!tool) throw new Error(`Tool ${action.name} not registered`);
    const flowContext = action.contextMapper ? action.contextMapper(context) : context;
    const timeoutMs = (action as any).timeout || 30000;
    const maxSteps = (action as any).maxSteps || 10;
    let steps = 0;
    const originalExecute = tool.graph.execute.bind(tool.graph);
    const wrappedExecute = async (startNode: string, ctx: any) => {
      steps++;
      if (steps > maxSteps) throw new Error(`GraphFlow exceeded max steps: ${maxSteps}`);
      return originalExecute(startNode, ctx);
    };
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`GraphFlow timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      const result = await Promise.race([wrappedExecute(tool.startNode, flowContext), timeoutPromise]);
      session.context = { ...session.context, ...result };
      return result;
    } catch (error) {
      session.context = { ...session.context, lastError: (error as Error).message };
      throw error;
    }
  }

  private async executeDynamicAction(action: TransitionAction, context: Record<string, any>, session: Session): Promise<any> {
    if (!this.llmCall) throw new Error('LLM call not configured for dynamic action');
    if (!action.prompt) throw new Error('Dynamic action missing prompt');
    const maxSteps = action.maxSteps || 5;
    const plan = await this.generateDynamicPlan(action.prompt, context, maxSteps, session.traceId);
    const { graph, startNode } = this.compilePlan(plan);
    const timeoutMs = (action as any).timeout || 30000;
    let steps = 0;
    const originalExecute = graph.execute.bind(graph);
    const wrappedExecute = async (startNode: string, ctx: any) => {
      steps++;
      if (steps > maxSteps) throw new Error(`Dynamic plan exceeded max steps: ${maxSteps}`);
      return originalExecute(startNode, ctx);
    };
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Dynamic action timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      const result = await Promise.race([wrappedExecute(startNode, context), timeoutPromise]);
      session.context = { ...session.context, ...result };
      return result;
    } catch (error) {
      session.context = { ...session.context, lastError: (error as Error).message };
      logger.warn({ traceId: session.traceId, error }, 'Dynamic action failed');
      throw error;
    }
  }

  private async generateDynamicPlan(prompt: string, context: Record<string, any>, maxSteps: number, traceId?: string): Promise<{ goal: string; steps: { node: string; params?: any }[] }> {
    if (!this.llmCall) throw new Error('LLM call not configured');
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
    const PlanSchema = z.object({
      goal: z.string(),
      steps: z.array(
        z.object({
          node: z.string(),
          params: z.record(z.string(), z.unknown()).optional(),
        })
      ),
    });
    try {
      const plan = PlanSchema.parse(rawPlan);
      if (plan.steps.length > maxSteps) throw new Error(`Plan exceeds max steps: ${plan.steps.length} > ${maxSteps}`);
      log.info({ plan }, 'Dynamic plan validated successfully');
      return { goal: plan.goal || prompt, steps: plan.steps };
    } catch (error) {
      log.warn({ rawPlan, error, prompt }, 'Dynamic plan rejected by Zod validation');
      throw error;
    }
  }

  private compilePlan(plan: { goal: string; steps: { node: string; params?: any }[] }): { graph: GraphFlow<any>; startNode: string } {
    return compilePlan(plan, this.toolRegistry);
  }

  async orchestrate(message: string, sessionId?: string): Promise<{
    intent: IntentResult;
    transitionResult?: TransitionResult & { actionResult?: any };
    sessionId: string;
    needsClarification?: boolean;
    clarificationQuestion?: string;
    fallbackResponse?: string;
    shouldReenterPetri?: boolean;
  }> {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const resolvedSessionId = session ? session.id : this.startSession(sessionId);
    const sessionObj = this.sessions.get(resolvedSessionId)!;
    const log = logger.child({ sessionId: resolvedSessionId, traceId: sessionObj.traceId });
    log.info({ message }, 'Orchestration started');

    if (sessionObj.inFallbackMode && this.fallbackLLM) {
      return this.handleFallbackMode(message, resolvedSessionId, sessionObj, log);
    }

    const intent = await this.classifyIntent(message, resolvedSessionId);
    sessionObj.history.push(message);
    log.info({ intent }, 'Intent classified');

    const threshold = this.confidenceThreshold;
    if (intent.confidence < threshold || intent.intent === 'UNKNOWN') {
      log.warn({ intent, threshold }, 'Low confidence or UNKNOWN, entering fallback mode');

      if (this.fallbackLLM) {
        return this.enterFallbackMode(message, resolvedSessionId, sessionObj, intent, log);
      }

      let clarificationQuestion: string | undefined;
      if (this.intentClassifierInstance) {
        try {
          clarificationQuestion = await this.intentClassifierInstance.generateClarification(message);
          sessionObj.clarificationQuestion = clarificationQuestion;
        } catch (error) {
          log.warn({ error }, 'Failed to generate clarification question');
        }
      }
      return { intent, sessionId: resolvedSessionId, needsClarification: true, clarificationQuestion };
    }

    let intentsToExecute = intent.intents && intent.intents.length > 0
      ? [...intent.intents]
      : [];

    const mainIntent = { intent: intent.intent, confidence: intent.confidence, entities: intent.entities };
    if (!intentsToExecute.some(i => i.intent === mainIntent.intent)) {
      intentsToExecute.unshift(mainIntent);
    }

    const results: Array<TransitionResult & { actionResult?: any }> = [];

    for (let i = 0; i < intentsToExecute.length; i++) {
      const subIntent = intentsToExecute[i];

      if (i > 0) {
        log.info('Resetting Petri net for next sub-intent');
        sessionObj.petriNet.state.marking.clear();
        sessionObj.petriNet.state.marking.set('idle', [{
          id: `reset_${Date.now()}`,
          data: { resetForMultiIntent: true },
          createdAt: Date.now(),
        }]);
        sessionObj.petriNet.state.history = [];
      }

      const enabledTransitions = sessionObj.petriNet.getEnabledTransitions({
        intent: subIntent.intent,
        confidence: subIntent.confidence,
        ...(subIntent.entities || {}),
      });

      if (enabledTransitions.length === 0) {
        log.warn({ subIntent }, 'No enabled transitions for sub-intent');

        if (this.fallbackLLM && intentsToExecute.length === 1) {
          return this.enterFallbackMode(message, resolvedSessionId, sessionObj, intent, log);
        }

        if (intentsToExecute.length === 1) {
          let clarificationQuestion: string | undefined;
          if (this.intentClassifierInstance) {
            try {
              clarificationQuestion = await this.intentClassifierInstance.generateClarification(message);
              sessionObj.clarificationQuestion = clarificationQuestion;
            } catch (error) {
              log.warn({ error }, 'Failed to generate clarification question');
            }
          }
          return { intent, sessionId: resolvedSessionId, needsClarification: true, clarificationQuestion };
        }
        continue;
      }

      const transitionId = enabledTransitions[0];
      log.info({ transitionId, subIntent }, 'Firing enabled transition for sub-intent');
      const result = await this.fire(transitionId, resolvedSessionId, {
        intent: subIntent.intent,
        ...(subIntent.entities || {}),
        traceId: sessionObj.traceId,
      });
      results.push(result);
      log.info({ result }, 'Sub-intent transition completed');
    }

    log.info({ results }, 'Orchestration completed');
    return {
      intent,
      transitionResult: results.length > 0 ? results[results.length - 1] : undefined,
      sessionId: resolvedSessionId,
      needsClarification: false,
    };
  }

  private async enterFallbackMode(
    message: string,
    sessionId: string,
    sessionObj: Session,
    intent: IntentResult,
    log: any
  ): Promise<{
    intent: IntentResult;
    sessionId: string;
    fallbackResponse?: string;
    needsClarification?: boolean;
    shouldReenterPetri?: boolean;
  }> {
    sessionObj.inFallbackMode = true;
    if (!sessionObj.fallbackContext) {
      sessionObj.fallbackContext = {
        conversationHistory: [...sessionObj.history],
      };
    }

    const fallbackResult = await this.fallbackLLM!(message, sessionObj, this.toolRegistry);

    sessionObj.fallbackContext.lastFallbackResponse = fallbackResult.response;
    sessionObj.fallbackContext.conversationHistory.push(message, fallbackResult.response);

    log.info({ fallbackResult }, 'Fallback LLM responded');

    if (fallbackResult.shouldReenterPetri && fallbackResult.reinterpretMessage) {
      log.info({ reinterpretMessage: fallbackResult.reinterpretMessage }, 'Reinterpreting message via fallback');
      sessionObj.inFallbackMode = false;
      return this.orchestrate(fallbackResult.reinterpretMessage, sessionId);
    }

    return {
      intent,
      sessionId,
      fallbackResponse: fallbackResult.response,
      shouldReenterPetri: false,
    };
  }

  private async handleFallbackMode(
    message: string,
    sessionId: string,
    sessionObj: Session,
    log: any
  ): Promise<{
    intent: IntentResult;
    sessionId: string;
    fallbackResponse?: string;
    needsClarification?: boolean;
    shouldReenterPetri?: boolean;
  }> {
    const intent: IntentResult = { intent: 'UNKNOWN', confidence: 0, entities: {} };

    const fallbackResult = await this.fallbackLLM!(message, sessionObj, this.toolRegistry);

    sessionObj.fallbackContext!.lastFallbackResponse = fallbackResult.response;
    sessionObj.fallbackContext!.conversationHistory.push(message, fallbackResult.response);

    log.info({ fallbackResult }, 'Fallback LLM continued');

    if (fallbackResult.shouldReenterPetri && fallbackResult.reinterpretMessage) {
      log.info({ reinterpretMessage: fallbackResult.reinterpretMessage }, 'Reinterpreting message via fallback');
      sessionObj.inFallbackMode = false;
      return this.orchestrate(fallbackResult.reinterpretMessage, sessionId);
    }

    return {
      intent,
      sessionId,
      fallbackResponse: fallbackResult.response,
      shouldReenterPetri: false,
    };
  }
}
