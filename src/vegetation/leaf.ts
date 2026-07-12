/**
 * Leaf cards — SpeedTree's final layer, ported.
 *
 * A leaf is a shaped blade by default. Explicit quad/crossed-card modes remain
 * for alpha-textured foliage and distant impostors. `scatterLeaves` distributes leaves along the terminal
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
import type { BranchPlacementMode } from "./branch.js";

/**
 * A single leaf quad rooted at `center`, facing `normal`, with `up` defining
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
  /** Fake normals away from the card plane so flat cards shade like a round crown. */
  roundedNormals?: boolean;
}

/**
 * A real leaf blade mesh rooted at `center`: shaped outline + UVs + curl/fold. Use this
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
  const roundedNormals = opts.roundedNormals ?? false;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const hw = (width * 0.5) * leafWidthProfile(shape, t);
    const curlOffset = curl * height * 0.18 * t * t;
    const foldOffset = fold * width * 0.22 * Math.sin(Math.PI * t);
    for (const side of [-1, 0, 1] as const) {
      const pos = add(
        add(center, scale(u, height * t)),
        add(scale(right, hw * side), scale(n, curlOffset + foldOffset * Math.abs(side))),
      );
      positions.push(pos);
      normals.push(roundedNormals ? normalize(add(n, add(scale(right, side * 0.35), scale(u, (t - 0.45) * 0.35)))) : n);
      uvs.push(vec2((side + 1) * 0.5, t));
    }
  }

  for (let i = 0; i < segments; i++) {
    const left = i * 3;
    const mid = left + 1;
    const rightIndex = left + 2;
    const nextLeft = left + 3;
    const nextMid = left + 4;
    const nextRight = left + 5;
    indices.push(left, mid, nextLeft, mid, nextMid, nextLeft);
    indices.push(mid, rightIndex, nextMid, rightIndex, nextRight, nextMid);
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
  /** Leaf scale multiplier sampled over normalized position along each terminal branch. */
  scaleProfile?: Curve1DInput;
  /** Blend of card facing toward world-up vs branch-outward (0..1). */
  upBias?: number;
  /** Use crossed quads instead of single cards. */
  cross?: boolean;
  /** Only place leaves past this fraction along each terminal branch (0..1). */
  startPct?: number;
  /** Quad card or shaped procedural blade. */
  shape?: LeafShape;
  /** Deterministically choose among several procedural leaf resources. */
  shapeVariants?: LeafShape[];
  /** Leaf long-axis angle relative to its default twig orientation, in degrees. */
  angle?: number;
  /** Symmetric random angle variation, in degrees. */
  angleJitter?: number;
  /** Shape sample count for non-quad leaves. */
  leafSegments?: number;
  /** Tip curl for non-quad leaves. */
  curl?: number;
  /** Side fold for non-quad leaves. */
  fold?: number;
  /** Per-branch count multiplier, sampled from branch attachT. */
  densityProfile?: Curve1DInput;
  /** Leaf placement along each terminal branch. */
  placement?: BranchPlacementMode;
  /** Fake normals away from the card plane so flat leaves shade fuller. */
  roundedNormals?: boolean;
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
  const shape = opts.shape ?? "oval";
  const shapeVariants = opts.shapeVariants?.length ? opts.shapeVariants : undefined;
  const scaleProfile = curve1D(opts.scaleProfile, 1);
  const angle = opts.angle ?? 0;
  const angleJitter = Math.max(0, opts.angleJitter ?? 0);
  const startPct = opts.startPct ?? 0.4;
  const densityProfile = curve1D(opts.densityProfile, 1);
  const placement = opts.placement ?? "golden";
  const rng = makeRng(opts.seed ?? 99);
  const UP = vec3(0, 1, 0);

  const cards: Mesh[] = [];
  for (let bi = 0; bi < branches.length; bi++) {
    const b = branches[bi]!;
    if (!b.terminal) continue;
    const count = Math.max(0, Math.round(perBranch * densityProfile(b.attachT ?? 1, bi)));
    for (let i = 0; i < count; i++) {
      const t = leafT(i, count, startPct, placement, rng);
      const frame = curveFrameAt(b.curve, Math.min(1, t));
      // Facing: blend branch outward normal toward world up.
      const facing = normalize(lerpVec3(frame.normal, UP, upBias));
      // Random yaw around the branch tangent so leaves fan around the twig.
      const yaw = rng.next() * Math.PI * 2;
      const rolledNormal = rotateAround(facing, frame.tangent, yaw);
      const baseUp = normalize(lerpVec3(frame.tangent, UP, 0.5));
      const leafAngle = (angle + (rng.next() * 2 - 1) * angleJitter) * Math.PI / 180;
      const up = rotateAround(baseUp, rolledNormal, leafAngle);
      const leafIndex = bi * 1000003 + i;
      const profileScale = Math.max(0, scaleProfile(t, leafIndex));
      const s = size * profileScale * (1 - sizeJitter + rng.next() * sizeJitter * 2);
      const selectedShape = shapeVariants
        ? shapeVariants[Math.min(shapeVariants.length - 1, Math.floor(rng.next() * shapeVariants.length))]!
        : shape;
      const instanceOpts: LeafInstanceOptions = {
        shape: selectedShape,
        cross: opts.cross ?? selectedShape === "quad",
      };
      if (opts.leafSegments !== undefined) instanceOpts.leafSegments = opts.leafSegments;
      if (opts.curl !== undefined) instanceOpts.curl = opts.curl;
      if (opts.fold !== undefined) instanceOpts.fold = opts.fold;
      if (opts.roundedNormals !== undefined) instanceOpts.roundedNormals = opts.roundedNormals;
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
    const card = opts.cross
      ? crossQuad(center, normal, up, width, height)
      : leafCard(center, normal, up, width, height);
    return opts.roundedNormals ? roundLeafNormals(card, center, up, width, height) : card;
  }
  const meshOpts: LeafMeshOptions = { shape: opts.shape };
  if (opts.leafSegments !== undefined) meshOpts.segments = opts.leafSegments;
  if (opts.curl !== undefined) meshOpts.curl = opts.curl;
  if (opts.fold !== undefined) meshOpts.fold = opts.fold;
  if (opts.roundedNormals !== undefined) meshOpts.roundedNormals = opts.roundedNormals;
  return opts.cross
    ? crossLeafMesh(center, normal, up, width, height, meshOpts)
    : leafMesh(center, normal, up, width, height, meshOpts);
}

