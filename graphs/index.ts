import { Agent } from "../agent";
import { MyContext, Node, SharedState } from "../types";
import { handleInterpreter } from "./handlers/interpreter.handler";
import { handleMemory } from "./handlers/memory.handler";
import { handleOrchestrator } from "./handlers/orchestrator.handler";
import { handleQueue } from "./handlers/queue.handler";
import { handleScheduler } from "./handlers/scheduler.handler";

export interface GraphDefinition<T> {
  name: string;
  nodes: {
    [key: string]: Node<T> & {
      condition?: (state: SharedState<T>) => boolean;
      next?: string[];
    };
  };
  entryNode: string;
  checkForCycles?: () => boolean;
}

const hasActions = (state: SharedState<MyContext>): boolean =>
  !!state.context.actions && state.context.actions.length > 0;

const isNotStopped = (state: SharedState<MyContext>): boolean =>
  !state.context.processing?.stop;

const isInterpreterDefined = (state: SharedState<MyContext>): boolean =>
  !!state.context.interpreter;

const isResultsDefined = (state: SharedState<MyContext>): boolean =>
  !!state.context.results && state.context.results.length > 0;

const isStopped = (state: SharedState<MyContext>): boolean =>
  !!state.context.processing?.stop;

export const createMainGraph = (
  agent: Agent,
  prompt: string,
  callbacks?: any
): GraphDefinition<MyContext> => ({
  name: "agentGraph", // Name of the graph
  entryNode: "makeDecision", // Entry node
  nodes: {
    makeDecision: {
      name: "makeDecision", // Make a decision following the environment
      execute: async (state) =>
        handleOrchestrator(prompt, state, agent, callbacks),
      condition: (state) => isNotStopped(state), // Check if the agent is not stopped
      next: ["checkEnvironment", "scheduleActions", "interpretResults"], // Next nodes to execute
    },
    checkEnvironment: {
      name: "checkEnvironment", // Check the environment
      execute: async (state) => handleQueue(state, agent, callbacks),
      condition: (state) => hasActions(state) && isNotStopped(state), // Check if there are actions to handle and the agent is not stopped
      next: ["makeDecision"],
    },
    scheduleActions: {
      name: "scheduleActions", // Schedule actions
      execute: async (state) => handleScheduler(prompt, state, agent),
      condition: (state) => hasActions(state), // Check if there are actions to schedule
    },
    interpretResults: {
      name: "interpretResults",
      execute: async (state) => handleInterpreter(state, agent),
      condition: (state) =>
        isInterpreterDefined(state) && // Check if interpreter is defined
        isResultsDefined(state) && // Check if results are defined
        isStopped(state), // Check if processing is stopped
      next: ["saveMemory"],
    },
    saveMemory: {
      name: "saveMemory", // Save memory
      execute: async (state) => handleMemory(state, agent),
      condition: (state) => isResultsDefined(state), // Check if results are defined
    },
  },
});
