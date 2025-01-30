import { Persistence, RealTimeNotifier } from "@/interfaces";
import { GraphDefinition, Node, NodeRelationship, SharedState } from "@/types";
import { configDotenv } from "dotenv";
import EventEmitter from "events";
import { z } from "zod";

configDotenv();

interface GraphOptions<T> {
  initialState?: SharedState<T>;
  schema?: z.ZodSchema<T>;
  autoDetectCycles?: boolean;
}

/**
 * Represents a directed worflow structure capable of executing nodes in sequence or parallel.
 * The worflow can handle state management, event emissions, and conditional execution paths.
 *
 * @template T - The type of data stored in the worflow's context
 */
export class GraphEngine<T> {
  /** Stores global context data accessible to all nodes */
  public globalContext: Map<string, any>;

  /** Event emitter for handling worflow-wide events */
  private eventEmitter: EventEmitter;

  /** Map of all nodes in the worflow */
  public nodes: Map<string, Node<T>>;

  /** Set of nodes that have been executed */
  public executedNodes: Set<string>;

  /** Name identifier for the worflow */
  public name: string;

  /** Optional persistence layer for saving worflow state */
  private persistence: Persistence<T> | null;

  /** Optional notifier for real-time updates */
  private notifier: RealTimeNotifier | null;

  private schema?: z.ZodSchema<T>;

  private currentState: SharedState<T>;

  /**
   * Creates a new Graph instance.
   *
   * @param {GraphDefinition<T>} [definition] - Initial worflow structure and configuration
   * @param {Object} [config] - Additional configuration options
   * @param {boolean} [config.autoDetectCycles] - Whether to check for cycles during initialization
   * @throws {Error} If cycles are detected when autoDetectCycles is true
   */
  constructor(definition?: GraphDefinition<T>, options?: GraphOptions<T>) {
    this.name = definition?.name || "anonymous";
    this.eventEmitter = new EventEmitter();
    this.globalContext = new Map();
    this.nodes = new Map();
    this.executedNodes = new Set();
    this.persistence = null;
    this.notifier = null;
    this.schema = options?.schema;
    this.currentState = { context: {} } as SharedState<T>;

    if (definition) {
      this.loadFromDefinition(definition);
    }

    if (options?.autoDetectCycles && this.checkForCycles()) {
      throw new Error("Cycle detected in the workflow");
    }

    if (options?.initialState) {
      this.setState(options.initialState);
    }
  }

  /**
   * Adds a value to the global context.
   * @param {string} key - The key to store the value under
   * @param {any} value - The value to store
   */
  addToContext(key: string, value: any): void {
    this.globalContext.set(key, value);
  }

  /**
   * Retrieves a value from the global context.
   * @param {string} key - The key to retrieve
   * @returns {any} The stored value, or undefined if not found
   */
  getContext(key: string): any {
    return this.globalContext.get(key);
  }

  /**
   * Removes a value from the global context.
   * @param {string} key - The key to remove
   */
  removeFromContext(key: string): void {
    this.globalContext.delete(key);
  }

  /**
   * Sets the persistence layer for the worflow.
   * @param {Persistence<T>} persistence - The persistence implementation
   */
  setPersistence(persistence: Persistence<T>): void {
    this.persistence = persistence;
  }

  /**
   * Sets the real-time notifier for the worflow.
   * @param {RealTimeNotifier} notifier - The notifier implementation
   */
  setNotifier(notifier: RealTimeNotifier): void {
    this.notifier = notifier;
  }

  /**
   * Loads a worflow structure from a definition object.
   * @private
   * @param {GraphDefinition<T>} definition - The worflow definition
   */
  private loadFromDefinition(definition: GraphDefinition<T>): void {
    Object.entries(definition.nodes).forEach(([_, nodeConfig]) => {
      this.addNode(nodeConfig, {
        condition: nodeConfig.condition,
        relationships: nodeConfig.relationships,
      });
    });
  }

