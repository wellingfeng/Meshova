/**
 * Image-targeted agent loop (P7): the "approximate this photo" closed loop.
 *
 * It extends the plain agent loop with a *reference image goal*. Each iteration
 *   1. the VLM writes/revises a script (it sees BOTH the reference photo and
 *      the previous render),
 *   2. the sandbox runs it and we render a screenshot,
 *   3. we score the render's silhouette + color against the reference,
 *   4. the score + breakdown go back to the model as feedback.
 *
 * Shape is the dominant signal (silhouette IoU), matching the project's
 * priority that the *form* should match; color is a secondary nudge and
 * material category is handled by the separate classifier, not here. We never
 * bake the photo into geometry — the output is always a procedural script.
 */
import { runMeshScript, type RunScriptResult } from "./runner.js";
import { SCRIPT_API_REFERENCE } from "./api.js";
import { extractCode, type LlmClient, type LlmMessage } from "./llm.js";
import type { NamedPart } from "../geometry/export.js";
import {
  makeReferenceTarget,
  scoreRenderPng,
  formatScore,
  scoreSolidity,
  applySolidity,
  formatSolidity,
  bytesToBase64,
  base64ToBytes,
  type ReferenceTarget,
  type ScoreBreakdown,
  type SolidityBreakdown,
  type TargetOptions,
} from "../vision/index.js";
import {
  critique,
  formatCritique,
  critiqueWithVlm,
  type CritiqueReport,
  type VlmCritique,
} from "../critique/index.js";

export interface ImageRenderResult {
  /** base64 PNG (no data: prefix) of the rendered model. Required for scoring. */
  imageBase64: string;
  /**
   * Optional extra renders of the SAME model from other angles (e.g. side, top,
   * a 45deg orbit), base64 PNG each. When provided, the loop runs a reference
   * free "solidity" check: a flat billboard that matches head-on but collapses
   * edge-on gets penalized. No per-view reference needed — it's geometric.
   */
  auxViewsBase64?: string[];
  notes?: string;
}

export interface ImageLoopOptions {
  client: LlmClient;
  /** The reference photo as PNG bytes. */
  referencePng: Uint8Array;
  /** Optional text hint, e.g. "a wooden stool". Helps the VLM's first guess. */
  hint?: string;
  maxIterations?: number;
  /** Renderer MUST return a screenshot; scoring needs it. */
  render: (parts: NamedPart[], iteration: number) => Promise<ImageRenderResult>;
  /** Stop early once score >= this threshold (0..1). Default 0.9. */
  targetScore?: number;
  scoreOptions?: TargetOptions;
  /**
   * Penalty weight for the solidity check (flat-shape guard), >=0. Only applies
   * when the renderer returns auxViewsBase64. Default 0.5. Set 0 to disable.
   */
  solidityPenalty?: number;
  timeoutMs?: number;
  opBudget?: number;
  /**
   * Run the deterministic mesh critic (geometry + proportion/rubric) each
   * iteration and feed its report back. Default true. The goal used for its
   * rubric is the `hint` (falls back to a generic rubric).
   */
  critic?: boolean;
  /**
   * Run the expensive VLM aesthetic/realism review every N iterations (and on
   * the final scored iteration), folding it into the critic report. 0 disables.
   * Default 0 — enable explicitly since it costs VLM calls per milestone.
   */
  vlmCriticEveryN?: number;
  onStep?: (step: ImageAgentStep) => void;
}

export interface ImageAgentStep {
  iteration: number;
  script: string;
  run: RunScriptResult;
  imageBase64?: string;
  score?: ScoreBreakdown;
  /** Reference-free solidity (flat-shape) result, when aux views were given. */
  solidity?: SolidityBreakdown;
  /** Score after folding solidity into the shape score (what `best` ranks on). */
  combinedScore?: number;
  /** Mesh critic report (geometry + proportion, and VLM axes at milestones). */
  critique?: CritiqueReport;
}

export interface ImageLoopResult {
  success: boolean;
  steps: ImageAgentStep[];
  /** Step with the highest score (best shape match). */
  best: ImageAgentStep | null;
  target: ReferenceTarget;
}

