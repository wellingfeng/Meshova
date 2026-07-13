/**
 * Image -> procedural model (public skill).
 *
 * The second end-user entry point: hand in a reference photo, get back a
 * procedural script whose SHAPE approximates it, plus a material choice for
 * its surface category. Design priorities (set with the user):
 *   - Shape consistency first: the loop optimizes silhouette overlap.
 *   - Material is "category-correct", not pixel-accurate: a classifier picks a
 *     procedural preset family; if unsure it returns a neutral material rather
 *     than guessing (so metal never becomes leather).
 * Nothing from the photo is baked into geometry or texture — output stays
 * fully procedural.
 */
import { runImageLoop, type ImageRenderResult } from "../agent/image-loop.js";
import type { LlmClient } from "../agent/llm.js";
import type { NamedPart } from "../geometry/export.js";
import type { ReconstructionContract, ReconstructionPassState, ReviewLedger } from "../reconstruction/index.js";
import { encodePNG } from "../texture/png.js";
import {
  classifyByVlm,
  classifyByFeatures,
  resolveWithGuard,
  decodePNG,
  crop,
  bytesToBase64,
  canonicalizeReference,
  formatViewpoint,
  type MaterialChoice,
  type ReferenceEvaluationOptions,
  type ReferenceCandidateGateOptions,
  type ScoreBreakdown,
  type TargetOptions,
} from "../vision/index.js";

export interface ImageToModelOptions {
  client: LlmClient;
  /** Reference photo as PNG bytes. */
  referencePng: Uint8Array;
  /** Optional category hint, e.g. "a leather armchair". */
  hint?: string;
  /** Shape-matching rounds. Default 4. */
  iterations?: number;
  /** Renderer MUST return a screenshot; shape scoring depends on it. */
  render: (parts: NamedPart[], iteration: number) => Promise<ImageRenderResult>;
  /** Stop early once shape score >= this (0..1). Default 0.9. */
  targetScore?: number;
  scoreOptions?: TargetOptions;
  evaluationOptions?: ReferenceEvaluationOptions;
  candidateGate?: ReferenceCandidateGateOptions;
  /**
   * Penalty weight for the flat-shape (solidity) guard, >=0. Effective only
   * when `render` returns auxViewsBase64 (extra angles). Default 0.5; 0 off.
   */
  solidityPenalty?: number;
  /** Optional staged quality contract with critical-feature and LookDev gates. */
  reconstructionContract?: ReconstructionContract;
  /**
   * Classify the surface material too. Default true. Uses the VLM classifier
   * with a feature-based fallback, then applies the confidence guard.
   */
  classifyMaterial?: boolean;
  onStep?: (info: { iteration: number; ok: boolean; score?: ScoreBreakdown }) => void;
}

export interface ImageToModelResult {
  success: boolean;
  /** Best-matching procedural script. */
  script: string;
  parts: NamedPart[];
  /** Best shape score achieved. */
  score: ScoreBreakdown | null;
  /** Chosen surface material (guarded). null if classification was disabled. */
  material: MaterialChoice | null;
  iterations: number;
  passState?: ReconstructionPassState;
  reviewLedger?: ReviewLedger;
}

/**
 * Classify the reference's surface material. Canonicalizes first so the sample
 * patch comes from the SUBJECT (centered, background removed) rather than a
 * blind center crop that might land on the backdrop. Runs the VLM classifier
 * with a feature-based fallback, then applies the confidence guard.
 */
async function classifyMaterial(client: LlmClient, referencePng: Uint8Array): Promise<MaterialChoice> {
  const canon = canonicalizeReference(decodePNG(referencePng));
  const img = canon.raster;
  // The subject now fills ~90% of a centered square; sample its middle third,
  // which is reliably on the subject's surface (background already keyed out).
  const cw = Math.max(1, Math.floor(img.width / 3));
  const chh = Math.max(1, Math.floor(img.height / 3));
  const patch = crop(img, Math.floor(img.width / 2 - cw / 2), Math.floor(img.height / 2 - chh / 2), cw, chh);
  const hint = classifyByFeatures(patch);
  const patchPng = encodePNG(patch.width, patch.height, 4, patch.data);
  try {
    const vlm = await classifyByVlm(client, bytesToBase64(patchPng), hint);
    // Prefer whichever is more confident; guard the result.
    const best = vlm.confidence >= hint.confidence ? vlm : hint;
    return resolveWithGuard(best);
  } catch {
    return resolveWithGuard(hint);
  }
}

/** Generate a shape-matching procedural model + material from a photo. */
export async function imageToModel(opts: ImageToModelOptions): Promise<ImageToModelResult> {
  // Canonicalize once up front to derive an apparent-viewpoint hint. This is a
  // calibration cue: it tells the model which way the photo's camera looks, so
  // it can build a shape that reads correctly from that angle.
  const canon = canonicalizeReference(decodePNG(opts.referencePng));
  const vpHint = `Reference appears as: ${formatViewpoint(canon.viewpoint)}; subject aspect ${canon.aspect.toFixed(2)} (w/h).`;
  const combinedHint = opts.hint ? `${opts.hint}. ${vpHint}` : vpHint;

  const loopOpts: Parameters<typeof runImageLoop>[0] = {
    client: opts.client,
    referencePng: opts.referencePng,
    render: opts.render,
    hint: combinedHint,
    onStep: (s) => {
      const info: { iteration: number; ok: boolean; score?: ScoreBreakdown } = { iteration: s.iteration, ok: s.run.ok };
      if (s.score) info.score = s.score;
      opts.onStep?.(info);
    },
  };
  if (opts.iterations !== undefined) loopOpts.maxIterations = opts.iterations;
  if (opts.reconstructionContract !== undefined) loopOpts.reconstructionContract = opts.reconstructionContract;
  if (opts.targetScore !== undefined) loopOpts.targetScore = opts.targetScore;
  if (opts.scoreOptions !== undefined) loopOpts.scoreOptions = opts.scoreOptions;
  if (opts.evaluationOptions !== undefined) loopOpts.evaluationOptions = opts.evaluationOptions;
  if (opts.candidateGate !== undefined) loopOpts.candidateGate = opts.candidateGate;
  if (opts.solidityPenalty !== undefined) loopOpts.solidityPenalty = opts.solidityPenalty;

  const shape = await runImageLoop(loopOpts);

  let material: MaterialChoice | null = null;
  if (opts.classifyMaterial !== false) {
    material = await classifyMaterial(opts.client, opts.referencePng);
  }

  const best = shape.best;
  const result: ImageToModelResult = {
    success: shape.success,
    script: best?.script ?? "",
    parts: best?.run.parts ?? [],
    score: best?.score ?? null,
    material,
    iterations: shape.steps.length,
  };
  if (shape.passState) result.passState = shape.passState;
  if (shape.reviewLedger) result.reviewLedger = shape.reviewLedger;
  return result;
}
