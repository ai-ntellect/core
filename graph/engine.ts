import { Persistence, RealTimeNotifier } from "@/interfaces";
import { GraphDefinition, Node, SharedState } from "@/types";
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
 * Représente un workflow dirigé capable d’exécuter des noeuds en séquence ou en parallèle.
 *
 * @template T - Le type de données stockées dans le contexte du workflow
 */
export class GraphEngine<T> {
  /** Données globales accessibles à tous les nœuds */
  public globalContext: Map<string, any>;

  /** Event emitter pour gérer les événements du workflow */
  private eventEmitter: EventEmitter;

  /** Map de tous les nœuds du workflow */
  public nodes: Map<string, Node<T>>;

  /** Ensemble des nœuds déjà exécutés */
  public executedNodes: Set<string>;

  /** Nom du workflow */
  public name: string;

  /** Couche de persistance optionnelle pour sauvegarder l'état du workflow */
  private persistence: Persistence<T> | null;

  /** Notifier en temps réel optionnel */
  private notifier: RealTimeNotifier | null;

  /** Schéma global Zod pour valider l’état ou le contexte du workflow */
  private schema?: z.ZodSchema<T>;

  /** État interne actuel du workflow */
  private currentState: SharedState<T>;

  /**
   * Crée une nouvelle instance de GraphEngine.
   *
   * @param {GraphDefinition<T>} [definition] - La définition initiale du workflow
   * @param {GraphOptions<T>} [options] - Options de configuration
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
    this.currentState = {} as SharedState<T>;

    if (definition) {
      this.loadFromDefinition(definition);
    }

    if (options?.autoDetectCycles && this.checkForCycles()) {
      throw new Error("Cycle détecté dans le workflow");
    }

    if (options?.initialState) {
      this.setState(options.initialState);
    }
  }

  /**
   * Ajoute un élément au contexte global.
   * @param {string} key - La clé
   * @param {any} value - La valeur
   */
  addToContext(key: string, value: any): void {
    this.globalContext.set(key, value);
  }

  /**
   * Récupère un élément du contexte global.
   * @param {string} key - La clé
   */
  getContext(key: string): any {
    return this.globalContext.get(key);
  }

  /**
   * Supprime un élément du contexte global.
   * @param {string} key - La clé
   */
  removeFromContext(key: string): void {
    this.globalContext.delete(key);
  }

  /**
   * Définit la couche de persistance.
   * @param {Persistence<T>} persistence
   */
  setPersistence(persistence: Persistence<T>): void {
    this.persistence = persistence;
  }

  /**
   * Définit le notifier en temps réel.
   * @param {RealTimeNotifier} notifier
   */
  setNotifier(notifier: RealTimeNotifier): void {
    this.notifier = notifier;
  }

  /**
   * Charge un workflow à partir d'une définition.
   * @private
   * @param {GraphDefinition<T>} definition
   */
  private loadFromDefinition(definition: GraphDefinition<T>): void {
    Object.entries(definition.nodes).forEach(([_, nodeConfig]) => {
      this.addNode(nodeConfig);
    });
  }

  /**
   * Vérifie récursivement s’il existe un cycle dans le workflow.
   * @param {string} nodeName
   * @param {Set<string>} visited
   * @param {Set<string>} recStack
   * @returns {boolean}
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
   * Vérifie si le workflow contient des cycles.
   * @returns {boolean}
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
   * Ajoute un nouveau nœud au workflow.
   * @param {Node<T>} node
   */
  addNode(node: Node<T>): void {
    if (node.relationships) {
      node.relationships.forEach((relationship) => {
        this.nodes.get(relationship.name)?.relationships?.push(relationship);
      });
    }

    if (node.events) {
      node.events.forEach((event) => {
        this.eventEmitter.on(event, async (data) => {
          const state = data.state || {};
          await this.execute(state, node.name);
        });
      });
    }

    this.nodes.set(node.name, node);
  }

  /**
   * Émet un événement sur l'event emitter du workflow.
   * @param {string} eventName
   * @param {any} data
   */
  public emit(eventName: string, data: any): void {
    this.eventEmitter.emit(eventName, data);
  }

