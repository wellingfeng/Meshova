/**
 * Leaf cards — SpeedTree's final layer, ported.
 *
 * A leaf is a quad (optionally a cross of two perpendicular quads so it reads
 * from any angle). `scatterLeaves` distributes cards along the terminal
 * branches, orienting them outward + upward with random yaw, scaled and jittered
 * deterministically. Cards carry UVs (0..1) so an alpha leaf texture maps on.
 *
 * Determinism: one seed drives all placement; no Math.random.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize, lerpVec3, makeBasis, length } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, merge } from "../geometry/mesh.js";
import { makeRng } from "../random/prng.js";
import type { BranchSegment } from "./branch.js";
import { curveFrameAt, rotateAround } from "./curve-frame.js";
import { curve1D, type Curve1DInput } from "./curve-param.js";

/**
 * A single leaf quad centered at `center`, facing `normal`, with `up` defining
 * the long axis. Width/height in world units. UVs span 0..1.
 */
export function leafCard(center: Vec3, normal: Vec3, up: Vec3, width: number, height: number): Mesh {
  const n = normalize(normal);
  // Build an in-plane basis from up projected onto the card plane.
  let u = add(up, scale(n, -dot(up, n)));
  if (length(u) < 1e-6) u = makeBasis(n).x;
  u = normalize(u);
  const right = normalize(cross(u, n));
  const hw = width / 2;
  const positions: Vec3[] = [
    add(add(center, scale(right, -hw)), scale(u, 0)),       // bottom-left (at stem)
    add(add(center, scale(right, hw)), scale(u, 0)),        // bottom-right
    add(add(center, scale(right, hw)), scale(u, height)),   // top-right
    add(add(center, scale(right, -hw)), scale(u, height)),  // top-left
  ];
  const normals = [n, n, n, n];
  const uvs = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
  const indices = [0, 1, 2, 0, 2, 3];
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * A crossed pair of leaf quads (perpendicular) so the leaf cluster stays
 * visible from any viewing angle — SpeedTree's classic billboard trick.
 */
export function crossQuad(center: Vec3, normal: Vec3, up: Vec3, width: number, height: number): Mesh {
  const a = leafCard(center, normal, up, width, height);
  const perpNormal = normalize(cross(normalize(normal), normalize(up)));
  const b = leafCard(center, perpNormal, up, width, height);
  return merge(a, b);
}

export type LeafShape = "quad" | "oval" | "lanceolate" | "teardrop" | "round";

export interface LeafMeshOptions {
  shape?: Exclude<LeafShape, "quad">;
  /** Cross-section samples along the leaf midrib. */
  segments?: number;
  /** Tip curl along the leaf normal, in leaf-height units. */
  curl?: number;
  /** Side fold along the leaf normal, in leaf-width units. */
  fold?: number;
}

/**
 * A real leaf blade mesh: shaped outline + UVs + optional curl/fold. Use this
 * when silhouette matters more than a rectangular alpha card.
 */
export function leafMesh(
  center: Vec3,
  normal: Vec3,
  up: Vec3,
  width: number,
  height: number,
  opts: LeafMeshOptions = {},
): Mesh {
  const n = normalize(normal);
  let u = add(up, scale(n, -dot(up, n)));
  if (length(u) < 1e-6) u = makeBasis(n).x;
  u = normalize(u);
  const right = normalize(cross(u, n));
  const shape = opts.shape ?? "oval";
  const segments = Math.max(3, Math.floor(opts.segments ?? 7));
  const curl = opts.curl ?? 0;
  const fold = opts.fold ?? 0;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const hw = (width * 0.5) * leafWidthProfile(shape, t);
    const curlOffset = curl * height * 0.18 * t * t;
    const foldOffset = fold * width * 0.22 * Math.sin(Math.PI * t);
    for (const side of [-1, 1] as const) {
      const pos = add(
        add(center, scale(u, height * t)),
        add(scale(right, hw * side), scale(n, curlOffset + foldOffset)),
      );
      positions.push(pos);
      normals.push(n);
      uvs.push(vec2(side < 0 ? 0 : 1, t));
    }
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  return makeMesh({ positions, normals, uvs, indices });
}

export function crossLeafMesh(
  center: Vec3,
  normal: Vec3,
  up: Vec3,
  width: number,
  height: number,
  opts: LeafMeshOptions = {},
): Mesh {
  const a = leafMesh(center, normal, up, width, height, opts);
  const perpNormal = normalize(cross(normalize(normal), normalize(up)));
  const b = leafMesh(center, perpNormal, up, width, height, opts);
  return merge(a, b);
}

export interface ScatterLeavesOptions {
  seed?: number;
  /** Leaves placed per terminal branch. */
  perBranch?: number;
  /** Card width in world units. */
  size?: number;
  /** Card aspect ratio (height/width). */
  aspect?: number;
  /** Random scale variation (0..1). */
  sizeJitter?: number;
  /** Blend of card facing toward world-up vs branch-outward (0..1). */
  upBias?: number;
  /** Use crossed quads instead of single cards. */
  cross?: boolean;
  /** Only place leaves past this fraction along each terminal branch (0..1). */
  startPct?: number;
  /** Quad card or shaped procedural blade. */
  shape?: LeafShape;
  /** Shape sample count for non-quad leaves. */
  leafSegments?: number;
  /** Tip curl for non-quad leaves. */
  curl?: number;
  /** Side fold for non-quad leaves. */
  fold?: number;
  /** Per-branch count multiplier, sampled from branch attachT. */
  densityProfile?: Curve1DInput;
}

/**
 * Scatter leaf cards along the terminal branches of a branch set. Returns a
 * single merged mesh of all leaves.
 */
export function scatterLeaves(branches: BranchSegment[], opts: ScatterLeavesOptions = {}): Mesh {
  const perBranch = Math.max(0, Math.floor(opts.perBranch ?? 6));
  const size = opts.size ?? 0.15;
  const aspect = opts.aspect ?? 1.4;
  const sizeJitter = opts.sizeJitter ?? 0.3;
  const upBias = opts.upBias ?? 0.5;
  const useCross = opts.cross ?? true;
  const startPct = opts.startPct ?? 0.4;
  const shape = opts.shape ?? "quad";
  const densityProfile = curve1D(opts.densityProfile, 1);
  const rng = makeRng(opts.seed ?? 99);
  const UP = vec3(0, 1, 0);

  const cards: Mesh[] = [];
  for (let bi = 0; bi < branches.length; bi++) {
    const b = branches[bi]!;
    if (!b.terminal) continue;
    const count = Math.max(0, Math.round(perBranch * densityProfile(b.attachT ?? 1, bi)));
    for (let i = 0; i < count; i++) {
      const t = startPct + (1 - startPct) * ((i + rng.next()) / Math.max(1, count));
      const frame = curveFrameAt(b.curve, Math.min(1, t));
      // Facing: blend branch outward normal toward world up.
      const facing = normalize(lerpVec3(frame.normal, UP, upBias));
      // Random yaw around the branch tangent so leaves fan around the twig.
      const yaw = rng.next() * Math.PI * 2;
      const rolledNormal = rotateAround(facing, frame.tangent, yaw);
      const up = normalize(lerpVec3(frame.tangent, UP, 0.5));
      const s = size * (1 - sizeJitter + rng.next() * sizeJitter * 2);
      const instanceOpts: LeafInstanceOptions = { shape, cross: useCross };
      if (opts.leafSegments !== undefined) instanceOpts.leafSegments = opts.leafSegments;
      if (opts.curl !== undefined) instanceOpts.curl = opts.curl;
      if (opts.fold !== undefined) instanceOpts.fold = opts.fold;
      const card = makeLeafInstance(frame.position, rolledNormal, up, s, s * aspect, instanceOpts);
      cards.push(card);
    }
  }
  return cards.length ? merge(...cards) : merge();
}

// Local vec3 helpers to avoid import churn.
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function makeLeafInstance(
  center: Vec3,
  normal: Vec3,
  up: Vec3,
  width: number,
  height: number,
  opts: LeafInstanceOptions,
): Mesh {
  if (opts.shape === "quad") {
    return opts.cross
      ? crossQuad(center, normal, up, width, height)
      : leafCard(center, normal, up, width, height);
  }
  const meshOpts: LeafMeshOptions = { shape: opts.shape };
  if (opts.leafSegments !== undefined) meshOpts.segments = opts.leafSegments;
  if (opts.curl !== undefined) meshOpts.curl = opts.curl;
  if (opts.fold !== undefined) meshOpts.fold = opts.fold;
  return opts.cross
    ? crossLeafMesh(center, normal, up, width, height, meshOpts)
    : leafMesh(center, normal, up, width, height, meshOpts);
}

interface LeafInstanceOptions {
  shape: LeafShape;
  cross: boolean;
  leafSegments?: number;
  curl?: number;
  fold?: number;
}

function leafWidthProfile(shape: Exclude<LeafShape, "quad">, t: number): number {
  const s = Math.sin(Math.PI * clamp01(t));
  if (shape === "lanceolate") return Math.pow(s, 1.35) * (0.75 + 0.25 * t);
  if (shape === "teardrop") return Math.pow(s, 0.8) * (1.25 - 0.45 * t);
  if (shape === "round") return Math.pow(s, 0.45);
  return Math.pow(s, 0.7);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
