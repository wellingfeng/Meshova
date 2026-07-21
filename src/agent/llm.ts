/**
 * LLM interface (P4): the agent loop depends only on this small interface, so
 * any provider (OpenAI/Anthropic/local/Ollama) plugs in by implementing it.
 * No provider SDK or API key lives in the core — you inject a client.
 *
 * A turn may include an image (the rendered screenshot) so vision models can
 * critique their own output and iterate.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional base64 PNG (no data: prefix) for vision feedback. */
  imageBase64?: string;
  /**
   * Optional multiple base64 PNGs (no data: prefix) for multi-image turns, e.g.
   * feeding aligned channels (pbr/normal/depth) or several views at once. When
   * set, adapters should attach all of them in order; `imageBase64` is the
   * single-image shorthand and may be used together with this.
   */
  imagesBase64?: string[];
}

export interface LlmCompletionMetadata {
  model: string;
  attempts: number;
  fallbackUsed: boolean;
}

export interface LlmClient {
  /** Return the assistant's text completion for the given conversation. */
  complete(messages: LlmMessage[]): Promise<string>;
  /** Metadata for the latest successful completion, when the adapter exposes it. */
  completionMetadata?(): LlmCompletionMetadata | undefined;
}

/** Extract a single ```...``` code block, or return the whole text trimmed. */
export function extractCode(text: string): string {
  const fence = /```(?:json|javascript|typescript|js|ts)?[ \t]*\r?\n?([\s\S]*?)```/i.exec(text);
  if (fence) return fence[1]!.trim();
  return text.trim();
}

/**
 * A deterministic mock client for tests and offline end-to-end runs. It does
 * not call any network. Provide canned replies; it returns them in order, then
 * repeats the last one. This lets the whole loop be exercised without a key.
 */
export class MockLlmClient implements LlmClient {
  private calls = 0;
  constructor(private readonly replies: string[]) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async complete(_messages: LlmMessage[]): Promise<string> {
    const idx = Math.min(this.calls, this.replies.length - 1);
    this.calls += 1;
    return this.replies[idx] ?? "";
  }

  get callCount(): number {
    return this.calls;
  }

  completionMetadata(): LlmCompletionMetadata {
    return { model: "mock", attempts: 1, fallbackUsed: false };
  }
}

/**
 * Reference adapter shape for an OpenAI-compatible chat endpoint. Not wired to
 * any network here; copy this into your app and pass a real fetch + key. Kept
 * as a comment-documented helper so the integration point is obvious.
 *
 * Example:
 *   const client = makeOpenAICompatibleClient({
 *     endpoint: "https://api.openai.com/v1/chat/completions",
 *     apiKey: process.env.OPENAI_API_KEY!,
 *     model: "gpt-4o",
 *     fetchImpl: fetch,
 *   });
 */
export interface OpenAICompatibleOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  /** Models tried after the primary model exhausts retryable failures. */
  fallbackModels?: readonly string[];
  /** Per-request timeout. Default 120 seconds. */
  timeoutMs?: number;
  /** Retries per model after the first request. Default 2. */
  maxRetries?: number;
  /** Initial exponential-backoff delay. Default 750ms. */
  retryDelayMs?: number;
  /** Pass the platform fetch (globalThis.fetch in browser/Node 18+). */
  fetchImpl: (input: string, init?: unknown) => Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

export function makeOpenAICompatibleClient(opts: OpenAICompatibleOptions): LlmClient {
  const models = [...new Set([opts.model, ...(opts.fallbackModels ?? [])].filter(Boolean))];
  const timeoutMs = Math.max(1, opts.timeoutMs ?? 120_000);
  const maxRetries = Math.max(0, Math.floor(opts.maxRetries ?? 2));
  const retryDelayMs = Math.max(0, opts.retryDelayMs ?? 750);
  let lastCompletion: LlmCompletionMetadata | undefined;
  const runtime = globalThis as unknown as {
    AbortController: new () => { abort(): void; signal: { aborted: boolean } };
    setTimeout(handler: () => void, delay: number): unknown;
    clearTimeout(timer: unknown): void;
  };

  const client: LlmClient = {
    completionMetadata(): LlmCompletionMetadata | undefined {
      return lastCompletion;
    },
    async complete(messages: LlmMessage[]): Promise<string> {
      let attempts = 0;
      let lastError: Error | undefined;
      for (const [modelIndex, model] of models.entries()) {
        for (let retry = 0; retry <= maxRetries; retry++) {
          attempts += 1;
          const controller = new runtime.AbortController();
          const timer = runtime.setTimeout(() => controller.abort(), timeoutMs);
          try {
            const body = {
              model,
              messages: messages.map((message) => {
                const images = [
                  ...(message.imageBase64 ? [message.imageBase64] : []),
                  ...(message.imagesBase64 ?? []),
                ];
                if (images.length === 0) return { role: message.role, content: message.content };
                return {
                  role: message.role,
                  content: [
                    { type: "text", text: message.content },
                    ...images.map((imageBase64) => ({
                      type: "image_url",
                      image_url: { url: `data:image/png;base64,${imageBase64}` },
                    })),
                  ],
                };
              }),
            };
            const response = await opts.fetchImpl(opts.endpoint, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${opts.apiKey}`,
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            if (!response.ok) {
              const detail = await response.text();
              const error = new Error(`LLM HTTP ${response.status} [${model}]: ${detail}`);
              const retryable = response.status === 408 || response.status === 409 || response.status === 425 ||
                response.status === 429 || response.status >= 500;
              const modelUnavailable = response.status === 404;
              if (!retryable && !modelUnavailable) throw error;
              lastError = error;
              if (retry < maxRetries && retryable) {
                await new Promise<void>((resolve) => runtime.setTimeout(resolve, retryDelayMs * 2 ** retry));
                continue;
              }
              break;
            }
            const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
            lastCompletion = { model, attempts, fallbackUsed: modelIndex > 0 };
            return json.choices?.[0]?.message?.content ?? "";
          } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            const aborted = controller.signal.aborted;
            if (!aborted && /^LLM HTTP (?!408|409|425|429|5\d\d)/.test(normalized.message)) throw normalized;
            lastError = aborted ? new Error(`LLM timeout after ${timeoutMs}ms [${model}]`) : normalized;
            if (retry < maxRetries) {
              await new Promise<void>((resolve) => runtime.setTimeout(resolve, retryDelayMs * 2 ** retry));
              continue;
            }
            break;
          } finally {
            runtime.clearTimeout(timer);
          }
        }
      }
      throw lastError ?? new Error("LLM completion failed without a response");
    },
  };
  return client;
}
