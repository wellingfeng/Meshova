/**
 * Procedural vine / creeper / hanging-plant generator.
 *
 * Why this exists: in UE's Electric Dreams PCG demo the "vines" are *baked*
 * static meshes an external tool grew along an authored curve, then PCG merely
 * scatters them onto rock faces. Meshova instead grows the vine geometry itself
 * from a seeded recipe, so a vine is a re-runnable script, never a mesh dump.
 *
 * The core is a growth walk: start at a root, step along a direction that is
 * pulled by three forces — an intended growth heading, gravity droop, and a
 * seeded wander — then sweep a tapering tube along the resulting polyline.
 * Branches recurse the same walk with a shorter budget. Leaves are scattered
 * along each strand by phyllotaxis (golden angle) so they spiral naturally.
 *
 * Three ready modes fall out of the same walk by tuning the force weights:
 *   - "hanging":  strong downward gravity  -> curtains of drooping vines
 *   - "climbing": upward heading, weak gravity, surface-hugging jitter
 *   - "creeping": near-horizontal heading  -> ground runners
 *
 * Determinism: every random draw comes from the seeded PRNG. Same options +
 * seed => identical vine, every run (screenshot tests + AI reproduction rely
 * on this — never introduce Math.random / Date.now here).
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, normalize, length, cross } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import { makeRng, type Rng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";
import { merge } from "./mesh.js";
import { polyline, smoothCurve, sweep, type Curve } from "./curve.js";
import { transform } from "./transform.js";
import { sphere } from "./primitives.js";
import { closestPointOnMesh } from "./query.js";
import type { NamedPart } from "./export.js";

export type VineMode = "hanging" | "climbing" | "creeping";

/** A single grown strand: its smoothed centerline plus its start thickness. */
export interface VineStrand {
  curve: Curve;
  /** Base radius at the strand root (tapers to ~0 at the tip). */
  radius: number;
  /** Depth in the branch hierarchy (0 = main stem). */
  depth: number;
}

export interface VineOptions {
  /** Random stream seed. Same seed => identical vine. Default 5. */
  seed?: number;
  /** Growth style. Default "hanging". */
  mode?: VineMode;
  /** Total arc length budget of the main stem, world units. Default 3. */
  length?: number;
  /** Root (base) radius of the main stem. Default 0.06. */
  radius?: number;
  /** Growth steps along the main stem (more = smoother/longer walk). Default 24. */
  steps?: number;
  /** Seeded lateral wander strength (0 = straight, 1 = very wiggly). Default 0.5. */
  wander?: number;
  /** Gravity pull per step (overrides the mode default when set). */
  gravity?: number;
  /** How many child branches the whole plant spawns. Default 3. */
  branches?: number;
  /** Max branch recursion depth. Default 2. */
  branchDepth?: number;
  /** Tube ring resolution. Default 7. */
  sides?: number;
  /** Leaves per world-unit of strand length. 0 = bare. Default 6. */
  leafDensity?: number;
  /** Leaf size in world units. Default 0.13. */
  leafSize?: number;
  /** Intended growth heading before gravity/wander (auto from mode if unset). */
  heading?: Vec3;
  /** Where the root sits. Default origin. */
  origin?: Vec3;
}

interface ModeDefaults {
  heading: Vec3;
  gravity: number;
  wanderScale: number;
}

/** Per-mode force weights. gravity is the per-step downward pull. */
function modeDefaults(mode: VineMode): ModeDefaults {
  switch (mode) {
    case "climbing":
      // grows upward, gravity barely tugs, wander hugs the surface plane
      return { heading: vec3(0, 1, 0), gravity: 0.08, wanderScale: 0.7 };
    case "creeping":
      // runs nearly flat along the ground, mild droop keeps it grounded
      return { heading: vec3(1, 0.05, 0), gravity: 0.25, wanderScale: 0.9 };
    case "hanging":
    default:
      // starts sideways then gravity wins -> a drooping curtain strand
      return { heading: vec3(0.35, 0.15, 0), gravity: 1.0, wanderScale: 1.0 };
  }
}