  /**
   * Ajoute un sous-graph (GraphEngine) comme un nœud dans le workflow courant.
   * @param {GraphEngine<T>} subGraph
   * @param {string} entryNode - Le nom du nœud de démarrage dans le sous-graph
   * @param {string} name - Le nom symbolique à donner au sous-graph
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
   * Exécute le workflow à partir d’un nœud donné.
   * @param {SharedState<T>} state
   * @param {string} startNode
   * @param {(state: SharedState<T>) => void} [onStream] - Callback sur l’évolution de l’état
   * @param {(error: Error, nodeName: string, state: SharedState<T>) => void} [onError] - Callback sur erreur
   */
  async execute(
    state: SharedState<T>,
    startNode: string,
    onStream?: (graph: GraphEngine<T>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<T>) => void
  ): Promise<SharedState<T>> {
    try {
      // Valide l'état initial via le schéma global (si défini)
      if (this.schema) {
        try {
          this.schema.parse(state);
        } catch (error) {
          const validationError = new Error(
            `Échec de la validation de l'état initial: ${
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
        if (!currentNode) {
          throw new Error(`Nœud ${currentNodeName} introuvable.`);
        }

        // Vérification de condition (si présente)
        if (
          currentNode.condition &&
          !currentNode.condition(this.currentState)
        ) {
          break;
        }

        try {
          // Notifier : début d'exécution du nœud
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
            if (onStream) onStream(this);
          }

          // Sauvegarde via la persistence (optionnel)
          if (this.persistence) {
            await this.persistence.saveState(
              this.name,
              this.currentState,
              currentNodeName
            );
          }

          // Notifier : fin d'exécution du nœud
          if (this.notifier) {
            await this.notifier.notify("nodeExecutionCompleted", {
              workflow: this.name,
              node: currentNodeName,
              state: this.currentState,
            });
          }
        } catch (error) {
          if (onError) {
            onError(error as Error, currentNodeName, this.currentState);
          }
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

        // Gestion des relations (branchements)
        const relationsNodes = currentNode.relationships || [];
        if (relationsNodes.length > 1) {
          // Exécution parallèle des branches
          await Promise.all(
            relationsNodes.map((relation) =>
              this.execute(this.currentState, relation.name, onStream, onError)
            )
          );
          // Après exécution en parallèle, on arrête la boucle
          break;
        } else {
          // Cas normal : un seul chemin
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
   * Exécute plusieurs nœuds en parallèle au sein du même workflow, avec une limite de concurrence.
   * @param {SharedState<T>} state
   * @param {string[]} nodeNames
   * @param {number} [concurrencyLimit=5]
   */
  async executeParallel(
    state: SharedState<T>,
    nodeNames: string[],
    concurrencyLimit: number = 5,
    onStream?: (graph: GraphEngine<T>) => void,
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
   * Met à jour le workflow avec une nouvelle définition (mise à jour des nœuds existants ou ajout de nouveaux).
   * @param {GraphDefinition<T>} definition
   */
  updateGraph(definition: GraphDefinition<T>): void {
    Object.entries(definition.nodes).forEach(([_, nodeConfig]) => {
      if (this.nodes.has(nodeConfig.name)) {
        const existingNode = this.nodes.get(nodeConfig.name)!;
        existingNode.relationships =
          nodeConfig.relationships || existingNode.relationships;
        existingNode.condition = nodeConfig.condition || existingNode.condition;
        existingNode.events = nodeConfig.events || existingNode.events;
      } else {
        this.addNode(nodeConfig);
      }
    });
  }

  /**
   * Remplace complètement le workflow par une nouvelle définition.
   * @param {GraphDefinition<T>} definition
   */
  replaceGraph(definition: GraphDefinition<T>): void {
    this.nodes.clear();
    this.loadFromDefinition(definition);
  }

  /**
   * Génère un diagramme Mermaid pour visualiser le workflow.
   * @param {string} [title]
   * @returns {string}
   */
  generateMermaidDiagram(title?: string): string {
    const lines: string[] = ["flowchart TD"];

    if (title) {
      lines.push(`  subgraph ${title}`);
    }

    // Ajout des nœuds
    this.nodes.forEach((node, nodeName) => {
      const hasEvents = node.events && node.events.length > 0;
      const hasCondition = !!node.condition;

      // Style selon les propriétés
      let style = "";
      if (hasEvents) {
        style = "style " + nodeName + " fill:#FFD700,stroke:#DAA520"; // Jaune pour event
      } else if (hasCondition) {
        style = "style " + nodeName + " fill:#FFA500,stroke:#FF8C00"; // Orange pour condition
      }

      lines.push(`  ${nodeName}[${nodeName}]`);
      if (style) {
        lines.push(`  ${style}`);
      }
    });

    // Ajout des connexions
    this.nodes.forEach((node, nodeName) => {
      if (node.relationships) {
        node.relationships.forEach((relationsNode) => {
          let connectionStyle = "";
          if (node.condition) {
            connectionStyle = "---|condition|";
          } else {
            connectionStyle = "-->";
          }
          lines.push(`  ${nodeName} ${connectionStyle} ${relationsNode}`);
        });
      }

      // Gestion des events
      if (node.events && node.events.length > 0) {
        node.events.forEach((event: string) => {
          const eventNodeId = `${event}_event`;
          lines.push(`  ${eventNodeId}((${event})):::event`);
          lines.push(`  ${eventNodeId} -.->|trigger| ${nodeName}`);
        });
        lines.push("  classDef event fill:#FFD700,stroke:#DAA520");
      }
    });

    if (title) {
      lines.push("  end");
    }

    return lines.join("\n");
  }

  /**
   * Affiche le diagramme Mermaid dans la console.
   * @param {string} [title]
   */
  visualize(title?: string): void {
    const diagram = this.generateMermaidDiagram(title);
    console.log(
      "Pour visualiser ce workflow, utilisez un rendu compatible Mermaid avec la syntaxe suivante :"
    );
    console.log("\n```mermaid");
    console.log(diagram);
    console.log("```\n");
  }

  /**
   * Exporte la définition du workflow au format JSON (pour debug ou documentation).
   * @param {GraphDefinition<T>} workflow
   * @returns {string} JSON string
   */
  exportGraphToJson(workflow: GraphDefinition<T>): string {
    const result = {
      workflowName: workflow.name,
      entryNode: workflow.entryNode,
      nodes: Object.entries(workflow.nodes).reduce((acc, [key, node]) => {
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
   * Génère une représentation textuelle (console) du schéma du workflow.
   * @returns {string}
   */
  visualizeSchema(): string {
    const output: string[] = [];

    output.push(`📋 Graph: ${this.name}`);
    output.push("=".repeat(50));

    // Schéma global
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

    // Détails des nœuds
    output.push("🔷 Nodes:");
    output.push("-".repeat(30));

    this.nodes.forEach((node, nodeName) => {
      output.push(`\n📍 Node: ${nodeName}`);
      output.push(
        `Description: ${node.description || "No description provided"}`
      );

      if (node.relationships && node.relationships.length > 0) {
        const rels = node.relationships.map((r) => r.name).join(", ");
        output.push(`Next nodes: ${rels}`);
      }

      output.push("");
    });

    return output.join("\n");
  }

  /**
   * Décrit récursivement un type Zod pour l'affichage.
   * @param {z.ZodType} type
   * @param {number} indent
   * @returns {string}
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
   * Met à jour le contexte du workflow pour un nœud, en renvoyant un nouvel état.
   * @param {SharedState<T>} state
   * @param {Partial<T>} updates
   * @returns {SharedState<T>}
   */
  protected updateNodeState(state: SharedState<T>, updates: Partial<T>) {
    return {
      ...state,
      ...updates,
    };
  }

  /**
   * Récupère l'état courant du workflow.
   * @returns {SharedState<T>}
   */
  public getState(): SharedState<T> {
    return this.currentState;
  }

  /**
   * Définit le nouvel état courant du workflow et met à jour le contexte global.
   * @param {Partial<SharedState<T>>} state
   */
  public setState(state: Partial<SharedState<T>>): void {
    this.currentState = this.mergeStates(this.currentState, state);

    if (state) {
      Object.entries(state).forEach(([key, value]) => {
        this.globalContext.set(key, value);
      });
    }
    const currentNode = Array.from(this.executedNodes).pop();
    if (currentNode) {
      const node = this.nodes.get(currentNode);
      if (node) {
        node.state = {
          ...(node.state || {}),
          ...(state || {}),
        };
      }
    }
  }

  /**
   * Fusionne deux états.
   * @param {SharedState<T>} currentState
   * @param {Partial<SharedState<T>>} newState
   * @returns {SharedState<T>}
   */
  private mergeStates(
    currentState: SharedState<T>,
    newState: Partial<SharedState<T>>
  ): SharedState<T> {
    return {
      ...currentState,
      ...(newState || {}),
    };
  }

  /**
   * Met à jour l'état courant et le renvoie.
   * @param {Partial<T>} updates
   * @returns {SharedState<T>}
   */
  public updateState(updates: Partial<T>): SharedState<T> {
    const currentState = this.getState();
    const newState: SharedState<T> = {
      ...currentState,
      ...updates,
    };
    this.setState(newState);
    return newState;
  }

  /* =============================================
     =   MÉTHODES STATIQUES POUR PLUSIEURS GRAPHES  =
     ============================================= */

  /**
   * Exécute plusieurs GraphEngine en **séquence** (l'un après l'autre).
   * @param graphs Liste des graphes à exécuter
   * @param startNodes Noms des nœuds de départ correspondants
   * @param initialStates États initiaux correspondants
   * @param onStream Callback d'avancement
   * @param onError Callback d'erreur
   * @returns Tableau des états finaux de chaque graphe
   */
  public static async executeGraphsInSequence<U>(
    graphs: GraphEngine<U>[],
    startNodes: string[],
    initialStates: SharedState<U>[],
    onStream?: (graph: GraphEngine<U>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<U>) => void
  ): Promise<SharedState<U>[]> {
    const finalStates: SharedState<U>[] = [];

    for (let i = 0; i < graphs.length; i++) {
      const graph = graphs[i];
      const startNode = startNodes[i];
      const initialState = initialStates[i];
      const result = await graph.execute(
        initialState,
        startNode,
        onStream,
        onError
      );
      finalStates.push(result);
    }

    return finalStates;
  }

  /**
   * Exécute plusieurs GraphEngine en **parallèle** (sans limite de concurrence).
   * @param graphs Liste des graphes
   * @param startNodes Noms des nœuds de départ
   * @param initialStates États initiaux
   * @param onStream Callback d'avancement
   * @param onError Callback d'erreur
   * @returns Tableau des états finaux de chaque graphe
   */
  public static async executeGraphsInParallel<U>(
    graphs: GraphEngine<U>[],
    startNodes: string[],
    initialStates: SharedState<U>[],
    onStream?: (graph: GraphEngine<U>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<U>) => void
  ): Promise<SharedState<U>[]> {
    const promises = graphs.map((graph, index) =>
      graph.execute(initialStates[index], startNodes[index], onStream, onError)
    );
    return Promise.all(promises);
  }

  /**
   * Exécute plusieurs GraphEngine en parallèle **avec une limite de concurrence**.
   * @param graphs Liste des graphes
   * @param startNodes Noms des nœuds de départ
   * @param initialStates États initiaux
   * @param concurrencyLimit Limite de concurrence
   * @param onStream Callback d'avancement
   * @param onError Callback d'erreur
   * @returns Tableau des états finaux de chaque graphe
   */
  public static async executeGraphsWithConcurrencyLimit<U>(
    graphs: GraphEngine<U>[],
    startNodes: string[],
    initialStates: SharedState<U>[],
    concurrencyLimit: number,
    onStream?: (graph: GraphEngine<U>) => void,
    onError?: (error: Error, nodeName: string, state: SharedState<U>) => void
  ): Promise<SharedState<U>[]> {
    const results: SharedState<U>[] = [];

    for (let i = 0; i < graphs.length; i += concurrencyLimit) {
      const chunkGraphs = graphs.slice(i, i + concurrencyLimit);
      const chunkStartNodes = startNodes.slice(i, i + concurrencyLimit);
      const chunkInitialStates = initialStates.slice(i, i + concurrencyLimit);

      const chunkPromises = chunkGraphs.map((graph, index) => {
        return graph.execute(
          chunkInitialStates[index],
          chunkStartNodes[index],
          onStream,
          onError
        );
      });
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }
}
