import { BehaviorSubject, Observable, Subject, combineLatest } from "rxjs";
import {
  distinctUntilChanged,
  filter,
  map,
  share,
  startWith,
  take,
  takeUntil,
  timeout,
} from "rxjs/operators";
import { ZodSchema } from "zod";
import { GraphContext, GraphEvent } from "../types";
import { GraphFlow } from "./index";

/**
 * GraphObserver class provides reactive observation capabilities for a GraphFlow instance
 * It allows monitoring state changes, node updates, and specific events in the graph
 * @template T - The Zod schema type that defines the structure of the graph data
 */
export class GraphObserver<T extends ZodSchema> {
  constructor(
    private graph: GraphFlow<T>,
    private eventSubject: Subject<GraphEvent<T>>,
    private stateSubject: BehaviorSubject<GraphContext<T>>,
    private destroySubject: Subject<void>
  ) {}

  /**
   * Observes the entire graph state changes
   * @returns An Observable that emits the complete graph context whenever it changes
   */
  state(): Observable<GraphContext<T>> {
    return this.eventSubject.pipe(
      filter(
        (event) =>
          event.type === "nodeStateChanged" ||
          event.type === "nodeStarted" ||
          event.type === "nodeCompleted"
      ),
      map((event) => event.payload.context),
      startWith(this.stateSubject.getValue()),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      takeUntil(this.destroySubject),
      share()
    );
  }

  /**
   * Observes state changes for a specific node
   * @param name - The name of the node to observe
   * @returns An Observable that emits the graph context when the specified node changes
   */
  node(name: string): Observable<GraphContext<T>> {
    return this.eventSubject.pipe(
      filter(
        (event) =>
          event.type === "nodeStateChanged" && event.payload?.name === name
      ),
      map((event) => event.payload.context),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      takeUntil(this.destroySubject),
      share()
    );
  }

  /**
   * Observes state changes for multiple nodes
   * @param names - Array of node names to observe
   * @returns An Observable that emits the graph context when any of the specified nodes change
   */
  nodes(names: string[]): Observable<GraphContext<T>> {
    return this.eventSubject.pipe(
      filter(
        (event) =>
          names.includes(event.payload?.name ?? "") &&
          event.type === "nodeStateChanged"
      ),
      map(() => this.graph.getContext()),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      takeUntil(this.destroySubject),
      share()
    );
  }

  /**
   * Observes specific properties of the graph context
   * @param keys - Single or multiple property keys to observe
   * @returns An Observable that emits an object containing only the specified properties
   * @template K - The key of the property to observe from GraphContext<T>
   */
  property<K extends keyof GraphContext<T>>(
    keys: K | K[]
  ): Observable<{ [P in K]: GraphContext<T>[P] } & { name: string }> {
    const properties = Array.isArray(keys) ? keys : [keys];

    return this.eventSubject.pipe(
      filter(
        (event) =>
          event.type === "nodeStateChanged" &&
          properties.some((key) => event.payload?.property === key)
      ),
      map((event) => ({
        ...properties.reduce(
          (obj, key) => ({
            ...obj,
            [key]: event.payload.context[key],
          }),
          {} as { [P in K]: GraphContext<T>[P] }
        ),
        name: event.payload.name as string,
      })),
      startWith({
        ...properties.reduce(
          (obj, key) => ({
            ...obj,
            [key]: this.stateSubject.value[key],
          }),
          {}
        ),
        name: "initial",
      } as { [P in K]: GraphContext<T>[P] } & { name: string }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      share()
    );
  }

  /**
   * Observes specific events in the graph
   * @param type - The type of event to observe
   * @returns An Observable that emits events of the specified type
   */
  event(type: string): Observable<GraphEvent<T>> {
    return this.eventSubject.pipe(
      filter((event) => event.type === type),
      map((event) => event),
      takeUntil(this.destroySubject),
      share()
    );
  }

  /**
   * Waits for a specific condition to be met on an observable
   * @param observable - The Observable to watch
   * @param predicate - A function that returns true when the desired condition is met
   * @returns A Promise that resolves with the value when the predicate returns true
   * @template R - The type of value emitted by the observable
   */
  until<R>(
    observable: Observable<R>,
    predicate: (value: R) => boolean
  ): Promise<R> {
    return new Promise((resolve) => {
      const subscription = observable.subscribe({
        next: (value) => {
          if (predicate(value)) {
            subscription.unsubscribe();
            resolve(value);
          }
        },
      });
    });
  }

  /**
   * Waits for correlated events to occur and validates them using a correlation function
   * @param eventTypes - Array of event types to wait for
   * @param timeoutMs - Timeout duration in milliseconds
   * @param correlationFn - Function to validate the correlation between events
   * @returns Promise that resolves when all correlated events are received
   */
  waitForCorrelatedEvents(
    eventTypes: string[],
    timeoutMs: number,
    correlationFn: (events: GraphEvent<T>[]) => boolean
  ): Promise<GraphEvent<T>[]> {
    return new Promise((resolve, reject) => {
      const eventObservables = eventTypes.map((eventType) =>
        this.eventSubject.pipe(
          filter((event): event is GraphEvent<T> => {
            return event.type === eventType && "timestamp" in event;
          }),
          take(1)
        )
      );

      combineLatest(eventObservables)
        .pipe(timeout(timeoutMs), take(1))
        .subscribe({
          next: (events) => {
            if (correlationFn(events)) {
              resolve(events);
            } else {
              reject(new Error(`Correlation validation failed`));
            }
          },
          error: (error) => reject(error),
        });
    });
  }

  // Méthode pour observer les changements d'état
  observeState(): Observable<GraphContext<T>> {
    return this.stateSubject.asObservable().pipe(
      takeUntil(this.destroySubject),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  // Méthode pour observer les événements
  observeEvents(eventType: string): Observable<GraphEvent<T>> {
    return this.eventSubject.asObservable().pipe(
      takeUntil(this.destroySubject),
      filter((event) => event.type === eventType)
    );
  }

  // Méthode pour observer les changements d'état d'un nœud spécifique
  observeNodeState(nodeName: string): Observable<GraphContext<T>> {
    return this.eventSubject.asObservable().pipe(
      takeUntil(this.destroySubject),
      filter(
        (event) =>
          event.type === "nodeStateChanged" && event.payload?.name === nodeName
      ),
      map(() => this.stateSubject.value)
    );
  }
}
