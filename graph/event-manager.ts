import { IEventEmitter } from "interfaces";
import { Observable, Subject, filter } from "rxjs";
import { GraphContext, GraphEvent, Node } from "types";
import { ZodSchema } from "zod";
import { GraphNodeExecutor } from "./node-executor";
export class GraphEventManager<T extends ZodSchema> {
  private eventSubject: Subject<GraphEvent<T>> = new Subject();
  private nodeStreams: Map<string, Observable<GraphEvent<T>>> = new Map();
  private context: GraphContext<T>;
  private name: string;
  private graphEvents?: string[];
  private entryNode?: string;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;

  constructor(
    private eventEmitter: IEventEmitter,
    private nodes: Map<string, Node<T, any>>,
    name: string,
    context: GraphContext<T>,
    graphEvents?: string[],
    entryNode?: string,
    globalErrorHandler?: (error: Error, context: GraphContext<T>) => void,
    private nodeExecutor?: GraphNodeExecutor<T>
  ) {
    this.name = name;
    this.context = context;
    this.graphEvents = graphEvents;
    this.entryNode = entryNode;
    this.globalErrorHandler = globalErrorHandler;
    this.setupEventStreams();
  }

  public setupEventStreams(): void {
    for (const [nodeName, node] of this.nodes.entries()) {
      if (node.events && node.events.length > 0) {
        const nodeStream = this.eventSubject.pipe(
          filter((event) => node.events!.includes(event.type))
        );
        this.nodeStreams.set(nodeName, nodeStream);
      }
    }
  }

  public emitEvent<P = any>(
    type: string,
    payload?: P,
    context?: GraphContext<T>
  ): void {
    const event: GraphEvent<T> = { type, payload, timestamp: Date.now() };
    this.eventSubject.next(event);
    this.eventEmitter.emit(type, event);
  }

  setupEventListeners(): void {
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
              const freshContext = structuredClone(this.context);
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

  setupGraphEventListeners(): void {
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

  async waitForEvents(
    events: string[],
    timeout: number = 30000
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const receivedEvents = new Map<string, any>();
      const eventHandlers = new Map();
      let isResolved = false;

      const cleanup = () => {
        events.forEach((event) => {
          const handler = eventHandlers.get(event);
          if (handler) {
            this.eventEmitter.removeListener(event, handler);
          }
        });
      };

      events.forEach((event) => {
        const handler = (eventData: any) => {
          console.log(`Received event: ${event}`, eventData);
          if (!isResolved) {
            receivedEvents.set(event, eventData);
            console.log(
              "Current received events:",
              Array.from(receivedEvents.keys())
            );

            if (events.every((e) => receivedEvents.has(e))) {
              console.log("All events received, resolving");
              isResolved = true;
              clearTimeout(timeoutId);
              cleanup();
              resolve(Array.from(receivedEvents.values()));
            }
          }
        };

        eventHandlers.set(event, handler);
        this.eventEmitter.on(event, handler);
      });

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Timeout waiting for events: ${events.join(", ")}`));
        }
      }, timeout);
    });
  }

  on(eventName: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(eventName, handler);
  }

  emit(eventName: string, data?: any): void {
    this.eventEmitter.emit(eventName, data);
  }

  private createNewContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  private async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    inputs: any,
    triggeredByEvent: boolean
  ): Promise<void> {
    if (!this.nodeExecutor) {
      throw new Error("NodeExecutor not initialized");
    }
    return this.nodeExecutor.executeNode(
      nodeName,
      context,
      inputs,
      triggeredByEvent
    );
  }

  // ... autres méthodes liées aux événements
}
