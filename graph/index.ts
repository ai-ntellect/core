import { EventEmitter } from "events";
import { BehaviorSubject, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { GraphObservable, IEventEmitter, NLPNodeConfig } from "../interfaces";
import { NLPNode } from "../modules/nlp";
import {
  GraphConfig,
  GraphContext,
  GraphEvent,
  GraphNodeConfig,
} from "../types";
import { GraphEventManager } from "./event-manager";
import { GraphLogger } from "./logger";
import { GraphNode, NodeParams } from "./node";
import { GraphObserver } from "./observer";
import { GraphVisualizer } from "./visualizer";

/**
 * @module GraphFlow
 * @description A workflow engine that manages the execution of nodes in a graph-like structure.
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
  private verbose: boolean = false;
  public nodes: Map<string, GraphNodeConfig<T, any>>;
  public name: string;

  private eventSubject: Subject<GraphEvent<T>> = new Subject();
  private stateSubject: BehaviorSubject<GraphContext<T>>;
  private destroySubject: Subject<void> = new Subject();

  public observer: GraphObserver<T>;
  private logger: GraphLogger;
  private eventManager: GraphEventManager<T>;
  private nodeExecutor: GraphNode<T>;

  private nlpNodes: Map<string, NLPNode<T>> = new Map();

  /**
   * Creates a new instance of GraphFlow
   * @param {GraphConfig<T>} config - Configuration object containing name, nodes, schema, context, and error handlers
   * @param {Object} options - Optional options for the graph flow
   */
  constructor(config: GraphConfig<T>, options: { verbose?: boolean } = {}) {
    this.name = config.name;
    this.nodes = new Map(
      config.nodes.map((node: GraphNodeConfig<T, any>) => [node.name, node])
    );
    this.validator = config.schema;
    this.context = config.schema.parse(config.context) as GraphContext<T>;
    this.globalErrorHandler = config.onError;
    this.eventEmitter =
      config.eventEmitter || (new EventEmitter() as IEventEmitter);
    this.graphEvents = config.events;
    this.entryNode = config.entryNode;
    this.verbose = options.verbose ?? false;

    this.stateSubject = new BehaviorSubject<GraphContext<T>>(this.context);

    this.logger = new GraphLogger(this.name, options.verbose);
    this.eventManager = new GraphEventManager(
      this.eventEmitter,
      this.nodes,
      this.name,
      this.context,
      config.events,
      config.entryNode,
      config.onError
    );
    this.nodeExecutor = new GraphNode(
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
      this.destroySubject,
      this.eventManager
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
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found`);

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
  public observe(
    options: {
      debounce?: number;
      delay?: number;
      stream?: boolean;
      properties?: (string | number)[];
      onStreamLetter?: (data: { letter: string; property: string }) => void;
      onStreamComplete?: () => void;
    } = {}
  ): GraphObservable<T> {
    return this.observer.state(options) as GraphObservable<T>;
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
   * @param {any} inputs - Optional input parameters for the start node
   * @param {Partial<GraphContext<T>>} context - Optional context to merge
   * @param {NodeParams} params - Optional node parameters
   * @returns {Promise<GraphContext<T>>} Final context after execution
   */
  public async execute(
    startNode: string,
    params?: NodeParams,
    context?: Partial<GraphContext<T>>
  ): Promise<GraphContext<T>> {
    if (context) {
      Object.assign(this.context, context);
    }

    this.eventEmitter.emit("graphStarted", { name: this.name });

    try {
      const node = this.nodes.get(startNode);
      if (!node) throw new Error(`Node "${startNode}" not found`);

      if (node.params && !params) {
        throw new Error(`Params required for node "${startNode}"`);
      }

      await this.nodeExecutor.executeNode(
        startNode,
        this.context,
        params,
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
  public emit(
    eventName: string,
    data?: Partial<GraphContext<T>>
  ): Promise<void> {
    const event: GraphEvent<T> = {
      type: eventName,
      payload: data,
      timestamp: Date.now(),
    };
    this.eventSubject.next(event);
    this.eventManager.emit(eventName, data);
    return Promise.resolve();
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
   * @param {GraphConfig<T>} definition - New graph definition
   */
  public load(definition: GraphConfig<T>): void {
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
   * @param {GraphNodeConfig<T, any>} node - Node to add
   * @throws {Error} If node with same name already exists
   */
  public addNode(node: GraphNodeConfig<T, any>): void {
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
  public getNodes(): GraphNodeConfig<T, any>[] {
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

  /**
   * Creates a visualizer instance for the current graph
   * @returns {GraphVisualizer<T>} A visualizer instance
   */
  public createVisualizer(): GraphVisualizer<T> {
    return new GraphVisualizer(this.nodes);
  }

  /**
   * Gets the schema for the current graph
   * @returns {T} The schema for the current graph
   */
  public getSchema(): T {
    return this.validator as T;
  }

  /**
   * Adds a new NLP node to the graph
   * @param {NLPNodeConfig<T>} config - Configuration for the NLP node
   * @returns {Promise<void>}
   */
  public async addNLPNode(config: NLPNodeConfig<T>) {
    const node = new NLPNode(config);
    await node.initialize();
    this.nlpNodes.set(config.name, node);

    this.addNode({
      name: config.name,
      execute: async (context, input) => {
        if (!input?.input) return;
        const result = await node.process(input.input);
        console.log("GraphFlow NLP result:", result);
        Object.assign(context, { nlpResult: result });
      },
      next: config.next,
    });
  }

  /**
   * Processes natural language input using a specific NLP node
   * @param {string} text - The input text to process
   * @param {string} nodeName - The name of the NLP node to use
   * @returns {Promise<GraphContext<T>>} The result of the NLP node execution
   */
  public async processNaturalLanguage(text: string, nodeName: string) {
    const node = this.nlpNodes.get(nodeName);
    if (!node) {
      throw new Error(`NLP node "${nodeName}" not found`);
    }

    return this.execute(nodeName, { input: text });
  }
}
