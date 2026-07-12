/**
 * Image -> procedural garment (M6 closed loop, public entry point).
 *
 * Ties the M6 pieces into one end-to-end function, mirroring the project's
 * image-target策略 (shape first, material by coarse category, never pixel-match):
 *
 *   reference photo
 *     -> classifyGarment (VLM picks template + fabric + feature tags)
 *        [offline fallback: parseGarmentHint keyword parser]
 *     -> classificationToSpec (seed continuous params from tags)
 *     -> optimizeGarment (deterministic hill-climb on ease/length/flare,
 *        scored by silhouette IoU from a render callback)
 *     -> best GarmentSpec + rendered parts
 *
 * The template choice stays discrete (the optimizer can't wander into a
 * different garment); only continuous knobs are fit. Nothing from the photo is
 * baked into geometry — output is a reproducible spec + procedural parts.
 */
import type { LlmClient } from "../agent/llm.js";
import type { NamedPart } from "../geometry/export.js";
import {
  classifyGarment,
  parseGarmentHint,
  classificationToSpec,
  optimizeGarment,
  buildSpec,
  type GarmentSpec,
  type GarmentClassification,
} from "../clothing/garment-agent.js";
import {
  makeReferenceTarget,
  evaluateReferencePng,
  base64ToBytes,
  bytesToBase64,
  type ScoreBreakdown,
  type TargetOptions,
} from "../vision/index.js";

/** A render of garment parts -> screenshot PNG (base64, no data: prefix). */
export interface GarmentRenderResult {
  imageBase64: string;
  notes?: string;
}

export interface ImageToGarmentOptions {
  /** VLM client for classification. If omitted, the keyword parser is used. */
  client?: LlmClient;
  /** Reference photo as PNG bytes. */
  referencePng: Uint8Array;
  /** Optional text hint, e.g. "牛仔A字裙". Drives the offline parser + VLM. */
  hint?: string;
  /** Body measures override (passed to every build). */
  measures?: Record<string, number>;
  /** Coordinate-descent rounds for param fitting. Default 4. */
  rounds?: number;
  /** Stop fitting once silhouette score reaches this. Default 0.95. */
  targetScore?: number;
  scoreOptions?: TargetOptions;
  /** Renderer MUST return a screenshot; silhouette scoring depends on it. */
  render: (parts: NamedPart[], spec: GarmentSpec, evalIndex: number) => Promise<GarmentRenderResult>;
  onStep?: (info: { evalIndex: number; key?: string; spec: GarmentSpec; score: number }) => void;
}

export interface ImageToGarmentResult {
  success: boolean;
  /** Best-fitting garment spec (template + fabric + continuous params). */
  spec: GarmentSpec;
  /** Parts built from the best spec. */
  parts: NamedPart[];
  /** Best silhouette score achieved. */
  score: ScoreBreakdown | null;
  /** How the template/fabric was chosen. */
  classification: GarmentClassification;
  /** Number of render evaluations performed. */
  evaluations: number;
}

/**
 * Classify the garment: try the VLM if a client is given, else fall back to the
 * offline keyword parser. Always returns a usable classification.
 */
async function classify(opts: ImageToGarmentOptions): Promise<GarmentClassification> {
  if (opts.client) {
    try {
      return await classifyGarment(opts.client, bytesToBase64(opts.referencePng), opts.hint);
    } catch {
      /* fall through to offline parser */
    }
  }
  const spec = parseGarmentHint(opts.hint ?? "");
  return { template: spec.template, fabric: spec.fabric, features: [], confidence: 0.4 };
}

/** Run the full image -> garment closed loop. */
export async function imageToGarment(opts: ImageToGarmentOptions): Promise<ImageToGarmentResult> {
  const target = makeReferenceTarget(opts.referencePng, opts.scoreOptions);
  const classification = await classify(opts);
  const start: GarmentSpec = classificationToSpec(classification);

  let evalIndex = 0;
  let bestScore: ScoreBreakdown | null = null;

  const evaluate = async (spec: GarmentSpec): Promise<number> => {
    const parts = buildSpec(spec, opts.measures ?? {});
    const r = await opts.render(parts, spec, evalIndex);
    const breakdown = evaluateReferencePng(target, base64ToBytes(r.imageBase64));
    opts.onStep?.({ evalIndex, spec, score: breakdown.score });
    if (!bestScore || breakdown.score > bestScore.score) bestScore = breakdown;
    evalIndex++;
    return breakdown.score;
  };

  const opt = await optimizeGarment(start, {
    evaluate,
    rounds: opts.rounds ?? 4,
    targetScore: opts.targetScore ?? 0.95,
  });

  const parts = buildSpec(opt.spec, opts.measures ?? {});
  return {
    success: bestScore !== null,
    spec: opt.spec,
    parts,
    score: bestScore,
    classification,
    evaluations: opt.evaluations,
  };
}
