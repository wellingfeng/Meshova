/**
 * Scatter rule DSL — Meshova's port of the CitySample "SliceAndDice" idea: a
 * layout is a point cloud passed through a chain of small, composable, purely
 * deterministic rules. Each rule takes a PointCloud and returns a new
 * PointCloud, reading/writing the standard instance attributes so the result
 * feeds straight into copyToPoints:
 *
 *   - "variant"  which mesh in the instance library to place (integer)
 *   - "scale"    per-point uniform scale
 *   - "yaw"      per-point Y rotation (radians)
 *   - "mask"     0/1 keep flag (pruneMasked drops the zeros)
 *
 * Rules compose left-to-right via `applyRules(pc, [...])`. Everything is seeded
 * off explicit integer seeds, so the same inputs always give the same dressing
 * (Meshova determinism invariant). Point clouds stay inspectable until
 * copyToPoints realizes them, exactly like Houdini / SliceAndDice.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, dot, normalize, scale, sub, length, vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { makeNoise, fbm3, type FbmOptions } from "../random/noise.js";
import type { Curve } from "./curve.js";
import { resampleCurve } from "./curve.js";
import {
  makePointCloud,
  pointContext,
  evalPointScalar,
  type PointCloud,
  type PointContext,
  type PointScalar,
} from "./point-cloud.js";

/** A scatter rule: pure function from a point cloud to a new point cloud. */
export type ScatterRule = (pc: PointCloud) => PointCloud;

/** Rebuild a cloud with one attribute overwritten (keeps points/normals/others). */
function withAttribute(pc: PointCloud, name: string, values: number[]): PointCloud {
  return makePointCloud({
    points: pc.points,
    normals: pc.normals,
    attributes: { ...pc.attributes, [name]: values },
  });
}

/** Run a point cloud through an ordered list of rules. */
export function applyRules(pc: PointCloud, rules: ReadonlyArray<ScatterRule>): PointCloud {
  let cur = pc;
  for (const rule of rules) cur = rule(cur);
  return cur;
}

// ---------------------------------------------------------------------------
// Generators — produce the initial layout point cloud.
// ---------------------------------------------------------------------------

export interface AlongCurveOptions {
  /** Slot spacing along the curve (metres). */
  spacing?: number;
  /** Lateral offset from the curve, along its right vector (+/- for each side). */
  offset?: number;
  /** Emit points on both sides of the curve (mirrored offset). */
  bothSides?: boolean;
  /** Skip the first/last slot fraction so props don't sit on the endpoints. */
  endPadding?: number;
}

/**
 * Lay a regular row of points along a curve (a sidewalk edge, a fence line, a
 * planting strip). Stores per-point "along" (0..1 arc param), "side" (+1/-1),
 * and a "yaw" facing the curve's travel direction. This is the layout stage of
 * SliceAndDice: raw slots that later rules decorate.
 */
export function scatterAlongCurve(curve: Curve, opts: AlongCurveOptions = {}): PointCloud {
  const spacing = Math.max(0.05, opts.spacing ?? 3);
  const offset = opts.offset ?? 0;
  const bothSides = opts.bothSides ?? false;
  const pad = opts.endPadding ?? 0.5;
  const dense = resampleCurve(curve, { segmentLength: Math.min(spacing, 1) });
  const pts = dense.points;
  if (pts.length < 2) return makePointCloud({ points: [] });

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + length(sub(pts[i]!, pts[i - 1]!)));
  const total = cum[cum.length - 1]!;

  const at = (d: number): { pos: Vec3; tan: Vec3 } => {
    const dc = Math.max(0, Math.min(total, d));
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! <= dc) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi]! - cum[lo]!;
    const t = seg > 1e-9 ? (dc - cum[lo]!) / seg : 0;
    const pos = add(pts[lo]!, scale(sub(pts[hi]!, pts[lo]!), t));
    const rawTan = sub(pts[hi]!, pts[lo]!);
    const flat = vec3(rawTan.x, 0, rawTan.z);
    const l = length(flat);
    const tan = l > 1e-9 ? scale(flat, 1 / l) : vec3(1, 0, 0);
    return { pos, tan };
  };

  const points: Vec3[] = [];
  const normals: Vec3[] = [];
  const along: number[] = [];
  const side: number[] = [];
  const yaw: number[] = [];
  const sides = bothSides ? [1, -1] : [1];
  const startD = pad * spacing;
  for (let d = startD; d <= total - startD + 1e-6; d += spacing) {
    const { pos, tan } = at(d);
    // right vector on the ground = tan x up
    const right = vec3(tan.z, 0, -tan.x);
    for (const sgn of sides) {
      const p = add(pos, scale(right, sgn * offset));
      points.push(vec3(p.x, p.y, p.z));
      normals.push(vec3(0, 1, 0));
      along.push(total > 0 ? d / total : 0);
      side.push(sgn);
      // face toward the curve: +side faces -right, -side faces +right
      yaw.push(Math.atan2(-sgn * right.x, -sgn * right.z));
    }
  }
  return makePointCloud({ points, normals, attributes: { along, side, yaw } });
}