/**
 * Grow one strand by walking a heading that's continuously bent by gravity and
 * a seeded random wander. Returns a smoothed curve. Gravity accumulates so the
 * strand starts along `heading` and progressively droops — the natural read of
 * a real vine bending under its own weight.
 */
function growStrand(
  rng: Rng,
  origin: Vec3,
  heading: Vec3,
  totalLength: number,
  steps: number,
  gravity: number,
  wander: number,
): Curve {
  const stepLen = totalLength / steps;
  const pts: Vec3[] = [origin];
  let pos = origin;
  let dir = normalize(heading);
  let droop = 0;
  for (let i = 0; i < steps; i++) {
    // gravity accrues so later steps bend downward harder (self-weight)
    droop += gravity * stepLen * 0.6;
    // seeded lateral wander: a small random vector added each step
    const w = wander * 0.5;
    const jitter = vec3(
      (rng.next() - 0.5) * w,
      (rng.next() - 0.5) * w * 0.5,
      (rng.next() - 0.5) * w,
    );
    dir = normalize(add(add(dir, jitter), vec3(0, -droop * stepLen, 0)));
    pos = add(pos, scale(dir, stepLen));
    pts.push(pos);
  }
  return smoothCurve(polyline(pts), 6);
}

/** A point + tangent sampled from a curve at parameter t in [0,1]. */
function sampleCurve(curve: Curve, t: number): { pos: Vec3; tangent: Vec3 } {
  const pts = curve.points;
  const n = pts.length;
  if (n === 1) return { pos: pts[0]!, tangent: vec3(0, 1, 0) };
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const frac = f - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const pos = add(a, scale(sub(b, a), frac));
  const tangent = normalize(sub(b, a));
  return { pos, tangent };
}

/**
 * Recursively grow the strand hierarchy. Each branch starts partway along its
 * parent, inherits a shortened length budget and thinner radius, and veers off
 * the parent tangent by a seeded angle. Depth is bounded by `branchDepth`.
 */
function growHierarchy(
  rng: Rng,
  origin: Vec3,
  heading: Vec3,
  opts: Required<VineOptions>,
): VineStrand[] {
  const strands: VineStrand[] = [];
  const md = modeDefaults(opts.mode);
  const gravity = opts.gravity >= 0 ? opts.gravity : md.gravity;

  const grow = (
    from: Vec3,
    dir: Vec3,
    len: number,
    radius: number,
    depth: number,
    childBudget: number,
  ): void => {
    const steps = Math.max(6, Math.round(opts.steps * (len / opts.length)));
    const curve = growStrand(rng, from, dir, len, steps, gravity, opts.wander * md.wanderScale);
    strands.push({ curve, radius, depth });
    if (depth >= opts.branchDepth || childBudget <= 0) return;

    // spawn children partway up the parent, veering to a seeded side
    for (let c = 0; c < childBudget; c++) {
      const t = 0.3 + rng.next() * 0.5; // sprout from the mid-upper span
      const { pos, tangent } = sampleCurve(curve, t);
      // veer: mix parent tangent with a random lateral kick
      const kick = normalize(
        vec3(rng.next() - 0.5, (rng.next() - 0.5) * 0.4, rng.next() - 0.5),
      );
      const childDir = normalize(add(scale(tangent, 0.5), scale(kick, 0.9)));
      const childLen = len * (0.45 + rng.next() * 0.25);
      const childRadius = radius * 0.6;
      const nextBudget = Math.max(0, Math.floor(childBudget / 2));
      grow(pos, childDir, childLen, childRadius, depth + 1, nextBudget);
    }
  };

  grow(origin, heading, opts.length, opts.radius, 0, opts.branches);
  return strands;
}

const GOLDEN_ANGLE = 2.399963; // ~137.5°, the phyllotaxis spiral angle

