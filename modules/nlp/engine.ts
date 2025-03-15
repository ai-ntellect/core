import { ActionHandler, NLPConfig } from "../../types";

const { dockStart } = require("@nlpjs/basic");

/**
 * NLP Engine for processing natural language commands
 * @example
 * const engine = await NLPEngine.create({
 *   corpus: require('./corpus.json'),
 *   responses: require('./responses.json'),
 *   entities: require('./entities.json')
 * });
 *
 * engine.addAction('transferTokens', async (data) => {
 *   // Handle transfer logic
 * });
 *
 * const response = await engine.process('transfer 5 ETH');
 */
export class NLPEngine {
  private manager: any;
  private responses: Record<string, any>;
  private intentHandlers: Record<string, ActionHandler> = {};

  constructor() {
    this.responses = {};
  }

  /**
   * Creates and initializes a new NLP Engine
   */
  static async create(config: NLPConfig): Promise<NLPEngine> {
    const engine = new NLPEngine();
    await engine.init(config);
    return engine;
  }

  /**
   * Initializes the NLP engine with configuration
   */
  private async init({
    corpus,
    responses,
    entities,
    language = "en",
    threshold = 0.5,
  }: NLPConfig) {
    const dock = await dockStart({
      settings: {
        nlp: {
          forceNER: true,
          languages: [language],
          corpora: corpus ? [corpus] : undefined,
        },
        ner: { threshold },
      },
      use: ["Basic", "LangEn"],
    });

    this.manager = dock.get("nlp");
    this.responses = responses || {};

    if (corpus) {
      await this.manager.addCorpus(corpus);
    }

    if (entities) {
      this.registerEntities(entities);
    }

    await this.manager.train();
  }

  /**
   * Registers entities for Named Entity Recognition (NER)
   * @private
   * @param {Record<string, any>} entities - Entity definitions
   */
  private registerEntities(entities: Record<string, any>) {
    Object.entries(entities).forEach(([name, data]: [string, any]) => {
      if (data.options) {
        Object.entries(data.options).forEach(([option, texts]) => {
          this.manager.addNerRuleOptionTexts(
            "en",
            name,
            option,
            texts as string[]
          );
        });
      } else if (data.regex) {
        this.manager.addNerRegexRule("en", name, data.regex);
      } else if (data.trim) {
        data.trim.forEach((trimRule: any) => {
          if (trimRule.position === "afterLast") {
            trimRule.words.forEach((word: string) => {
              this.manager.addNerAfterLastCondition("en", name, word);
            });
          } else if (trimRule.position === "betweenLast") {
            this.manager.addNerBetweenLastCondition(
              "en",
              name,
              trimRule.leftWords,
              trimRule.rightWords
            );
          }
        });
      }
    });
  }

  /**
   * Adds an action handler for a specific intent
   * @param {string} name - Intent name
   * @param {ActionHandler} handler - Action handler function
   */
  addAction(name: string, handler: ActionHandler): void {
    this.intentHandlers[name] = handler;
  }

  /**
   * Creates and loads a pre-trained NLP Engine
   */
  static async loadFromModel(
    modelPath: string,
    responses?: Record<string, any>
  ): Promise<NLPEngine> {
    const engine = new NLPEngine();
    engine.responses = responses || {};
    await engine.loadModel(modelPath);
    return engine;
  }

  /**
   * Loads a pre-trained model and configures default actions
   */
  private async loadModel(modelPath: string) {
    const dock = await dockStart({
      settings: {
        nlp: {
          forceNER: true,
          languages: ["en"],
        },
      },
      use: ["Basic", "LangEn"],
    });

    this.manager = dock.get("nlp");
    await this.manager.load(modelPath);

    // Configure default actions handler
    this.setupDefaultActions();
  }

