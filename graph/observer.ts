import {
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  firstValueFrom,
} from "rxjs";
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
import { GraphObservable } from "../interfaces";
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
   * @param options Configuration options for the observation
   * @param options.debounce Debounce time in milliseconds
   * @param options.delay Delay between emissions in milliseconds
   * @param options.stream If true, streams the specified properties letter by letter
   * @param options.properties List of properties to stream
   * @param options.onStreamLetter Callback for each letter emitted during streaming
   * @param options.onStreamComplete Callback when streaming is complete
   * @returns An Observable that emits the complete graph context whenever it changes
   */
  state(
    options: {
      debounce?: number;
      delay?: number;
      stream?: boolean;
      properties?: (keyof GraphContext<T>)[];
      onStreamLetter?: (data: { letter: string; property: string }) => void;
      onStreamComplete?: () => void;
    } = {}
  ): GraphObservable<T> {
    const baseObservable = new Observable<any>((subscriber) => {
      const subscription = this.eventSubject
        .pipe(
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
          )
        )
        .subscribe(subscriber);

      // Stream the specified properties if specified
      if (options.stream && options.properties) {
        const context = this.stateSubject.getValue();
        options.properties.forEach((property) => {
          const message = context[property];
          if (message) {
            this.streamMessage(
              message.toString(),
              500,
              property as string
            ).subscribe({
              next: (data) => options.onStreamLetter?.(data),
              complete: () => options.onStreamComplete?.(),
            });
          }
        });
      }

      return () => subscription.unsubscribe();
    });

    // Extend the observable with our custom methods
    return Object.assign(baseObservable, {
      state: () => this.stateSubject.asObservable(),
      node: (nodeName: string) =>
        this.stateSubject.pipe(map((state) => ({ ...state, nodeName }))),
      nodes: (nodeNames: string[]) =>
        this.eventSubject.pipe(
          filter(
            (event) =>
              event.type === "nodeStateChanged" &&
              nodeNames.includes(event.payload?.name ?? "")
          ),
          map((event) => event.payload.context),
          distinctUntilChanged(
            (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
          ),
          takeUntil(this.destroySubject),
          share()
        ),
      property: (props: string | string[]) =>
        this.stateSubject.pipe(
          map((state) => {
            const properties = Array.isArray(props) ? props : [props];
            return properties.reduce(
              (acc, prop) => ({
                ...acc,
                [prop]: state[prop],
              }),
              {}
            );
          })
        ),
      event: (eventName: string) =>
        this.eventSubject.pipe(filter((event) => event.type === eventName)),
      until: (
        observable: Observable<any>,
        predicate: (state: any) => boolean
      ) => firstValueFrom(observable.pipe(filter(predicate), take(1))),
    }) as GraphObservable<T>;
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

  /**
   * Observes the current state of the graph
   * @returns Observable that emits the current graph context
   */
  observeState(): Observable<GraphContext<T>> {
    return this.stateSubject.asObservable().pipe(
      takeUntil(this.destroySubject),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  /**
   * Observes specific event types in the graph
   * @param eventType - The type of event to observe
   * @returns Observable that emits events of the specified type
   */
  observeEvents(eventType: string): Observable<GraphEvent<T>> {
    return this.eventSubject.asObservable().pipe(
      takeUntil(this.destroySubject),
      filter((event) => event.type === eventType)
    );
  }

  /**
   * Observes state changes for a specific node
   * @param nodeName - The name of the node to observe
   * @returns Observable that emits the graph context when the specified node changes
   */
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

  /**
   * Streams a message letter by letter with a specified delay
   * @param message - The message to stream
   * @param delayMs - The delay in milliseconds between each letter
   * @param property - The property name being streamed
   * @returns An Observable that emits each letter of the message along with its property
   */
  streamMessage(
    message: string,
    delayMs: number,
    property: string
  ): Observable<{ letter: string; property: string }> {
    return new Observable<{ letter: string; property: string }>(
      (subscriber) => {
        for (let i = 0; i < message.length; i++) {
          setTimeout(() => {
            subscriber.next({ letter: message[i], property });
            if (i === message.length - 1) {
              subscriber.complete();
            }
          }, i * delayMs);
        }
      }
    );
  }
}
