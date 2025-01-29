import { Agent } from "..";
import { GraphDefinition, MyContext } from "../../types";
import {
  hasActions,
  isInterpreterDefined,
  isNotStopped,
  isResultsDefined,
  isStopped,
  shouldRetry,
} from "./conditions";
import { handleAgenda } from "./handlers/agenda.handler";
import { handleInterpreter } from "./handlers/interpreter.handler";
import { handleMemory } from "./handlers/memory.handler";
import { handleOrchestrator } from "./handlers/orchestrator.handler";
import { handleQueue } from "./handlers/queue.handler";

const MINIMUM_ACCEPTABLE_SCORE = 50;
const MAX_ATTEMPTS = 3;

export const createMainGraph = (
  agent: Agent,
  prompt: string,
  callbacks?: any
): GraphDefinition<MyContext> => ({
  name: "agent",
  entryNode: "orchestrator",
  nodes: {
    orchestrator: {
      name: "orchestrator",
      description: "Make a decision following the current context",
      execute: async (params, state) => {
        const result = await handleOrchestrator(agent, callbacks);

        return result;
      },
      condition: (state) => isNotStopped(state) || shouldRetry(state),
      relationships: [
        {
          name: "executeWorkflows",
          description: "Execute the workflows",
        },
        {
          name: "agenda",
          description: "Schedule actions for the future",
        },
        {
          name: "interpreter",
          description: "Interpret the results of the actions",
        },
      ],
    },
    executeWorkflows: {
      name: "executeWorkflows",
      description: "Execute the workflows",
      execute: async () => {
        const currentState = agent.graph.getState();
        console.log("🔄 Execute workflows");
        return handleQueue(currentState, agent, callbacks);
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return hasActions(currentState) && isNotStopped(currentState);
      },
      relationships: [
        {
          name: "orchestrator",
          description: "Make a decision following the current context",
        },
      ],
    },
    agenda: {
      name: "agenda",
      description: "Schedule actions for the future",
      execute: async () => {
        const currentState = agent.graph.getState();
        return handleAgenda(prompt, currentState, agent);
      },
      condition: hasActions,
    },
    interpreter: {
      name: "interpreter",
      description: "Interpret the results of the actions",
      execute: async () => {
        console.log("🔄 Interpreter");
        const currentState = agent.graph.getState();
        return handleInterpreter(currentState, agent);
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return (
          isInterpreterDefined(currentState) &&
          isResultsDefined(currentState) &&
          isStopped(currentState)
        );
      },
      relationships: [
        {
          name: "memory",
          description: "Save memory",
        },
      ],
    },
    memory: {
      name: "memory",
      description: "Save memory",
      execute: async () => {
        console.log("🔄 Memory");
        const currentState = agent.graph.getState();
        return handleMemory(currentState, agent);
      },
      condition: () => {
        const currentState = agent.graph.getState();
        return isResultsDefined(currentState);
      },
    },
  },
});