/** Build a single flattened teardrop leaf mesh (long in local +X, thin in Y). */
function leafMesh(size: number): Mesh {
  return transform(sphere(1, 8, 6), { scale: vec3(size * 1.5, size * 0.06, size * 0.85) });
}

/**
 * Scatter leaves along every strand by golden-angle phyllotaxis. Each leaf sits
 * at a curve sample, is pushed out past the tube radius, tilts up, and spins to
 * the next spiral slot. Leaf count scales with strand length and leafDensity.
 * Returns one merged leaf mesh (empty mesh contributions are skipped upstream).
 */
function growLeaves(rng: Rng, strands: VineStrand[], opts: Required<VineOptions>): Mesh[] {
  if (opts.leafDensity <= 0) return [];
  const leaves: Mesh[] = [];
  let spiral = 0;
  for (const strand of strands) {
    const pts = strand.curve.points;
    if (pts.length < 2) continue;
    // approximate strand length to size the leaf count
    let strandLen = 0;
    for (let i = 1; i < pts.length; i++) strandLen += length(sub(pts[i]!, pts[i - 1]!));
    const count = Math.max(0, Math.round(strandLen * opts.leafDensity));
    for (let i = 0; i < count; i++) {
      const t = 0.12 + ((i + 0.5) / Math.max(1, count)) * 0.85;
      const { pos, tangent } = sampleCurve(strand.curve, t);
      spiral += GOLDEN_ANGLE;
      const yaw = spiral + (rng.next() - 0.5) * 0.5;
      const stemR = strand.radius * (1 - t * 0.8);
      const sz = opts.leafSize * (0.7 + (1 - t) * 0.5) * (0.8 + rng.next() * 0.4);
      // orient the leaf's growth-out axis roughly perpendicular to the stem
      const pitch = 0.4 + (rng.next() - 0.5) * 0.4;
      let leaf = leafMesh(sz);
      // push out from the stem centerline, tilt up
      leaf = transform(leaf, { translate: vec3(sz * 1.3 + stemR, 0, 0), rotate: vec3(0, 0, pitch) });
      // spin to the spiral slot, align loosely with the local tangent, place at pos
      const tilt = Math.atan2(tangent.x, tangent.y);
      leaf = transform(leaf, { rotate: vec3(0, yaw, tilt * 0.5), translate: pos });
      leaves.push(leaf);
    }
  }
  return leaves;
}

function resolveOptions(options: VineOptions): Required<VineOptions> {
  const mode = options.mode ?? "hanging";
  const md = modeDefaults(mode);
  return {
    seed: options.seed ?? 5,
    mode,
    length: options.length ?? 3,
    radius: options.radius ?? 0.06,
    steps: options.steps ?? 24,
    wander: options.wander ?? 0.5,
    gravity: options.gravity ?? -1, // -1 sentinel => use mode default downstream
    branches: options.branches ?? 3,
    branchDepth: options.branchDepth ?? 2,
    sides: options.sides ?? 7,
    leafDensity: options.leafDensity ?? 6,
    leafSize: options.leafSize ?? 0.13,
    heading: options.heading ?? md.heading,
    origin: options.origin ?? vec3(0, 0, 0),
  };
}

/** Grow the strand hierarchy for a vine without meshing it (for scatter/instancing). */
export function growVineStrands(options: VineOptions = {}): VineStrand[] {
  const opts = resolveOptions(options);
  const rng = makeRng(opts.seed);
  return growHierarchy(rng, opts.origin, normalize(opts.heading), opts);
}

/** Sweep all strands into one merged stem tube mesh (no leaves). */
export function buildVineStemMesh(options: VineOptions = {}): Mesh {
  const opts = resolveOptions(options);
  const rng = makeRng(opts.seed);
  const strands = growHierarchy(rng, opts.origin, normalize(opts.heading), opts);
  const tubes = strands.map((s) =>
    sweep(s.curve, {
      radius: s.radius,
      sides: opts.sides,
      radiusAt: (t) => Math.max(0.08, 1 - t * 0.85),
      caps: false,
    }),
  );
  return merge(...tubes);
}

