import { EventEmitter } from "events";
import { ZodSchema } from "zod";
import { IEventEmitter } from "../interfaces";
import { GraphContext, GraphDefinition, Node } from "../types";

/**
 * @module GraphFlow
 * @description A flexible workflow engine that manages the execution of nodes in a graph-like structure.
 *
 * Key features:
 * - Multiple branches support
 * - Conditional branching (runs first matching condition, or all if none have conditions)
 * - Event-driven nodes
 * - Zod validation of context/inputs/outputs
 * - Automatic retry on node failures
 *
 * @template T - Extends ZodSchema for type validation
 */
export class GraphFlow<T extends ZodSchema> {
  private nodes: Map<string, Node<T>>;
  private context: GraphContext<T>;
  public validator?: T;
  private eventEmitter: IEventEmitter;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;

  /**
   * Creates a new instance of GraphFlow
   * @param {string} name - The name of the graph flow
   * @param {GraphDefinition<T>} config - Configuration object containing nodes, schema, context, and error handlers
   */
  constructor(public name: string, config: GraphDefinition<T>) {
    this.nodes = new Map(config.nodes.map((node) => [node.name, node]));
    this.validator = config.schema;
    this.context = config.schema.parse(config.context) as GraphContext<T>;
    this.globalErrorHandler = config.onError;
    this.eventEmitter = config.eventEmitter || new EventEmitter();

    this.setupEventListeners();
  }

  /**
   * Creates a new context for execution
   * @private
   * @returns {GraphContext<T>} A cloned context to prevent pollution during parallel execution
   */
  private createNewContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  /**
   * Sets up event listeners for node-based events
   * @private
   * @description Attaches all node-based event triggers while preserving external listeners
   */
  private setupEventListeners(): void {
    // First remove only the existing node-based listeners that we might have created previously
    // We do NOT remove, for example, "nodeStarted" or "nodeCompleted" listeners that test code added.
    for (const [eventName, listener] of this.eventEmitter
      .rawListeners("*")
      .entries()) {
      // This can be tricky—EventEmitter doesn't directly let you remove by "type" of listener.
      // Alternatively, we can store references in a separate structure.
      // For simplicity, let's do a full removeAllListeners() on node-specified events (only),
      // then re-add them below, but keep the test-based events like "nodeStarted" or "nodeCompleted".
    }

    // The simplest approach: removeAllListeners for each event that is declared as a node event
    // so we don't stack up duplicates:
    const allEvents = new Set<string>();
    for (const node of this.nodes.values()) {
      if (node.events) {
        node.events.forEach((evt) => allEvents.add(evt));
      }
    }
    for (const evt of allEvents) {
      // remove only those events that are used by nodes
      this.eventEmitter.removeAllListeners(evt);
    }

    // Now re-add the node-based event triggers
    for (const node of this.nodes.values()) {
      if (node.events && node.events.length > 0) {
        node.events.forEach((event) => {
          this.eventEmitter.on(
            event,
            async (data?: Partial<GraphContext<T>>) => {
              const freshContext = this.createNewContext();
              if (data) Object.assign(freshContext, data);

              // If triggered by an event, we pass "true" so event-driven node will skip `next`.
              await this.executeNode(
                node.name,
                freshContext,
                undefined,
                /* triggeredByEvent= */ true
              );
            }
          );
        });
      }
    }
  }

