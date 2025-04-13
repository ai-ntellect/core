import {
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  firstValueFrom,
} from "rxjs";
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  share,
  take,
  takeUntil,
} from "rxjs/operators";
import { ZodSchema } from "zod";
import { GraphObservable } from "../interfaces";
import { GraphContext, GraphEvent, ObserverOptions } from "../types";
import { GraphEventManager } from "./event-manager";
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
    private destroySubject: Subject<void>,
    private eventManager: GraphEventManager<T>
  ) {}

  /**
   * Observes the entire graph state changes
   * @param options Configuration options for the observation
   * @returns An Observable that emits the complete graph context whenever it changes
   */
  state(options: ObserverOptions = {}): GraphObservable<T> {
    const baseObservable = new Observable<any>((subscriber) => {
      const subscription = combineLatest([
        this.eventSubject.pipe(
          filter((event) => event.type === "nodeStateChanged"),
          map((event) => event.payload.context),
          distinctUntilChanged(
            (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
          ),
          debounceTime(options.debounce || 100)
        ),
        this.stateSubject,
      ])
        .pipe(
          map(([eventContext, stateContext]) => ({
            ...stateContext,
            ...eventContext,
          })),
          distinctUntilChanged(
            (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
          )
        )
        .subscribe(subscriber);

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
   * Waits for correlated events to occur and validates them using a correlation function
   * @param eventTypes - Array of event types to wait for
   * @param timeoutMs - Timeout in milliseconds
   * @param correlationFn - Function to validate event correlation
   * @returns Promise that resolves with the correlated events
   */
  waitForCorrelatedEvents(
    eventTypes: string[],
    timeoutMs: number,
    correlationFn: (events: GraphEvent<T>[]) => boolean
  ): Promise<GraphEvent<T>[]> {
    return new Promise((resolve, reject) => {
      const events: GraphEvent<T>[] = [];
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for correlated events: ${eventTypes.join(", ")}`
          )
        );
      }, timeoutMs);

      const subscription = this.eventSubject
        .pipe(
          filter((event) => eventTypes.includes(event.type)),
          takeUntil(this.destroySubject)
        )
        .subscribe({
          next: (event) => {
            events.push(event);
            if (events.length === eventTypes.length && correlationFn(events)) {
              clearTimeout(timeout);
              subscription.unsubscribe();
              resolve(events);
            }
          },
          error: (error) => {
            clearTimeout(timeout);
            subscription.unsubscribe();
            reject(error);
          },
        });
    });
  }

  /**
   * Streams a message letter by letter with a specified delay
   */
  private streamMessage(
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
