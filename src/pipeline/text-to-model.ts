/**
 * Text -> procedural model (public skill).
 *
 * This is one of the two end-user entry points Meshova ships: describe a model
 * in words, get back a procedural script + built parts. It is a thin, stable
 * wrapper over the agent loop so callers don't wire up sandboxing/feedback
 * themselves. The output is always a script (re-runnable, editable), never a
 * baked mesh dump — that's the whole point of the project.
 */
import { runAgentLoop, type RenderResult } from "../agent/loop.js";
import type { LlmClient } from "../agent/llm.js";
import type { NamedPart } from "../geometry/export.js";

export interface TextToModelOptions {
  client: LlmClient;
  /** Natural-language description, e.g. "a low-poly pine tree". */
  prompt: string;
  /** Generate→render→revise rounds. Default 3. */
  iterations?: number;
  /**
   * Optional renderer (parts -> screenshot) for vision feedback. Omit for
   * headless text-only iteration (proportions judged from stats alone).
   */
  render?: (parts: NamedPart[], iteration: number) => Promise<RenderResult>;
  onStep?: (info: { iteration: number; ok: boolean; summary: string }) => void;
}

export interface TextToModelResult {
  success: boolean;
  /** The final working script (or last attempt if none succeeded). */
  script: string;
  /** Built parts from the final script, ready to render/export. */
  parts: NamedPart[];
  iterations: number;
}

/** Generate a procedural model from a text prompt via the closed agent loop. */
export async function textToModel(opts: TextToModelOptions): Promise<TextToModelResult> {
  const loopOpts: Parameters<typeof runAgentLoop>[0] = {
    client: opts.client,
    goal: opts.prompt,
    maxIterations: opts.iterations ?? 3,
    onStep: (s) => opts.onStep?.({ iteration: s.iteration, ok: s.run.ok, summary: s.run.summary }),
  };
  if (opts.render) loopOpts.render = opts.render;

  const result = await runAgentLoop(loopOpts);
  const final = result.final;
  return {
    success: result.success,
    script: final?.script ?? "",
    parts: final?.run.parts ?? [],
    iterations: result.steps.length,
  };
}

