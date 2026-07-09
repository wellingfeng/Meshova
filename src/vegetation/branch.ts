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
import { vec3, add, scale, normalize } from "../math/vec3.js";
import type { Curve } from "../geometry/curve.js";
import { sweep, curveLength } from "../geometry/curve.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { vec2 } from "../math/vec2.js";
import { makeRng, type Rng } from "../random/prng.js";
import { curveFrameAt, growCurve, rotateAround } from "./curve-frame.js";
import { curve1D, type Curve1DFn, type Curve1DInput } from "./curve-param.js";

/** Golden angle in radians (~137.5deg) — natural phyllotaxis spacing. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface BranchSegment {
  /** Centerline of this branch. */
  curve: Curve;
  /** Recursion depth (0 = trunk, 1 = first-order branch, ...). */
  depth: number;
  /** Base radius of this branch. */
  radius: number;
  /** Parent-surface normal used for root attachment. */
  attachNormal?: Vec3;
  /** Parent curve parameter where this branch was seeded. */
  attachT?: number;
  /** Approximate parent surface radius at the attachment point. */
  parentRadius?: number;
  /** True if no children were spawned from it (leaf-bearing tip). */
  terminal: boolean;
}

export type BranchPlacementMode = "golden" | "stratified-shuffled";

export interface BranchLevelOptions {
  /** Children spawned for this branch generation. Alias: children. */
  count?: number;
  /** ez-tree-style alias for count. */
  children?: number;
  startPct?: number;
  endPct?: number;
  angle?: number;
  angleJitter?: number;
  phototropism?: number;
  gravity?: number;
  lengthScale?: number;
  radiusScale?: number;
  lengthProfile?: Curve1DInput;
  radiusProfile?: Curve1DInput;
  angleProfile?: Curve1DInput;
  countProfile?: Curve1DInput;
  childFalloff?: number;
  gnarl?: number;
  segments?: number;
}

export interface GrowBranchesOptions {
  seed?: number;
  /** Children spawned per parent at depth 0. Decreases with depth via childFalloff. */
  count?: number;
  /** Recursion depth (number of child generations to spawn). */
  depth?: number;
  /** Per-generation overrides, level 0 = first-order branches off the trunk. */
  levels?: BranchLevelOptions[];
  /** Branch placement along + around parent. */
  placement?: BranchPlacementMode;
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
  /** Multiplier over parent t for child branch length. */
  lengthProfile?: Curve1DInput;
  /** Multiplier over parent t for child branch radius. */
  radiusProfile?: Curve1DInput;
  /** Multiplier over parent t for outgoing angle. */
  angleProfile?: Curve1DInput;
  /** Multiplier over normalized recursion depth for child count. */
  countProfile?: Curve1DInput;
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
  lengthProfile: Curve1DFn;
  radiusProfile: Curve1DFn;
  angleProfile: Curve1DFn;
  countProfile: Curve1DFn;
  childFalloff: number;
  gnarl: number;
  segments: number;
  placement: BranchPlacementMode;
  levels: LevelConfig[];
}

