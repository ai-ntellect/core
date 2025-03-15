import { NLPNodeConfig } from "@/interfaces";
import { ZodSchema } from "zod";
import { NLPEngine } from "./engine";

/**
 * NLPNode class handles natural language processing operations with type-safe schema validation
 * @template T - Zod schema type for validation
 */
export class NLPNode<T extends ZodSchema> {
  private engine!: NLPEngine;

  /**
   * Creates an instance of NLPNode
   * @param {NLPNodeConfig<T>} config - Configuration object for the NLP node
   */
  constructor(private config: NLPNodeConfig<T>) {}

  /**
   * Initializes the NLP engine and sets up intent handlers
   * @returns {Promise<void>}
   */
  async initialize() {
    this.engine = await NLPEngine.create(this.config.nlpConfig);
    console.log("Loaded engine");
    if (this.config.intentHandlers) {
      Object.entries(this.config.intentHandlers).forEach(
        ([intent, handler]) => {
          this.engine.addAction(intent, handler);
        }
      );
    }
  }

  /**
   * Processes the input text through the NLP engine
   * @param {string} input - Text to be processed
   * @returns {Promise<any>} - Processing result from the engine
   */
  async process(input: string) {
    console.log("NLP Node processing:", input);
    const result = await this.engine.process(input);
    console.log("NLP Node result:", result);
    return result;
  }
}
