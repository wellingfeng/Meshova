/**
 * Single-reference multi-view "solidity" check (P7+).
 *
 * The user gives ONE photo, so we have no per-view reference to score against
 * from the side or top. But we can still exploit extra rendered views to catch
 * the classic failure the gaussian-splat pipelines guard against with true
 * multi-view consistency: a FLAT shape (billboard / paper-thin slab) that
 * matches the reference head-on but collapses to a sliver from the side.
 *
 * The signal is geometric, reference-free: render the SAME model from a few
 * extra angles, take each silhouette's foreground footprint (normalized by
 * frame), and measure how much it collapses across views. A genuinely 3D form
 * keeps a comparable footprint from most angles; a billboard's footprint
 * craters when seen edge-on. We turn that collapse into a 0..1 "solidity" score
 * plus a penalty the loop folds into the shape score and surfaces as feedback.
 *
 * This is NOT a pose/shape match — it only rewards "the object has real volume
 * from every angle", which directly serves the shape-consistency priority.
 */
import { decodePNG } from "./png.js";
import { resizeNearest, type Raster } from "./raster.js";
import { maskFromBackground, maskBounds, type Mask } from "./silhouette.js";

export interface SolidityOptions {
  /** Comparison grid; each view is resized to this square. Default 96. */
  gridSize?: number;
  /** Viewer clear color for keying the renders. Default [13,17,23]. */
  renderBg?: [number, number, number];
  /**
   * How hard a collapsed footprint is punished, >=0. Used by applySolidity.
   * Default 0.5.
   */
  penalty?: number;
}

export interface SolidityBreakdown {
  /** 0..1, 1 = footprint holds up from every angle, 0 = fully collapses. */
  solidity: number;
  /** Per-view normalized foreground footprint. */
  areas: number[];
  /** Smallest / largest footprint ratio — the core collapse measure. */
  minOverMax: number;
}

function footprint(mask: Mask): number {
  // Geometric mean of bbox-fill and actual filled fraction, normalized by the
  // frame: robust to thin protrusions, sensitive to the whole footprint
  // shrinking to a sliver (the billboard edge-on case).
  const b = maskBounds(mask);
  if (b.area === 0) return 0;
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const frame = mask.width * mask.height;
  const bboxFrac = (w * h) / frame;
  const fillFrac = b.area / frame;
  return Math.sqrt(bboxFrac * fillFrac);
}

/**
 * Compute solidity from several renders of the SAME model at different angles
 * (order/identity of views doesn't matter; pass whatever extra angles you
 * captured, e.g. side + top + a 45deg orbit). Needs >=2 views to mean anything;
 * with fewer it returns solidity 1 (no evidence of collapse).
 */
export function scoreSolidity(renders: Array<Raster | Uint8Array>, options?: SolidityOptions): SolidityBreakdown {
  const g = options?.gridSize ?? 96;
  const bg = options?.renderBg ?? [13, 17, 23];
  if (renders.length < 2) return { solidity: 1, areas: [], minOverMax: 1 };

  const areas = renders.map((r) => {
    const raster = r instanceof Uint8Array ? decodePNG(r) : r;
    const small = resizeNearest(raster, g, g);
    return footprint(maskFromBackground(small, bg));
  });
  let min = Infinity, max = 0;
  for (const a of areas) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  // Invisible from every angle is an empty-render failure, not a billboard;
  // don't reward or punish solidity in that case.
  if (max <= 1e-6) return { solidity: 1, areas, minOverMax: 1 };
  const minOverMax = min / max;
  // minOverMax near 1 => footprint consistent => solid; near 0 => a view
  // collapsed => flat. It's already 0..1, so use it directly as solidity.
  return { solidity: minOverMax, areas, minOverMax };
}

/**
 * Fold a solidity score into a base shape score (0..1). A solid object is left
 * essentially untouched; a flat one is dragged down in proportion to how much
 * its footprint collapsed and the configured penalty weight.
 */
export function applySolidity(baseScore: number, solidity: number, penalty = 0.5): number {
  const p = Math.max(0, penalty);
  const s = Math.max(0, Math.min(1, solidity));
  const factor = Math.max(0, 1 - p * (1 - s));
  return baseScore * factor;
}

/** Compact one-line summary for feedback / logs. */
export function formatSolidity(b: SolidityBreakdown): string {
  const areas = b.areas.map((a) => a.toFixed(3)).join(",");
  return `solidity=${b.solidity.toFixed(3)} (areas=[${areas}], min/max=${b.minOverMax.toFixed(3)})`;
}
