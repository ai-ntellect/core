import { Observable, Subject, filter } from "rxjs";
import { ZodSchema } from "zod";
import { IEventEmitter } from "../interfaces";
import {
  EventConfig,
  GraphContext,
  GraphEvent,
  GraphNodeConfig,
} from "../types";
import { GraphNode } from "./node";

/**
 * Manages event handling and routing for a graph
 * Coordinates event emission, listening, and execution of event-driven nodes
 * @template T - The Zod schema type for validation
 */
export class GraphEventManager<T extends ZodSchema> {
  private eventSubject: Subject<GraphEvent<T>> = new Subject();
  private nodeStreams: Map<string, Observable<GraphEvent<T>>> = new Map();
  private context: GraphContext<T>;
  private name: string;
  private graphEvents?: string[];
  private entryNode?: string;
  private globalErrorHandler?: (error: Error, context: GraphContext<T>) => void;
  private lastEvents = new Map<string, any>();

  /**
   * Creates a new GraphEventManager instance
   * @param eventEmitter - The event emitter implementation to use
   * @param nodes - Map of all nodes in the graph
   * @param name - Name of the graph
   * @param context - Initial graph context
   * @param graphEvents - List of events the graph should listen to
   * @param entryNode - Name of the entry node for graph events
   * @param globalErrorHandler - Global error handling function
   * @param nodeExecutor - GraphNode instance for executing nodes
   */
  constructor(
    private eventEmitter: IEventEmitter,
    private nodes: Map<string, GraphNodeConfig<T, any>>,
    name: string,
    context: GraphContext<T>,
    graphEvents?: string[],
    entryNode?: string,
    globalErrorHandler?: (error: Error, context: GraphContext<T>) => void,
    private nodeExecutor?: GraphNode<T>
  ) {
    this.name = name;
    this.context = context;
    this.graphEvents = graphEvents;
    this.entryNode = entryNode;
    this.globalErrorHandler = globalErrorHandler;
    this.setupEventStreams();
  }

  /**
   * Sets up event streams for all nodes that listen to events
   */
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

  /**
   * Emits an event with optional payload and context
   * @param type - The type of event to emit
   * @param payload - Optional payload data
   * @param context - Optional graph context
   */
  public emitEvent<P = any>(
    type: string,
    payload?: P,
    context?: GraphContext<T>
  ): void {
    // Éviter la double imbrication des événements
    const event = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Émettre l'événement une seule fois
    this.eventSubject.next(event);
    this.eventEmitter.emit(type, payload);
  }

  /**
   * Sets up event listeners for all nodes in the graph
   * Handles cleanup and re-registration of event listeners
   */
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

  /**
   * Sets up listeners for graph-level events
   * Handles graph start, completion, and error events
   */
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

