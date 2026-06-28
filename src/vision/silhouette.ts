/**
 * Silhouette extraction + overlap scoring (P7) — the primary shape-matching
 * signal. Shape consistency is the top priority for image-targeted modeling,
 * so the loop optimizes how well the rendered object's outline covers the
 * reference object's outline. Color/material are scored separately.
 *
 * A silhouette is a boolean foreground mask. We derive it two ways:
 *  - From a render on a known flat background (chroma/luma key).
 *  - From a reference photo via a background estimate (corner-color key),
 *    which is coarse but adequate for the "good enough" bar we set.
 */
import type { Raster } from "./raster.js";

export interface Mask {
  readonly width: number;
  readonly height: number;
  /** 1 = foreground, 0 = background. */
  readonly data: Uint8Array;
}

function makeMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

/**
 * Foreground mask from a render with a known background color (the viewer's
 * clear color). A pixel is foreground if it differs from the background beyond
 * a tolerance. This is robust because we control the render background.
 */
export function maskFromBackground(
  img: Raster,
  bg: [number, number, number] = [13, 17, 23],
  tol = 24,
): Mask {
  const m = makeMask(img.width, img.height);
  const t2 = tol * tol * 3;
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    const dr = img.data[i]! - bg[0];
    const dg = img.data[i + 1]! - bg[1];
    const db = img.data[i + 2]! - bg[2];
    const a = img.data[i + 3]!;
    m.data[p] = a > 16 && dr * dr + dg * dg + db * db > t2 ? 1 : 0;
  }
  return m;
}

/**
 * Foreground mask from a reference photo. Real photos rarely have a single
 * flat backdrop (this project's test image is a colored glass on a gray
 * gradient floor+wall), so plain color keying against a border average fails —
 * a bright wall reads as "foreground". Instead we exploit a property that
 * holds for most product/reference shots: the SUBJECT is chromatic while the
 * set (floor, wall, shadow) is near-neutral gray. So we key on saturation when
 * a chromatic subject is present, and fall back to border color-distance only
 * when the scene is essentially neutral (e.g. a gray object on white). Then we
 * keep the largest connected blob to drop shadows and grid speckles.
 */
export function maskFromPhoto(img: Raster, tol = 44): Mask {
  const { width: w, height: h } = img;

  // Per-pixel saturation = (max-min)/max (0 for gray, higher for colorful).
  const sat = (i: number): number => {
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };

  // Background estimate from the border ring (robust to gradients): mean color
  // and mean saturation of the outer pixels.
  let br = 0;
  let bgc = 0;
  let bb = 0;
  let bsat = 0;
  let count = 0;
  const sampleBorder = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    br += img.data[i]!;
    bgc += img.data[i + 1]!;
    bb += img.data[i + 2]!;
    bsat += sat(i);
    count++;
  };
  for (let x = 0; x < w; x++) {
    sampleBorder(x, 0);
    sampleBorder(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    sampleBorder(0, y);
    sampleBorder(w - 1, y);
  }
  const bg: [number, number, number] = [br / count, bgc / count, bb / count];
  const bgSat = bsat / count;

  // Decide if a chromatic subject exists: enough pixels notably more saturated
  // than the background.
  const satMargin = 0.14;
  const satThresh = bgSat + satMargin;
  let chromaticPx = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (sat(i) > satThresh) chromaticPx++;
  }
  const chromaticFrac = chromaticPx / (w * h);
  const useSaturation = chromaticFrac > 0.015;

  const raw = makeMask(w, h);
  if (useSaturation) {
    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
      raw.data[p] = sat(i) > satThresh ? 1 : 0;
    }
  } else {
    const t2 = tol * tol * 3;
    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
      const dr = img.data[i]! - bg[0];
      const dg = img.data[i + 1]! - bg[1];
      const db = img.data[i + 2]! - bg[2];
      raw.data[p] = dr * dr + dg * dg + db * db > t2 ? 1 : 0;
    }
  }
  return largestComponent(raw);
}

/**
 * Keep only the largest 4-connected foreground blob. Cast shadows and grid
 * lines key as small disconnected regions; the subject is the biggest one.
 * Iterative flood fill (explicit stack) so big images don't blow the call
 * stack.
 */
function largestComponent(m: Mask): Mask {
  const { width: w, height: h } = m;
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let bestId = -1;
  let bestSize = 0;
  let curId = 0;
  for (let start = 0; start < w * h; start++) {
    if (m.data[start] !== 1 || label[start] !== -1) continue;
    let size = 0;
    stack.push(start);
    label[start] = curId;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      const neigh = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const q of neigh) {
        if (q >= 0 && m.data[q] === 1 && label[q] === -1) {
          label[q] = curId;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = curId;
    }
    curId++;
  }
  if (bestId < 0) return m;
  const out = makeMask(w, h);
  for (let i = 0; i < label.length; i++) out.data[i] = label[i] === bestId ? 1 : 0;
  return out;
}

/** Intersection-over-union of two equally-sized masks (0..1). */
export function maskIoU(a: Mask, b: Mask): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("maskIoU: size mismatch — resize first");
  }
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    const av = a.data[i]!;
    const bv = b.data[i]!;
    if (av | bv) {
      union++;
      if (av & bv) inter++;
    }
  }
  return union === 0 ? 1 : inter / union;
}

/** Tight bounding box of the foreground (for centering / scale comparison). */
export function maskBounds(m: Mask): { x0: number; y0: number; x1: number; y1: number; area: number } {
  let x0 = m.width;
  let y0 = m.height;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (m.data[y * m.width + x]) {
        area++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, area };
}

/**
 * Normalize a mask: translate+scale the foreground so its bounding box fills a
 * standard frame. Comparing normalized masks scores *shape* independent of
 * where the object sits or how big it is in frame, which matters when the
 * render camera and the photo framing differ. Returns a new mask of the same
 * size with the foreground re-centered to fill ~90% of the frame.
 */
export function normalizeMask(m: Mask): Mask {
  const b = maskBounds(m);
  if (b.area === 0) return m;
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const target = Math.min(m.width, m.height) * 0.9;
  const scale = target / Math.max(bw, bh);
  const out = makeMask(m.width, m.height);
  const cx = m.width / 2;
  const cy = m.height / 2;
  const srcCx = (b.x0 + b.x1) / 2;
  const srcCy = (b.y0 + b.y1) / 2;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const sx = Math.round((x - cx) / scale + srcCx);
      const sy = Math.round((y - cy) / scale + srcCy);
      if (sx >= 0 && sx < m.width && sy >= 0 && sy < m.height && m.data[sy * m.width + sx]) {
        out.data[y * m.width + x] = 1;
      }
    }
  }
  return out;
}

