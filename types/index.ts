import { Message } from "ai";
import { Action } from "../llm/orchestrator/types";

export interface MyContext {
  messages?: Message[];
  prompt?: string;
  processing?: {
    stop: boolean;
    stopReason?: string;
  };
  actions?: Action[];
  response?: string;
  interpreter?: string | null;
  results?: any;
  score?: number;
}

export interface SharedState<T> {
  context: T;
  messages?: Message[];
}
