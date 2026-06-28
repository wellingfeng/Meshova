/**
 * Recursive branch generator — the heart of SpeedTree's paradigm, ported.
 *
 * `growBranches` seeds child branches along a parent spline using golden-angle
 * phyllotaxis (137.5deg) so they spiral instead of stacking, then recurses to a
 * given depth, scaling length / radius / child-count down each level. Each
 * branch is grown with phototropism + gravity + gnarl, then swept into a tapered
 * tube. The terminal (leaf-bearing) branches are tracked separately so the leaf
 * pass can scatter cards onto them.
 *
 * Determinism: a single seed forks independent RNG streams per branch.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize, lerpVec3 } from "../math/vec3.js";
import type { Curve } from "../geometry/curve.js";
import { sweep, curveLength } from "../geometry/curve.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { makeRng, type Rng } from "../random/prng.js";
import { curveFrameAt, growCurve, rotateAround } from "./curve-frame.js";

/** Golden angle in radians (~137.5deg) — natural phyllotaxis spacing. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface BranchSegment {
  /** Centerline of this branch. */
  curve: Curve;
  /** Recursion depth (0 = trunk, 1 = first-order branch, ...). */
  depth: number;
  /** Base radius of this branch. */
  radius: number;
  /** True if no children were spawned from it (leaf-bearing tip). */
  terminal: boolean;
}

export interface GrowBranchesOptions {
  seed?: number;
  /** Children spawned per parent at depth 0. Decreases with depth via childFalloff. */
  count?: number;
  /** Recursion depth (number of child generations to spawn). */
  depth?: number;
  /** Fraction of parent length where children start (0..1). */
  startPct?: number;
  /** Fraction of parent length where children end (0..1). */
  endPct?: number;
  /** Out-going angle off the parent tangent, in degrees. */
  angle?: number;
  /** Random jitter added to the angle, in degrees. */
  angleJitter?: number;
  /** Bend toward +Y (light) per branch, 0..1. */
  phototropism?: number;
  /** Bend toward -Y (gravity) per branch, 0..1. */
  gravity?: number;
  /** Child length = parent length * lengthScale. */
  lengthScale?: number;
  /** Child radius = parent radius * radiusScale. */
  radiusScale?: number;
  /** Child count = round(parent count * childFalloff). */
  childFalloff?: number;
  /** Lateral gnarl amount per branch (scaled by branch length). */
  gnarl?: number;
  /** Segments per branch curve. */
  segments?: number;
}

interface GrowConfig {
  count: number;
  depth: number;
  startPct: number;
  endPct: number;
  angle: number;
  angleJitter: number;
  phototropism: number;
  gravity: number;
  lengthScale: number;
  radiusScale: number;
  childFalloff: number;
  gnarl: number;
  segments: number;
}

/**
 * Grow a recursive tree of branches off a parent curve. Returns every branch
 * segment (including the children's children), each tagged with depth, radius,
 * and whether it is terminal. Does NOT include the parent curve itself.
 */
export function growBranches(
  parent: Curve,
  parentRadius: number,
  opts: GrowBranchesOptions = {},
): BranchSegment[] {
  const cfg: GrowConfig = {
    count: opts.count ?? 6,
    depth: opts.depth ?? 3,
    startPct: opts.startPct ?? 0.3,
    endPct: opts.endPct ?? 0.95,
    angle: opts.angle ?? 50,
    angleJitter: opts.angleJitter ?? 12,
    phototropism: opts.phototropism ?? 0.35,
    gravity: opts.gravity ?? 0.1,
    lengthScale: opts.lengthScale ?? 0.7,
    radiusScale: opts.radiusScale ?? 0.6,
    childFalloff: opts.childFalloff ?? 0.7,
    gnarl: opts.gnarl ?? 0.15,
    segments: opts.segments ?? 6,
  };
  const rng = makeRng(opts.seed ?? 1234);
  const out: BranchSegment[] = [];
  const parentLen = Math.max(1e-4, curveLength(parent));
  spawnChildren(parent, parentLen, parentRadius, 0, cfg.count, cfg, rng, out);
  return out;
}