// Built lazily (not at module load) to avoid a circular-import TDZ crash:
// reading SCRIPT_API_REFERENCE at top level races api.js -> ../index.js barrel.
function systemPrompt(): string {
  return `You are a procedural 3D modeling assistant for Meshova.
Your job: write a SINGLE JavaScript snippet (no imports, no async) that builds
a model whose SHAPE approximates a reference photo. Getting the overall form
and proportions right matters most; fine surface detail does not.

${SCRIPT_API_REFERENCE}

Rules:
- Use only the listed functions. No DOM, no fetch, no require/import.
- Before writing code, infer reference anchors internally, independent of
  object category: main silhouette, support/contact/bottom line, local-axis
  extents, major cross-section widths/heights, openings/negative spaces,
  visible boundary lines, repeated element counts, symmetry/asymmetry, and
  which parts must be separate named geometry.
- Before writing code, infer an attachment graph: for every visible part,
  decide what it touches, penetrates, supports, or is embedded into. Normal
  manufactured/organic objects should read as connected assemblies, not a set
  of separated labels.
- Preserve those anchors in part placement. Do not satisfy the prompt only by
  naming semantic parts; match where each visible part sits in the reference.
- Build connected major forms first. Prefer shared loft sections, inset panels,
  boolean cuts, shallow overlaps, or embedded sub-meshes for windows/openings/
  panels. Use separate floating parts only when the reference shows true gaps.
- If material regions are adjacent on one continuous form, keep them coplanar
  or slightly inset/embedded. Do not leave visible air gaps between adjacent
  panels, glass, trim, shells, limbs, supports, or tail/front modules.
- When a reference includes comparison arrows/markup, treat arrow endpoints as
  correction targets for position, size, and hierarchy.
- Compose primitives (box/sphere/cylinder/cone/...) and ops to match the
  object's silhouette and proportions. Keep it centered near the origin,
  roughly 1-2 units tall.
- Separate structure from surface/material detail. Thin dark lines, seams,
  grooves, decals, color boundaries, wrinkles, stitches, and panel gaps are not
  standalone rods/bars unless they change silhouette or depth. If they affect
  a soft surface shape, use subdivided mesh + indentCreases(...).
- On feedback turns, compare the render against the inferred anchors first.
  Fix the largest position/proportion/count/connection error before adding
  small detail. If the run summary reports floating/disconnected parts, resolve
  those gaps before adding new parts.
- You will be shown the reference photo and your latest render plus a score.
  Increase silhouette overlap by fixing proportions, part placement, and counts.
- Output ONLY one fenced \`\`\`js code block.`;
}

function feedback(run: RunScriptResult, score: ScoreBreakdown | undefined, solidity: SolidityBreakdown | undefined): string {
  if (!run.ok) {
    return `The script failed.\nError: ${run.error}\nReturn the corrected full snippet.`;
  }
  const lines = [
    "Script ran. Stats:",
    run.summary,
  ];
  if (score) {
    lines.push(
      `Match vs reference: ${formatScore(score)}`,
      "The FIRST attached image is the reference photo; the SECOND is your render.",
      "Improve the silhouette match (shape/proportions/part layout). Return an improved full snippet, or the same one if it already matches well.",
    );
  } else {
    lines.push("No score available this turn; judge from the attached images.");
  }
  if (solidity && solidity.areas.length >= 2 && solidity.solidity < 0.75) {
    lines.push(
      `Solidity warning: ${formatSolidity(solidity)}.`,
      "The model's footprint collapses from some angles — it reads as flat/billboard-like. Give it real volume/depth on all axes (extrude, thicken, add cross-section), not just a front-facing slab.",
    );
  }
  return lines.join("\n");
}