export interface GridOptions {
  cols: number;
  rows: number;
  cellX?: number;
  cellZ?: number;
  /** Ground Y for all points. */
  y?: number;
}

/** A regular XZ grid of points (a plaza, a parking lot, an orchard). */
export function scatterGrid(opts: GridOptions): PointCloud {
  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = Math.max(1, Math.floor(opts.rows));
  const cx = opts.cellX ?? 2;
  const cz = opts.cellZ ?? 2;
  const y = opts.y ?? 0;
  const points: Vec3[] = [];
  const gx: number[] = [];
  const gz: number[] = [];
  const ox = -((cols - 1) * cx) / 2;
  const oz = -((rows - 1) * cz) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push(vec3(ox + c * cx, y, oz + r * cz));
      gx.push(c);
      gz.push(r);
    }
  }
  return makePointCloud({ points, attributes: { gx, gz } });
}

// ---------------------------------------------------------------------------
// Rules — composable transforms over a point cloud (the "dice" stage).
// ---------------------------------------------------------------------------

/**
 * Assign a "variant" index by a repeating cadence: every `every`-th slot gets
 * `feature`, the rest keep `base`. This is how CitySample lands lamps on a
 * regular rhythm while filler props sit between them.
 */
export function ruleCadence(
  every: number,
  feature: number,
  base = -1,
): ScatterRule {
  const step = Math.max(1, Math.floor(every));
  return (pc) => {
    const prev = pc.attributes["variant"];
    const variant = pc.points.map((_, i) =>
      i % step === 0 ? feature : (prev?.[i] ?? base),
    );
    return withAttribute(pc, "variant", variant);
  };
}

/**
 * Fill the still-unassigned points (variant < 0) with a seeded weighted pick
 * from `choices`. Weights default to uniform. Points already assigned (e.g. by
 * ruleCadence) are left untouched. Deterministic per `seed`.
 */
export function ruleWeightedFill(
  choices: ReadonlyArray<number>,
  opts: { weights?: ReadonlyArray<number>; seed?: number } = {},
): ScatterRule {
  if (choices.length === 0) throw new Error("ruleWeightedFill: choices is empty");
  const weights = opts.weights ?? choices.map(() => 1);
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < choices.length; i++) {
    acc += Math.max(0, weights[i] ?? 0);
    cum.push(acc);
  }
  const totalW = acc > 0 ? acc : 1;
  return (pc) => {
    const rng = makeRng((opts.seed ?? 0) >>> 0);
    const prev = pc.attributes["variant"];
    const variant = pc.points.map((_, i) => {
      const cur = prev?.[i] ?? -1;
      if (cur >= 0) return cur;
      const r = rng.next() * totalW;
      let idx = cum.findIndex((c) => r < c);
      if (idx < 0) idx = choices.length - 1;
      return choices[idx]!;
    });
    return withAttribute(pc, "variant", variant);
  };
}

/**
 * Write per-point "scale" from a field (constant or (ctx)=>number). Combine
 * with an existing scale multiplicatively when `multiply` is true.
 */
