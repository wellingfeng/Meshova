/**
 * Deterministic, render-free turntable shape signature (P7+ / CI baseline).
 *
 * The headless screenshot loop is great for the AI iteration, but it needs a
 * browser + GPU and isn't a good CI gate. For regression testing we want a
 * fast, deterministic "is the shape still the shape" check that runs in plain
 * Node. So we CPU-rasterize each model's SILHOUETTE from several turntable
 * azimuths by orthographic-projecting its vertices, and summarize each view's
 * footprint. The resulting vector is a stable fingerprint: if a geometry change
 * shifts proportions or collapses a form, the signature moves and the test
 * fails. No pixels, no GPU, fully deterministic.
 *
 * It is intentionally coarse (footprint fractions, not exact pixels): it should
 * catch real shape regressions, not flag sub-pixel jitter.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";

export interface TurntableOptions {
  /** Number of evenly spaced azimuths around +Y. Default 8. */
  views?: number;
  /** Raster grid for the footprint projection (square). Default 64. */
  gridSize?: number;
  /** Camera elevation in radians (look-down positive). Default ~0.2. */
  elevation?: number;
}

export interface TurntableSignature {
  views: number;
  gridSize: number;
  /** Per-view footprint fraction (filled cells / grid), 0..1. */
  footprints: number[];
  /** Per-view aspect ratio (bbox width/height in screen space). */
  aspects: number[];
  /** min/max footprint ratio — the same solidity collapse measure, offline. */
  solidity: number;
}

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

/**
 * Project the mesh vertices to a view and rasterize a coarse filled silhouette
 * by splatting triangles' bounding boxes... actually splat each triangle as a
 * filled triangle into the grid for a faithful footprint.
 */
function viewFootprint(meshes: Mesh[], azimuth: number, elevation: number, grid: number): { fill: number; aspect: number } {
  // Collect projected screen points (orthographic: drop depth after rotate).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const pts: Array<{ x: number; y: number }> = [];
  const tris: number[] = [];
  let base = 0;
  for (const m of meshes) {
    for (const p of m.positions) {
      const r = rotateX(rotateY(p, azimuth), elevation);
      pts.push({ x: r.x, y: r.y });
      if (r.x < minX) minX = r.x;
      if (r.x > maxX) maxX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.y > maxY) maxY = r.y;
    }
    for (const idx of m.indices) tris.push(base + idx);
    base += m.positions.length;
  }
  if (pts.length === 0 || !isFinite(minX)) return { fill: 0, aspect: 1 };
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  // Uniform fit so aspect is preserved; center in the grid with a small margin.
  const margin = 0.08;
  const usable = grid * (1 - 2 * margin);
  const scale = usable / Math.max(spanX, spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = grid / 2;
  const sx = (x: number) => half + (x - cx) * scale;
  const sy = (y: number) => half - (y - cy) * scale; // flip Y for image space
  const cell = new Uint8Array(grid * grid);
  const plot = (x: number, y: number) => {
    const ix = x | 0, iy = y | 0;
    if (ix >= 0 && ix < grid && iy >= 0 && iy < grid) cell[iy * grid + ix] = 1;
  };
  // Rasterize each triangle (scanline-free: bbox + edge sign test, coarse grid).
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = pts[tris[t]!]!, b = pts[tris[t + 1]!]!, c = pts[tris[t + 2]!]!;
    const ax = sx(a.x), ay = sy(a.y), bx = sx(b.x), by = sy(b.y), cx2 = sx(c.x), cy2 = sy(c.y);
    const tminx = Math.max(0, Math.floor(Math.min(ax, bx, cx2)));
    const maxx = Math.min(grid - 1, Math.ceil(Math.max(ax, bx, cx2)));
    const tminy = Math.max(0, Math.floor(Math.min(ay, by, cy2)));
    const maxy = Math.min(grid - 1, Math.ceil(Math.max(ay, by, cy2)));
    const area = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
    if (Math.abs(area) < 1e-9) {
      // Degenerate on screen: just plot its vertices so thin parts still mark.
      plot(ax, ay); plot(bx, by); plot(cx2, cy2);
      continue;
    }
    const inv = 1 / area;
    for (let py = tminy; py <= maxy; py++) {
      for (let px = tminx; px <= maxx; px++) {
        const x = px + 0.5, y = py + 0.5;
        const w0 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * inv;
        const w1 = ((cx2 - bx) * (y - by) - (cy2 - by) * (x - bx)) * inv;
        const w2 = ((ax - cx2) * (y - cy2) - (ay - cy2) * (x - cx2)) * inv;
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
          cell[py * grid + px] = 1;
        }
      }
    }
  }
  let fill = 0;
  for (let i = 0; i < cell.length; i++) fill += cell[i]!;
  const aspect = (spanX * scale) / (spanY * scale || 1e-6);
  return { fill: fill / (grid * grid), aspect };
}

/**
 * Compute a turntable shape signature for a set of part meshes. Deterministic
 * given the same geometry. Use it as a CI regression fingerprint.
 */
export function turntableSignature(meshes: Mesh[], options?: TurntableOptions): TurntableSignature {
  const views = Math.max(1, options?.views ?? 8);
  const grid = Math.max(8, options?.gridSize ?? 64);
  const elevation = options?.elevation ?? 0.2;
  const footprints: number[] = [];
  const aspects: number[] = [];
  for (let i = 0; i < views; i++) {
    const az = (i * 2 * Math.PI) / views;
    const { fill, aspect } = viewFootprint(meshes, az, elevation, grid);
    footprints.push(+fill.toFixed(4));
    aspects.push(+aspect.toFixed(4));
  }
  let min = Infinity, max = 0;
  for (const f of footprints) {
    if (f < min) min = f;
    if (f > max) max = f;
  }
  const solidity = max <= 1e-6 ? 1 : +(min / max).toFixed(4);
  return { views, gridSize: grid, footprints, aspects, solidity };
}

/**
 * Compare two signatures. Returns the max absolute per-view footprint delta and
 * whether it stays within tolerance — the assertion a CI baseline test makes.
 */
export function compareSignatures(a: TurntableSignature, b: TurntableSignature, tolerance = 0.02): { maxDelta: number; withinTolerance: boolean } {
  if (a.footprints.length !== b.footprints.length) return { maxDelta: 1, withinTolerance: false };
  let maxDelta = 0;
  for (let i = 0; i < a.footprints.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(a.footprints[i]! - b.footprints[i]!));
  }
  return { maxDelta, withinTolerance: maxDelta <= tolerance };
}