/**
 * Build a full vine as named parts: one woody stem part plus one leaf part.
 * Ready for the viewer / OBJ export. Deterministic for a given seed.
 */
export function buildVineParts(options: VineOptions = {}): NamedPart[] {
  const opts = resolveOptions(options);
  const rng = makeRng(opts.seed);
  const strands = growHierarchy(rng, opts.origin, normalize(opts.heading), opts);

  const tubes = strands.map((s) =>
    sweep(s.curve, {
      radius: s.radius,
      sides: opts.sides,
      radiusAt: (t) => Math.max(0.08, 1 - t * 0.85),
      caps: false,
    }),
  );

  const parts: NamedPart[] = [
    {
      name: "stem",
      label: "藤茎",
      mesh: merge(...tubes),
      color: [0.32, 0.22, 0.13],
      surface: { type: "wood", params: { tone: [0.32, 0.22, 0.13] } },
    },
  ];

  const leaves = growLeaves(rng, strands, opts);
  if (leaves.length > 0) {
    parts.push({
      name: "leaves",
      label: "叶片",
      mesh: merge(...leaves),
      color: [0.22, 0.48, 0.17],
      surface: { type: "fabric", params: { color: [0.22, 0.48, 0.17] } },
    });
  }
  return parts;
}

/** Named vine recipes — distinct silhouettes from the one generator. */
export const VINE_PRESETS: Record<string, VineOptions> = {
  // Curtain of drooping vines off a ledge: long, gravity-heavy, leafy.
  hanging: { seed: 5, mode: "hanging", length: 3.2, branches: 4, leafDensity: 7, wander: 0.5 },
  // Ivy climbing a wall: upward, tight wander, dense small leaves.
  ivy: { seed: 12, mode: "climbing", length: 2.6, radius: 0.045, branches: 5, leafDensity: 9, leafSize: 0.1, wander: 0.6 },
  // Ground runner spreading outward: near-flat, sparse leaves.
  creeper: { seed: 23, mode: "creeping", length: 3.6, radius: 0.05, branches: 4, leafDensity: 5, wander: 0.7 },
  // Bare woody liana: thick, few leaves, strong droop.
  liana: { seed: 31, mode: "hanging", length: 4, radius: 0.09, branches: 2, leafDensity: 1.5, leafSize: 0.16, wander: 0.35 },
};

/** Build one vine preset by name. Falls back to the hanging curtain. */
export function buildVinePreset(name: string, override: VineOptions = {}): NamedPart[] {
  const base = VINE_PRESETS[name] ?? VINE_PRESETS.hanging!;
  return buildVineParts({ ...base, ...override });
}

// ===========================================================================
// Surface-climbing vines — the "ivy crawls up a column / wall" feature.
//
// The free-space walk above grows a vine in open air. Real climbing ivy instead
// *adheres to a surface*: every growth step is snapped back onto the surface and
// the walk is steered in the surface's own tangent frame (up + around). On a
// cylinder that yields a natural helix; on a wall it yields a gently weaving
// vertical run. This mirrors how UE's Electric Dreams ivy was authored — grown
// along a surface, then swept — except here we grow it live and deterministically.
// ===========================================================================

/**
 * A climbable surface. `project` snaps an arbitrary point onto the surface and
 * returns the surface point, its outward normal, and an "up" tangent (world +Y
 * projected onto the surface) plus an "around" tangent (normal × up). The walk
 * steers in the (up, around) basis so it stays glued to the surface.
 */
export interface ClimbSurface {
  /** Snap `p` onto the surface; return the anchor, outward normal, and tangents. */
  project(p: Vec3): { point: Vec3; normal: Vec3; up: Vec3; around: Vec3 };
  /** A reasonable starting anchor on the surface for a given seed fraction (0..1). */
  seedPoint(frac: number, rng: Rng): Vec3;
  /** Top Y of the surface, so climbers know when to stop / spill over. */
  topY: number;
}

