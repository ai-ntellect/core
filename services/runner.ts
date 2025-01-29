import { GraphDefinition } from "../types";
import { Graph } from "./graph";

export class Runner<T> {
  private workflows: Record<string, Graph<T>> = {};

  async run(actions: any[], workflows: GraphDefinition<T>[]) {
    // Créer un map des workflows pour une recherche efficace
    const workflowMap = new Map(workflows.map((w) => [w.name, w]));

    for (const action of actions) {
      const workflow = workflowMap.get(action.name);
      if (!workflow) {
        throw new Error(`Workflow not found: ${action.name}`);
      }

      // Création du workflow
      this.workflows[action.name] = new Graph(workflow, {
        schema: workflow.schema,
        autoDetectCycles: true,
      });

      // Reconstruction de l'état avec tous les paramètres
      const state = {
        ...action.parameters.reduce(
          (acc: Record<string, any>, param: { name: string; value: any }) => {
            acc[param.name] = param.value;
            return acc;
          },
          {} as Record<string, any>
        ),
      };

      // Exécution séquentielle
      await this.workflows[action.name].execute(state, workflow.entryNode);
      const updatedState = await this.workflows[action.name].getState();
      console.log("🔄 Updated State:", updatedState);
      return { context: updatedState.context as T, updatedState };
    }
  }
}
