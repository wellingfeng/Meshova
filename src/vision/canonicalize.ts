/**
 * Reference-image canonicalization (P7+) — the "calibration" step every high
 * quality image->3D pipeline runs before scoring or reconstruction.
 *
 * A raw photo and the viewer's render disagree on framing, scale, and where the
 * subject sits. If we score them directly, silhouette IoU partly measures
 * "where is the object in frame" instead of "is the shape right". The fix is to
 * put BOTH into a canonical frame first: key out the background, crop to the
 * subject's bounding box, recenter it, and scale it to fill a fixed square.
 * Then IoU measures shape alone.
 *
 * We also estimate a coarse APPARENT viewpoint (which way the subject faces /
 * how high the camera sits) from silhouette geometry. It's a rough hint for the
 * VLM and for choosing a render camera that roughly matches the photo — not a
 * precise pose solve. Nothing here is baked into geometry.
 */
import { makeRaster, getPixel, type Raster } from "./raster.js";
import { maskFromPhoto, maskBounds, type Mask } from "./silhouette.js";

export interface CanonicalImage {
  /** The recentered, unit-scaled image on a neutral square canvas. */
  raster: Raster;
  /** Foreground mask of the canonical image (subject = 1). */
  mask: Mask;
  /** Subject bbox in the ORIGINAL image (px), for traceability. */
  sourceBounds: { x0: number; y0: number; x1: number; y1: number };
  /** Subject aspect ratio (w/h) in the original — a shape prior for the VLM. */
  aspect: number;
  /** Coarse apparent viewpoint estimate. */
  viewpoint: ViewpointHint;
}

export interface ViewpointHint {
  /**
   * Apparent camera elevation, degrees. 0 = eye level (we see the side), +
   * looking down (we see more of the top), - looking up. Estimated from how
   * "top-heavy" the silhouette is, so it's coarse: a sign + small/medium/large.
   */
  elevationDeg: number;
  /**
   * Horizontal facing bias, -1..1. <0 = subject's mass leans left, >0 right,
   * ~0 = symmetric (likely a front/back or pure side view). From silhouette
   * left/right asymmetry.
   */
  facing: number;
  /** True if the silhouette is near-symmetric L/R (canonical front/side/back). */
  symmetric: boolean;
}

export interface CanonicalizeOptions {
  /** Output canvas size (square). Default 256. */
  size?: number;
  /** Fraction of the canvas the subject's longest side fills. Default 0.9. */
  fill?: number;
  /** Background fill RGB for the canonical canvas. Default viewer dark bg. */
  bg?: [number, number, number];
}

/**
 * Estimate a coarse apparent viewpoint from a subject mask. All signals come
 * from silhouette geometry — no depth, no learning — so treat them as hints.
 *
 * elevation: a higher camera reveals more of the top, making the silhouette
 *   top-heavy (more foreground area above the centroid than below). We map the
 *   vertical mass imbalance to a small degree range.
 * facing/symmetry: left/right mass imbalance. Near-zero => the view is
 *   front/back/side (symmetric); a clear bias => a 3/4 view leaning that way.
 */
export function estimateViewpoint(mask: Mask): ViewpointHint {
  const b = maskBounds(mask);
  if (b.area === 0) return { elevationDeg: 0, facing: 0, symmetric: true };
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      if (y < cy) top++; else bottom++;
      if (x < cx) left++; else right++;
    }
  }
  const total = top + bottom || 1;
  // Vertical imbalance in -1..1 (top-heavy positive). Camera looking DOWN makes
  // the top read larger, so positive imbalance => positive elevation.
  const vImb = (top - bottom) / total;
  const elevationDeg = clamp(vImb * 60, -45, 45);
  const hTotal = left + right || 1;
  const facing = clamp((right - left) / hTotal, -1, 1);
  const symmetric = Math.abs(facing) < 0.08;
  return { elevationDeg, facing, symmetric };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Canonicalize a reference photo: key out the background, crop to the subject,
 * recenter, and unit-scale onto a fixed square canvas. The returned raster is
 * what scoring and material sampling should use instead of the raw photo, so
 * framing/scale differences stop polluting the shape signal.
 */
export function canonicalizeReference(photo: Raster, options?: CanonicalizeOptions): CanonicalImage {
  const size = Math.max(8, options?.size ?? 256);
  const fill = clamp(options?.fill ?? 0.9, 0.1, 1);
  const bg = options?.bg ?? [13, 17, 23];

  const fg = maskFromPhoto(photo);
  const b = maskBounds(fg);
  const out = makeRaster(size, size);
  const outMask: Mask = { width: size, height: size, data: new Uint8Array(size * size) };
  // Paint the neutral background first.
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    out.data[o] = bg[0]; out.data[o + 1] = bg[1]; out.data[o + 2] = bg[2]; out.data[o + 3] = 255;
  }
  if (b.area === 0) {
    return {
      raster: out,
      mask: outMask,
      sourceBounds: { x0: 0, y0: 0, x1: photo.width - 1, y1: photo.height - 1 },
      aspect: 1,
      viewpoint: { elevationDeg: 0, facing: 0, symmetric: true },
    };
  }

  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const target = size * fill;
  const scale = target / Math.max(bw, bh); // uniform: preserve subject aspect
  const srcCx = (b.x0 + b.x1) / 2;
  const srcCy = (b.y0 + b.y1) / 2;
  const cc = size / 2;
  // For each canonical pixel, sample back into the source (inverse map). Only
  // copy where the source is foreground, so the backdrop is fully replaced by
  // our neutral bg — same keying the render already gets.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.round((x - cc) / scale + srcCx);
      const sy = Math.round((y - cc) / scale + srcCy);
      if (sx < 0 || sx >= photo.width || sy < 0 || sy >= photo.height) continue;
      if (!fg.data[sy * photo.width + sx]) continue;
      const [r, g, bl] = getPixel(photo, sx, sy);
      const o = (y * size + x) * 4;
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = bl; out.data[o + 3] = 255;
      outMask.data[y * size + x] = 1;
    }
  }

  return {
    raster: out,
    mask: outMask,
    sourceBounds: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
    aspect: bw / bh,
    viewpoint: estimateViewpoint(fg),
  };
}

/** One-line summary of a viewpoint hint for prompts/logs. */
export function formatViewpoint(v: ViewpointHint): string {
  const el = v.elevationDeg >= 0 ? `down ${v.elevationDeg.toFixed(0)}deg` : `up ${(-v.elevationDeg).toFixed(0)}deg`;
  const face = v.symmetric ? "symmetric (front/side/back)" : v.facing > 0 ? "3/4 facing right" : "3/4 facing left";
  return `camera ~${el}, ${face}`;
}