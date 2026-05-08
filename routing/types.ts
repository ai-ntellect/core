export interface Token {
  id: string;
  data: Record<string, any>;
  createdAt: number;
}

export interface Place {
  id: string;
  type: 'normal' | 'initial' | 'final';
  tokens: Token[];
}

export interface Guard {
  type: 'deterministic' | 'llm_evaluated';
  condition?: string;
  name?: string;
}

export interface TransitionAction {
  type: 'graphflow' | 'dynamic';
  name?: string;
  prompt?: string;
  maxSteps?: number;
  contextMapper?: (ctx: any) => any;
}

export interface Transition {
  id: string;
  from: string[];
  to: string | string[];
  guard?: Guard;
  action?: TransitionAction;
  description?: string;
  when?: {
    events: string[];
    timeout?: number;
  };
}

export interface PetriNetState {
  marking: Map<string, Token[]>;
  history: string[];
}

export interface TransitionResult {
  success: boolean;
  transitionId: string;
  newMarking: Map<string, Token[]>;
  consumedTokens: Token[];
  producedTokens: Token[];
  error?: string;
}

export type GuardLLMExecutor = (prompt: string, context: any) => Promise<boolean>;

export type ActionExecutor = (
  action: TransitionAction,
  context: any
) => Promise<any>;
