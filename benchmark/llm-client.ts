/**
 * @file llm-client.ts
 * @description Thin OpenAI-compatible LLM client shared by all benchmark variants.
 *
 * Works with any OpenAI-compatible endpoint:
 *   - Ollama local  : http://localhost:11434/v1  (no key required)
 *   - Groq          : https://api.groq.com/openai/v1
 *   - OpenRouter    : https://openrouter.ai/api/v1
 */

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Request timeout in ms. Default: 60 000 */
  timeout?: number;
}

export interface LLMCall {
  /** Number of LLM calls made since creation (for benchmark accounting). */
  callCount: number;
  /** Send a prompt and return the text content of the first choice. */
  call(prompt: string): Promise<string>;
  /** Reset the call counter (used between benchmark variants). */
  resetCount(): void;
}

/**
 * Creates an LLMCall instance backed by an OpenAI-compatible chat endpoint.
 * The `format: json` instruction is embedded in the system prompt so that
 * both providers that support the `response_format` field and those that do
 * not (e.g. some Ollama models) behave consistently.
 */
export function createLLMClient(config: LLMConfig): LLMCall {
  let callCount = 0;

  async function call(prompt: string): Promise<string> {
    callCount++;
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Always respond with valid JSON.' },
          { role: 'user',   content: prompt },
        ],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(config.timeout ?? 60_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  return {
    get callCount() { return callCount; },
    call,
    resetCount() { callCount = 0; },
  };
}

/** Safely parse LLM JSON output; returns `fallback` on failure. */
export function safeParse<T>(raw: string, fallback: T): T {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(cleaned) as T; }
  catch { return fallback; }
}