function spawnChildren(
  parent: Curve,
  parentLen: number,
  parentRadius: number,
  parentDepth: number,
  count: number,
  cfg: GrowConfig,
  rng: Rng,
  out: BranchSegment[],
): void {
  if (parentDepth >= cfg.depth || count < 1) return;
  const childDepth = parentDepth + 1;
  const childLen = parentLen * cfg.lengthScale;
  const childRadius = parentRadius * cfg.radiusScale;
  const angleRad = (cfg.angle * Math.PI) / 180;
  const jitterRad = (cfg.angleJitter * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    // Position along parent via golden-angle spiral, within [startPct, endPct].
    const frac = count > 1 ? i / (count - 1) : 0.5;
    const t = cfg.startPct + (cfg.endPct - cfg.startPct) * frac;
    const roll = i * GOLDEN_ANGLE;
    const frame = curveFrameAt(parent, t);

    // Out-going direction: rotate the parent tangent away by `angle` around a
    // side axis that is rolled around the tangent by the golden angle.
    const side = add(scale(frame.normal, Math.cos(roll)), scale(frame.binormal, Math.sin(roll)));
    const sideUnit = normalize(side);
    const jitter = (rng.next() * 2 - 1) * jitterRad;
    // Bend the tangent toward `sideUnit` by (angle + jitter).
    let dir = rotateAround(frame.tangent, normalize(cross3(frame.tangent, sideUnit)), angleRad + jitter);
    dir = normalize(add(dir, scale(sideUnit, 0.15))); // nudge outward so children fan out

    const branchSeed = rng.fork();
    const len = childLen * (0.8 + rng.next() * 0.4); // length variation
    const curve = growCurve(frame.position, dir, len, {
      segments: cfg.segments,
      phototropism: cfg.phototropism,
      gravity: cfg.gravity,
      gnarl: cfg.gnarl,
      seed: (branchSeed.next() * 1e9) | 0,
    });

    const childCount = Math.round(count * cfg.childFalloff);
    const willRecurse = childDepth < cfg.depth && childCount >= 1;
    out.push({ curve, depth: childDepth, radius: childRadius, terminal: !willRecurse });

    if (willRecurse) {
      spawnChildren(curve, len, childRadius, childDepth, childCount, cfg, branchSeed, out);
    }
  }
}

/** Local cross helper (avoid extra import churn). */
function cross3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export interface BranchMeshOptions {
  /** Ring resolution; reduced automatically for thin/deep branches. */
  sides?: number;
  /** Min sides for the thinnest branches (LOD). */
  minSides?: number;
}

/**
 * Sweep every branch segment into a tapered tube and merge into one mesh.
 * Radius tapers from the branch base to a thin tip via a simple curve.
 */
export function branchesToMesh(
  branches: BranchSegment[],
  opts: BranchMeshOptions = {},
): Mesh {
  const maxSides = Math.max(3, Math.floor(opts.sides ?? 8));
  const minSides = Math.max(3, Math.floor(opts.minSides ?? 3));
  const meshes: Mesh[] = [];
  for (const b of branches) {
    // Deeper / thinner branches get fewer sides (cheap LOD).
    const sides = Math.max(minSides, Math.round(maxSides - b.depth));
    const mesh = sweep(b.curve, {
      sides,
      radius: b.radius,
      radiusAt: (t) => taper(t, b.terminal),
      caps: false,
    });
    meshes.push(mesh);
  }
  return meshes.length ? merge(...meshes) : merge();
}

/** Radius profile along a branch: full at base, taper to a point at the tip. */
function taper(t: number, terminal: boolean): number {
  // Terminal branches taper fully to a tip; structural ones keep a little width
  // at the end so children join without a visible pinch.
  const tipScale = terminal ? 0.02 : 0.4;
  return 1 - (1 - tipScale) * smoothstep(t);
}

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
