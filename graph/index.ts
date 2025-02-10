import { EventEmitter } from "events";
import { IEventEmitter } from "interfaces";
import { ZodSchema } from "zod";
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
  private nodes: Map<string, Node<T, any>>;
  private context: GraphContext<T>;
  public validator?: T;
  private eventEmitter: IEventEmitter;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;
  private graphEvents?: string[];
  private entryNode?: string;
  private logs: string[] = [];
  private verbose: boolean = false;

  /**
   * Creates a new instance of GraphFlow
   * @param {string} name - The name of the graph flow
   * @param {GraphDefinition<T>} config - Configuration object containing nodes, schema, context, and error handlers
   * @param {Object} options - Optional options for the graph flow
   */
  constructor(
    public name: string,
    config: GraphDefinition<T>,
    options: { verbose?: boolean } = {}
  ) {
    this.nodes = new Map(
      config.nodes.map((node: Node<T, any>) => [node.name, node])
    );
    this.validator = config.schema;
    this.context = config.schema.parse(config.context) as GraphContext<T>;
    this.globalErrorHandler = config.onError;
    this.eventEmitter =
      config.eventEmitter || (new EventEmitter() as IEventEmitter);
    this.graphEvents = config.events;
    this.verbose = options.verbose ?? false;

    this.setupEventListeners();
    this.setupGraphEventListeners();
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

  private addLog(message: string): void {
    const logMessage = `[${new Date().toISOString()}] ${message}`;
    this.logs.push(logMessage);
    if (this.verbose) {
      console.log(`[${this.name}] ${message}`);
    }
  }

  /**
   * Enable or disable verbose logging
   * @param {boolean} enabled - Whether to enable verbose logging
   */
  public setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  /**
   * Get current verbose setting
   * @returns {boolean} Current verbose setting
   */
  public isVerbose(): boolean {
    return this.verbose;
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
    inputs: any,
    triggeredByEvent: boolean = false
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found.`);

    this.addLog(`🚀 Starting node "${nodeName}"`);
    this.eventEmitter.emit("nodeStarted", { name: nodeName });

    try {
      const localContext = structuredClone(context);

      if (node.condition && !node.condition(localContext)) {
        this.addLog(`⏭️ Skipping node "${nodeName}" - condition not met`);
        return;
      }

      // Validate inputs
      if (node.inputs) {
        if (!inputs) {
          this.addLog(`❌ Missing required inputs for node "${nodeName}"`);
          throw new Error(`Inputs required for node "${nodeName}"`);
        }
        this.addLog(`📥 Validating inputs for node "${nodeName}"`);
        inputs = node.inputs.parse(inputs);
      }

      // Handle retry logic
      if (node.retry && node.retry.maxAttempts > 0) {
        let attempts = 0;
        let lastError: Error | null = null;

        while (attempts < node.retry.maxAttempts) {
          try {
            this.addLog(`🔄 Attempt ${attempts + 1}/${node.retry.maxAttempts}`);
            await node.execute(localContext, inputs);
            lastError = null;
            break;
          } catch (error: any) {
            lastError = error as Error;
            attempts++;
            this.addLog(`❌ Attempt ${attempts} failed: ${error.message}`);

            if (attempts === node.retry.maxAttempts) {
              // Si toutes les tentatives ont échoué et qu'il y a un gestionnaire d'échec
              if (node.retry.onRetryFailed) {
                this.addLog(
                  `🔄 Executing retry failure handler for node "${nodeName}"`
                );
                try {
                  await node.retry.onRetryFailed(lastError, localContext);
                  // Si le gestionnaire d'échec réussit, on continue l'exécution
                  // SEULEMENT si le gestionnaire a explicitement retourné true
                  if (node.retry.continueOnFailed) {
                    this.addLog(
                      `✅ Retry failure handler succeeded for node "${nodeName}" - continuing execution`
                    );
                    break;
                  } else {
                    this.addLog(
                      `⚠️ Retry failure handler executed but node "${nodeName}" will still fail`
                    );
                    throw lastError;
                  }
                } catch (handlerError: any) {
                  this.addLog(
                    `❌ Retry failure handler failed for node "${nodeName}": ${handlerError.message}`
                  );
                  throw handlerError;
                }
              }
              // Si pas de gestionnaire d'échec ou si le gestionnaire a échoué
              throw lastError;
            }

            if (attempts < node.retry.maxAttempts) {
              this.addLog(
                `⏳ Waiting ${node.retry.delay}ms before next attempt`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, node.retry?.delay || 0)
              );
            }
          }
        }
      } else {
        await node.execute(localContext, inputs);
      }

      // Validate outputs
      if (node.outputs) {
        this.addLog(`📤 Validating outputs for node "${nodeName}"`);
        node.outputs.parse(localContext);
      }

      Object.assign(context, localContext);

      this.addLog(
        `✅ Node "${nodeName}" executed successfully ${JSON.stringify(context)}`
      );
      this.eventEmitter.emit("nodeCompleted", { name: nodeName });

      // Handle waitForEvent
      if (node.waitForEvent && !triggeredByEvent) {
        this.addLog(
          `⏳ Node "${nodeName}" waiting for events: ${node.events?.join(", ")}`
        );

        await new Promise<void>((resolve) => {
          const eventHandler = () => {
            this.addLog(`🚀 Event received for node "${nodeName}"`);
            resolve();
          };

          node.events?.forEach((event) => {
            this.eventEmitter.once(event, eventHandler);
          });
        });

        const nextNodes =
          typeof node.next === "function"
            ? node.next(context)
            : node.next || [];

        if (nextNodes.length > 0) {
          this.addLog(`➡️ Executing next nodes: ${nextNodes.join(", ")}`);

          // Créer un contexte unique pour toutes les branches
          const branchContext = structuredClone(context);

          // Exécuter les branches séquentiellement avec le même contexte
          for (const nextNodeName of nextNodes) {
            this.addLog(`🔄 Starting branch for node "${nextNodeName}"`);
            const nextNode = this.nodes.get(nextNodeName);
            if (nextNode) {
              // Utiliser le même contexte pour toutes les branches
              await this.executeNode(
                nextNodeName,
                branchContext,
                undefined,
                nextNode.waitForEvent
              );
            }
            this.addLog(`✅ Branch "${nextNodeName}" completed`);
          }

          // Mettre à jour le contexte global avec le résultat final des branches
          Object.assign(context, branchContext);
          this.context = structuredClone(context);

          this.eventEmitter.emit("graphCompleted", {
            name: this.name,
            context: this.context,
          });

          return;
        }
      }

      // Execute next nodes
      const nextNodes =
        typeof node.next === "function"
          ? node.next(localContext)
          : node.next || [];

      if (nextNodes.length > 0) {
        this.addLog(`➡️ Executing next nodes: ${nextNodes.join(", ")}`);

        // Créer un contexte unique pour toutes les branches
        const branchContext = structuredClone(context);

        // Exécuter les branches séquentiellement avec le même contexte
        for (const nextNodeName of nextNodes) {
          this.addLog(`🔄 Starting branch for node "${nextNodeName}"`);
          const nextNode = this.nodes.get(nextNodeName);
          if (nextNode) {
            // Utiliser le même contexte pour toutes les branches
            await this.executeNode(
              nextNodeName,
              branchContext,
              undefined,
              nextNode.waitForEvent
            );
          }
          this.addLog(`✅ Branch "${nextNodeName}" completed`);
        }

        // Mettre à jour le contexte global avec le résultat final des branches
        Object.assign(context, branchContext);
        this.context = structuredClone(context);
      }
    } catch (error: any) {
      this.addLog(`❌ Error in node "${nodeName}": ${error.message}`);
      this.eventEmitter.emit("nodeError", { name: nodeName, error });
      throw error;
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
    inputParams?: any,
    inputContext?: Partial<GraphContext<T>>
  ): Promise<GraphContext<T>> {
    if (inputParams) {
      // Merge inputParams into context
      Object.assign(this.context, inputParams);
    }

    if (inputContext) {
      Object.assign(this.context, inputContext);
    }

    this.eventEmitter.emit("graphStarted", { name: this.name });

    try {
      await this.executeNode(startNode, this.context, inputParams, false);

      this.eventEmitter.emit("graphCompleted", {
        name: this.name,
        context: this.context,
      });

      return this.getContext();
    } catch (error) {
      this.eventEmitter.emit("graphError", { name: this.name, error });
      this.globalErrorHandler?.(error as Error, this.context);
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
    const workingContext = structuredClone(this.context);

    if (data) {
      Object.assign(workingContext, data);
    }

    const eventNodes = Array.from(this.nodes.values()).filter((node) =>
      node.events?.includes(eventName)
    );

    // Execute event nodes sequentially with shared context
    for (const node of eventNodes) {
      await this.executeNode(node.name, workingContext, undefined, true);
    }

    // Update global context after all event nodes are executed
    this.context = structuredClone(workingContext);

    this.eventEmitter.emit("graphCompleted", {
      name: this.name,
      context: this.context,
    });

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
  load(definition: GraphDefinition<T>): void {
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

    // Store entry node
    this.entryNode = definition.entryNode;
    // Store graph events
    this.graphEvents = definition.events;

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

    // Re-setup graph event listeners
    this.setupGraphEventListeners();
  }

  /**
   * Gets a copy of the current context
   * @returns {GraphContext<T>} A deep copy of the current context
   */
  public getContext(): GraphContext<T> {
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
  addNode(node: Node<T, any>): void {
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
  getNodes(): Node<T, any>[] {
    return Array.from(this.nodes.values());
  }

  private setupGraphEventListeners(): void {
    if (this.graphEvents && this.graphEvents.length > 0) {
      this.graphEvents.forEach((event) => {
        this.eventEmitter.on(event, async (data?: Partial<GraphContext<T>>) => {
          const freshContext = this.createNewContext();
          if (data) Object.assign(freshContext, data);

          // Emit "graphStarted"
          this.eventEmitter.emit("graphStarted", { name: this.name });

          try {
            // Execute the graph starting from the entry node
            if (!this.entryNode) {
              throw new Error("No entry node defined for graph event handling");
            }

            await this.executeNode(
              this.entryNode,
              freshContext,
              undefined,
              false
            );

            // Emit "graphCompleted"
            this.eventEmitter.emit("graphCompleted", {
              name: this.name,
              context: this.context,
            });
          } catch (error) {
            // Emit "graphError"
            this.eventEmitter.emit("graphError", { name: this.name, error });
            this.globalErrorHandler?.(error as Error, freshContext);
            throw error;
          }
        });
      });
    }
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