  /**
   * Recursively checks if a node is part of a cycle.
   * @private
   * @param {string} nodeName - The name of the node to check
   * @param {Set<string>} visited - Set of visited nodes
   * @param {Set<string>} recStack - Set of nodes in the current recursion stack
   * @returns {boolean} True if a cycle is detected, false otherwise
   */
  private isCyclic(
    nodeName: string,
    visited: Set<string>,
    recStack: Set<string>
  ): boolean {
    if (!visited.has(nodeName)) {
      visited.add(nodeName);
      recStack.add(nodeName);

      const currentNode = this.nodes.get(nodeName);
      if (currentNode?.relationships) {
        for (const relation of currentNode.relationships) {
          const targetNode = relation.name;
          if (
            !visited.has(targetNode) &&
            this.isCyclic(targetNode, visited, recStack)
          ) {
            return true;
          } else if (recStack.has(targetNode)) {
            return true;
          }
        }
      }
    }
    recStack.delete(nodeName);
    return false;
  }

  /**
   * Checks if the worflow contains any cycles.
   * @returns {boolean} True if cycles are detected, false otherwise
   */
  public checkForCycles(): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    for (const nodeName of this.nodes.keys()) {
      if (this.isCyclic(nodeName, visited, recStack)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Adds a new node to the worflow.
   * @param {Node<T>} node - The node to add
   * @param {Object} options - Node configuration options
   * @param {Function} [options.condition] - Condition function for node execution
   * @param {string[]} [options.relations] - Array of relations node names
   * @param {string[]} [options.events] - Array of event names to listen for
   */
  addNode(
    node: Node<T>,
    {
      condition,
      relationships,
      events,
    }: {
      condition?: (state: SharedState<T>) => boolean;
      relationships?: NodeRelationship[];
      events?: string[];
    }
  ): void {
    node.relationships = relationships;
    node.condition = condition;

    if (events) {
      events.forEach((event) => {
        this.eventEmitter.on(event, async (data) => {
          const state = data.state || {};
          await this.execute(state, node.name);
        });
      });
    }

    this.nodes.set(node.name, node);
  }

  /**
   * Emits an event to the worflow's event emitter.
   * @param {string} eventName - Name of the event to emit
   * @param {any} data - Data to pass with the event
   */
  public emit(eventName: string, data: any): void {
    this.eventEmitter.emit(eventName, data);
  }

  /**
   * Adds a subworflow as a node in the current worflow.
   * @param {Graph<T>} subGraph - The subworflow to add
   * @param {string} entryNode - The entry node name in the subworflow
   * @param {string} name - The name for the subworflow node
   */
  addSubGraph(subGraph: GraphEngine<T>, entryNode: string, name: string): void {
    const subGraphNode: Node<T> = {
      name: name,
      execute: async (state) => {
        await subGraph.execute(state, entryNode);
        return state;
      },
    };
    this.nodes.set(name, subGraphNode);
  }

  /**
   * Executes the worflow starting from a specific node.
   * @param {SharedState<T>} state - The initial state
   * @param {string} startNode - The name of the starting node
   * @param {Function} [onStream] - Callback for streaming state updates
   * @param {Function} [onError] - Callback for handling errors
   */
  async execute(
    state: SharedState<T>,
    startNode: string,
    onStream?: (state: SharedState<T>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<T>) => void
  ): Promise<SharedState<T>> {
    try {
      if (this.schema) {
        try {
          this.schema.parse(state.context);
        } catch (error) {
          const validationError = new Error(
            `Initial state validation failed: ${
              error instanceof Error ? error.message : error
            }`
          );
          if (onError) onError(validationError, startNode, state);
          throw validationError;
        }
      }

      this.setState(state);
      let currentNodeName = startNode;

      while (currentNodeName) {
        this.executedNodes.add(currentNodeName);
        const currentNode = this.nodes.get(currentNodeName);
        if (!currentNode) throw new Error(`Node ${currentNodeName} not found.`);

        if (
          currentNode.condition &&
          !currentNode.condition(this.currentState)
        ) {
          break;
        }

        try {
          if (this.notifier) {
            this.notifier.notify("nodeExecutionStarted", {
              workflow: this.name,
              node: currentNodeName,
            });
          }

          const params = currentNode.schema?.parse(this.currentState);
          const newState = await currentNode.execute(
            params || {},
            this.currentState
          );

          if (newState) {
            this.setState(newState);
            if (onStream) onStream(this.currentState);
          }

          if (this.persistence) {
            await this.persistence.saveState(
              this.name,
              this.currentState,
              currentNodeName
            );
          }

          if (this.notifier) {
            await this.notifier.notify("nodeExecutionCompleted", {
              workflow: this.name,
              node: currentNodeName,
              state: this.currentState,
            });
          }
        } catch (error) {
          if (onError)
            onError(error as Error, currentNodeName, this.currentState);
          if (this.notifier) {
            this.notifier.notify("nodeExecutionFailed", {
              workflow: this.name,
              node: currentNodeName,
              state: this.currentState,
              error,
            });
          }
          break;
        }

        const relationsNodes = currentNode.relationships || [];
        if (relationsNodes.length > 1) {
          await Promise.all(
            relationsNodes.map((relation) =>
              this.execute(this.currentState, relation.name, onStream, onError)
            )
          );
          break;
        } else {
          currentNodeName = relationsNodes[0]?.name || "";
        }
      }

      return this.getState();
    } catch (error) {
      if (onError) {
        onError(error as Error, startNode, state);
      }
      throw error;
    }
  }

  /**
   * Executes multiple nodes in parallel with a concurrency limit.
   * @param {SharedState<T>} state - The shared state
   * @param {string[]} nodeNames - Array of node names to execute
   * @param {number} [concurrencyLimit=5] - Maximum number of concurrent executions
   * @param {Function} [onStream] - Callback for streaming state updates
   * @param {Function} [onError] - Callback for handling errors
   */
  async executeParallel(
    state: SharedState<T>,
    nodeNames: string[],
    concurrencyLimit: number = 5,
    onStream?: (state: SharedState<T>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<T>) => void
  ): Promise<void> {
    const executeWithLimit = async (nodeName: string) => {
      await this.execute(state, nodeName, onStream, onError);
    };

    const chunks = [];
    for (let i = 0; i < nodeNames.length; i += concurrencyLimit) {
      chunks.push(nodeNames.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(executeWithLimit));
    }
  }

  /**
   * Updates the worflow structure with a new definition.
   * @param {GraphDefinition<T>} definition - The new worflow definition
   */
  updateGraph(definition: GraphDefinition<T>): void {
    Object.entries(definition.nodes).forEach(([_, nodeConfig]) => {
      if (this.nodes.has(nodeConfig.name)) {
        const existingNode = this.nodes.get(nodeConfig.name)!;
        existingNode.relationships =
          nodeConfig.relationships || existingNode.relationships;
        existingNode.condition = nodeConfig.condition || existingNode.condition;
      } else {
        this.addNode(nodeConfig, {
          condition: nodeConfig.condition,
          relationships: nodeConfig.relationships,
        });
      }
    });
  }

  /**
   * Replace the worflow with a new definition.
   * @param {GraphDefinition<T>} definition - The new worflow definition
   */
  replaceGraph(definition: GraphDefinition<T>): void {
    this.nodes.clear();
    this.loadFromDefinition(definition);
  }

  /**
   * Generates a visual representation of the worflow using Mermaid diagram syntax.
   * The diagram shows all nodes and their connections, with special highlighting for:
   * - Entry nodes (green)
   * - Event nodes (yellow)
   * - Conditional nodes (orange)
   *
   * @param {string} [title] - Optional title for the diagram
   * @returns {string} Mermaid diagram syntax representing the worflow
   */
  generateMermaidDiagram(title?: string): string {
    const lines: string[] = ["flowchart TD"];

    if (title) {
      lines.push(`  subgraph ${title}`);
    }

    // Add nodes with styling
    this.nodes.forEach((node, nodeName) => {
      const hasEvents = node.events && node.events.length > 0;
      const hasCondition = !!node.condition;

      // Style nodes based on their properties
      let style = "";
      if (hasEvents) {
        style = "style " + nodeName + " fill:#FFD700,stroke:#DAA520"; // Yellow for event nodes
      } else if (hasCondition) {
        style = "style " + nodeName + " fill:#FFA500,stroke:#FF8C00"; // Orange for conditional nodes
      }

      // Add node definition
      lines.push(`  ${nodeName}[${nodeName}]`);
      if (style) {
        lines.push(`  ${style}`);
      }
    });

    // Add connections
    this.nodes.forEach((node, nodeName) => {
      if (node.relationships) {
        node.relationships.forEach((relationsNode) => {
          let connectionStyle = "";
          if (node.condition) {
            connectionStyle = "---|condition|"; // Add label for conditional connections
          } else {
            connectionStyle = "-->"; // Normal connection
          }
          lines.push(`  ${nodeName} ${connectionStyle} ${relationsNode}`);
        });
      }

      // Add event connections if any
      if (node.events && node.events.length > 0) {
        node.events.forEach((event: string) => {
          const eventNodeId = `${event}_event`;
          lines.push(`  ${eventNodeId}((${event})):::event`);
          lines.push(`  ${eventNodeId} -.->|trigger| ${nodeName}`);
        });
        // Add style class for event nodes
        lines.push("  classDef event fill:#FFD700,stroke:#DAA520");
      }
    });

    if (title) {
      lines.push("  end");
    }

    return lines.join("\n");
  }

  /**
   * Renders the worflow visualization using Mermaid syntax.
   * This method can be used to visualize the worflow structure in supported environments.
   *
   * @param {string} [title] - Optional title for the visualization
   */
  visualize(title?: string): void {
    const diagram = this.generateMermaidDiagram(title);
    console.log(
      "To visualize this worflow, use a Mermaid-compatible renderer with this syntax:"
    );
    console.log("\n```mermaid");
    console.log(diagram);
    console.log("```\n");
  }

  exportGraphToJson<T>(worflow: GraphDefinition<T>): string {
    const result = {
      worflowName: worflow.name,
      entryNode: worflow.entryNode,
      nodes: Object.entries(worflow.nodes).reduce((acc, [key, node]) => {
        acc[key] = {
          name: node.name,
          description: node.description || "No description provided",
          execute: node.execute.name,
          condition: node.condition ? node.condition.toString() : "None",
          relationships: node.relationships || [],
        };
        return acc;
      }, {} as Record<string, any>),
    };
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generates a visual representation of the workflow schema.
   * Displays the structure of the data expected for each node.
   *
   * @returns {string} A formatted string describing the workflow schema
   */
  visualizeSchema(): string {
    const output: string[] = [];

    output.push(`📋 Graph: ${this.name}`);
    output.push("=".repeat(50));

    if (this.schema) {
      output.push("🔷 Global Schema:");
      output.push("-".repeat(30));

      if (this.schema instanceof z.ZodObject) {
        const shape = this.schema.shape;
        Object.entries(shape).forEach(([key, value]) => {
          const description = this.describeZodType(value as z.ZodType, 1);
          output.push(`${key}:`);
          output.push(description);
        });
      }
      output.push("");
    }

    output.push("🔷 Nodes:");
    output.push("-".repeat(30));

    this.nodes.forEach((node, nodeName) => {
      output.push(`\n📍 Node: ${nodeName}`);
      output.push(
        `Description: ${node.description || "No description provided"}`
      );

      if (node.relationships && node.relationships.length > 0) {
        output.push(`Next nodes: ${node.relationships.join(", ")}`);
      }

      output.push("");
    });

    return output.join("\n");
  }

  /**
   * Recursively describes a Zod type.
   */
  public describeZodType(type: z.ZodType, indent: number = 0): string {
    const padding = "  ".repeat(indent);

    if (type instanceof z.ZodObject) {
      const shape = type.shape;
      const lines: string[] = [];

      Object.entries(shape).forEach(([key, value]) => {
        const isOptional = value instanceof z.ZodOptional;
        const actualType = isOptional
          ? (value as z.ZodOptional<z.ZodType<any, any, any>>).unwrap()
          : (value as z.ZodType<any, any, any>);
        const description = this.describeZodType(actualType, indent + 1);

        lines.push(`${padding}${key}${isOptional ? "?" : ""}: ${description}`);
      });

      return lines.join("\n");
    }

    if (type instanceof z.ZodArray) {
      const elementType = this.describeZodType(type.element, indent);
      return `Array<${elementType}>`;
    }

    if (type instanceof z.ZodString) {
      const checks = type._def.checks || [];
      const constraints = checks
        .map((check) => {
          if (check.kind === "url") return "url";
          if (check.kind === "email") return "email";
          return check.kind;
        })
        .join(", ");

      return constraints ? `string (${constraints})` : "string";
    }

    if (type instanceof z.ZodNumber) {
      return "number";
    }

    if (type instanceof z.ZodBoolean) {
      return "boolean";
    }

    if (type instanceof z.ZodOptional) {
      return `${this.describeZodType(type.unwrap(), indent)} (optional)`;
    }

    return type.constructor.name.replace("Zod", "") || "unknown";
  }

  /**
   * Updates the state of a node.
   * @param {SharedState<T>} state - The current state
   * @param {Partial<T>} updates - The updates to apply
   * @returns {SharedState<T>} The updated state
   */
  protected updateNodeState(state: SharedState<T>, updates: Partial<T>) {
    return {
      ...state,
      context: {
        ...(state.context || {}),
        ...updates,
      },
    };
  }

  /**
   * Retrieves the current state of the workflow.
   * @returns {SharedState<T>} The current state
   */
  public getState(): SharedState<T> {
    return this.currentState;
  }

  /**
   * Sets the state of the workflow.
   * @param {Partial<SharedState<T>>} state - The new state
   */
  public setState(state: Partial<SharedState<T>>): void {
    this.currentState = this.mergeStates(this.currentState, state);

    if (state.context) {
      Object.entries(state.context).forEach(([key, value]) => {
        this.globalContext.set(key, value);
      });
    }
    const currentNode = Array.from(this.executedNodes).pop();
    if (currentNode) {
      const node = this.nodes.get(currentNode);
      if (node) {
        node.state = {
          ...(node.state || {}),
          ...(state.context || {}),
        };
      }
    }
  }

  /**
   * Merges two states.
   * @param {SharedState<T>} currentState - The current state
   * @param {Partial<SharedState<T>>} newState - The new state
   * @returns {SharedState<T>} The merged state
   */
  private mergeStates(
    currentState: SharedState<T>,
    newState: Partial<SharedState<T>>
  ): SharedState<T> {
    return {
      ...currentState,
      context: {
        ...(currentState.context || {}),
        ...(newState.context || {}),
      },
    };
  }

  /**
   * Updates the state of the workflow.
   * @param {Partial<SharedState<T>>} updates - The updates to apply
   * @returns {SharedState<T>} The updated state
   */
  public updateState(updates: Partial<SharedState<T>>): SharedState<T> {
    const currentState = this.getState();
    const newState = {
      ...currentState,
      context: {
        ...currentState.context,
        ...(updates.context || {}),
      },
    };
    this.setState(newState);
    return newState;
  }
}