interface LevelConfig {
  count?: number;
  startPct?: number;
  endPct?: number;
  angle?: number;
  angleJitter?: number;
  phototropism?: number;
  gravity?: number;
  lengthScale?: number;
  radiusScale?: number;
  lengthProfile?: Curve1DFn;
  radiusProfile?: Curve1DFn;
  angleProfile?: Curve1DFn;
  countProfile?: Curve1DFn;
  childFalloff?: number;
  gnarl?: number;
  segments?: number;
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
  const levels = (opts.levels ?? []).map(normalizeLevel);
  const cfg: GrowConfig = {
    count: opts.count ?? 6,
    depth: opts.depth ?? (levels.length > 0 ? levels.length : 3),
    startPct: opts.startPct ?? 0.3,
    endPct: opts.endPct ?? 0.95,
    angle: opts.angle ?? 50,
    angleJitter: opts.angleJitter ?? 12,
    phototropism: opts.phototropism ?? 0.35,
    gravity: opts.gravity ?? 0.1,
    lengthScale: opts.lengthScale ?? 0.7,
    radiusScale: opts.radiusScale ?? 0.6,
    lengthProfile: curve1D(opts.lengthProfile, 1),
    radiusProfile: curve1D(opts.radiusProfile, 1),
    angleProfile: curve1D(opts.angleProfile, 1),
    countProfile: curve1D(opts.countProfile, 1),
    childFalloff: opts.childFalloff ?? 0.7,
    gnarl: opts.gnarl ?? 0.15,
    segments: opts.segments ?? 6,
    placement: opts.placement ?? "golden",
    levels,
  };
  const rng = makeRng(opts.seed ?? 1234);
  const out: BranchSegment[] = [];
  const parentLen = Math.max(1e-4, curveLength(parent));
  spawnChildren(parent, parentLen, parentRadius, 0, initialCount(cfg), cfg, rng, out);
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
  const level = levelFor(cfg, childDepth - 1);
  const startPct = numberAtLevel(level, "startPct", cfg.startPct);
  const endPct = numberAtLevel(level, "endPct", cfg.endPct);
  const angle = numberAtLevel(level, "angle", cfg.angle);
  const angleJitter = numberAtLevel(level, "angleJitter", cfg.angleJitter);
  const phototropism = numberAtLevel(level, "phototropism", cfg.phototropism);
  const gravity = numberAtLevel(level, "gravity", cfg.gravity);
  const lengthScale = numberAtLevel(level, "lengthScale", cfg.lengthScale);
  const radiusScale = numberAtLevel(level, "radiusScale", cfg.radiusScale);
  const childFalloff = numberAtLevel(level, "childFalloff", cfg.childFalloff);
  const gnarl = numberAtLevel(level, "gnarl", cfg.gnarl);
  const segments = Math.max(2, Math.floor(numberAtLevel(level, "segments", cfg.segments)));
  const lengthProfile = level?.lengthProfile ?? cfg.lengthProfile;
  const radiusProfile = level?.radiusProfile ?? cfg.radiusProfile;
  const angleProfile = level?.angleProfile ?? cfg.angleProfile;
  const countProfile = level?.countProfile ?? cfg.countProfile;
  const jitterRad = (angleJitter * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    const placement = branchPlacement(i, count, parentDepth, startPct, endPct, cfg.placement, rng);
    const t = placement.t;
    const profileIndex = parentDepth * 1009 + i;
    const childLen = parentLen * lengthScale * Math.max(0.05, lengthProfile(t, profileIndex));
    const childRadius = parentRadius * radiusScale * Math.max(0.05, radiusProfile(t, profileIndex));
    const angleRad = (angle * Math.max(0.05, angleProfile(t, profileIndex)) * Math.PI) / 180;
    const roll = placement.roll;
    const frame = curveFrameAt(parent, t);

    // Out-going direction: rotate the parent tangent away by `angle` around a
    // side axis that is rolled around the tangent by the golden angle.
    const side = add(scale(frame.normal, Math.cos(roll)), scale(frame.binormal, Math.sin(roll)));
    const sideUnit = normalize(side);
    const jitter = (rng.next() * 2 - 1) * jitterRad;
    // Bend the tangent toward `sideUnit` by (angle + jitter).
    let dir = rotateAround(frame.tangent, normalize(cross3(frame.tangent, sideUnit)), angleRad + jitter);
    dir = normalize(add(dir, scale(sideUnit, 0.15))); // nudge outward so children fan out

    const parentSurfaceRadius = Math.max(childRadius * 0.75, parentRadius * parentRadiusScale(t));
    const start = add(frame.position, scale(sideUnit, parentSurfaceRadius));
    const branchSeed = rng.fork();
    const len = childLen * (0.8 + rng.next() * 0.4); // length variation
    const curve = growCurve(start, dir, len, {
      segments,
      phototropism,
      gravity,
      gnarl,
      seed: (branchSeed.next() * 1e9) | 0,
    });

    const depthT = childDepth / Math.max(1, cfg.depth);
    const fallbackCount = Math.round(count * childFalloff * Math.max(0, countProfile(depthT, profileIndex)));
    const childCount = countForLevel(cfg, childDepth, fallbackCount);
    const willRecurse = childDepth < cfg.depth && childCount >= 1;
    out.push({
      curve,
      depth: childDepth,
      radius: childRadius,
      attachNormal: sideUnit,
      attachT: t,
      parentRadius: parentSurfaceRadius,
      terminal: !willRecurse,
    });

    if (willRecurse) {
      spawnChildren(curve, len, childRadius, childDepth, childCount, cfg, branchSeed, out);
    }
  }
}

