import {
  Token,
  Place,
  Transition,
  PetriNetState,
  TransitionResult,
  Guard,
  GuardLLMExecutor,
  ActionExecutor,
  TransitionAction,
} from './types';
import {
  matrixZeros,
  matrixSubtract,
  hasPositiveNullVector,
} from './matrix';

export {
  Token,
  Place,
  Transition,
  PetriNetState,
  TransitionResult,
  Guard,
  GuardLLMExecutor,
  ActionExecutor,
  TransitionAction,
} from './types';

export class PetriNet {
  name: string;
  places: Map<string, Place> = new Map();
  transitions: Map<string, Transition> = new Map();
  state: PetriNetState;
  private guardFunctions: Map<string, (ctx: any) => boolean> = new Map();
  private llmExecutor?: GuardLLMExecutor;
  private actionExecutor?: ActionExecutor;

  constructor(name: string) {
    this.name = name;
    this.state = {
      marking: new Map(),
      history: [],
    };
  }

  addPlace(place: Place): void {
    this.places.set(place.id, place);
    this.state.marking.set(place.id, place.tokens.map(t => ({ ...t })));
  }

  addTransition(transition: Transition): void {
    this.transitions.set(transition.id, transition);
  }

  registerGuardFunction(name: string, func: (ctx: any) => boolean): void {
    this.guardFunctions.set(name, func);
  }

  setLLMExecutor(executor: GuardLLMExecutor): void {
    this.llmExecutor = executor;
  }

  setActionExecutor(executor: ActionExecutor): void {
    this.actionExecutor = executor;
  }

  getEnabledTransitions(context?: any): string[] {
    const enabled: string[] = [];
    for (const [tid, transition] of this.transitions) {
      if (transition.when) {
        continue;
      }
      const hasTokens = transition.from.every(
        pid => (this.state.marking.get(pid) || []).length > 0
      );
      if (!hasTokens) continue;
      let guardPassed = true;
      if (transition.guard) {
        guardPassed = this.evaluateGuard(transition.guard, context || {});
      }
      if (guardPassed) {
        enabled.push(tid);
      }
    }
    return enabled;
  }

  getEventDrivenTransitions(): string[] {
    const eventDriven: string[] = [];
    for (const [tid, transition] of this.transitions) {
      if (transition.when) {
        eventDriven.push(tid);
      }
    }
    return eventDriven;
  }

  private evaluateGuard(guard: Guard, context: any): boolean {
    if (guard.type === 'deterministic') {
      if (guard.name && this.guardFunctions.has(guard.name)) {
        return this.guardFunctions.get(guard.name)!(context);
      }
      if (guard.condition) {
        try {
          const fn = new Function(
            ...Object.keys(context),
            `'use strict'; return (${guard.condition});`
          );
          return !!fn(...Object.values(context));
        } catch {
          return false;
        }
      }
      return true;
    }
    return true;
  }

  private getTokenContext(transition: Transition): any {
    const context: any = {};
    for (const pid of transition.from) {
      const tokens = this.state.marking.get(pid) || [];
      if (tokens.length > 0) {
        Object.assign(context, tokens[0].data);
      }
    }
    return context;
  }

