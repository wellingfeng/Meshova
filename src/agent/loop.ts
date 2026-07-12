/**
 * Agent loop (P4): the self-iteration cycle the project is built around.
 *
 *   describe -> LLM writes a script -> sandbox runs it -> render + summarize
 *   -> feed result (and optionally a screenshot) back -> LLM revises -> repeat
 *
 * The loop is provider-agnostic (depends on LlmClient) and render-agnostic
 * (you pass a `render` callback that turns parts into a screenshot, or omit it
 * for headless text-only iteration). This is the closed loop that lets the
 * model improve its own output without a human in the middle.
 */
import { runMeshScript, type RunScriptResult } from "./runner.js";
import { SCRIPT_API_REFERENCE } from "./api.js";
import { extractCode, type LlmClient, type LlmMessage } from "./llm.js";
import type { NamedPart } from "../geometry/export.js";
import { critique, formatCritique, type CritiqueReport } from "../critique/index.js";

export interface RenderResult {
  /** base64 PNG (no data: prefix) of the rendered model. */
  imageBase64?: string;
  /** Optional extra textual notes about the render (e.g. "looks lopsided"). */
  notes?: string;
}

export interface AgentLoopOptions {
  client: LlmClient;
  /** Natural-language goal, e.g. "a low-poly tree". */
  goal: string;
  /** Max generate→run→revise iterations. Default 3. */
  maxIterations?: number;
  /** Optional renderer: parts -> screenshot for vision feedback. */
  render?: (parts: NamedPart[], iteration: number) => Promise<RenderResult>;
  /** Sandbox limits. */
  timeoutMs?: number;
  opBudget?: number;
  /**
   * Enable the deterministic mesh critic (geometry + proportion/rubric review)
   * each iteration; its report is fed back to the model for targeted revision.
   * Default true. Set false for pure similarity/text iteration.
   */
  critic?: boolean;
  /** Overall critique pass threshold, 0..1. Default 0.7. */
  criticThreshold?: number;
  /** Stop early once a run passes the critic. Default true. */
  stopOnPass?: boolean;
  /** Called after each iteration for logging/streaming. */
  onStep?: (step: AgentStep) => void;
}

export interface AgentStep {
  iteration: number;
  script: string;
  run: RunScriptResult;
  imageBase64?: string;
  /** Mesh critic report for this iteration, when the critic is enabled. */
  critique?: CritiqueReport;
}

export interface AgentLoopResult {
  success: boolean;
  steps: AgentStep[];
  /** Best run (last successful, else last attempt). */
  final: AgentStep | null;
}

// Built lazily (not at module load): `SCRIPT_API_REFERENCE` comes from api.js,
// which pulls in the barrel `../index.js`. Reading it at top level here races
// the circular import and hits a temporal-dead-zone error in strict ESM eval
// order (crashes any bundle that imports the barrel, e.g. the web viewer).
function systemPrompt(): string {
  return `You are a procedural 3D modeling assistant for Meshova.
You write a SINGLE JavaScript snippet (no imports, no async) that calls the
provided API and ends with \`return [ part(...), ... ];\`.

${SCRIPT_API_REFERENCE}

Rules:
- Use only the listed functions. No DOM, no fetch, no require/import.
- Keep models centered near the origin and roughly 1-2 units tall.
- Generate the model AND its materials together: when a part's material matters
  (glass, metal, liquid, plastic, fabric, leather, glowing, etc.), emit it with
  surfacePart(name, mesh, type, params) so the surface is matched to the shape.
  Use plain part(name, mesh, [r,g,b]) only for simple flat-colored pieces.
- Separate structural parts from surface detail. Seams, panel gaps, wrinkles,
  stitches, bevel shadows, and creases on soft goods are material/detail cues:
  use subdivided mesh + indentCreases(...) when they affect shape, or keep them
  as same-material leather/fabric detail. Do not turn them into metal/plastic
  rods unless the reference clearly shows raised hardware.
- Prefer clean, readable code. Output ONLY one fenced \`\`\`js code block.`;
}

function feedbackMessage(run: RunScriptResult, hasImage: boolean, criticText?: string): string {
  if (!run.ok) {
    return `The script failed.\nError: ${run.error}\nFix the script and return the corrected full snippet.`;
  }
  const visionNote = hasImage
    ? "A rendered screenshot is attached. Critique it against the goal and improve the model."
    : "No screenshot available; use the stats to judge proportions.";
  const criticBlock = criticText
    ? `\n\nAutomated mesh review — address MUST FIX items first:\n${criticText}`
    : "";
  return `The script ran successfully.\n${run.summary}\n${visionNote}${criticBlock}\nIf it already matches the goal well, return the same script. Otherwise return an improved full snippet.`;
}

/** Run the closed generate→render→revise loop. */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxIterations = Math.max(1, opts.maxIterations ?? 3);
  const useCritic = opts.critic ?? true;
  const criticThreshold = opts.criticThreshold ?? 0.7;
  const stopOnPass = opts.stopOnPass ?? true;
  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: `Goal: ${opts.goal}\nWrite the script.` },
  ];

  const steps: AgentStep[] = [];
  let lastSuccess: AgentStep | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const reply = await opts.client.complete(messages);
    const script = extractCode(reply);
    messages.push({ role: "assistant", content: reply });

    const sandboxOpts: { timeoutMs?: number; opBudget?: number } = {};
    if (opts.timeoutMs !== undefined) sandboxOpts.timeoutMs = opts.timeoutMs;
    if (opts.opBudget !== undefined) sandboxOpts.opBudget = opts.opBudget;
    const run = runMeshScript(script, `${opts.goal.slice(0, 24)}-${i}`, sandboxOpts);

    let imageBase64: string | undefined;
    let renderNotes: string | undefined;
    if (run.ok && opts.render) {
      try {
        const r = await opts.render(run.parts, i);
        imageBase64 = r.imageBase64;
        renderNotes = r.notes;
      } catch {
        renderNotes = "(render failed; continuing with stats only)";
      }
    }

    let report: CritiqueReport | undefined;
    if (run.ok && useCritic) {
      try {
        report = critique(run.parts, { goal: opts.goal, passThreshold: criticThreshold });
      } catch {
        report = undefined;
      }
    }

    const step: AgentStep = { iteration: i, script, run };
    if (imageBase64 !== undefined) step.imageBase64 = imageBase64;
    if (report !== undefined) step.critique = report;
    steps.push(step);
    opts.onStep?.(step);
    if (run.ok) lastSuccess = step;

    // Stop early once the critic is satisfied, or on the last iteration.
    if (report && report.passed && stopOnPass) break;
    if (i === maxIterations - 1) break;
    const criticText = report ? formatCritique(report) : undefined;
    const fb = feedbackMessage(run, !!imageBase64, criticText);
    const msg: LlmMessage = {
      role: "user",
      content: renderNotes ? `${fb}\nRenderer notes: ${renderNotes}` : fb,
    };
    if (imageBase64 !== undefined) msg.imageBase64 = imageBase64;
    messages.push(msg);
  }

  return {
    success: !!lastSuccess,
    steps,
    final: lastSuccess ?? steps[steps.length - 1] ?? null,
  };
}