export function ruleScale(field: PointScalar, opts: { multiply?: boolean } = {}): ScatterRule {
  return (pc) => {
    const prev = pc.attributes["scale"];
    const scaleAttr = pc.points.map((_, i) => {
      const v = evalPointScalar(field, pointContext(pc, i));
      return opts.multiply ? (prev?.[i] ?? 1) * v : v;
    });
    return withAttribute(pc, "scale", scaleAttr);
  };
}

/**
 * Add seeded random scale variation in [1-amount, 1+amount] (multiplicative).
 */
export function ruleScaleJitter(amount: number, seed = 0): ScatterRule {
  const a = Math.max(0, amount);
  return (pc) => {
    const rng = makeRng(seed >>> 0);
    const prev = pc.attributes["scale"];
    const scaleAttr = pc.points.map((_, i) => {
      const base = prev?.[i] ?? 1;
      return base * (1 - a + rng.next() * 2 * a);
    });
    return withAttribute(pc, "scale", scaleAttr);
  };
}

/**
 * Add a seeded lateral jitter to point positions along a direction (default
 * X/Z plane random). Keeps determinism; useful to break grid/row regularity.
 */
export function ruleJitterPosition(amount: number, seed = 0): ScatterRule {
  const a = Math.max(0, amount);
  return (pc) => {
    const rng = makeRng(seed >>> 0);
    const points = pc.points.map((p) => {
      const dx = (rng.next() - 0.5) * 2 * a;
      const dz = (rng.next() - 0.5) * 2 * a;
      return vec3(p.x + dx, p.y, p.z + dz);
    });
    return makePointCloud({ points, normals: pc.normals, attributes: pc.attributes });
  };
}

/**
 * Add a seeded yaw jitter (radians) on top of any existing "yaw" attribute.
 */
export function ruleYawJitter(amountRad: number, seed = 0): ScatterRule {
  const a = Math.max(0, amountRad);
  return (pc) => {
    const rng = makeRng(seed >>> 0);
    const prev = pc.attributes["yaw"];
    const yaw = pc.points.map((_, i) => (prev?.[i] ?? 0) + (rng.next() - 0.5) * 2 * a);
    return withAttribute(pc, "yaw", yaw);
  };
}

/**
 * Set a 0/1 "mask" from a predicate; points failing the predicate are marked
 * for removal (drop later with pruneMasked). Predicate reads the point context.
 */
export function ruleMask(predicate: (ctx: PointContext) => boolean): ScatterRule {
  return (pc) => {
    const mask = pc.points.map((_, i) => (predicate(pointContext(pc, i)) ? 1 : 0));
    return withAttribute(pc, "mask", mask);
  };
}

/**
 * Seeded thinning: keep each point with probability `keepProb`. Writes "mask".
 */
export function ruleThin(keepProb: number, seed = 0): ScatterRule {
  const p = Math.max(0, Math.min(1, keepProb));
  return (pc) => {
    const rng = makeRng(seed >>> 0);
    const mask = pc.points.map(() => (rng.next() < p ? 1 : 0));
    return withAttribute(pc, "mask", mask);
  };
}

/**
 * Drop every point whose "mask" attribute is 0 (or a variant < 0 when
 * dropUnassigned). Returns a compacted cloud carrying all other attributes.
 */
export function pruneMasked(opts: { dropUnassigned?: boolean } = {}): ScatterRule {
  return (pc) => {
    const mask = pc.attributes["mask"];
    const variant = pc.attributes["variant"];
    const keep: number[] = [];
    for (let i = 0; i < pc.points.length; i++) {
      if (mask && (mask[i] ?? 1) < 0.5) continue;
      if (opts.dropUnassigned && variant && (variant[i] ?? -1) < 0) continue;
      keep.push(i);
    }
    const attributes: Record<string, number[]> = {};
    for (const [name, values] of Object.entries(pc.attributes)) {
      if (name === "mask") continue;
      attributes[name] = keep.map((i) => values[i] ?? 0);
    }
    return makePointCloud({
      points: keep.map((i) => pc.points[i]!),
      normals: keep.map((i) => pc.normals[i]!),
      attributes,
    });
  };
}

