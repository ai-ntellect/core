import { CoreMessage } from "ai";
import { QueueResult } from "../../types";

export interface State {
  currentContext: string;
  previousActions: (string | QueueResult)[];
  results?: string;
  recentMessages: CoreMessage[];
}

export interface Action {
  name: string;
  parameters: Record<string, any>;
}