function normalizeLevel(level: BranchLevelOptions): LevelConfig {
  const out: LevelConfig = {};
  const count = level.count ?? level.children;
  if (count !== undefined) out.count = count;
  if (level.startPct !== undefined) out.startPct = level.startPct;
  if (level.endPct !== undefined) out.endPct = level.endPct;
  if (level.angle !== undefined) out.angle = level.angle;
  if (level.angleJitter !== undefined) out.angleJitter = level.angleJitter;
  if (level.phototropism !== undefined) out.phototropism = level.phototropism;
  if (level.gravity !== undefined) out.gravity = level.gravity;
  if (level.lengthScale !== undefined) out.lengthScale = level.lengthScale;
  if (level.radiusScale !== undefined) out.radiusScale = level.radiusScale;
  if (level.lengthProfile !== undefined) out.lengthProfile = curve1D(level.lengthProfile, 1);
  if (level.radiusProfile !== undefined) out.radiusProfile = curve1D(level.radiusProfile, 1);
  if (level.angleProfile !== undefined) out.angleProfile = curve1D(level.angleProfile, 1);
  if (level.countProfile !== undefined) out.countProfile = curve1D(level.countProfile, 1);
  if (level.childFalloff !== undefined) out.childFalloff = level.childFalloff;
  if (level.gnarl !== undefined) out.gnarl = level.gnarl;
  if (level.segments !== undefined) out.segments = level.segments;
  return out;
}

function levelFor(cfg: GrowConfig, index: number): LevelConfig | undefined {
  return cfg.levels[index];
}

function initialCount(cfg: GrowConfig): number {
  return Math.max(0, Math.floor(cfg.levels[0]?.count ?? cfg.count));
}

function countForLevel(cfg: GrowConfig, index: number, fallback: number): number {
  return Math.max(0, Math.floor(cfg.levels[index]?.count ?? fallback));
}

function numberAtLevel<K extends NumericLevelKey>(
  level: LevelConfig | undefined,
  key: K,
  fallback: number,
): number {
  return level?.[key] ?? fallback;
}

type NumericLevelKey = {
  [K in keyof LevelConfig]-?: LevelConfig[K] extends number | undefined ? K : never;
}[keyof LevelConfig];

function branchPlacement(
  i: number,
  count: number,
  parentDepth: number,
  startPct: number,
  endPct: number,
  mode: BranchPlacementMode,
  rng: Rng,
): { t: number; roll: number } {
  if (mode === "stratified-shuffled") {
    const slotSize = 1 / Math.max(1, count);
    const jitter = (rng.next() - 0.5) * slotSize * 0.7;
    const frac = clamp01((i + 0.5) * slotSize + jitter);
    const radial = shuffledSlot(i, count, parentDepth);
    const rollJitter = (rng.next() - 0.5) * (Math.PI * 2 / Math.max(1, count)) * 0.35;
    return {
      t: startPct + (endPct - startPct) * frac,
      roll: ((radial + 0.5) / Math.max(1, count)) * Math.PI * 2 + rollJitter,
    };
  }
  const frac = count > 1 ? i / (count - 1) : 0.5;
  return {
    t: startPct + (endPct - startPct) * frac,
    roll: i * GOLDEN_ANGLE,
  };
}

function shuffledSlot(i: number, count: number, depth: number): number {
  if (count <= 1) return 0;
  let stride = Math.max(1, Math.floor(count * 0.61803398875));
  while (gcd(stride, count) !== 1) stride++;
  return (i * stride + depth) % count;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
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
  /** Add a flared root collar where child branches emerge from parent bark. */
  flare?: boolean;
  /** Collar root radius multiplier relative to branch radius. */
  flareScale?: number;
  /** Fraction of the branch curve covered by the collar. */
  flareLength?: number;
  /** Bark-friendly UVs: U wraps around radius, V repeats by arc length. */
  barkUv?: boolean | BarkUvOptions;
}

export interface BarkUvOptions {
  /** World units per vertical texture repeat along the branch. */
  longitudinalScale?: number;
  /** World units per circumferential texture repeat around the branch. */
  radialScale?: number;
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
  const flare = opts.flare ?? true;
  const meshes: Mesh[] = [];
  for (const b of branches) {
    // Deeper / thinner branches get fewer sides (cheap LOD).
    const sides = Math.max(minSides, Math.round(maxSides - b.depth));
    if (flare) {
      const flareOpts: BranchFlareOptions = { sides };
      if (opts.flareScale !== undefined) flareOpts.flareScale = opts.flareScale;
      if (opts.flareLength !== undefined) flareOpts.flareLength = opts.flareLength;
      if (opts.barkUv) flareOpts.barkUv = opts.barkUv;
      meshes.push(branchFlareMesh(b, flareOpts));
    }
    const sweepOpts = {
      sides,
      radius: b.radius,
      radiusAt: (t: number) => taper(t, b.terminal),
      caps: false,
    };
    const mesh = opts.barkUv
      ? sweepBarkTube(b.curve, { ...sweepOpts, barkUv: barkOptions(opts.barkUv) })
      : sweep(b.curve, sweepOpts);
    meshes.push(mesh);
  }
  return meshes.length ? merge(...meshes) : merge();
}

