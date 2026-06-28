/**
 * Image-target scoring (P7) — combine the per-aspect metrics into one number
 * the optimizer maximizes. Shape is weighted highest by design: the project's
 * stated priority is silhouette/shape consistency, with color a secondary
 * nudge and material handled separately (category classification, not pixels).
 */
import { decodePNG } from "./png.js";
import { resizeNearest, type Raster } from "./raster.js";
import {
  maskFromBackground,
  maskFromPhoto,
  maskIoU,
  normalizeMask,
} from "./silhouette.js";
import { meanColor, hueHistogram, hueSimilarity } from "./color.js";

export interface ScoreWeights {
  /** Silhouette overlap weight (shape). Default dominant. */
  silhouette: number;
  /** Color histogram similarity weight. Secondary. */
  color: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = { silhouette: 0.8, color: 0.2 };

export interface ScoreBreakdown {
  /** Weighted total, 0..1 (higher = closer to the reference). */
  score: number;
  silhouetteIoU: number;
  colorSimilarity: number;
}

export interface TargetOptions {
  /** Comparison grid size; both images are resized to this square. */
  gridSize?: number;
  /** Render background color (the viewer clear color) for keying. */
  renderBg?: [number, number, number];
  /** Normalize silhouettes (recenter+rescale) before IoU. Default true. */
  normalize?: boolean;
  weights?: ScoreWeights;
}

/**
 * A precomputed reference target: decode once, derive its mask and histogram,
 * then score many candidate renders against it cheaply. This is what the
 * optimizer holds onto across iterations.
 */
export interface ReferenceTarget {
  readonly raster: Raster;
  readonly maskNorm: import("./silhouette.js").Mask;
  /** Mean foreground RGB (0..255) — robust color anchor across lighting. */
  readonly meanRgb: [number, number, number];
  /**
   * Saturation-weighted hue histogram over the foreground — the color signal
   * actually scored. Lighting-robust ("delight by construction"): it compares
   * material hue, not absolute brightness, so the render isn't penalized for
   * highlights/shadows the photo lacks.
   */
  readonly hueHist: Float32Array;
  readonly opts: Required<TargetOptions>;
}

function fill(opts: TargetOptions | undefined): Required<TargetOptions> {
  return {
    gridSize: opts?.gridSize ?? 128,
    renderBg: opts?.renderBg ?? [13, 17, 23],
    normalize: opts?.normalize ?? true,
    weights: opts?.weights ?? DEFAULT_WEIGHTS,
  };
}

/** Build a reference target from a PNG byte buffer (the user's photo). */
export function makeReferenceTarget(pngBytes: Uint8Array, options?: TargetOptions): ReferenceTarget {
  const opts = fill(options);
  const raster = resizeNearest(decodePNG(pngBytes), opts.gridSize, opts.gridSize);
  const fg = maskFromPhoto(raster);
  const maskNorm = opts.normalize ? normalizeMask(fg) : fg;
  return {
    raster,
    maskNorm,
    // Color anchored on the foreground mean only, so the backdrop (which
    // differs between a photo and the viewer's clear color) doesn't pollute
    // the match, and so 3D shading variance doesn't shatter the signal the way
    // a fine histogram would.
    meanRgb: meanColor(raster, fg),
    // Hue histogram is what the score uses: chroma-weighted so shading (which
    // lives in brightness, not hue) is ignored — a built-in delighting step.
    hueHist: hueHistogram(raster, 12, fg),
    opts,
  };
}

/**
 * Score a rendered screenshot (PNG bytes) against the reference. The render is
 * keyed against the known viewer background, so its silhouette is clean.
 */
export function scoreRenderPng(target: ReferenceTarget, renderPng: Uint8Array): ScoreBreakdown {
  return scoreRenderRaster(target, decodePNG(renderPng));
}

/** Same as scoreRenderPng but takes an already-decoded raster. */
export function scoreRenderRaster(target: ReferenceTarget, render: Raster): ScoreBreakdown {
  const g = target.opts.gridSize;
  const r = resizeNearest(render, g, g);
  const fg = maskFromBackground(r, target.opts.renderBg);
  const maskNorm = target.opts.normalize ? normalizeMask(fg) : fg;

  const silhouetteIoU = maskIoU(target.maskNorm, maskNorm);
  // Color similarity via hue-histogram intersection (lighting-robust). We bin
  // hue weighted by chroma*value, so a render isn't penalized for the highlights
  // and shadows that a flat photo lacks — only the material hue mix is compared.
  const hueH = hueHistogram(r, 12, fg);
  const colorSimilarity = hueSimilarity(target.hueHist, hueH);
  const w = target.opts.weights;
  const denom = w.silhouette + w.color || 1;
  const score = (w.silhouette * silhouetteIoU + w.color * colorSimilarity) / denom;
  return { score, silhouetteIoU, colorSimilarity };
}

/** Format a breakdown as a compact line for agent feedback / logs. */
export function formatScore(b: ScoreBreakdown): string {
  return `score=${b.score.toFixed(3)} (silhouetteIoU=${b.silhouetteIoU.toFixed(3)}, color=${b.colorSimilarity.toFixed(3)})`;
}

