type HeaderValue = string | string[] | undefined;

export class LLMHeaderBuilder {
  private headers: Map<string, HeaderValue>;

  constructor() {
    this.headers = new Map();
  }

  addHeader(key: string, value: HeaderValue): this {
    if (Array.isArray(value)) {
      this.headers.set(key, value.join("\n"));
    } else {
      this.headers.set(key, value);
    }
    return this;
  }

  build(): string {
    return Array.from(this.headers.entries())
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `# ${key}: ${value}`)
      .join("\n")
      .trim();
  }

  static create(): LLMHeaderBuilder {
    return new LLMHeaderBuilder();
  }
}
