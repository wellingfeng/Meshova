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

export interface LlmClient {
  /** Return the assistant's text completion for the given conversation. */
  complete(messages: LlmMessage[]): Promise<string>;
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
  /** Pass the platform fetch (globalThis.fetch in browser/Node 18+). */
  fetchImpl: (input: string, init?: unknown) => Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

export function makeOpenAICompatibleClient(opts: OpenAICompatibleOptions): LlmClient {
  return {
    async complete(messages: LlmMessage[]): Promise<string> {
      const body = {
        model: opts.model,
        messages: messages.map((m) => {
          // Gather single + multi image fields into one ordered list.
          const imgs = [
            ...(m.imageBase64 ? [m.imageBase64] : []),
            ...(m.imagesBase64 ?? []),
          ];
          if (imgs.length > 0) {
            return {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                ...imgs.map((b64) => ({
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${b64}` },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        }),
      };
      const resp = await opts.fetchImpl(opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text()}`);
      const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    },
  };
}

