/**
 * Surface query — VEX parity (xyzdist, minpos, nearpoint, primuv,
 * distance_pointsegment, distance_pointline). Closest-point queries against
 * an indexed triangle mesh.
 *
 * Used by the image-to-model pipeline to measure how far a target point sits
 * from the current surface (a geometric loss term alongside silhouette IoU),
 * and to snap/project points onto the mesh.
 */
import type { Vec3 } from "../math/vec3.js";
import {
  sub,
  add,
  scale,
  dot,
  cross,
  length,
  lengthSq,
} from "../math/vec3.js";
import type { Mesh } from "./mesh.js";

export interface ClosestPoint {
  /** Closest position on the surface. */
  position: Vec3;
  /** Triangle index (0-based) that owns the closest point. */
  prim: number;
  /** Barycentric-ish uv within that triangle (u along edge0, v along edge1). */
  uv: { u: number; v: number };
  /** Distance from the query point to `position`. */
  distance: number;
}

/** VEX `distance_pointsegment`: closest point on segment [a,b] to p. */
export function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const denom = lengthSq(ab);
  if (denom === 0) return a;
  let t = dot(sub(p, a), ab) / denom;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return add(a, scale(ab, t));
}

/** VEX `distance_pointline`: distance from p to the infinite line through a,b. */
export function distancePointLine(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const denom = lengthSq(ab);
  if (denom === 0) return length(sub(p, a));
  const t = dot(sub(p, a), ab) / denom;
  return length(sub(p, add(a, scale(ab, t))));
}

/**
 * Closest point on a single triangle to p, with barycentric region test
 * (Ericson, Real-Time Collision Detection — re-derived). Returns position
 * and uv where the point = a + u*(b-a) + v*(c-a).
 */
export function closestPointOnTriangle(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): { position: Vec3; u: number; v: number } {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { position: a, u: 0, v: 0 };

  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { position: b, u: 1, v: 0 };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { position: add(a, scale(ab, v)), u: v, v: 0 };
  }

  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { position: c, u: 0, v: 1 };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { position: add(a, scale(ac, w)), u: 0, v: w };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const pos = add(b, scale(sub(c, b), w));
    return { position: pos, u: 1 - w, v: w };
  }

  // inside face region
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return { position: add(a, add(scale(ab, v), scale(ac, w))), u: v, v: w };
}

/**
 * VEX `minpos` / `xyzdist`: closest point on the whole mesh to p.
 * Brute-force over all triangles — fine for the moderate mesh sizes Meshova
 * produces. Returns position, owning prim, uv and distance.
 */
export function closestPointOnMesh(mesh: Mesh, p: Vec3): ClosestPoint {
  const { positions, indices } = mesh;
  let best: ClosestPoint = {
    position: positions[0] ?? { x: 0, y: 0, z: 0 },
    prim: 0,
    uv: { u: 0, v: 0 },
    distance: Infinity,
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = positions[indices[t]!]!;
    const b = positions[indices[t + 1]!]!;
    const c = positions[indices[t + 2]!]!;
    const r = closestPointOnTriangle(p, a, b, c);
    const d = length(sub(p, r.position));
    if (d < best.distance) {
      best = {
        position: r.position,
        prim: t / 3,
        uv: { u: r.u, v: r.v },
        distance: d,
      };
    }
  }
  return best;
}

/** VEX `xyzdist`: just the distance from p to the mesh surface. */
export function xyzdist(mesh: Mesh, p: Vec3): number {
  return closestPointOnMesh(mesh, p).distance;
}

/** VEX `minpos`: just the closest position on the mesh surface. */
export function minpos(mesh: Mesh, p: Vec3): Vec3 {
  return closestPointOnMesh(mesh, p).position;
}

/**
 * VEX `nearpoint`: index of the nearest mesh vertex (point) to p.
 * Returns -1 for an empty mesh.
 */