// ---------------------------------------------------------------------------
// PCG-density rules — ported from UE5 Electric Dreams PCG graph nodes.
// These give scatter "疏密变化 / 看坡度 / 不打架" the way a real vegetation
// pass does, while staying purely deterministic (noise + seed only).
// ---------------------------------------------------------------------------

export interface DensityNoiseOptions {
  /** World-space frequency of the noise field (higher = finer clumps). */
  frequency?: number;
  /** fBm settings (octaves/lacunarity/gain). */
  fbm?: FbmOptions;
  /** Remap the [0,1] field: values below `floor` clamp to 0 (bare patches). */
  floor?: number;
  /** Multiply onto an existing "density" attribute instead of replacing it. */
  multiply?: boolean;
  /** Noise seed. */
  seed?: number;
}

/**
 * UE PCG "DensityNoise": sample a 3D fBm field at each point's position and
 * write it to the "density" attribute in [0,1]. This is what turns a flat,
 * uniform scatter into natural clumps and clearings. Feed the resulting
 * "density" into ruleDensityPrune (or map it to scale) to realize it.
 */
export function ruleDensityNoise(opts: DensityNoiseOptions = {}): ScatterRule {
  const freq = opts.frequency ?? 0.05;
  const floor = Math.max(0, Math.min(1, opts.floor ?? 0));
  return (pc) => {
    const noise = makeNoise((opts.seed ?? 0) >>> 0);
    const prev = pc.attributes["density"];
    const density = pc.points.map((p, i) => {
      const n = fbm3(noise, p.x * freq, p.y * freq, p.z * freq, opts.fbm);
      let d = n * 0.5 + 0.5; // [-1,1] -> [0,1]
      if (floor > 0) d = d < floor ? 0 : (d - floor) / (1 - floor);
      d = Math.max(0, Math.min(1, d));
      return opts.multiply ? (prev?.[i] ?? 1) * d : d;
    });
    return withAttribute(pc, "density", density);
  };
}

export interface NormalToDensityOptions {
  /** Up vector to measure slope against (world up by default). */
  up?: Vec3;
  /** Slope (radians from up) at which density starts to fall off. */
  startAngle?: number;
  /** Slope (radians) at which density reaches 0 (fully rejected). */
  endAngle?: number;
  /** Multiply onto existing "density" instead of replacing it. */
  multiply?: boolean;
}

/**
 * UE PCG "NormalToDensity": convert surface slope into density. Flat ground
 * (normal ≈ up) keeps full density; steep faces fade to 0 between
 * startAngle..endAngle. This is the one rule that makes "陡坡不长草" work — the
 * soul of terrain vegetation, and it's tiny.
 */
export function ruleNormalToDensity(opts: NormalToDensityOptions = {}): ScatterRule {
  const up = normalize(opts.up ?? vec3(0, 1, 0));
  const a0 = opts.startAngle ?? (20 * Math.PI) / 180;
  const a1 = opts.endAngle ?? (45 * Math.PI) / 180;
  return (pc) => {
    const prev = pc.attributes["density"];
    const density = pc.points.map((_, i) => {
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(pc.normals[i]!, up))));
      let d: number;
      if (angle <= a0) d = 1;
      else if (angle >= a1) d = 0;
      else d = 1 - (angle - a0) / (a1 - a0);
      return opts.multiply ? (prev?.[i] ?? 1) * d : d;
    });
    return withAttribute(pc, "density", density);
  };
}

/**
 * Turn a "density" attribute into a keep/drop decision: keep each point with
 * probability equal to its density (seeded). Writes "mask" so pruneMasked can
 * compact the cloud. This is how DensityNoise/NormalToDensity actually thin the
 * scatter instead of just annotating it.
 */
export function ruleDensityPrune(seed = 0): ScatterRule {
  return (pc) => {
    const rng = makeRng(seed >>> 0);
    const density = pc.attributes["density"];
    const prevMask = pc.attributes["mask"];
    const mask = pc.points.map((_, i) => {
      if (prevMask && (prevMask[i] ?? 1) < 0.5) return 0;
      const d = Math.max(0, Math.min(1, density?.[i] ?? 1));
      return rng.next() < d ? 1 : 0;
    });
    return withAttribute(pc, "mask", mask);
  };
}

