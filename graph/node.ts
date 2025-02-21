import { IEventEmitter } from "interfaces";
import { BehaviorSubject, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { GraphContext, GraphEvent, GraphNodeConfig } from "../types";
import { GraphEventManager } from "./event-manager";

/**
 * Represents a node in the graph that can execute operations and manage state
 * @template T - The Zod schema type for validation
 */
export interface NodeParams<T = any> {
  [key: string]: T;
}

export interface GraphLogger {
  addLog: (message: string, data?: any) => void;
}

export class GraphNode<T extends ZodSchema> {
  private lastStateEvent: GraphEvent<T> | null = null;
  private eventEmitter: IEventEmitter;

  /**
   * Creates a new GraphNode instance
   * @param nodes - Map of all nodes in the graph
   * @param logger - Logger instance for tracking node operations
   * @param eventManager - Manager for handling graph events
   * @param eventSubject - Subject for emitting events
   * @param stateSubject - Subject for managing graph state
   */
  constructor(
    private nodes: Map<string, GraphNodeConfig<T, any>>,
    private logger: GraphLogger,
    private eventManager: GraphEventManager<T>,
    private eventSubject: Subject<GraphEvent<T>>,
    private stateSubject: BehaviorSubject<GraphContext<T>>
  ) {
    this.eventEmitter = eventManager["eventEmitter"];
  }

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
   * @param params - Input data for the node
   * @param triggeredByEvent - Whether the execution was triggered by an event
   * @throws Error if the node is not found or execution fails
   */
  public async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    params: any,
    triggeredByEvent: boolean = false
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found.`);

    const nodeContext = { ...context };
    this.emitEvent("nodeStarted", { name: nodeName, context: nodeContext });

    try {
      if (node.correlateEvents) {
        await this.eventManager.waitForCorrelatedEvents(
          node.correlateEvents.events,
          node.correlateEvents.timeout || 30000,
          (events) => {
            return node.correlateEvents!.correlation(events);
          }
        );
      }

      // Ensuite, attendre les événements si waitForEvents est défini
      if (node.waitForEvents) {
        await this.eventManager.waitForEvents(
          node.waitForEvents.events,
          node.waitForEvents.timeout
        );
      }

      const contextProxy = new Proxy(nodeContext, {
        set: (target: any, prop: string | symbol, value: any) => {
          const oldValue = target[prop.toString()];
          if (oldValue === value) return true;

          target[prop.toString()] = value;
          // Mettre à jour le contexte global
          context[prop.toString() as keyof typeof context] = value;

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

      if (node.condition && !node.condition(contextProxy, params)) {
        return;
      }

      await this.executeWithRetry(node, contextProxy, nodeName, params);
      this.emitEvent("nodeCompleted", { name: nodeName, context: nodeContext });

      if (!triggeredByEvent && node.next) {
        const nextNodes =
          typeof node.next === "function" ? node.next(contextProxy) : node.next;

        // Vérifier d'abord les conditions de tous les nœuds suivants
        const nextNodeConfigs = Array.isArray(nextNodes)
          ? nextNodes
          : [nextNodes];
        const validNextNodes = nextNodeConfigs
          .map((nextNode) => {
            const nextNodeName =
              typeof nextNode === "string" ? nextNode : nextNode.node;
            const condition =
              typeof nextNode === "string" ? undefined : nextNode.condition;
            return {
              name: nextNodeName,
              condition,
              isValid: !condition || condition(contextProxy),
            };
          })
          .filter((n) => n.isValid);

        // Sinon, exécuter les autres nœuds valides
        for (const nextNode of validNextNodes) {
          await this.executeNode(nextNode.name, context, undefined, false);
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
   * Validates the params for a node using its schema
   * @param node - The node whose params need validation
   * @param params - The input data to validate
   * @param nodeName - The name of the node (for error messages)
   * @throws Error if validation fails
   * @private
   */
  private async validateParams(
    node: GraphNodeConfig<T, any>,
    params: any,
    nodeName: string
  ): Promise<void> {
    // Si pas de schéma de validation ou si le schéma est optionnel, accepter n'importe quels params
    if (!node.params || node.params.isOptional?.()) return;

    // Vérifier les params uniquement si un schéma est défini et non optionnel
    if (!params) {
      throw new Error(`Params required for node "${nodeName}"`);
    }

    try {
      return node.params.parse(params);
    } catch (error: any) {
      throw error;
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
    node: GraphNodeConfig<T, any>,
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
   * @param params - Input data for the node
   * @param nodeName - The name of the node
   * @param params - Parameters for the node
   * @throws Error if all retry attempts fail
   * @private
   */
  private async executeWithRetry(
    node: GraphNodeConfig<T, any>,
    contextProxy: GraphContext<T>,
    nodeName: string,
    params?: NodeParams
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error = new Error("Unknown error");

    while (attempts < (node.retry?.maxAttempts || 1)) {
      try {
        if (node.params) {
          await this.validateParams(node, params, nodeName);
        }

        await node.execute(contextProxy, params, {
          eventEmitter: this.eventEmitter,
        });
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
    node: GraphNodeConfig<T, any>,
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
    node: GraphNodeConfig<T, any>,
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