export interface BranchFlareOptions {
  sides?: number;
  flareScale?: number;
  flareLength?: number;
  barkUv?: boolean | BarkUvOptions;
}

/**
 * Short flared collar at the branch root. This is not CSG welding; it is a
 * deterministic bark web that hides the pipe-intersection look and gives the
 * parent/child join a SpeedTree-style shoulder.
 */
export function branchFlareMesh(
  branch: BranchSegment,
  opts: BranchFlareOptions = {},
): Mesh {
  const pts = branch.curve.points;
  if (pts.length < 2) return merge();
  const sides = Math.max(3, Math.floor(opts.sides ?? 6));
  const flareScale = opts.flareScale ?? 1.85;
  const flareLength = opts.flareLength ?? 0.24;
  const endIndex = Math.max(1, Math.min(pts.length - 1, Math.ceil((pts.length - 1) * flareLength)));
  const collar: Curve = {
    points: pts.slice(0, endIndex + 1).map((p) => ({ ...p })),
    closed: false,
  };
  const sweepOpts = {
    sides,
    radius: branch.radius,
    radiusAt: (t: number) => 1 + (flareScale - 1) * (1 - smoothstep(t)),
    caps: false,
  };
  return opts.barkUv
    ? sweepBarkTube(collar, { ...sweepOpts, barkUv: barkOptions(opts.barkUv) })
    : sweep(collar, sweepOpts);
}

export interface SweepBarkTubeOptions {
  radius?: number;
  sides?: number;
  radiusAt?: (t: number) => number;
  caps?: boolean;
  barkUv?: BarkUvOptions;
}

export function sweepBarkTube(curve: Curve, opts: SweepBarkTubeOptions = {}): Mesh {
  const sides = Math.max(3, Math.floor(opts.sides ?? 12));
  const radius = opts.radius ?? 0.1;
  const radiusAt = opts.radiusAt ?? (() => 1);
  const mesh = sweep(curve, {
    sides,
    radius,
    radiusAt,
    caps: opts.caps ?? true,
  });
  return applyBarkUv(mesh, curve, sides, radius, radiusAt, opts.barkUv);
}

export function applyBarkUv(
  mesh: Mesh,
  curve: Curve,
  sides: number,
  radius: number,
  radiusAt: (t: number) => number,
  opts: BarkUvOptions = {},
): Mesh {
  const pts = curve.points;
  if (pts.length < 2) return mesh;
  const stride = sides + 1;
  const ringCount = pts.length;
  const ringVertexCount = ringCount * stride;
  const longitudinalScale = Math.max(1e-6, opts.longitudinalScale ?? 1);
  const radialScale = Math.max(1e-6, opts.radialScale ?? 1);
  const distances = arcDistances(curve);
  const uvs = mesh.uvs.map((uv) => ({ ...uv }));
  for (let i = 0; i < ringCount; i++) {
    const t = ringCount > 1 ? i / (ringCount - 1) : 0;
    const circumference = Math.PI * 2 * radius * Math.max(0, radiusAt(t));
    for (let j = 0; j <= sides; j++) {
      const idx = i * stride + j;
      uvs[idx] = vec2((j / sides) * (circumference / radialScale), distances[i]! / longitudinalScale);
    }
  }
  return {
    positions: mesh.positions.slice(),
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.length >= ringVertexCount ? uvs : mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  };
}

function arcDistances(curve: Curve): number[] {
  const pts = curve.points;
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    out.push(out[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return out;
}

function barkOptions(value: boolean | BarkUvOptions): BarkUvOptions {
  return value === true || value === false ? {} : value;
}

/** Radius profile along a branch: full at base, taper to a point at the tip. */
function taper(t: number, terminal: boolean): number {
  // Terminal branches taper fully to a tip; structural ones keep a little width
  // at the end so children join without a visible pinch.
  const tipScale = terminal ? 0.02 : 0.4;
  return 1 - (1 - tipScale) * smoothstep(t);
}

function parentRadiusScale(t: number): number {
  return 1 - 0.75 * smoothstep(t);
}

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
