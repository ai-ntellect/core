import { EventEmitter } from "events";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { IEventEmitter } from "../interfaces";
import { GraphContext, GraphDefinition, GraphEvent, Node } from "../types";
import { GraphEventManager } from "./event-manager";
import { GraphLogger } from "./logger";
import { GraphNodeExecutor } from "./node-executor";
import { GraphObserver } from "./observer";

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
  private context: GraphContext<T>;
  public validator?: T;
  private eventEmitter: IEventEmitter;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;
  private graphEvents?: string[];
  private entryNode?: string;
  private logs: string[] = [];
  private verbose: boolean = false;
  public nodes: Map<string, Node<T, any>>;

  private eventSubject: Subject<GraphEvent<T>> = new Subject();
  private stateSubject: BehaviorSubject<GraphContext<T>>;
  private destroySubject: Subject<void> = new Subject();

  private observer: GraphObserver<T>;
  private logger: GraphLogger;
  private eventManager: GraphEventManager<T>;
  private nodeExecutor: GraphNodeExecutor<T>;

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

    this.stateSubject = new BehaviorSubject<GraphContext<T>>(this.context);

    this.logger = new GraphLogger(name, options.verbose);
    this.eventManager = new GraphEventManager(
      this.eventEmitter,
      this.nodes,
      name,
      this.context,
      config.events,
      config.entryNode,
      config.onError
    );
    this.nodeExecutor = new GraphNodeExecutor(
      this.nodes,
      this.logger,
      this.eventManager,
      this.eventSubject,
      this.stateSubject
    );

    this.setupEventStreams();
    this.setupEventListeners();
    this.setupGraphEventListeners();

    this.observer = new GraphObserver(
      this,
      this.eventSubject,
      this.stateSubject,
      this.destroySubject
    );
  }

  /**
   * Sets up event listeners for node-based events
   * @private
   * @description Attaches all node-based event triggers while preserving external listeners
   */
  private setupEventStreams(): void {
    this.eventManager.on("nodeStarted", (data) => {
      this.addLog(`Event: Node "${data.name}" started`);
    });

    this.eventManager.on("nodeCompleted", (data) => {
      this.addLog(`Event: Node "${data.name}" completed`);
    });

    this.eventManager.on("nodeError", (data) => {
      let errorMessage = "Unknown error";
      if (data.error) {
        errorMessage =
          data.error instanceof Error
            ? data.error.message
            : data.error.errors?.[0]?.message ||
              data.error.message ||
              "Unknown error";
      }
      this.addLog(`Event: Node "${data.name}" error: ${errorMessage}`);
    });

    this.eventManager.on("nodeStateChanged", (data) => {
      this.addLog(`Event: Node "${data.name}" state changed`);
    });
  }

  /**
   * Sets up event listeners for node-based events
   * @private
   * @description Attaches all node-based event triggers while preserving external listeners
   */
  private setupEventListeners(): void {
    this.eventManager.setupEventListeners();
  }

  /**
   * Sets up event listeners for graph-based events
   * @private
   * @description Attaches all graph-based event triggers
   */
  private setupGraphEventListeners(): void {
    this.eventManager.setupGraphEventListeners();
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
    return this.nodeExecutor.executeNode(
      nodeName,
      context,
      inputs,
      triggeredByEvent
    );
  }

  private addLog(message: string): void {
    this.logger.addLog(message);
  }

  public getLogs(): string[] {
    return this.logger.getLogs();
  }

  public clearLogs(): void {
    this.logger.clearLogs();
  }

  /**
   * Get the observer instance for monitoring graph state and events
   */
  public observe() {
    return this.observer;
  }

  /**
   * Enable or disable verbose logging
   * @param {boolean} enabled - Whether to enable verbose logging
   */
  public setVerbose(enabled: boolean): void {
    this.logger.setVerbose(enabled);
  }

  /**
   * Get current verbose setting
   * @returns {boolean} Current verbose setting
   */
  public isVerbose(): boolean {
    return this.logger.isVerbose();
  }

  /**
   * Executes the graph flow starting from a specific node
   * @param {string} startNode - Name of the node to start execution from
   * @param {Partial<GraphContext<T>>} inputContext - Optional partial context to merge with current context
   * @param {any} inputParams - Optional input parameters for the start node
   * @returns {Promise<GraphContext<T>>} Final context after execution
   */
  public async execute(
    startNode: string,
    inputParams?: any,
    inputContext?: Partial<GraphContext<T>>
  ): Promise<GraphContext<T>> {
    if (inputParams) {
      Object.assign(this.context, inputParams);
    }

    if (inputContext) {
      Object.assign(this.context, inputContext);
    }

    this.eventEmitter.emit("graphStarted", { name: this.name });

    try {
      await this.nodeExecutor.executeNode(
        startNode,
        this.context,
        inputParams,
        false
      );

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
   * @returns {Promise<void>}
   */
  public async emit(
    eventName: string,
    data?: Partial<GraphContext<T>>
  ): Promise<void> {
    const event: GraphEvent<T> = {
      type: eventName,
      payload: data,
      timestamp: Date.now(),
    };
    this.eventSubject.next(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Registers an event handler
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} handler - Handler function to execute when event is emitted
   */
  public on(eventName: string, handler: (...args: any[]) => void): void {
    this.eventManager.on(eventName, handler);
  }

  /**
   * Updates the graph definition with new configuration
   * @param {GraphDefinition<T>} definition - New graph definition
   */
  public load(definition: GraphDefinition<T>): void {
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
  public log(message: string, data?: any): void {
    this.logger.log(message, data);
  }

  /**
   * Adds a new node to the graph
   * @param {Node<T>} node - Node to add
   * @throws {Error} If node with same name already exists
   */
  public addNode(node: Node<T, any>): void {
    this.nodes.set(node.name, node);
    this.eventManager.setupEventListeners();
  }

  /**
   * Removes a node from the graph
   * @param {string} nodeName - Name of the node to remove
   */
  public removeNode(nodeName: string): void {
    this.nodes.delete(nodeName);
    this.eventManager.setupEventListeners();
  }

  /**
   * Returns all nodes in the graph
   * @returns {Node<T>[]} Array of all nodes
   */
  public getNodes(): Node<T, any>[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.destroySubject.next();
    this.destroySubject.complete();
    this.eventSubject.complete();
    this.stateSubject.complete();
  }
}
