import { QueueResult } from "../../types";

export interface State {
  currentContext: string;
  previousActions: (string | QueueResult)[];
  reward?: number;
  userRequest?: string;
  results?: string;
}

export interface Action {
  name: string;
  parameters: Record<string, any>;
}