export interface SelfPruningOptions {
  /** Minimum spacing between kept points (world units). */
  radius: number;
  /** Optional per-point radius attribute; scaled by `radius` when present. */
  radiusAttr?: string;
  /**
   * Grid cell size for the spatial hash. Defaults to `radius`. Larger cells =
   * fewer buckets but more comparisons.
   */
  cellSize?: number;
}

/**
 * UE PCG "SelfPruning": greedily drop points that sit closer than `radius` to
 * an already-kept point, so instances don't overlap/穿模. Uses a uniform
 * spatial-hash grid for near-O(n) performance. Deterministic: iterates points
 * in stored order and keeps the first of any clashing pair. Writes "mask".
 */
export function ruleSelfPruning(opts: SelfPruningOptions): ScatterRule {
  const baseR = Math.max(1e-4, opts.radius);
  const cell = Math.max(1e-4, opts.cellSize ?? baseR);
  const inv = 1 / cell;
  return (pc) => {
    const radiusOf = (i: number): number => {
      const a = opts.radiusAttr ? pc.attributes[opts.radiusAttr] : undefined;
      return a ? baseR * (a[i] ?? 1) : baseR;
    };
    const grid = new Map<string, number[]>();
    const key = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;
    const prevMask = pc.attributes["mask"];
    const mask = new Array<number>(pc.points.length).fill(0);
    for (let i = 0; i < pc.points.length; i++) {
      if (prevMask && (prevMask[i] ?? 1) < 0.5) continue;
      const p = pc.points[i]!;
      const r = radiusOf(i);
      const cx = Math.floor(p.x * inv);
      const cy = Math.floor(p.y * inv);
      const cz = Math.floor(p.z * inv);
      // search span in cells that could hold a neighbor within r
      const span = Math.max(1, Math.ceil(r * inv));
      let clash = false;
      for (let dx = -span; dx <= span && !clash; dx++) {
        for (let dy = -span; dy <= span && !clash; dy++) {
          for (let dz = -span; dz <= span && !clash; dz++) {
            const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const j of bucket) {
              const q = pc.points[j]!;
              const minD = Math.max(r, radiusOf(j));
              if (length(sub(p, q)) < minD) {
                clash = true;
                break;
              }
            }
          }
        }
      }
      if (clash) continue;
      mask[i] = 1;
      const k = key(cx, cy, cz);
      const b = grid.get(k);
      if (b) b.push(i);
      else grid.set(k, [i]);
    }
    return withAttribute(pc, "mask", mask);
  };
}

/**
 * UE PCG "DistanceToNeighbors": for each point, compute the distance to its
 * nearest neighbor and store it in `attr` (default "neighborDist"). Uses the
 * same spatial-hash grid, expanding the search ring until a neighbor is found.
 * Useful to drive scale (bigger where sparse) or as a pruning signal.
 */
export function ruleDistanceToNeighbors(
  opts: { attr?: string; maxDistance?: number; cellSize?: number } = {},
): ScatterRule {
  const attr = opts.attr ?? "neighborDist";
  const maxD = opts.maxDistance ?? Infinity;
  return (pc) => {
    const cell = Math.max(1e-4, opts.cellSize ?? (isFinite(maxD) ? maxD : 1));
    const inv = 1 / cell;
    const cellOf = (p: Vec3): [number, number, number] => [
      Math.floor(p.x * inv),
      Math.floor(p.y * inv),
      Math.floor(p.z * inv),
    ];
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let i = 0; i < pc.points.length; i++) {
      const [cx, cy, cz] = cellOf(pc.points[i]!);
      const k = key(cx, cy, cz);
      const b = grid.get(k);
      if (b) b.push(i);
      else grid.set(k, [i]);
    }
    const dist = pc.points.map((p, i) => {
      const [cx, cy, cz] = cellOf(p);
      let best = maxD;
      // expand rings until we've covered a radius >= best
      for (let span = 1; ; span++) {
        for (let dx = -span; dx <= span; dx++) {
          for (let dy = -span; dy <= span; dy++) {
            for (let dz = -span; dz <= span; dz++) {
              // only the shell of this span
              if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== span) continue;
              const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
              if (!bucket) continue;
              for (const j of bucket) {
                if (j === i) continue;
                const d = length(sub(p, pc.points[j]!));
                if (d < best) best = d;
              }
            }
          }
        }
        // once the guaranteed-covered radius (span-1)*cell exceeds best, stop
        if ((span - 1) * cell >= best || span * cell > maxD) break;
      }
      return best;
    });
    return withAttribute(pc, attr, dist);
  };
}