/** An upright cylinder column: axis along Y, centered at `center`. */
export function cylinderSurface(opts: {
  center?: Vec3;
  radius?: number;
  height?: number;
}): ClimbSurface {
  const center = opts.center ?? vec3(0, 0, 0);
  const radius = opts.radius ?? 0.5;
  const height = opts.height ?? 3;
  const topY = center.y + height;
  return {
    topY,
    project(p) {
      const dx = p.x - center.x;
      const dz = p.z - center.z;
      let r = Math.hypot(dx, dz);
      if (r < 1e-6) r = 1e-6;
      const nx = dx / r;
      const nz = dz / r;
      const point = vec3(center.x + nx * radius, p.y, center.z + nz * radius);
      const normal = vec3(nx, 0, nz);
      // up = world Y is already tangent to a vertical cylinder
      const up = vec3(0, 1, 0);
      const around = normalize(cross(normal, up)); // circumferential
      return { point, normal, up, around };
    },
    seedPoint(frac, rng) {
      const a = frac * TAU + (rng.next() - 0.5) * 0.4;
      return vec3(
        center.x + Math.cos(a) * radius,
        center.y + 0.02 * height,
        center.z + Math.sin(a) * radius,
      );
    },
  };
}

/**
 * A flat vertical wall. `normal` faces away from the wall; the plane passes
 * through `origin`. `right`/`up` span the face; `width`/`height` bound the seed
 * region. Points project by removing their component along the wall normal.
 */
export function wallSurface(opts: {
  origin?: Vec3;
  normal?: Vec3;
  up?: Vec3;
  width?: number;
  height?: number;
}): ClimbSurface {
  const origin = opts.origin ?? vec3(0, 0, 0);
  const normal = normalize(opts.normal ?? vec3(0, 0, 1));
  const up = normalize(opts.up ?? vec3(0, 1, 0));
  const right = normalize(cross(up, normal));
  const width = opts.width ?? 4;
  const height = opts.height ?? 3;
  return {
    topY: origin.y + height,
    project(p) {
      const rel = sub(p, origin);
      const dist = rel.x * normal.x + rel.y * normal.y + rel.z * normal.z;
      const point = sub(p, scale(normal, dist)); // drop onto the plane
      return { point, normal, up, around: right };
    },
    seedPoint(frac, rng) {
      const u = (frac - 0.5) * width + (rng.next() - 0.5) * 0.3;
      return add(add(origin, scale(right, u)), scale(up, 0.02 * height));
    },
  };
}

/**
 * Adhere to an ARBITRARY mesh — the Natsura "grow on any surface" idea, done
 * with a closest-point projection instead of voxels. Each step snaps back onto
 * the nearest triangle, reads that face's geometric normal, and derives an
 * up/around tangent basis so climbers hug ruins, rocks, statues, trunks — any
 * shape, not just cylinders and flat walls. Deterministic (no spatial hashing
 * randomness). O(tris) per projection: fine for prop-scale meshes.
 */
