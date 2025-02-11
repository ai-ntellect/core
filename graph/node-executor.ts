import { BehaviorSubject, Subject } from "rxjs";
import { ZodSchema } from "zod";
import { GraphContext, GraphEvent, Node } from "../types";
import { GraphEventManager } from "./event-manager";
import { GraphLogger } from "./logger";

export class GraphNodeExecutor<T extends ZodSchema> {
  constructor(
    private nodes: Map<string, Node<T, any>>,
    private logger: GraphLogger,
    private eventManager: GraphEventManager<T>,
    private eventSubject: Subject<GraphEvent<T>>,
    private stateSubject: BehaviorSubject<GraphContext<T>>
  ) {}

  /**
   * Simplified event emission
   */
  private emitEvent(type: string, payload: any) {
    this.logger.addLog(`📢 Event: ${type}`);
    const event = {
      type,
      payload: {
        ...payload,
        name:
          type === "nodeStateChanged"
            ? payload.name || payload.nodeName
            : payload.name,
        context: { ...payload.context },
      },
      timestamp: Date.now(),
    };

    this.eventSubject.next(event);
    this.eventManager.emitEvent(type, event);

    // Update state subject only for state changes
    if (type === "nodeStateChanged") {
      this.stateSubject.next({ ...payload.context });
    }
  }

  async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    inputs: any,
    triggeredByEvent: boolean = false
  ): Promise<void> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Node "${nodeName}" not found.`);

    this.logger.addLog(`🚀 Starting node "${nodeName}"`);
    this.emitEvent("nodeStarted", { name: nodeName, context: { ...context } });

    try {
      const contextProxy = new Proxy(context, {
        set: (target, prop, value) => {
          const oldValue = target[prop];
          target[prop] = value;

          this.emitEvent("nodeStateChanged", {
            nodeName,
            name: nodeName,
            property: prop.toString(),
            oldValue,
            newValue: value,
            context: { ...target },
          });

          return true;
        },
        get: (target, prop) => {
          return target[prop];
        },
      });

      if (node.condition && !node.condition(contextProxy)) {
        this.logger.addLog(
          `⏭️ Skipping node "${nodeName}" - condition not met`
        );
        return;
      }

      if (node.inputs) {
        await this.validateInputs(node, inputs, nodeName);
      }

      if (node.retry && node.retry.maxAttempts > 0) {
        await this.executeWithRetry(node, contextProxy, inputs, nodeName);
      } else {
        await node.execute(contextProxy, inputs);
      }

      if (node.outputs) {
        await this.validateOutputs(node, contextProxy, nodeName);
      }

      if (!triggeredByEvent) {
        const nextNodes =
          typeof node.next === "function"
            ? node.next(contextProxy)
            : node.next || [];

        for (const nextNodeName of nextNodes) {
          const nextNode = this.nodes.get(nextNodeName);
          if (
            nextNode &&
            (!nextNode.condition || nextNode.condition(contextProxy))
          ) {
            await this.executeNode(
              nextNodeName,
              contextProxy,
              undefined,
              false
            );
          }
        }
      }

      if (!triggeredByEvent) {
        await this.handleEvents(node, nodeName, contextProxy);
      }

      this.logger.addLog(`✅ Node "${nodeName}" executed successfully`);
      this.emitEvent("nodeCompleted", {
        name: nodeName,
        context: { ...contextProxy },
      });
    } catch (error: any) {
      const errorToThrow =
        error instanceof Error
          ? error
          : new Error(error.message || "Unknown error");

      this.logger.addLog(
        `❌ Error in node "${nodeName}": ${errorToThrow.message}`
      );

      this.emitEvent("nodeError", {
        name: nodeName,
        error: errorToThrow,
        context,
      });

      throw errorToThrow;
    }
  }

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

  private async executeWithRetry(
    node: Node<T, any>,
    contextProxy: GraphContext<T>,
    inputs: any,
    nodeName: string
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < node.retry!.maxAttempts) {
      try {
        this.logger.addLog(
          `🔄 Attempt ${attempts + 1}/${node.retry!.maxAttempts}`
        );
        await node.execute(contextProxy, inputs);
        return;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(error.message);
        attempts++;
        this.logger.addLog(
          `❌ Attempt ${attempts} failed: ${lastError.message}`
        );

        if (attempts === node.retry!.maxAttempts) {
          if (node.retry!.onRetryFailed && lastError) {
            await this.handleRetryFailure(
              node,
              lastError,
              contextProxy,
              nodeName
            );
          }
          throw lastError;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, node.retry?.delay || 0)
        );
      }
    }
  }

  private async handleRetryFailure(
    node: Node<T, any>,
    error: Error,
    context: GraphContext<T>,
    nodeName: string
  ): Promise<void> {
    this.logger.addLog(
      `🔄 Executing retry failure handler for node "${nodeName}"`
    );
    try {
      if (node.retry?.onRetryFailed) {
        await node.retry.onRetryFailed(error, context);
        if (node.retry.continueOnFailed) {
          this.logger.addLog(
            `✅ Retry failure handler succeeded - continuing execution`
          );
          return;
        }
        this.logger.addLog(
          `⚠️ Retry failure handler executed but node will still fail`
        );
      }
    } catch (handlerError: any) {
      this.logger.addLog(
        `❌ Retry failure handler failed: ${handlerError.message}`
      );
      throw handlerError;
    }
  }

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