/**
 * UE PCG "LookAt": orient each point's "yaw" so it faces a world target (or a
 * direction). Only Y-yaw is written, matching the flat-ground convention used
 * by copyToPoints. Pass `target` for a focal point, or `direction` for a
 * constant facing.
 */
export function ruleLookAt(
  opts: { target?: Vec3; direction?: Vec3 } = {},
): ScatterRule {
  return (pc) => {
    const yaw = pc.points.map((p) => {
      const d = opts.target
        ? sub(opts.target, p)
        : (opts.direction ?? vec3(0, 0, 1));
      return Math.atan2(d.x, d.z);
    });
    return withAttribute(pc, "yaw", yaw);
  };
}

// ---------------------------------------------------------------------------
// Region clipping — the "Difference" workhorse. In the UE Electric Dreams PCG
// graphs, region difference/intersection is by far the most-used node (90%+):
// carve a scatter down to a shape (inside a boundary) or punch holes out of it
// (roads, clearings, water). These operate on the XZ ground plane and write
// "mask" so pruneMasked realizes the cut, staying inspectable until then.
// ---------------------------------------------------------------------------

/** Winding-number point-in-polygon test on the XZ plane (y ignored). */
function pointInPolygonXZ(px: number, pz: number, poly: ReadonlyArray<Vec3>): boolean {
  let wn = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (a.z <= pz) {
      if (b.z > pz && (b.x - a.x) * (pz - a.z) - (px - a.x) * (b.z - a.z) > 0) wn++;
    } else {
      if (b.z <= pz && (b.x - a.x) * (pz - a.z) - (px - a.x) * (b.z - a.z) < 0) wn--;
    }
  }
  return wn !== 0;
}

export interface ClipPolygonOptions {
  /** "keep" retains points inside the polygon; "remove" drops them (Difference). */
  mode?: "keep" | "remove";
  /** Grow (+) or shrink (-) the boundary test by this margin (world units). */
  margin?: number;
}

/**
 * UE PCG "Difference/Intersection" on the ground plane: mark points inside (or
 * outside) a closed XZ polygon. `mode:"keep"` = intersection (only inside),
 * `mode:"remove"` = difference (punch a hole). Combines with any prior mask.
 * Pass a Curve or a raw vertex ring.
 */
export function ruleClipToPolygon(
  boundary: Curve | ReadonlyArray<Vec3>,
  opts: ClipPolygonOptions = {},
): ScatterRule {
  const poly = Array.isArray(boundary)
    ? (boundary as ReadonlyArray<Vec3>)
    : (boundary as Curve).points;
  const mode = opts.mode ?? "keep";
  const margin = opts.margin ?? 0;
  // Precompute polygon centroid to apply an isotropic margin by scaling verts.
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  cx /= Math.max(1, poly.length);
  cz /= Math.max(1, poly.length);
  const expanded =
    margin === 0
      ? poly
      : poly.map((p) => {
          const dx = p.x - cx;
          const dz = p.z - cz;
          const len = Math.hypot(dx, dz) || 1;
          return vec3(p.x + (dx / len) * margin, p.y, p.z + (dz / len) * margin);
        });
  return (pc) => {
    const prev = pc.attributes["mask"];
    const mask = pc.points.map((p, i) => {
      if (prev && (prev[i] ?? 1) < 0.5) return 0;
      const inside = pointInPolygonXZ(p.x, p.z, expanded);
      const keep = mode === "keep" ? inside : !inside;
      return keep ? 1 : 0;
    });
    return withAttribute(pc, "mask", mask);
  };
}