  /**
   * Setup default actions to handle responses
   */
  private setupDefaultActions() {
    this.manager.onIntent = async (data: any) => {
      // Execute registered action if exists
      if (data.actions?.length > 0) {
        for (const actionData of data.actions) {
          const result = await this.executeAction(actionData, data);
          if (result) {
            data.actionResult = result;
          }
        }
      }

      // Format response if answer exists
      if (data.answer && this.responses[data.answer]) {
        data.jsonResponse = this.formatResponse(
          this.responses[data.answer],
          data.actionResult || {}
        );
      }

      return data;
    };
  }

  /**
   * Execute a single action
   */
  private async executeAction(actionData: any, context: any): Promise<any> {
    const { action, parameters } = actionData;
    const handler = this.manager.actions[action];
    if (handler) {
      return handler(context);
    }
    return null;
  }

  /**
   * Processes natural language input text
   * @param {string} input - Input text to process
   * @returns {Promise<any>} Processing result with intent, entities and response
   */
  async process(input: string) {
    const result = await this.manager.process("en", input);
    console.log("NLP Engine Result:", result);

    // Si une action est définie, exécuter le handler
    if (result.intent) {
      const handler = this.intentHandlers[result.intent.split(".")[1]];
      if (handler) {
        const handlerResult = await handler(result);
        return {
          ...result,
          ...handlerResult,
        };
      }
    }

    return result;
  }

  /**
   * Trains the NLP model with current corpus
   * @returns {Promise<void>}
   */
  public async train(): Promise<void> {
    await this.manager.train();
  }

  /**
   * Exports the trained model
   * @param {boolean} [minified=true] - Whether to minify the exported model
   * @returns {string} Exported model as string
   */
  public export(minified = true): string {
    return this.manager.export(minified);
  }

  /**
   * Imports a previously trained model
   * @param {string} data - Model data to import
   */
  public import(data: string): void {
    this.manager.import(data);
  }

  /**
   * Saves the current model to a file
   * @param {string} [path='./model.json'] - Path to save the model
   * @returns {Promise<void>}
   */
  public async saveModel(path = "./model.json"): Promise<void> {
    this.manager.save();
    this.manager.save("./model.json");
  }

  /**
   * Formats response using template and context
   */
  private formatResponse(template: any, context: any): any {
    const response = JSON.parse(JSON.stringify(template));

    // Format data fields
    if (response.data) {
      Object.keys(response.data).forEach((key) => {
        if (context[key] !== undefined) {
          response.data[key] = context[key];
        }
      });
    }

    return response;
  }

  /**
   * Gets entity value from NLP result
   * @param {any} data - NLP processing result
   * @param {string} entityName - Name of the entity to extract
   * @returns {string|undefined} Entity value if found
   */
  getEntity(data: any, entityName: string): string | undefined {
    const entity = data.entities?.find((e: any) => e.entity === entityName);
    return entity ? entity.utteranceText : undefined;
  }

  /**
   * Gets entity option from NLP result
   * @param {any} data - NLP processing result
   * @param {string} entityName - Name of the entity to extract
   * @returns {string|undefined} Entity option if found
   */
  getEntityOption(data: any, entityName: string): string | undefined {
    const entity = data.entities?.find((e: any) => e.entity === entityName);
    return entity ? entity.option : undefined;
  }

  /**
   * Gets recipient entity from NLP result
   * @param {any} data - NLP processing result
   * @returns {string|undefined} Recipient value if found
   */
  getRecipient(data: any): string | undefined {
    const toEntity = data.entities?.find((e: any) => e.entity === "to");
    return toEntity ? toEntity.utteranceText : undefined;
  }

  /**
   * Gets current responses configuration
   * @returns {Record<string, any>} Current responses
   */
  public getResponses(): Record<string, any> {
    return this.responses;
  }

  /**
   * Gets current corpus configuration
   * @returns {any} Current corpus
   */
  public getCorpus(): any {
    return this.manager.corpora;
  }

  /**
   * Gets current entities configuration
   * @returns {any} Current entities configuration
   */
  public getEntities(): any {
    return this.manager.nerManager?.rules || {};
  }
}