export function meshSurface(mesh: Mesh, opts: { up?: Vec3 } = {}): ClimbSurface {
  const worldUp = normalize(opts.up ?? vec3(0, 1, 0));
  // Precompute face normals + centroids for seed sampling and normal reads.
  const triCount = mesh.indices.length / 3;
  const faceN: Vec3[] = [];
  const faceC: Vec3[] = [];
  let topY = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const a = mesh.positions[mesh.indices[t * 3]!]!;
    const b = mesh.positions[mesh.indices[t * 3 + 1]!]!;
    const c = mesh.positions[mesh.indices[t * 3 + 2]!]!;
    const n = cross(sub(b, a), sub(c, a));
    faceN.push(length(n) > 1e-9 ? normalize(n) : vec3(0, 1, 0));
    faceC.push(vec3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3));
    topY = Math.max(topY, a.y, b.y, c.y);
  }
  if (!isFinite(topY)) topY = 0;

  const basisFor = (normal: Vec3): { up: Vec3; around: Vec3 } => {
    // up = worldUp projected into the tangent plane (climb direction).
    let up = sub(worldUp, scale(normal, worldUp.x * normal.x + worldUp.y * normal.y + worldUp.z * normal.z));
    if (length(up) < 1e-6) {
      // surface is horizontal: pick an arbitrary tangent.
      up = cross(normal, vec3(1, 0, 0));
      if (length(up) < 1e-6) up = cross(normal, vec3(0, 0, 1));
    }
    up = normalize(up);
    const around = normalize(cross(normal, up));
    return { up, around };
  };

  return {
    topY,
    project(p) {
      const cp = closestPointOnMesh(mesh, p);
      const normal = faceN[cp.prim] ?? vec3(0, 1, 0);
      const { up, around } = basisFor(normal);
      return { point: cp.position, normal, up, around };
    },
    seedPoint(frac, rng) {
      // Bias seeds toward lower faces so vines start near the base and climb up.
      if (triCount === 0) return vec3(0, 0, 0);
      const idx = Math.min(triCount - 1, Math.floor(frac * triCount + (rng.next() - 0.5) * 2));
      const t = Math.max(0, idx);
      const c = faceC[t] ?? vec3(0, 0, 0);
      const n = faceN[t] ?? vec3(0, 1, 0);
      return add(c, scale(n, 0.01));
    },
  };
}

export interface ClimbOptions {
  /** Random stream seed. Default 5. */
  seed?: number;
  /** How many separate climbing strands seed onto the surface. Default 5. */
  strands?: number;
  /** Total arc length each strand climbs. Default = surface height * 1.3. */
  length?: number;
  /** Root radius of each strand. Default 0.035. */
  radius?: number;
  /** Growth steps per strand. Default 30. */
  steps?: number;
  /** Upward drive per step (bigger = steeper climb, less winding). Default 1. */
  climb?: number;
  /** Sideways winding per step (bigger = more helix/weave). Default 0.6. */
  weave?: number;
  /** Seeded wander on top of the steer. Default 0.35. */
  wander?: number;
  /** Tube ring resolution. Default 6. */
  sides?: number;
  /** Leaves per world-unit of strand length. Default 8. */
  leafDensity?: number;
  /** Leaf size. Default 0.11. */
  leafSize?: number;
  /** Push the tube this far off the surface so it doesn't z-fight. Default = radius. */
  offset?: number;
  /** How many side branches each strand spawns. Default 2. */
  branches?: number;
}

interface ClimbResolved extends Required<ClimbOptions> {}

function resolveClimb(surface: ClimbSurface, options: ClimbOptions): ClimbResolved {
  const radius = options.radius ?? 0.035;
  return {
    seed: options.seed ?? 5,
    strands: options.strands ?? 5,
    length: options.length ?? (surface.topY) * 1.3,
    radius,
    steps: options.steps ?? 30,
    climb: options.climb ?? 1,
    weave: options.weave ?? 0.6,
    wander: options.wander ?? 0.35,
    sides: options.sides ?? 6,
    leafDensity: options.leafDensity ?? 8,
    leafSize: options.leafSize ?? 0.11,
    offset: options.offset ?? radius,
    branches: options.branches ?? 2,
  };
}

/**
 * Grow one strand that adheres to `surface`, climbing upward while winding
 * around. Each step: build a steer vector in the surface (up, around) basis,
 * add wander, advance, then PROJECT back onto the surface so the strand never
 * leaves it. `windDir` (+1/-1) sets which way it spirals.
 */
