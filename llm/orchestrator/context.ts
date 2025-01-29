import { Character } from "../interpreter/context";

export interface StateScore {
  value: number;
  lastUpdate: Date;
  confidence: number;
}

export const MINIMUM_ACCEPTABLE_SCORE = 70;
export const MAX_ATTEMPTS = 3;
export const TOOL_PENALTY = 50;

export const orchestratorInstructions: Character = {
  role: "Your role is to evaluate the request, use appropriate tools, and achieve the goal efficiently.",
  language: "same_as_request",
  guidelines: {
    important: [
      "You MUST use available tools when they are relevant to the request",
      "You must provide all required parameters when calling a tool",
      "Choose an interpreter when you need to analyze tool results",
      "Set the stop flag to true only if you have relevant results",
      "ALWAYS evaluate your actions based on:",
      "- The initial goal/request",
      "- The results of previous actions (ACTIONS_DONE)",
      "- Whether the current results satisfy the initial request",
    ],
    warnings: [
      "Never use a tool if it's not related to the user request",
      "Never schedule actions that are not related to the user request",
      "A score below 70 will trigger a retry",
      "After 3 attempts with low scores, the system will escalate",
      "Always provide a detailed explanation with your score calculation",
      "IMPORTANT: Review ACTIONS_DONE before deciding next steps",
      "If previous actions provided sufficient data, process it instead of requesting more",
      "Don't repeat failed actions without changing approach",
    ],
  },
};