export interface ClipCurveBandOptions {
  /** Half-width of the band around the curve (world units). */
  width: number;
  /** "keep" retains points within the band; "remove" drops them. */
  mode?: "keep" | "remove";
}

/**
 * UE PCG spline-difference: mark points within `width` of a polyline/curve —
 * the way roads, ditches and riverbanks carve or claim a strip of ground.
 * `mode:"remove"` clears vegetation off a road; `mode:"keep"` plants only along
 * an embankment. Measured on the XZ plane against the curve's segments.
 */
export function ruleClipToCurveBand(
  curve: Curve,
  opts: ClipCurveBandOptions,
): ScatterRule {
  const w = Math.max(0, opts.width);
  const w2 = w * w;
  const mode = opts.mode ?? "remove";
  const pts = curve.points;
  return (pc) => {
    const prev = pc.attributes["mask"];
    const distSqToSegments = (px: number, pz: number): number => {
      let best = Infinity;
      for (let i = 0; i + 1 < pts.length; i++) {
        const ax = pts[i]!.x;
        const az = pts[i]!.z;
        const bx = pts[i + 1]!.x;
        const bz = pts[i + 1]!.z;
        const dx = bx - ax;
        const dz = bz - az;
        const segLen2 = dx * dx + dz * dz || 1;
        let t = ((px - ax) * dx + (pz - az) * dz) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx;
        const qz = az + t * dz;
        const d = (px - qx) ** 2 + (pz - qz) ** 2;
        if (d < best) best = d;
      }
      return best;
    };
    const mask = pc.points.map((p, i) => {
      if (prev && (prev[i] ?? 1) < 0.5) return 0;
      const within = distSqToSegments(p.x, p.z) <= w2;
      const keep = mode === "keep" ? within : !within;
      return keep ? 1 : 0;
    });
    return withAttribute(pc, "mask", mask);
  };
}

// ---------------------------------------------------------------------------
// Variant selection — UE PCG "PointMatchAndSet". Instead of "one mesh for the
// whole scatter", pick per-point which library variant to place by matching a
// condition (slope, height, an attribute, or any custom predicate). This is
// what keeps a forest from being one cloned tree, and lets "陡坡长藤本、平地长
// 匍匐藤" fall out of a rule chain. Writes the integer "variant" attribute that
// copyToPoints / copyAssembliesToPoints already read.
// ---------------------------------------------------------------------------

/** One match case: if `when(ctx)` is true, set variant to `variant`. */
export interface MatchCase {
  when: (ctx: PointContext) => boolean;
  variant: number;
}

export interface MatchAndSetOptions {
  /** Ordered cases; the first matching case wins (like a switch). */
  cases: ReadonlyArray<MatchCase>;
  /** Variant used when no case matches. Default 0. */
  fallback?: number;
  /** Attribute name to write. Default "variant". */
  attribute?: string;
}

/**
 * UE PCG "PointMatchAndSet": assign each point an integer variant by the first
 * matching case. Cases read the point context (position, normal, existing
 * attributes) so you can branch on slope, height, density, or anything upstream
 * rules stored. Deterministic — no randomness of its own.
 */
export function ruleMatchAndSet(opts: MatchAndSetOptions): ScatterRule {
  const attr = opts.attribute ?? "variant";
  const fallback = opts.fallback ?? 0;
  return (pc) => {
    const values = pc.points.map((_, i) => {
      const ctx = pointContext(pc, i);
      for (const c of opts.cases) {
        if (c.when(ctx)) return c.variant;
      }
      return fallback;
    });
    return withAttribute(pc, attr, values);
  };
}

export interface VariantBySlopeOptions {
  /** Up vector to measure slope against. Default world up. */
  up?: Vec3;
  /**
   * Slope thresholds in radians, ascending. A point with slope below the first
   * threshold gets variant 0, below the second gets variant 1, and so on; steeper
   * than the last threshold gets the final variant. `variants.length` should be
   * `thresholds.length + 1`.
   */
  thresholds: ReadonlyArray<number>;
  /** Variant index per slope band. */
  variants: ReadonlyArray<number>;
  /** Attribute name to write. Default "variant". */
  attribute?: string;
}

