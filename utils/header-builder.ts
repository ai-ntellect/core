type HeaderValue = string | string[] | undefined;

export class LLMHeaderBuilder {
  private headers: Map<string, HeaderValue>;
  private _result: string;

  constructor() {
    this.headers = new Map();
    this._result = "";
  }

  addHeader(key: string, value: HeaderValue): LLMHeaderBuilder {
    if (Array.isArray(value)) {
      this.headers.set(key, value.join("\n"));
    } else {
      this.headers.set(key, value);
    }

    // Build result immediately
    this._result = Array.from(this.headers.entries())
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `# ${key}: ${value}`)
      .join("\n")
      .trim();

    return this;
  }

  valueOf(): string {
    return this._result;
  }

  toString(): string {
    return this._result;
  }

  static create(): LLMHeaderBuilder {
    return new LLMHeaderBuilder();
  }
}
