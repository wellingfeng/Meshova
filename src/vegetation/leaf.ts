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
}

/**
 * Scatter leaf cards along the terminal branches of a branch set. Returns a
 * single merged mesh of all leaves.
 */
export function scatterLeaves(branches: BranchSegment[], opts: ScatterLeavesOptions = {}): Mesh {
  const perBranch = Math.max(1, Math.floor(opts.perBranch ?? 6));
  const size = opts.size ?? 0.15;
  const aspect = opts.aspect ?? 1.4;
  const sizeJitter = opts.sizeJitter ?? 0.3;
  const upBias = opts.upBias ?? 0.5;
  const useCross = opts.cross ?? true;
  const startPct = opts.startPct ?? 0.4;
  const rng = makeRng(opts.seed ?? 99);
  const UP = vec3(0, 1, 0);

  const cards: Mesh[] = [];
  for (const b of branches) {
    if (!b.terminal) continue;
    for (let i = 0; i < perBranch; i++) {
      const t = startPct + (1 - startPct) * ((i + rng.next()) / perBranch);
      const frame = curveFrameAt(b.curve, Math.min(1, t));
      // Facing: blend branch outward normal toward world up.
      const facing = normalize(lerpVec3(frame.normal, UP, upBias));
      // Random yaw around the branch tangent so leaves fan around the twig.
      const yaw = rng.next() * Math.PI * 2;
      const rolledNormal = rotateAround(facing, frame.tangent, yaw);
      const up = normalize(lerpVec3(frame.tangent, UP, 0.5));
      const s = size * (1 - sizeJitter + rng.next() * sizeJitter * 2);
      const card = useCross
        ? crossQuad(frame.position, rolledNormal, up, s, s * aspect)
        : leafCard(frame.position, rolledNormal, up, s, s * aspect);
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