/**
 * Convenience over ruleMatchAndSet: bucket points into variants by surface
 * slope. E.g. flat ground -> creeping vine, mid slope -> climbing ivy, steep
 * cliff -> woody liana. The slope-driven analogue of ruleNormalToDensity.
 */
export function ruleVariantBySlope(opts: VariantBySlopeOptions): ScatterRule {
  const up = normalize(opts.up ?? vec3(0, 1, 0));
  const attr = opts.attribute ?? "variant";
  const thresholds = opts.thresholds;
  const variants = opts.variants;
  return (pc) => {
    const values = pc.points.map((_, i) => {
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(pc.normals[i]!, up))));
      let band = thresholds.length; // steeper than all thresholds
      for (let t = 0; t < thresholds.length; t++) {
        if (angle < thresholds[t]!) {
          band = t;
          break;
        }
      }
      return variants[Math.min(band, variants.length - 1)] ?? 0;
    });
    return withAttribute(pc, attr, values);
  };
}

export interface VariantByHeightOptions {
  /**
   * Y thresholds, ascending. Below the first -> variant 0, below the second ->
   * variant 1, etc. `variants.length` should be `thresholds.length + 1`.
   */
  thresholds: ReadonlyArray<number>;
  /** Variant index per height band. */
  variants: ReadonlyArray<number>;
  /** Attribute name to write. Default "variant". */
  attribute?: string;
}

/**
 * Convenience over ruleMatchAndSet: bucket points into variants by world height
 * (point.y). E.g. low = one species, high = another — the altitude-zoning read
 * from the Electric Dreams forest-to-mountain switch.
 */
export function ruleVariantByHeight(opts: VariantByHeightOptions): ScatterRule {
  const attr = opts.attribute ?? "variant";
  const thresholds = opts.thresholds;
  const variants = opts.variants;
  return (pc) => {
    const values = pc.points.map((p) => {
      let band = thresholds.length;
      for (let t = 0; t < thresholds.length; t++) {
        if (p.y < thresholds[t]!) {
          band = t;
          break;
        }
      }
      return variants[Math.min(band, variants.length - 1)] ?? 0;
    });
    return withAttribute(pc, attr, values);
  };
}

export interface SlopeFilterOptions {
  /** Up vector to measure slope against. Default world up. */
  up?: Vec3;
  /** Keep points whose slope (radians from up) is at or below this. Default π (no upper bound). */
  maxSlope?: number;
  /** Keep points whose slope is at or above this. Default 0 (no lower bound). */
  minSlope?: number;
}

/**
 * UE PCG "NormalToDensity" used as a HARD gate (the "陡坡不长草" cutoff). Where
 * `ruleNormalToDensity` softens density across a slope band, this writes a 0/1
 * "mask": a point survives only when its surface slope sits inside
 * [minSlope, maxSlope]. Combines with any prior mask so it chains with density
 * and self-pruning; realize with pruneMasked. Deterministic — pure geometry.
 *
 *   - maxSlope alone  -> "only plant on ground flatter than N degrees"
 *   - minSlope alone  -> "only cling to faces steeper than N degrees" (cliff ivy)
 *   - both            -> a slope band (embankments, terraces)
 */
export function ruleSlopeFilter(opts: SlopeFilterOptions = {}): ScatterRule {
  const up = normalize(opts.up ?? vec3(0, 1, 0));
  const maxS = opts.maxSlope ?? Math.PI;
  const minS = opts.minSlope ?? 0;
  return (pc) => {
    const prev = pc.attributes["mask"];
    const mask = pc.points.map((_, i) => {
      if (prev && (prev[i] ?? 1) < 0.5) return 0;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(pc.normals[i]!, up))));
      return angle >= minS && angle <= maxS ? 1 : 0;
    });
    return withAttribute(pc, "mask", mask);
  };
}

