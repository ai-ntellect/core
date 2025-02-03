import { GraphConfig, GraphContext, GraphDefinition, Node } from "@/types";
import { configDotenv } from "dotenv";
import EventEmitter from "events";
import { ZodSchema } from "zod";
configDotenv();

// Classe Graph avec un contexte typé
export class Graph<T extends ZodSchema> {
  private nodes: Map<string, Node<T>>;
  private context: GraphContext<T>;
  public validator?: T;
  private eventEmitter: EventEmitter;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;

  constructor(public name: string, config: GraphConfig<T>) {
    this.nodes = new Map(config.nodes.map((node) => [node.name, node]));
    this.context = config.initialContext || ({} as GraphContext<T>);
    this.validator = config.validator;
    this.globalErrorHandler = config.globalErrorHandler;
    this.eventEmitter = new EventEmitter();
    this.setupEventListeners();
  }

  private createNewContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  private setupEventListeners(): void {
    for (const node of this.nodes.values()) {
      node.events?.forEach((event) => {
        this.eventEmitter.on(event, async (data?: Partial<GraphContext<T>>) => {
          const context = this.createNewContext();
          if (data) Object.assign(context, data);
          await this.executeNode(node.name, context);
        });
      });
    }
  }
  private async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    params?: any
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`❌ Node ${nodeName} not found`);

    if (node.condition && !node.condition(context)) return;

    let attempts = 0;
    const maxAttempts = node.retry?.maxAttempts || 1;
    const delay = node.retry?.delay || 0;

    while (attempts < maxAttempts) {
      try {
        let validatedParams;

        // ✅ Si le nœud a un `parameters`, on valide `params` avant exécution
        if (node.parameters) {
          if (!params) {
            throw new Error(
              `❌ Paramètres requis pour le nœud "${nodeName}" mais reçus: ${params}`
            );
          }
          validatedParams = node.parameters.parse(params);
        }

        // ✅ Exécuter avec ou sans `params`
        if (node.execute) {
          await node.execute(context);
        } else if (node.executeWithParams) {
          if (!validatedParams) {
            throw new Error(
              `❌ Paramètres invalides pour le nœud "${nodeName}"`
            );
          }
          await node.executeWithParams(context, validatedParams);
        }

        this.validateContext(context);

        this.eventEmitter.emit("nodeCompleted", { nodeName, context });

        if (node.next) {
          await Promise.all(
            node.next.map((nextNode) => this.executeNode(nextNode, context))
          );
        }
        return;
      } catch (error) {
        attempts++;

        if (attempts >= maxAttempts) {
          this.eventEmitter.emit("nodeError", { nodeName, error });
          node.onError?.(error as Error);
          this.globalErrorHandler?.(error as Error, context);
          throw error;
        }

        console.warn(
          `[Graph ${this.name}] Retry attempt ${attempts} for node ${nodeName}`,
          { error }
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private validateContext(context: GraphContext<T>): void {
    if (this.validator) {
      this.validator.parse(context);
    }
  }

  async execute(
    startNode: string,
    inputContext?: Partial<GraphContext<T>>,
    inputParams?: any
  ): Promise<GraphContext<T>> {
    const context = this.createNewContext();
    if (inputContext) Object.assign(context, inputContext);

    this.eventEmitter.emit("graphStarted", { name: this.name });
    try {
      await this.executeNode(startNode, context, inputParams);
      this.eventEmitter.emit("graphCompleted", { name: this.name, context });
      return context;
    } catch (error) {
      this.eventEmitter.emit("graphError", { name: this.name, error });
      this.globalErrorHandler?.(error as Error, context); // Gestionnaire d'erreurs global
      throw error;
    }
  }

  emit(
    eventName: string,
    data?: Partial<GraphContext<T>>
  ): Promise<GraphContext<T>> {
    return new Promise((resolve, reject) => {
      if (data) Object.assign(this.context, data); // ✅ Met à jour le contexte global

      this.eventEmitter.emit(eventName, this.context); // Utilise le contexte global

      const eventNodes = Array.from(this.nodes.values()).filter((node) =>
        node.events?.includes(eventName)
      );
      if (eventNodes.length === 0) return resolve(this.context);

      Promise.all(
        eventNodes.map(
          (node) =>
            new Promise<void>((resolve) => {
              this.eventEmitter.once("nodeCompleted", ({ nodeName }) => {
                if (nodeName === node.name) resolve();
              });
            })
        )
      )
        .then(() => resolve(this.context))
        .catch(reject);
    });
  }

  on(eventName: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(eventName, handler);
  }

  loadDefinition(definition: GraphDefinition<T>): void {
    this.nodes.clear();
    Object.values(definition.nodes).forEach((node) =>
      this.nodes.set(node.name, node)
    );
    this.setupEventListeners();
  }

  getContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  // Journalisation (logging)
  log(message: string, data?: any): void {
    console.log(`[Graph ${this.name}] ${message}`, data);
  }

  // Modification dynamique du graph
  addNode(node: Node<T>): void {
    this.nodes.set(node.name, node);
    this.setupEventListeners();
  }

  removeNode(nodeName: string): void {
    this.nodes.delete(nodeName);
  }

  getNodes(): Node<T>[] {
    return Array.from(this.nodes.values());
  }
}