  async fireTransition(
    transitionId: string,
    tokenData?: Record<string, any>
  ): Promise<TransitionResult> {
    const transition = this.transitions.get(transitionId);
    if (!transition) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: `Unknown transition: ${transitionId}`,
      };
    }

    if (transition.when) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: `Transition ${transitionId} is event-driven`,
      };
    }

    const hasTokens = transition.from.every(
      pid => (this.state.marking.get(pid) || []).length > 0
    );
    if (!hasTokens) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: 'Missing tokens in input places',
      };
    }

    if (transition.guard) {
      const context = this.getTokenContext(transition);
      const passed = this.evaluateGuard(transition.guard, context);
      if (!passed) {
        return {
          success: false,
          transitionId,
          newMarking: this.cloneMarking(this.state.marking),
          consumedTokens: [],
          producedTokens: [],
          error: 'Guard condition not met',
        };
      }
    }

    const consumed: Token[] = [];
    for (const pid of transition.from) {
      const tokens = this.state.marking.get(pid) || [];
      if (tokens.length > 0) {
        consumed.push(tokens.shift()!);
      }
    }

    const firstConsumed = consumed[0];
    const newToken: Token = {
      id: `${transitionId}_${Date.now()}`,
      data: tokenData || (firstConsumed ? { ...firstConsumed.data } : {}),
      createdAt: Date.now(),
    };

    const toPlaces = Array.isArray(transition.to)
      ? transition.to
      : [transition.to];
    for (const pid of toPlaces) {
      if (!this.state.marking.has(pid)) {
        this.state.marking.set(pid, []);
      }
      this.state.marking.get(pid)!.push(newToken);
    }

    this.state.history.push(transitionId);

    return {
      success: true,
      transitionId,
      newMarking: this.cloneMarking(this.state.marking),
      consumedTokens: consumed,
      producedTokens: [newToken],
    };
  }

  async fireTransitionByEvent(
    transitionId: string,
    eventData?: Record<string, any>
  ): Promise<TransitionResult> {
    const transition = this.transitions.get(transitionId);
    if (!transition) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: `Unknown transition: ${transitionId}`,
      };
    }

    if (!transition.when) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: `Transition ${transitionId} is not event-driven`,
      };
    }

    const hasTokens = transition.from.every(
      pid => (this.state.marking.get(pid) || []).length > 0
    );
    if (!hasTokens) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: 'Missing tokens in input places',
      };
    }

    const consumed: Token[] = [];
    for (const pid of transition.from) {
      const tokens = this.state.marking.get(pid) || [];
      if (tokens.length > 0) {
        consumed.push(tokens.shift()!);
      }
    }

    const firstConsumed = consumed[0];
    const newToken: Token = {
      id: `${transitionId}_${Date.now()}`,
      data: eventData || (firstConsumed ? { ...firstConsumed.data } : {}),
      createdAt: Date.now(),
    };

    const toPlaces = Array.isArray(transition.to)
      ? transition.to
      : [transition.to];
    for (const pid of toPlaces) {
      if (!this.state.marking.has(pid)) {
        this.state.marking.set(pid, []);
      }
      this.state.marking.get(pid)!.push(newToken);
    }

    this.state.history.push(transitionId);

    return {
      success: true,
      transitionId,
      newMarking: this.cloneMarking(this.state.marking),
      consumedTokens: consumed,
      producedTokens: [newToken],
    };
  }

  async fireTransitionWithAction(
    transitionId: string,
    tokenData?: Record<string, any>
  ): Promise<TransitionResult & { actionResult?: any }> {
    const transition = this.transitions.get(transitionId);
    if (!transition) {
      return {
        success: false,
        transitionId,
        newMarking: this.cloneMarking(this.state.marking),
        consumedTokens: [],
        producedTokens: [],
        error: `Unknown transition: ${transitionId}`,
      };
    }

    const tokenContext = this.getTokenContext(transition);
    const result = await this.fireTransition(transitionId, tokenData);

    if (result.success && transition.action && this.actionExecutor) {
      const actionContext = transition.action.contextMapper
        ? transition.action.contextMapper(tokenContext)
        : tokenContext;
      try {
        const actionResult = await this.actionExecutor(
          transition.action,
          actionContext
        );
        return { ...result, actionResult };
      } catch (error) {
        return {
          ...result,
          success: false,
          error: (error as Error).message,
          actionResult: undefined,
        } as any;
      }
    }

    return result;
  }

  detectDeadlock(): boolean {
    const enabled = this.getEnabledTransitions();
    const eventDriven = this.getEventDrivenTransitions();
    const hasActiveTokens = this.hasActiveTokens();
    if (enabled.length > 0) return false;
    if (eventDriven.length > 0 && hasActiveTokens) return false;
    return hasActiveTokens;
  }

  private hasActiveTokens(): boolean {
    return Array.from(this.state.marking.values()).some(
      tokens => tokens.length > 0
    );
  }

  validateBoundedness(): { bounded: boolean; details?: string } {
    for (const [tid, t] of this.transitions) {
      if (t.from.length === 0) {
        return {
          bounded: false,
          details: `Transition ${tid} has no input places`,
        };
      }
      const toPlaces = Array.isArray(t.to) ? t.to : [t.to];
      for (const toPlace of toPlaces) {
        if (t.from.includes(toPlace) && toPlaces.length > 0) {
          return {
            bounded: false,
            details: `Transition ${tid} has self-loop`,
          };
        }
      }
    }

    const places = Array.from(this.places.keys());
    const transitions = Array.from(this.transitions.keys());
    const P = places.length;
    const T = transitions.length;
    if (P === 0 || T === 0) return { bounded: true };

    const Pre = matrixZeros(P, T);
    const Post = matrixZeros(P, T);
    for (let j = 0; j < T; j++) {
      const t = this.transitions.get(transitions[j])!;
      for (const pid of t.from) {
        const i = places.indexOf(pid);
        if (i !== -1) Pre[i][j] = 1;
      }
      const toArray = Array.isArray(t.to) ? t.to : [t.to];
      for (const pid of toArray) {
        const i = places.indexOf(pid);
        if (i !== -1) Post[i][j] = 1;
      }
    }

    const C = matrixSubtract(Post, Pre);
    const hasInvariant = hasPositiveNullVector(C);
    if (hasInvariant) {
      return { bounded: true };
    }

    return { bounded: true, details: 'No P-invariant found' };
  }

  toDot(): string {
    const lines = [`digraph {`, `  label="${this.name}"`];
    for (const [pid, place] of this.places) {
      const tokenCount = (this.state.marking.get(pid) || []).length;
      const shape =
        place.type === 'initial'
          ? 'circle'
          : place.type === 'final'
            ? 'doublecircle'
            : 'box';
      lines.push(
        `  ${pid} [shape=${shape}, label="${pid}\\n(${tokenCount} tokens)"]`
      );
    }
    for (const [tid, transition] of this.transitions) {
      const label = transition.description || tid;
      lines.push(
        `  ${tid} [shape=box, style=filled, fillcolor=lightgray, label="${label}"]`
      );
      for (const fp of transition.from) {
        lines.push(`  ${fp} -> ${tid}`);
      }
      const toPlaces = Array.isArray(transition.to)
        ? transition.to
        : [transition.to];
      for (const tp of toPlaces) {
        lines.push(`  ${tid} -> ${tp}`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  private cloneMarking(
    marking: Map<string, Token[]>
  ): Map<string, Token[]> {
    const cloned = new Map<string, Token[]>();
    for (const [k, v] of marking) {
      cloned.set(k, v.map(t => ({ ...t })));
    }
    return cloned;
  }
}
