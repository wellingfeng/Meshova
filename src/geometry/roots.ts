/**
 * Procedural root / root-flare / erosion-root generator.
 *
 * Why this exists: in UE's Electric Dreams PCG demo the `RootsTest/SM_Roots_*`
 * and `SM_ErosionRoots_*` are *baked* static meshes an external tool grew, then
 * PCG scatters them onto embankments and exposed riverbanks. Meshova grows the
 * root geometry itself from a seeded recipe, so a root clump is a re-runnable
 * script, never a mesh dump — the same principle as `vine.ts`, mirrored to grow
 * DOWN and OUT instead of up.
 *
 * The core is the same growth walk as the vine: start at a flare collar, step
 * along a direction pulled by three forces — a downward+outward heading,
 * gravity, and seeded wander — then sweep a tapering tube. Roots differ from
 * vines in intent, so the defaults invert:
 *   - heading drives down and away from the trunk (roots seek soil)
 *   - stronger taper (roots thin fast toward the tips / rootlets)
 *   - many primary roots fan out radially from the collar (the root flare)
 *   - "erosion" mode keeps roots near-horizontal, as if soil washed away and
 *     left them exposed clinging to an embankment face.
 *
 * Determinism: every draw comes from the seeded PRNG. Same options + seed =>
 * identical root system (screenshot tests + AI reproduction rely on this —
 * never introduce Math.random / Date.now here).
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, normalize } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import { makeRng, type Rng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";
import { merge } from "./mesh.js";
import { polyline, smoothCurve, sweep, type Curve } from "./curve.js";
import type { NamedPart } from "./export.js";

export type RootMode = "flare" | "erosion" | "taproot";

/** A single grown root strand: smoothed centerline + base radius + hierarchy depth. */
export interface RootStrand {
  curve: Curve;
  /** Base radius at the strand root (tapers toward the tip). */
  radius: number;
  /** Depth in the branch hierarchy (0 = primary root off the collar). */
  depth: number;
}

export interface RootOptions {
  /** Random stream seed. Same seed => identical roots. Default 7. */
  seed?: number;
  /** Growth style. Default "flare". */
  mode?: RootMode;
  /** Number of primary roots fanning off the collar. Default 6. */
  count?: number;
  /** Radius of the collar the primaries sprout from (the trunk base). Default 0.4. */
  collarRadius?: number;
  /** Total arc length budget of a primary root. Default 2.5. */
  length?: number;
  /** Base radius of a primary root where it leaves the collar. Default 0.12. */
  radius?: number;
  /** Growth steps along a primary (more = smoother/longer walk). Default 20. */
  steps?: number;
  /** Seeded lateral wander strength (0 = straight, 1 = very wiggly). Default 0.5. */
  wander?: number;
  /** Downward pull per step (overrides the mode default when >= 0). Default -1 (auto). */
  gravity?: number;
  /** How far primaries splay outward vs. down (0 = straight down, 1 = flat). Default auto. */
  spread?: number;
  /** Child rootlets each root spawns. Default 3. */
  branches?: number;
  /** Max branch recursion depth. Default 2. */
  branchDepth?: number;
  /** Tube ring resolution. Default 7. */
  sides?: number;
  /** Where the collar center sits. Default origin. */
  origin?: Vec3;
}

interface RootModeDefaults {
  /** Downward pull per step. */
  gravity: number;
  /** Outward splay 0..1 (0 = down, 1 = horizontal). */
  spread: number;
  /** Wander multiplier. */
  wanderScale: number;
}

function rootModeDefaults(mode: RootMode): RootModeDefaults {
  switch (mode) {
    case "erosion":
      // exposed on an embankment: roots run nearly horizontal, clinging out
      return { gravity: 0.2, spread: 0.85, wanderScale: 1.1 };
    case "taproot":
      // one dominant plunge downward, little splay
      return { gravity: 1.2, spread: 0.15, wanderScale: 0.6 };
    case "flare":
    default:
      // classic root flare: fan out and dive into soil
      return { gravity: 0.8, spread: 0.55, wanderScale: 0.9 };
  }
}

/**
 * Grow one root strand by walking a heading bent by gravity and seeded wander.
 * Mirrors the vine walk but gravity here reinforces the intended downward
 * heading rather than fighting it. Returns a smoothed curve.
 */
function growRootStrand(
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
  for (let i = 0; i < steps; i++) {
    const w = wander * 0.5;
    const jitter = vec3(
      (rng.next() - 0.5) * w,
      (rng.next() - 0.5) * w * 0.5,
      (rng.next() - 0.5) * w,
    );
    // gravity steadily pulls the heading downward (roots dive as they go)
    dir = normalize(add(add(dir, jitter), vec3(0, -gravity * stepLen, 0)));
    pos = add(pos, scale(dir, stepLen));
    pts.push(pos);
  }
  return smoothCurve(polyline(pts), 6);
}

/** A point + tangent sampled from a curve at parameter t in [0,1]. */
function sampleCurve(curve: Curve, t: number): { pos: Vec3; tangent: Vec3 } {
  const pts = curve.points;
  const n = pts.length;
  if (n === 1) return { pos: pts[0]!, tangent: vec3(0, -1, 0) };
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const frac = f - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const pos = add(a, scale(sub(b, a), frac));
  const tangent = normalize(sub(b, a));
  return { pos, tangent };
}