function growClimbStrand(
  rng: Rng,
  surface: ClimbSurface,
  start: Vec3,
  totalLength: number,
  steps: number,
  opts: ClimbResolved,
  windDir: number,
): Curve {
  const stepLen = totalLength / steps;
  const pts: Vec3[] = [];
  let cur = surface.project(start);
  // record the offset anchor (pushed off the surface a touch)
  pts.push(add(cur.point, scale(cur.normal, opts.offset)));
  for (let i = 0; i < steps; i++) {
    // steer: mostly up, some circumferential winding, plus seeded wander
    const around = scale(cur.around, windDir * opts.weave);
    const up = scale(cur.up, opts.climb);
    const wander = scale(cur.around, (rng.next() - 0.5) * opts.wander);
    const wanderUp = scale(cur.up, (rng.next() - 0.5) * opts.wander * 0.4);
    const step = normalize(add(add(add(up, around), wander), wanderUp));
    const nextGuess = add(cur.point, scale(step, stepLen));
    cur = surface.project(nextGuess);
    pts.push(add(cur.point, scale(cur.normal, opts.offset)));
    // stop early if we've spilled over the top
    if (cur.point.y > surface.topY) break;
  }
  return smoothCurve(polyline(pts), 5);
}

/**
 * Grow a set of vines that climb `surface`. Returns strands (centerlines +
 * radius) ready to sweep. Deterministic for a given seed. Some strands wind
 * clockwise, some counter, for a natural tangle.
 */
export function growClimbingStrands(surface: ClimbSurface, options: ClimbOptions = {}): VineStrand[] {
  const opts = resolveClimb(surface, options);
  const rng = makeRng(opts.seed);
  const strands: VineStrand[] = [];
  for (let s = 0; s < opts.strands; s++) {
    const frac = opts.strands > 1 ? s / opts.strands : 0.5;
    const start = surface.seedPoint(frac, rng);
    const windDir = rng.next() < 0.5 ? 1 : -1;
    const len = opts.length * (0.8 + rng.next() * 0.4);
    const main = growClimbStrand(rng, surface, start, len, opts.steps, opts, windDir);
    strands.push({ curve: main, radius: opts.radius, depth: 0 });

    // side branches: sprout partway up, climb a shorter distance, weave harder
    for (let b = 0; b < opts.branches; b++) {
      const t = 0.25 + rng.next() * 0.5;
      const { pos } = sampleCurve(main, t);
      const childLen = len * (0.3 + rng.next() * 0.25);
      const childWind = rng.next() < 0.5 ? 1 : -1;
      const child = growClimbStrand(rng, surface, pos, childLen, Math.max(6, Math.round(opts.steps * 0.5)), opts, childWind);
      strands.push({ curve: child, radius: opts.radius * 0.65, depth: 1 });
    }
  }
  return strands;
}

/** Sweep + leaf the climbing strands into named parts (stem + leaves). */
function climbingStrandsToParts(rng: Rng, strands: VineStrand[], opts: ClimbResolved): NamedPart[] {
  const tubes = strands.map((s) =>
    sweep(s.curve, {
      radius: s.radius,
      sides: opts.sides,
      radiusAt: (t) => Math.max(0.1, 1 - t * 0.8),
      caps: false,
    }),
  );
  const parts: NamedPart[] = [
    {
      name: "stem",
      label: "藤茎",
      mesh: merge(...tubes),
      color: [0.3, 0.24, 0.14],
      surface: { type: "wood", params: { tone: [0.3, 0.24, 0.14] } },
    },
  ];
  const leafOpts: Required<VineOptions> = resolveOptions({
    leafDensity: opts.leafDensity,
    leafSize: opts.leafSize,
  });
  const leaves = growLeaves(rng, strands, leafOpts);
  if (leaves.length > 0) {
    parts.push({
      name: "leaves",
      label: "叶片",
      mesh: merge(...leaves),
      color: [0.24, 0.5, 0.18],
      surface: { type: "fabric", params: { color: [0.24, 0.5, 0.18] } },
    });
  }
  return parts;
}

/**
 * Grow ivy climbing a surface and return it as named parts. This is the
 * headline "vines crawl up the column/wall" builder.
 */
export function buildClimbingVineParts(surface: ClimbSurface, options: ClimbOptions = {}): NamedPart[] {
  const opts = resolveClimb(surface, options);
  const rng = makeRng(opts.seed);
  const strands = growClimbingStrands(surface, options);
  return climbingStrandsToParts(rng, strands, opts);
}