/** Run the closed image-targeted generate→render→score→revise loop. */
export async function runImageLoop(opts: ImageLoopOptions): Promise<ImageLoopResult> {
  const maxIterations = Math.max(1, opts.maxIterations ?? 4);
  const targetScore = opts.targetScore ?? 0.9;
  const useCritic = opts.critic ?? true;
  const vlmEveryN = Math.max(0, opts.vlmCriticEveryN ?? 0);
  const critiqueGoal = opts.hint ?? "object";
  const target = makeReferenceTarget(opts.referencePng, opts.scoreOptions);
  const refB64 = bytesToBase64(opts.referencePng);

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `Reference photo is attached.${opts.hint ? ` Hint: ${opts.hint}.` : ""} Write the script to approximate its shape.`,
      imageBase64: refB64,
    },
  ];

  const steps: ImageAgentStep[] = [];
  let best: ImageAgentStep | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const reply = await opts.client.complete(messages);
    const script = extractCode(reply);
    messages.push({ role: "assistant", content: reply });

    const sandboxOpts: { timeoutMs?: number; opBudget?: number } = {};
    if (opts.timeoutMs !== undefined) sandboxOpts.timeoutMs = opts.timeoutMs;
    if (opts.opBudget !== undefined) sandboxOpts.opBudget = opts.opBudget;
    const run = runMeshScript(script, `img-${i}`, sandboxOpts);

    let imageBase64: string | undefined;
    let renderNotes: string | undefined;
    let score: ScoreBreakdown | undefined;
    let solidity: SolidityBreakdown | undefined;
    let combinedScore: number | undefined;
    if (run.ok) {
      try {
        const r = await opts.render(run.parts, i);
        imageBase64 = r.imageBase64;
        renderNotes = r.notes;
        score = scoreRenderPng(target, base64ToBytes(r.imageBase64));
        // Reference-free solidity from extra angles: the main render plus any
        // aux views form the set whose footprint collapse we measure.
        if (r.auxViewsBase64 && r.auxViewsBase64.length > 0) {
          const views = [r.imageBase64, ...r.auxViewsBase64].map(base64ToBytes);
          solidity = scoreSolidity(views, { renderBg: opts.scoreOptions?.renderBg ?? [13, 17, 23] });
          combinedScore = applySolidity(score.score, solidity.solidity, opts.solidityPenalty ?? 0.5);
        } else {
          combinedScore = score.score;
        }
      } catch {
        renderNotes = "(render/score failed; continuing with stats only)";
      }
    }

    // Mesh critic: deterministic geometry + proportion every iteration, with an
    // optional VLM aesthetic/realism pass at milestones (or on the last turn).
    let report: CritiqueReport | undefined;
    if (run.ok && useCritic) {
      const isLast = i === maxIterations - 1;
      const milestone =
        vlmEveryN > 0 && (isLast || (i + 1) % vlmEveryN === 0) && imageBase64 !== undefined;
      let vlm: VlmCritique | undefined;
      if (milestone && imageBase64 !== undefined) {
        try {
          const renders = [imageBase64];
          // Fold in extra angles when the renderer supplied them (better solidity
          // and proportion judgment for the VLM).
          vlm = await critiqueWithVlm({
            client: opts.client,
            goal: critiqueGoal,
            rendersBase64: renders,
            referenceBase64: refB64,
          });
        } catch {
          vlm = undefined;
        }
      }
      try {
        report = critique(run.parts, vlm ? { goal: critiqueGoal, vlm } : { goal: critiqueGoal });
      } catch {
        report = undefined;
      }
    }

    const step: ImageAgentStep = { iteration: i, script, run };
    if (imageBase64 !== undefined) step.imageBase64 = imageBase64;
    if (score !== undefined) step.score = score;
    if (solidity !== undefined) step.solidity = solidity;
    if (combinedScore !== undefined) step.combinedScore = combinedScore;
    if (report !== undefined) step.critique = report;
    steps.push(step);
    opts.onStep?.(step);

    // Rank on the combined (solidity-adjusted) score so a flat shape can't win
    // just by matching the front silhouette.
    if (combinedScore !== undefined && (best?.combinedScore === undefined || combinedScore > best.combinedScore)) best = step;

    if (best?.combinedScore !== undefined && best.combinedScore >= targetScore) break;
    if (i === maxIterations - 1) break;

    // Feedback turn: attach reference first, then the latest render, so the
    // model can compare the two directly.
    let fb = feedback(run, score, solidity);
    if (report) fb += `\n\nAutomated mesh review — address MUST FIX first:\n${formatCritique(report)}`;
    messages.push({
      role: "user",
      content: renderNotes ? `${fb}\nRenderer notes: ${renderNotes}` : fb,
      imageBase64: refB64,
    });
    if (imageBase64 !== undefined) {
      messages.push({ role: "user", content: "(your latest render)", imageBase64 });
    }
  }

  return {
    success: !!best,
    steps,
    best: best ?? steps[steps.length - 1] ?? null,
    target,
  };
}