function resolveRoot(options: RootOptions): Required<RootOptions> {
  const mode = options.mode ?? "flare";
  const md = rootModeDefaults(mode);
  return {
    seed: options.seed ?? 7,
    mode,
    count: options.count ?? 6,
    collarRadius: options.collarRadius ?? 0.4,
    length: options.length ?? 2.5,
    radius: options.radius ?? 0.12,
    steps: options.steps ?? 20,
    wander: options.wander ?? 0.5,
    gravity: options.gravity ?? -1, // sentinel => mode default
    spread: options.spread ?? md.spread,
    branches: options.branches ?? 3,
    branchDepth: options.branchDepth ?? 2,
    sides: options.sides ?? 7,
    origin: options.origin ?? vec3(0, 0, 0),
  };
}

/**
 * Grow the root strand hierarchy: `count` primaries fan radially off the collar,
 * each diving down + out; children (rootlets) sprout partway along and thin.
 * Deterministic for a given seed.
 */
export function growRootStrands(options: RootOptions = {}): RootStrand[] {
  const opts = resolveRoot(options);
  const md = rootModeDefaults(opts.mode);
  const gravity = opts.gravity >= 0 ? opts.gravity : md.gravity;
  const rng = makeRng(opts.seed);
  const strands: RootStrand[] = [];

  const grow = (
    from: Vec3,
    dir: Vec3,
    len: number,
    radius: number,
    depth: number,
    childBudget: number,
  ): void => {
    const steps = Math.max(6, Math.round(opts.steps * (len / opts.length)));
    const curve = growRootStrand(rng, from, dir, len, steps, gravity, opts.wander * md.wanderScale);
    strands.push({ curve, radius, depth });
    if (depth >= opts.branchDepth || childBudget <= 0) return;
    for (let c = 0; c < childBudget; c++) {
      const t = 0.25 + rng.next() * 0.55; // sprout along the mid span
      const { pos, tangent } = sampleCurve(curve, t);
      // veer to a seeded side, biased further downward for rootlets
      const kick = normalize(
        vec3(rng.next() - 0.5, -(0.2 + rng.next() * 0.5), rng.next() - 0.5),
      );
      const childDir = normalize(add(scale(tangent, 0.5), scale(kick, 0.9)));
      const childLen = len * (0.4 + rng.next() * 0.3);
      const childRadius = radius * 0.55;
      const nextBudget = Math.max(0, Math.floor(childBudget / 2));
      grow(pos, childDir, childLen, childRadius, depth + 1, nextBudget);
    }
  };

  const spread = Math.max(0, Math.min(1, opts.spread));
  for (let p = 0; p < opts.count; p++) {
    const frac = opts.count > 1 ? p / opts.count : 0;
    const a = frac * TAU + (rng.next() - 0.5) * 0.5;
    const outward = vec3(Math.cos(a), 0, Math.sin(a));
    // start on the collar ring, heading down + out per the spread weight
    const start = add(opts.origin, scale(outward, opts.collarRadius));
    const heading = normalize(add(scale(outward, spread), vec3(0, -(1 - spread), 0)));
    const len = opts.length * (0.75 + rng.next() * 0.5);
    grow(start, heading, len, opts.radius, 0, opts.branches);
  }
  return strands;
}

/** Sweep all root strands into one merged tapering-tube mesh. */
export function buildRootMesh(options: RootOptions = {}): Mesh {
  const opts = resolveRoot(options);
  const strands = growRootStrands(options);
  const tubes = strands.map((s) =>
    sweep(s.curve, {
      radius: s.radius,
      sides: opts.sides,
      // roots taper hard toward the tip (rootlets almost vanish)
      radiusAt: (t) => Math.max(0.05, 1 - t * 0.92),
      caps: false,
    }),
  );
  return merge(...tubes);
}

/**
 * Build a full root system as named parts (one woody root part). Ready for the
 * viewer / OBJ export. Deterministic for a given seed.
 */
export function buildRootsParts(options: RootOptions = {}): NamedPart[] {
  const opts = resolveRoot(options);
  const strands = growRootStrands(options);
  const tubes = strands.map((s) =>
    sweep(s.curve, {
      radius: s.radius,
      sides: opts.sides,
      radiusAt: (t) => Math.max(0.05, 1 - t * 0.92),
      caps: false,
    }),
  );
  return [
    {
      name: "roots",
      label: "根系",
      mesh: merge(...tubes),
      color: [0.28, 0.19, 0.11],
      surface: { type: "wood", params: { tone: [0.28, 0.19, 0.11] } },
    },
  ];
}

/** Named root recipes — distinct silhouettes from the one generator. */
export const ROOT_PRESETS: Record<string, RootOptions> = {
  // Classic buttress root flare at a tree base.
  flare: { seed: 7, mode: "flare", count: 7, length: 2.6, radius: 0.13, branches: 3 },
  // Roots exposed on an eroded embankment, clinging near-horizontal.
  erosion: { seed: 14, mode: "erosion", count: 8, length: 2.8, radius: 0.09, collarRadius: 0.25, branches: 4, wander: 0.7 },
  // A single dominant taproot plunging down with fine laterals.
  taproot: { seed: 21, mode: "taproot", count: 3, length: 3.4, radius: 0.16, collarRadius: 0.2, branches: 4 },
};

/** Build one root preset by name. Falls back to the flare. */
export function buildRootPreset(name: string, override: RootOptions = {}): NamedPart[] {
  const base = ROOT_PRESETS[name] ?? ROOT_PRESETS.flare!;
  return buildRootsParts({ ...base, ...override });
}
