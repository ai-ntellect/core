import { AgentContext, PromptSection } from "../../types/agent";

/**
 * Builder class for creating structured prompts with multiple sections
 * @class PromptBuilder
 */
export class PromptBuilder {
  private sections: PromptSection[] = [];
  private formatFn?: (
    sections: PromptSection[],
    context: AgentContext
  ) => string | Promise<string>;

  /**
   * Adds a new section to the prompt
   * @param {string} title - The title of the section
   * @param {string | ((context: AgentContext) => string | Promise<string>)} content - The content or a function to generate content
   * @returns {this} The builder instance for method chaining
   */
  addSection(
    title: string,
    content: string | ((context: AgentContext) => string | Promise<string>)
  ): this {
    this.sections.push({ title, content });
    return this;
  }

  /**
   * Sets a custom formatter function for the final prompt
   * @param {(sections: PromptSection[], context: AgentContext) => string | Promise<string>} formatter - The formatter function
   * @returns {this} The builder instance for method chaining
   */
  setFormatter(
    formatter: (
      sections: PromptSection[],
      context: AgentContext
    ) => string | Promise<string>
  ): this {
    this.formatFn = formatter;
    return this;
  }

  /**
   * Builds the final prompt by resolving all sections and applying formatting
   * @param {AgentContext} context - The context to use when resolving dynamic content
   * @returns {Promise<string>} The formatted prompt string
   */
  async build(context: AgentContext): Promise<string> {
    const resolvedSections = await Promise.all(
      this.sections.map(async (section) => ({
        title: section.title,
        content:
          typeof section.content === "function"
            ? await section.content(context)
            : section.content,
      }))
    );

    if (this.formatFn) {
      return this.formatFn(resolvedSections, context);
    }

    return resolvedSections
      .map((section) => `## ${section.title}\n${section.content}`)
      .join("\n\n");
  }
}

/**
 * Default formatter function that formats sections with markdown-style headers
 * @param {PromptSection[]} sections - The sections to format
 * @returns {string} The formatted prompt string
 */
export const defaultFormatter = (sections: PromptSection[]): string => {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n");
};