  /**
   * Waits for a set of events to occur within a timeout period
   * @param events - Array of event names to wait for
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise that resolves with array of received events
   * @throws Error if timeout occurs before all events are received
   */
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
          if (!isResolved) {
            receivedEvents.set(event, eventData);

            if (events.every((e) => receivedEvents.has(e))) {
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

  /**
   * Registers an event handler
   * @param eventName - Name of the event to listen for
   * @param handler - Function to handle the event
   */
  on(eventName: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(eventName, handler);
  }

  /**
   * Emits an event through the event emitter
   * @param eventName - Name of the event to emit
   * @param data - Optional data to include with the event
   */
  emit(eventName: string, data?: any): void {
    this.lastEvents.set(eventName, data);
    this.eventEmitter.emit(eventName, data);
  }

  /**
   * Creates a new context object by cloning the current context
   * @returns A new graph context instance
   * @private
   */
  private createNewContext(): GraphContext<T> {
    return structuredClone(this.context);
  }

  /**
   * Executes a node with the given parameters
   * @param nodeName - Name of the node to execute
   * @param context - Graph context for execution
   * @param inputs - Input data for the node
   * @param triggeredByEvent - Whether execution was triggered by an event
   * @returns Promise that resolves when execution is complete
   * @throws Error if nodeExecutor is not initialized
   * @private
   */
  private async executeNode(
    nodeName: string,
    context: GraphContext<T>,
    inputs: any,
    triggeredByEvent: boolean
  ): Promise<void> {
    if (!this.nodeExecutor) {
      throw new Error("NodeExecutor not initialized");
    }

    const node = this.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found`);
    }

    // Remplacer le code existant de gestion d'événements
    if (node.when) {
      await this.handleNodeEvents(nodeName, node.when);
    }

    return this.nodeExecutor.executeNode(
      nodeName,
      context,
      inputs,
      triggeredByEvent
    );
  }

  /**
   * Waits for correlated events to occur and validates them using a correlation function
   */
  waitForCorrelatedEvents(
    eventTypes: string[],
    timeoutMs: number,
    correlationFn: (events: GraphEvent<T>[]) => boolean
  ): Promise<GraphEvent<T>[]> {
    return new Promise((resolve, reject) => {
      const receivedEvents = new Map<string, GraphEvent<T>>();
      const eventHandlers = new Map();
      let isResolved = false;

      const cleanup = () => {
        eventHandlers.forEach((handler, event) => {
          this.eventEmitter.removeListener(event, handler);
        });
      };

      eventTypes.forEach((eventType) => {
        const handler = (eventData: any) => {
          if (!isResolved) {
            const event: GraphEvent<T> = {
              type: eventType,
              payload: eventData,
              timestamp: Date.now(),
            };
            receivedEvents.set(eventType, event);

            if (eventTypes.every((type) => receivedEvents.has(type))) {
              const events = Array.from(receivedEvents.values());
              if (correlationFn(events)) {
                isResolved = true;
                clearTimeout(timeoutId);
                cleanup();
                resolve(events);
              }
            }
          }
        };

        eventHandlers.set(eventType, handler);
        this.eventEmitter.on(eventType, handler);
      });

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          cleanup();
          reject(
            new Error(
              `Timeout waiting for correlated events: ${eventTypes.join(", ")}`
            )
          );
        }
      }, timeoutMs);
    });
  }

  /**
   * Handles events based on the node's event handler configuration
   */
  async handleNodeEvents(
    nodeName: string,
    config: EventConfig
  ): Promise<any[]> {
    const { events, timeout = 30000, strategy } = config;

    return new Promise((resolve, reject) => {
      const receivedEvents = new Map<string, any>();
      const eventHandlers = new Map();
      let isResolved = false;

      // Ajouter les événements déjà reçus
      events.forEach((event: string) => {
        const existingEvent = this.lastEvents.get(event);
        if (existingEvent) {
          receivedEvents.set(event, {
            type: event,
            payload: existingEvent,
            timestamp: Date.now(),
          });
        }
      });

      // Vérifier si on a déjà tous les événements nécessaires
      const checkEvents = () => {
        if (isResolved) return;

        const eventsList = Array.from(receivedEvents.values());

        switch (strategy.type) {
          case "single":
            if (receivedEvents.size > 0) {
              resolve(eventsList);
              isResolved = true;
            }
            break;

          case "all":
          case "correlate":
            const allReceived = events.every((e: string) =>
              receivedEvents.has(e)
            );
            if (allReceived) {
              if (strategy.type === "correlate") {
                const correlated = strategy.correlation?.(eventsList);
                if (!correlated) return;
              }
              resolve(eventsList);
              isResolved = true;
            }
            break;
        }

        if (isResolved) {
          cleanup();
        }
      };

      // Configurer les listeners pour les événements manquants
      events.forEach((event: string) => {
        if (!receivedEvents.has(event)) {
          const handler = (eventData: any) => {
            receivedEvents.set(event, {
              type: event,
              payload: eventData,
              timestamp: Date.now(),
            });
            checkEvents();
          };
          eventHandlers.set(event, handler);
          this.eventEmitter.on(event, handler);
        }
      });

      const cleanup = () => {
        eventHandlers.forEach((handler, event) => {
          this.eventEmitter.removeListener(event, handler);
        });
      };

      checkEvents();

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          cleanup();
          reject(new Error(`Timeout waiting for events: ${events.join(", ")}`));
        }
      }, timeout);
    });
  }
}