/*
 * Keep rounded normals as shading data only. Geometry remains card/leaf mesh,
 * so LOD counts and UVs stay stable.
 */
export function roundLeafNormals(mesh: Mesh, center: Vec3, up: Vec3, width: number, height: number): Mesh {
  const upUnit = normalize(up);
  const normals = mesh.positions.map((p, i) => {
    const base = mesh.normals[i] ?? vec3(0, 1, 0);
    const along = Math.max(0, Math.min(1, dot(add(p, scale(center, -1)), upUnit) / Math.max(1e-6, height)));
    const lateral = add(p, scale(add(center, scale(upUnit, along * height)), -1));
    const sideAmount = Math.min(1, length(lateral) / Math.max(1e-6, width * 0.5));
    return normalize(add(base, add(scale(upUnit, (along - 0.45) * 0.28), scale(normalize(lateral), sideAmount * 0.38))));
  });
  return {
    positions: mesh.positions.slice(),
    normals,
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  };
}

function leafT(i: number, count: number, startPct: number, placement: BranchPlacementMode, rng: ReturnType<typeof makeRng>): number {
  if (placement === "stratified-shuffled") {
    const slotSize = 1 / Math.max(1, count);
    const jitter = (rng.next() - 0.5) * slotSize * 0.7;
    return startPct + (1 - startPct) * clamp01((i + 0.5) * slotSize + jitter);
  }
  return startPct + (1 - startPct) * ((i + rng.next()) / Math.max(1, count));
}

interface LeafInstanceOptions {
  shape: LeafShape;
  cross: boolean;
  leafSegments?: number;
  curl?: number;
  fold?: number;
  roundedNormals?: boolean;
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
