import { IEventEmitter, ICheckpointAdapter } from "interfaces";
import { BehaviorSubject, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { Checkpoint, GraphContext, GraphEvent, GraphNodeConfig } from "../types";
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

export interface NodeExecutionHooks<T extends ZodSchema> {
  onBeforeExecute?: (nodeName: string, context: GraphContext<T>) => Promise<void>;
  onBeforeExecuteNext?: (
    nodeName: string,
    context: GraphContext<T>,
    nextNodes: string[]
  ) => Promise<void>;
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
   * @param hooks - Optional execution hooks
   * @throws Error if the node is not found or execution fails
   */
  public async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    triggeredByEvent: boolean = false,
    hooks?: NodeExecutionHooks<T>
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found.`);

    if (hooks?.onBeforeExecute) {
      await hooks.onBeforeExecute(nodeName, context);
    }

    const nodeContext = { ...context };
    this.emitEvent("nodeStarted", { name: nodeName, context: nodeContext });

    try {
      if (node.when) {
        await this.eventManager.handleNodeEvents(nodeName, node.when);
      }

      const contextProxy = new Proxy(nodeContext, {
        set: (target: any, prop: string | symbol, value: any) => {
          const oldValue = target[prop.toString()];
          if (oldValue === value) return true;

          target[prop.toString()] = value;
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

      if (node.condition && !node.condition(contextProxy)) {
        return;
      }

      await this.executeWithRetry(node, contextProxy, nodeName);
      this.emitEvent("nodeCompleted", { name: nodeName, context: nodeContext });

      if (!triggeredByEvent && node.next) {
        const nextNodes =
          typeof node.next === "function" ? node.next(contextProxy) : node.next;

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

        const nextNodeNames = validNextNodes.map((n) => n.name);

        if (hooks?.onBeforeExecuteNext) {
          await hooks.onBeforeExecuteNext(nodeName, context, nextNodeNames);
        }

        for (const nextNode of validNextNodes) {
          await this.executeNode(nextNode.name, context, false, hooks);
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
    nodeName: string
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error = new Error("Unknown error");

    while (attempts < (node.retry?.maxAttempts || 1)) {
      try {
        await node.execute(contextProxy, {
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
}
