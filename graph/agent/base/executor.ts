import { BaseAgent } from ".";
import { GraphFlow } from "../..";
import {
  ActionSchema,
  AgentContext,
  DecisionOutput,
} from "../../../types/agent";

/**
 * Abstract base class for agent executors that handle action execution
 * @abstract
 * @class AgentExecutor
 */
export abstract class AgentExecutor {
  protected agent: BaseAgent;
  protected availableGraphs: Map<string, GraphFlow<any>>;

  /**
   * Creates an instance of AgentExecutor
   * @param {BaseAgent} agent - The agent instance this executor is tied to
   * @param {GraphFlow<any>[]} graphs - Array of available graph flows that can be executed
   */
  constructor(agent: BaseAgent, graphs: GraphFlow<any>[]) {
    this.agent = agent;
    this.availableGraphs = new Map(graphs.map((g) => [g.name, g]));
  }

  /**
   * Makes a decision based on the current context
   * @abstract
   * @param {any} context - The context to base the decision on
   * @returns {Promise<DecisionOutput>} The decision output containing actions and response
   */
  abstract makeDecision(context: any): Promise<DecisionOutput>;

  /**
   * Executes a list of actions in the given context
   * @param {ActionSchema[]} actions - Array of actions to execute
   * @param {AgentContext} context - The context in which to execute the actions
   * @returns {Promise<void>}
   */
  async executeActions(
    actions: ActionSchema[],
    context: AgentContext
  ): Promise<void> {
    const workflowsToExecute: GraphFlow<any>[] = [];
    const startNodes: string[] = [];
    const inputs: any[] = [];

    for (const action of actions) {
      const workflow = this.availableGraphs.get(action.name);
      if (!workflow) continue;

      workflowsToExecute.push(workflow);
      startNodes.push(workflow.getNodes()[0].name);
      inputs.push(this.prepareActionInputs(action.parameters));
    }

    if (workflowsToExecute.length > 0) {
      await this.executeWorkflows(
        workflowsToExecute,
        startNodes,
        inputs,
        context
      );
    }
  }

  /**
   * Prepares the input parameters for an action
   * @private
   * @param {Array<{name: string, value: any}>} parameters - Array of parameter objects
   * @returns {Record<string, any>} Object with parameter names as keys and their values
   */
  private prepareActionInputs(
    parameters: Array<{ name: string; value: any }>
  ): Record<string, any> {
    return parameters.reduce((acc, param) => {
      acc[param.name] = param.value;
      return acc;
    }, {} as Record<string, any>);
  }

  /**
   * Executes multiple workflows with their respective inputs
   * @protected
   * @abstract
   * @param {GraphFlow<any>[]} workflows - Array of workflows to execute
   * @param {string[]} startNodes - Array of starting node names for each workflow
   * @param {any[]} inputs - Array of inputs for each workflow
   * @param {AgentContext} context - The context in which to execute the workflows
   * @returns {Promise<void>}
   */
  protected abstract executeWorkflows(
    workflows: GraphFlow<any>[],
    startNodes: string[],
    inputs: any[],
    context: AgentContext
  ): Promise<void>;
}