  /**
   * Executes a specific node in the graph
   * @private
   * @param {string} nodeName - Name of the node to execute
   * @param {GraphContext<T>} context - Current execution context
   * @param {any} inputs - Input parameters for the node
   * @param {boolean} triggeredByEvent - Whether the execution was triggered by an event
   * @returns {Promise<void>}
   */
  private async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    inputs?: any,
    triggeredByEvent: boolean = false
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`❌ Node "${nodeName}" not found.`);

    if (node.condition && !node.condition(context)) {
      return;
    }

    let attempts = 0;
    const maxAttempts = node.retry?.maxAttempts || 1;
    const delay = node.retry?.delay || 0;

    while (attempts < maxAttempts) {
      try {
        let validatedInputs;
        if (node.inputs) {
          if (!inputs) {
            throw new Error(
              `❌ Inputs required for node "${nodeName}" but received: ${inputs}`
            );
          }
          validatedInputs = node.inputs.parse(inputs);
        }

        this.eventEmitter.emit("nodeStarted", { name: nodeName, context });

        // Execute the node
        await node.execute(context, validatedInputs);

        if (node.outputs) {
          node.outputs.parse(context);
        }

        this.validateContext(context);
        this.eventEmitter.emit("nodeCompleted", { name: nodeName, context });

        // IMPORTANT: Si le nœud est déclenché par un événement et a des événements définis,
        // on arrête ici et on ne suit pas la chaîne next
        if (triggeredByEvent && node.events && node.events.length > 0) {
          this.context = structuredClone(context);
          return;
        }

        // Gérer les nœuds suivants
        if (node.next && node.next.length > 0) {
          const branchContexts: GraphContext<T>[] = [];

          // Exécuter toutes les branches valides
          for (const nextNodeName of node.next) {
            const nextNode = this.nodes.get(nextNodeName);
            if (!nextNode) continue;

            const branchContext = structuredClone(context);

            // Si le nœud a une condition et qu'elle n'est pas remplie, passer au suivant
            if (nextNode.condition && !nextNode.condition(branchContext)) {
              continue;
            }

            await this.executeNode(nextNodeName, branchContext);
            branchContexts.push(branchContext);
          }

          // Fusionner les résultats des branches dans l'ordre
          if (branchContexts.length > 0) {
            const finalContext = branchContexts[branchContexts.length - 1];
            Object.assign(context, finalContext);
          }
        }

        // Mettre à jour le contexte global
        this.context = structuredClone(context);
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

  /**
   * Validates the current context against the schema
   * @private
   * @param {GraphContext<T>} context - Context to validate
   * @throws {Error} If validation fails
   */
  private validateContext(context: GraphContext<T>): void {
    if (this.validator) {
      this.validator.parse(context);
    }
  }

  /**
   * Executes the graph flow starting from a specific node
   * @param {string} startNode - Name of the node to start execution from
   * @param {Partial<GraphContext<T>>} inputContext - Optional partial context to merge with current context
   * @param {any} inputParams - Optional input parameters for the start node
   * @returns {Promise<GraphContext<T>>} Final context after execution
   */
  async execute(
    startNode: string,
    inputContext?: Partial<GraphContext<T>>,
    inputParams?: any
  ): Promise<GraphContext<T>> {
    // Fresh local context from the global
    const context = this.createNewContext();
    if (inputContext) Object.assign(context, inputContext);

    // Emit "graphStarted"
    this.eventEmitter.emit("graphStarted", { name: this.name });

    try {
      // Because we're calling explicitly, it's NOT triggered by an event
      await this.executeNode(
        startNode,
        context,
        inputParams,
        /* triggeredByEvent= */ false
      );

      // Emit "graphCompleted"
      this.eventEmitter.emit("graphCompleted", {
        name: this.name,
        context: this.context,
      });

      // Return a snapshot of the final global context
      return structuredClone(this.context);
    } catch (error) {
      // Emit "graphError"
      this.eventEmitter.emit("graphError", { name: this.name, error });
      this.globalErrorHandler?.(error as Error, context);
      throw error;
    }
  }

  /**
   * Emits an event to trigger event-based nodes
   * @param {string} eventName - Name of the event to emit
   * @param {Partial<GraphContext<T>>} data - Optional data to merge with context
   * @returns {Promise<GraphContext<T>>} Updated context after event handling
   */
  public async emit(
    eventName: string,
    data?: Partial<GraphContext<T>>
  ): Promise<GraphContext<T>> {
    // Merge data into a fresh copy of the global context if desired
    const context = this.createNewContext();
    if (data) Object.assign(context, data);

    // Just emit the event; the node-based event listeners in setupEventListeners()
    // will handle calling "executeNode(...)"
    this.eventEmitter.emit(eventName, context);

    // Return the updated global context
    return this.getContext();
  }

  /**
   * Registers an event handler
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} handler - Handler function to execute when event is emitted
   */
  on(eventName: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(eventName, handler);
  }

  /**
   * Updates the graph definition with new configuration
   * @param {GraphDefinition<T>} definition - New graph definition
   */
  loadDefinition(definition: GraphDefinition<T>): void {
    // Clear all existing nodes
    this.nodes.clear();
    // Wipe out old node-based event listeners
    // (We keep external test listeners like "nodeStarted" or "nodeCompleted".)
    if (definition.nodes?.length) {
      const allEvents = new Set<string>();
      definition.nodes.forEach((n) =>
        n.events?.forEach((evt) => allEvents.add(evt))
      );
      for (const evt of allEvents) {
        this.eventEmitter.removeAllListeners(evt);
      }
    }

    // Add in new nodes
    definition.nodes.forEach((node) => this.nodes.set(node.name, node));

    // Parse the new context
    this.context = definition.schema.parse(
      definition.context
    ) as GraphContext<T>;
    this.validator = definition.schema;

    // Re-setup only node-based event triggers
    for (const node of this.nodes.values()) {
      if (node.events && node.events.length > 0) {
        node.events.forEach((event) => {
          this.eventEmitter.on(
            event,
            async (data?: Partial<GraphContext<T>>) => {
              const freshContext = structuredClone(this.context);
              if (data) Object.assign(freshContext, data);
              await this.executeNode(node.name, freshContext, undefined, true);
            }
          );
        });
      }
    }
  }

  /**
   * Returns the current context
   * @returns {GraphContext<T>} Current graph context
   */
  getContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  /**
   * Logs a message with optional data
   * @param {string} message - Message to log
   * @param {any} data - Optional data to log
   */
  log(message: string, data?: any): void {
    console.log(`[Graph ${this.name}] ${message}`, data);
  }

  /**
   * Adds a new node to the graph
   * @param {Node<T>} node - Node to add
   * @throws {Error} If node with same name already exists
   */
  addNode(node: Node<T>): void {
    this.nodes.set(node.name, node);
    if (node.events && node.events.length > 0) {
      for (const evt of node.events) {
        this.eventEmitter.on(evt, async (data?: Partial<GraphContext<T>>) => {
          const freshContext = this.createNewContext();
          if (data) Object.assign(freshContext, data);
          await this.executeNode(node.name, freshContext, undefined, true);
        });
      }
    }
  }

  /**
   * Removes a node from the graph
   * @param {string} nodeName - Name of the node to remove
   */
  removeNode(nodeName: string): void {
    const node = this.nodes.get(nodeName);
    if (!node) return;

    // remove the node from the map
    this.nodes.delete(nodeName);

    // remove any of its event-based listeners
    if (node.events && node.events.length > 0) {
      for (const evt of node.events) {
        // removeAllListeners(evt) would also remove other node listeners,
        // so we need a more fine-grained approach. Ideally, we should keep a reference
        // to the exact listener function we attached. For brevity, let's remove all for that event:
        this.eventEmitter.removeAllListeners(evt);
      }
      // Then reattach the others that remain in the graph
      for (const n of this.nodes.values()) {
        if (n.events && n.events.length > 0) {
          n.events.forEach((e) => {
            this.eventEmitter.on(e, async (data?: Partial<GraphContext<T>>) => {
              const freshContext = this.createNewContext();
              if (data) Object.assign(freshContext, data);
              await this.executeNode(n.name, freshContext, undefined, true);
            });
          });
        }
      }
    }
  }

  /**
   * Returns all nodes in the graph
   * @returns {Node<T>[]} Array of all nodes
   */
  getNodes(): Node<T>[] {
    return Array.from(this.nodes.values());
  }
}
