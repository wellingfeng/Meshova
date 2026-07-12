/**
 * Multi-view scoring (P7+) — fuse per-view shape/color scores into one number.
 *
 * A single silhouette is ambiguous: a flat billboard and a real 3D form can
 * share one outline. Scoring the SAME model from several poses (front/side/
 * persp/top) against per-view references collapses that ambiguity, so the
 * optimizer is pushed toward a shape that's right from every angle — directly
 * serving the project's "shape consistency is the top priority" goal.
 *
 * Shape (silhouette IoU) stays dominant; color is a secondary nudge. The fused
 * score is the weighted mean across views, with an optional emphasis on the
 * worst view so the optimizer fixes its weakest angle instead of over-fitting
 * one flattering pose.
 */
import type { ReferenceTarget } from "./loss.js";
import {
  evaluateReferenceRaster,
  type ReferenceEvaluation,
  type ReferenceEvaluationOptions,
} from "./reference-evaluation.js";
import { decodePNG } from "./png.js";
import type { Raster } from "./raster.js";

export interface ViewScore {
  /** View id, e.g. "front" | "side" | "persp" | "top". */
  view: string;
  score: ReferenceEvaluation;
}

export interface MultiViewBreakdown {
  /** Fused total, 0..1 (higher = closer from every angle). */
  score: number;
  /** Mean silhouette IoU across views. */
  silhouetteIoU: number;
  /** Mean color similarity across views. */
  colorSimilarity: number;
  /**
   * Std-dev of silhouette IoU across views (0..~0.5). High = the shape matches
   * from some angles but not others — the classic "flat billboard / collapsed
   * form" failure. Used to penalize inconsistency.
   */
  ioUStdDev: number;
  /** Lowest single-view score (the weakest angle). */
  worstView: ViewScore;
  perView: ViewScore[];
}

export interface MultiViewOptions {
  /** Per-view D0-D3 reference evaluation settings. */
  evaluation?: ReferenceEvaluationOptions;
  /**
   * Blend between mean and worst-view emphasis, 0..1. 0 = pure mean,
   * 1 = pure worst-view. Default 0.35: mostly the average, but a bad angle
   * still drags the total down so the optimizer can't ignore it.
   */
  worstWeight?: number;
  /**
   * How hard to penalize view-to-view IoU inconsistency, >=0. The fused score
   * is multiplied by (1 - consistencyPenalty * ioUStdDev), clamped to 0. A
   * shape that's right from every angle has ~0 std-dev and is untouched; one
   * that only looks right head-on has high std-dev and is dragged down. This is
   * the single-image-ambiguity guard the gaussian-splat pipelines get from
   * multi-view consistency. Default 0.6. Set 0 to disable.
   */
  consistencyPenalty?: number;
}

/** One reference target + one candidate render, paired by view id. */
export interface ViewPair {
  view: string;
  target: ReferenceTarget;
  /** Candidate render for this view, as decoded raster or PNG bytes. */
  render: Raster | Uint8Array;
}

function asRaster(r: Raster | Uint8Array): Raster {
  return r instanceof Uint8Array ? decodePNG(r) : r;
}

/**
 * Score a set of view pairs and fuse them. Each pair scores independently with
 * the existing single-view metric (silhouette-dominant), then we combine.
 */
export function scoreMultiView(pairs: ViewPair[], options?: MultiViewOptions): MultiViewBreakdown {
  if (pairs.length === 0) throw new Error("scoreMultiView: no view pairs");
  const worstWeight = Math.max(0, Math.min(1, options?.worstWeight ?? 0.35));
  const consistencyPenalty = Math.max(0, options?.consistencyPenalty ?? 0.6);

  const perView: ViewScore[] = pairs.map((p) => ({
    view: p.view,
    score: evaluateReferenceRaster(p.target, asRaster(p.render), options?.evaluation),
  }));

  let sumScore = 0, sumIoU = 0, sumColor = 0;
  let worst = perView[0]!;
  for (const v of perView) {
    sumScore += v.score.score;
    sumIoU += v.score.silhouetteIoU;
    sumColor += v.score.colorSimilarity;
    if (v.score.score < worst.score.score) worst = v;
  }
  const n = perView.length;
  const meanScore = sumScore / n;
  const meanIoU = sumIoU / n;

  // IoU std-dev across views: the inconsistency signal. With one view it's 0.
  let varAcc = 0;
  for (const v of perView) {
    const d = v.score.silhouetteIoU - meanIoU;
    varAcc += d * d;
  }
  const ioUStdDev = Math.sqrt(varAcc / n);

  const blended = (1 - worstWeight) * meanScore + worstWeight * worst.score.score;
  // Multiplicative consistency guard: a shape that only matches from one angle
  // has high IoU std-dev and gets pulled down, so the optimizer can't win by
  // over-fitting a single flattering pose.
  const consistency = Math.max(0, 1 - consistencyPenalty * ioUStdDev);
  const fused = blended * consistency;

  return {
    score: fused,
    silhouetteIoU: meanIoU,
    colorSimilarity: sumColor / n,
    ioUStdDev,
    worstView: worst,
    perView,
  };
}

/** Compact one-line summary for agent feedback / logs. */
export function formatMultiView(b: MultiViewBreakdown): string {
  const views = b.perView
    .map((v) => `${v.view}=${v.score.silhouetteIoU.toFixed(2)}`)
    .join(" ");
  return `multiview=${b.score.toFixed(3)} (IoU avg=${b.silhouetteIoU.toFixed(3)}±${b.ioUStdDev.toFixed(3)}, worst=${b.worstView.view}@${b.worstView.score.score.toFixed(3)}; ${views})`;
}
