/**
 * Scatter upgrade (P13): blue-noise (Poisson-disk) surface distribution plus
 * per-instance random transforms (scale jitter, Y-rotation, normal align).
 *
 * Blue noise avoids the clumping of pure-random scatter — instances keep a
 * minimum spacing, which looks far more natural for grass/rocks/foliage.
 * Implemented as Mitchell's best-candidate (no spatial grid needed, robust on
 * arbitrary triangle meshes).
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, merge } from "./mesh.js";
import { translateMesh } from "./transform.js";

export interface PoissonScatterOptions {
  count: number;
  seed?: number;
  /** Candidates per accepted point; higher = better spacing, slower. */
  candidates?: number;
  /** Random uniform scale range [min,max] per instance. */
  scaleRange?: [number, number];
  /** Random Y rotation per instance. */
  randomYaw?: boolean;
  /** Align instance +Y to surface normal. */
  alignToNormal?: boolean;
}

interface SurfaceSample {
  point: Vec3;
  normal: Vec3;
}

/** Sample one uniform point on the surface (area-weighted). */
function sampleSurface(target: Mesh, cum: Float64Array, total: number, rng: Rng): SurfaceSample {
  const triCount = cum.length;
  const r = rng.next() * total;
  let lo = 0, hi = triCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < r) lo = mid + 1;
    else hi = mid;
  }
  const t = lo;
  const a = target.positions[target.indices[t * 3]!]!;
  const b = target.positions[target.indices[t * 3 + 1]!]!;
  const c = target.positions[target.indices[t * 3 + 2]!]!;
  let u = rng.next();
  let v = rng.next();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const point = add(add(a, scale(sub(b, a), u)), scale(sub(c, a), v));
  const normal = normalize(cross(sub(b, a), sub(c, a)));
  return { point, normal };
}

/**
 * Blue-noise scatter of `instance` across `target` using best-candidate
 * sampling, with optional per-instance scale/rotation.
 */
export function poissonScatter(
  target: Mesh,
  instance: Mesh,
  opts: PoissonScatterOptions,
): Mesh {
  const count = Math.max(0, Math.floor(opts.count));
  if (count === 0) return merge();
  const rng = makeRng(opts.seed ?? 0);
  const candidates = Math.max(1, Math.floor(opts.candidates ?? 8));
  const [smin, smax] = opts.scaleRange ?? [1, 1];
  const randomYaw = opts.randomYaw ?? false;
  const alignToNormal = opts.alignToNormal ?? true;

  // Cumulative area table.
  const triCount = target.indices.length / 3;
  const cum = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    total += length(cross(sub(b, a), sub(c, a))) * 0.5;
    cum[t] = total;
  }
  if (total === 0) return merge();

  // Best-candidate: each new point is the candidate farthest from existing.
  const accepted: SurfaceSample[] = [];
  for (let i = 0; i < count; i++) {
    let best: SurfaceSample | null = null;
    let bestDist = -1;
    const tries = accepted.length === 0 ? 1 : candidates;
    for (let c = 0; c < tries; c++) {
      const cand = sampleSurface(target, cum, total, rng);
      let minD = Infinity;
      for (const a of accepted) {
        const d = length(sub(cand.point, a.point));
        if (d < minD) minD = d;
      }
      if (minD > bestDist) { bestDist = minD; best = cand; }
    }
    if (best) accepted.push(best);
  }

  // Place instances.
  const placed: Mesh[] = [];
  for (const sample of accepted) {
    const s = smin + rng.next() * (smax - smin);
    const yaw = randomYaw ? rng.next() * Math.PI * 2 : 0;
    let inst = transformInstance(instance, s, yaw);
    if (alignToNormal) inst = alignYTo(inst, sample.normal);
    placed.push(translateMesh(inst, sample.point));
  }
  return placed.length ? merge(...placed) : merge();
}

function transformInstance(mesh: Mesh, s: number, yaw: number): Mesh {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rotY = (p: Vec3): Vec3 => vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  return makeMesh({
    positions: mesh.positions.map((p) => rotY(scale(p, s))),
    normals: mesh.normals.map((n) => rotY(n)),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

function alignYTo(mesh: Mesh, dir: Vec3): Mesh {
  const up = vec3(0, 1, 0);
  const d = normalize(dir);
  const c = dot(up, d);
  if (c > 0.9999) return mesh;
  if (c < -0.9999) {
    return makeMesh({
      positions: mesh.positions.map((p) => vec3(p.x, -p.y, p.z)),
      normals: mesh.normals.map((n) => vec3(n.x, -n.y, n.z)),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      indices: mesh.indices.slice(),
    });
  }
  const axis = normalize(cross(up, d));
  const angle = Math.acos(c);
  const rot = (p: Vec3): Vec3 => {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return add(
      add(scale(p, cosA), scale(cross(axis, p), sinA)),
      scale(axis, dot(axis, p) * (1 - cosA)),
    );
  };
  return makeMesh({
    positions: mesh.positions.map(rot),
    normals: mesh.normals.map(rot),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}
