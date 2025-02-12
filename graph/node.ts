import { BehaviorSubject, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { GraphContext, GraphEvent } from "../types";
import { GraphEventManager } from "./event-manager";

/**
 * Represents a node in the graph that can execute operations and manage state
 * @template T - The Zod schema type for validation
 */
export interface NodeParams<T = any> {
  [key: string]: T;
}

export interface Node<T extends ZodSchema, I = any> {
  condition?: (context: GraphContext<T>, params?: NodeParams) => boolean;
  execute: (
    context: GraphContext<T>,
    inputs: I,
    params?: NodeParams
  ) => Promise<void>;
  next?: string[] | ((context: GraphContext<T>) => string[]);
  inputs?: ZodSchema;
  outputs?: ZodSchema;
  retry?: {
    maxAttempts: number;
    delay?: number;
    onRetryFailed?: (error: Error, context: GraphContext<T>) => Promise<void>;
    continueOnFailed?: boolean;
  };
  correlateEvents?: {
    events: string[];
    timeout?: number;
    correlation: (events: GraphEvent<T>[]) => boolean;
  };
  waitForEvents?: {
    events: string[];
    timeout: number;
  };
}

export interface GraphLogger {
  addLog: (message: string, data?: any) => void;
}

export class GraphNode<T extends ZodSchema> {
  private lastStateEvent: GraphEvent<T> | null = null;

  /**
   * Creates a new GraphNode instance
   * @param nodes - Map of all nodes in the graph
   * @param logger - Logger instance for tracking node operations
   * @param eventManager - Manager for handling graph events
   * @param eventSubject - Subject for emitting events
   * @param stateSubject - Subject for managing graph state
   */
  constructor(
    private nodes: Map<string, Node<T, any>>,
    private logger: GraphLogger,
    private eventManager: GraphEventManager<T>,
    private eventSubject: Subject<GraphEvent<T>>,
    private stateSubject: BehaviorSubject<GraphContext<T>>
  ) {}

  /**
   * Emits an event with the specified type and payload
   * @param type - The type of event to emit
   * @param payload - The data associated with the event
   * @private
   */
  private emitEvent(type: string, payload: any) {
    if (type === "nodeStateChanged") {
      if (
        this.lastStateEvent?.type === type &&
        this.lastStateEvent.payload.property === payload.property &&
        this.lastStateEvent.payload.newValue === payload.newValue &&
        this.lastStateEvent.payload.nodeName === payload.nodeName
      ) {
        return;
      }
    }

    const event = {
      type,
      payload: {
        ...payload,
        name: type === "nodeStateChanged" ? payload.nodeName : payload.name,
        context: { ...payload.context },
      },
      timestamp: Date.now(),
    };

    this.eventSubject.next(event);
    this.eventManager.emitEvent(type, event);

    if (type === "nodeStateChanged") {
      this.lastStateEvent = event;
      this.stateSubject.next({ ...payload.context });
    }
  }

  /**
   * Executes a node with the given name and context
   * @param nodeName - The name of the node to execute
   * @param context - The current graph context
   * @param inputs - Input data for the node
   * @param triggeredByEvent - Whether the execution was triggered by an event
   * @throws Error if the node is not found or execution fails
   */
  public async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    inputs: any,
    triggeredByEvent: boolean = false
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found.`);

    // Créer une copie du contexte pour ce nœud
    const nodeContext = { ...context };
    this.emitEvent("nodeStarted", { name: nodeName, context: nodeContext });

    try {
      const contextProxy = new Proxy(nodeContext, {
        set: (target, prop, value) => {
          const oldValue = target[prop];
          if (oldValue === value) return true;

          target[prop] = value;
          // Mettre à jour le contexte global
          context[prop as keyof typeof context] = value;

          this.emitEvent("nodeStateChanged", {
            nodeName,
            property: prop.toString(),
            oldValue,
            newValue: value,
            context: { ...target },
          });
          return true;
        },
      });

      if (node.condition && !node.condition(contextProxy, inputs)) {
        return;
      }

      await this.executeWithRetry(node, contextProxy, inputs, nodeName);
      this.emitEvent("nodeCompleted", { name: nodeName, context: nodeContext });

      if (!triggeredByEvent && node.next) {
        const nextNodes =
          typeof node.next === "function" ? node.next(contextProxy) : node.next;
        for (const nextNodeName of nextNodes) {
          await this.executeNode(nextNodeName, context, undefined, false);
        }
      }
    } catch (error) {
      this.emitEvent("nodeError", {
        name: nodeName,
        error,
        context: nodeContext,
      });
      throw error;
    }
  }

  /**
   * Validates the inputs for a node using its schema
   * @param node - The node whose inputs need validation
   * @param inputs - The input data to validate
   * @param nodeName - The name of the node (for error messages)
   * @throws Error if validation fails
   * @private
   */
  private async validateInputs(
    node: Node<T, any>,
    inputs: any,
    nodeName: string
  ): Promise<void> {
    if (!inputs) {
      throw new Error(`Inputs required for node "${nodeName}"`);
    }

    try {
      return node.inputs!.parse(inputs);
    } catch (error: any) {
      throw new Error(
        error.errors?.[0]?.message || error.message || "Input validation failed"
      );
    }
  }

  /**
   * Validates the outputs of a node against its schema
   * @param node - The node whose outputs need validation
   * @param context - The current graph context
   * @param nodeName - The name of the node (for error messages)
   * @throws Error if validation fails
   * @private
   */
  private async validateOutputs(
    node: Node<T, any>,
    context: GraphContext<T>,
    nodeName: string
  ): Promise<void> {
    try {
      node.outputs!.parse(context);
    } catch (error: any) {
      throw new Error(
        error.errors?.[0]?.message ||
          error.message ||
          "Output validation failed"
      );
    }
  }

  /**
   * Handles event-related operations for a node
   * @param node - The node whose events need handling
   * @param nodeName - The name of the node
   * @param context - The current graph context
   * @private
   */
  private async handleEvents(
    node: Node<T, any>,
    nodeName: string,
    context: GraphContext<T>
  ): Promise<void> {
    if (node.correlateEvents) {
      await this.handleCorrelatedEvents(node, nodeName);
    }

    if (node.waitForEvents) {
      await this.handleWaitForEvents(node, nodeName);
    }
  }

  /**
   * Executes a node with retry logic
   * @param node - The node to execute
   * @param contextProxy - The proxied graph context
   * @param inputs - Input data for the node
   * @param nodeName - The name of the node
   * @throws Error if all retry attempts fail
   * @private
   */
  private async executeWithRetry(
    node: Node<T, any>,
    contextProxy: GraphContext<T>,
    inputs: any,
    nodeName: string
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error = new Error("Unknown error");

    while (attempts < (node.retry?.maxAttempts || 1)) {
      try {
        // Validation des inputs
        if (node.inputs) {
          try {
            node.inputs.parse(inputs);
          } catch (error: any) {
            const message = error.errors?.[0]?.message || error.message;
            throw new Error(`Input validation failed: ${message}`);
          }
        }

        // Exécution du node
        await node.execute(contextProxy, inputs);

        // Validation des outputs
        if (node.outputs) {
          try {
            node.outputs.parse(contextProxy);
          } catch (error: any) {
            const message = error.errors?.[0]?.message || error.message;
            throw new Error(`Output validation failed: ${message}`);
          }
        }
        return;
      } catch (error: any) {
        lastError =
          error instanceof Error
            ? error
            : new Error(error?.message || "Unknown error");
        attempts++;

        if (attempts === (node.retry?.maxAttempts || 1)) {
          if (node.retry?.onRetryFailed) {
            await node.retry.onRetryFailed(lastError, contextProxy);
            if (node.retry.continueOnFailed) return;
          }
          throw lastError;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, node.retry?.delay || 0)
        );
      }
    }
  }

  /**
   * Handles correlated events for a node
   * @param node - The node with correlated events
   * @param nodeName - The name of the node
   * @throws Error if correlation fails or timeout occurs
   * @private
   */
  private async handleCorrelatedEvents(
    node: Node<T, any>,
    nodeName: string
  ): Promise<void> {
    if (node.correlateEvents) {
      const { events, timeout, correlation } = node.correlateEvents;
      this.logger.addLog(
        `⏳ Node "${nodeName}" waiting for correlated events: ${events.join(
          ", "
        )}`
      );

      try {
        // Attendre les événements
        const receivedEvents = await this.eventManager.waitForEvents(
          events,
          timeout
        );

        // Vérifier la corrélation
        if (!correlation(receivedEvents)) {
          this.logger.addLog(
            `❌ Event correlation failed for node "${nodeName}"`
          );
          throw new Error(`Event correlation failed for node "${nodeName}"`);
        }

        this.logger.addLog(
          `✅ Event correlation succeeded for node "${nodeName}"`
        );
      } catch (error) {
        this.logger.addLog(
          `❌ Error waiting for events: ${(error as Error).message}`
        );
        throw error;
      }
    }
  }

  /**
   * Handles waiting for events
   * @param node - The node waiting for events
   * @param nodeName - The name of the node
   * @throws Error if timeout occurs
   * @private
   */
  private async handleWaitForEvents(
    node: Node<T, any>,
    nodeName: string
  ): Promise<void> {
    if (node.waitForEvents) {
      const { events, timeout } = node.waitForEvents;
      this.logger.addLog(
        `⏳ Node "${nodeName}" waiting for events: ${events.join(", ")}`
      );
      await this.eventManager.waitForEvents(events, timeout);
      this.logger.addLog(`✅ All events received for node "${nodeName}"`);
    }
  }
}