export function nearpoint(mesh: Mesh, p: Vec3): number {
  const { positions } = mesh;
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = lengthSq(sub(p, positions[i]!));
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export interface RayHit {
  /** Distance along the ray direction (t >= 0). */
  t: number;
  /** Hit position. */
  position: Vec3;
  /** Triangle index that was hit. */
  prim: number;
  /** Barycentric coords within the triangle (u along edge1, v along edge2). */
  uv: { u: number; v: number };
}

/**
 * VEX `intersect` (single triangle): Möller–Trumbore ray/triangle test.
 * Returns the hit t (>=0) or -1 on miss. dir need not be normalized; t is in
 * units of dir length. Culling is disabled (hits both faces).
 */
export function rayTriangle(
  origin: Vec3,
  dir: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): { t: number; u: number; v: number } | null {
  const EPS = 1e-9;
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (det > -EPS && det < EPS) return null; // parallel
  const inv = 1 / det;
  const tvec = sub(origin, a);
  const u = dot(tvec, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(tvec, e1);
  const v = dot(dir, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  if (t < 0) return null;
  return { t, u, v };
}

/**
 * VEX `intersect` (whole mesh): nearest forward hit of a ray against the mesh.
 * Returns null on miss. dir is treated in its own length units.
 */
export function rayMesh(mesh: Mesh, origin: Vec3, dir: Vec3): RayHit | null {
  const { positions, indices } = mesh;
  let best: RayHit | null = null;
  for (let i = 0; i < indices.length; i += 3) {
    const a = positions[indices[i]!]!;
    const b = positions[indices[i + 1]!]!;
    const c = positions[indices[i + 2]!]!;
    const hit = rayTriangle(origin, dir, a, b, c);
    if (hit && (best === null || hit.t < best.t)) {
      best = {
        t: hit.t,
        position: add(origin, scale(dir, hit.t)),
        prim: i / 3,
        uv: { u: hit.u, v: hit.v },
      };
    }
  }
  return best;
}

/**
 * Count forward ray hits — building block for inside tests and `windingnumber`
 * style parity checks.
 */
export function countRayHits(mesh: Mesh, origin: Vec3, dir: Vec3): number {
  const { positions, indices } = mesh;
  let count = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = positions[indices[i]!]!;
    const b = positions[indices[i + 1]!]!;
    const c = positions[indices[i + 2]!]!;
    if (rayTriangle(origin, dir, a, b, c)) count++;
  }
  return count;
}

/**
 * Point-in-mesh test via parity ray casting (odd crossings = inside).
 * Assumes a closed, watertight mesh. Casts along +X by default; a tiny jitter
 * avoids degenerate edge/vertex grazes. Approximates VEX `windingnumber > 0.5`.
 */
export function isPointInside(mesh: Mesh, p: Vec3): boolean {
  // Three near-axis directions; majority vote guards against edge grazes.
  const dirs: Vec3[] = [
    { x: 1, y: 0.0001, z: 0.00007 },
    { x: 0.0001, y: 1, z: 0.00005 },
    { x: 0.00003, y: 0.00009, z: 1 },
  ];
  let votes = 0;
  for (const d of dirs) {
    if (countRayHits(mesh, p, d) % 2 === 1) votes++;
  }
  return votes >= 2;
}

/**
 * VEX `primuv`: interpolate a per-vertex attribute at a (u,v) location inside
 * triangle `prim`, where the point = v0 + u*(v1-v0) + v2*(v2-v0).
 * Works on the mesh's own positions, normals or uvs by passing the array.
 */
export function primuvVec3(
  mesh: Mesh,
  attr: ReadonlyArray<Vec3>,
  prim: number,
  u: number,
  v: number,
): Vec3 {
  const i = prim * 3;
  const a = attr[mesh.indices[i]!]!;
  const b = attr[mesh.indices[i + 1]!]!;
  const c = attr[mesh.indices[i + 2]!]!;
  // barycentric weights: w0 for a, u for b, v for c
  const w0 = 1 - u - v;
  return {
    x: a.x * w0 + b.x * u + c.x * v,
    y: a.y * w0 + b.y * u + c.y * v,
    z: a.z * w0 + b.z * u + c.z * v,
  };
}

/**
 * Interpolated surface position at the closest point to p — convenience that
 * pairs `closestPointOnMesh` with `primuv` so the AI can read off any attribute
 * (e.g. the interpolated normal at the projected point).
 */
export function sampleNormalAt(mesh: Mesh, p: Vec3): Vec3 {
  const cp = closestPointOnMesh(mesh, p);
  return primuvVec3(mesh, mesh.normals, cp.prim, cp.uv.u, cp.uv.v);
}


