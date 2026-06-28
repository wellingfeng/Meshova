/**
 * Measurement + size-matching utilities (Houdini `measure` / `matchsize` /
 * `bound`). Professional procedural setups measure first, then place by relative
 * size — never by hard-coded coordinates. These let AI scripts assemble
 * multi-part models robustly: center a part, fit it into a target box, or align
 * one mesh's bounds to another's. Per-face area also feeds area-weighted
 * scatter and curvature-aware operations.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, sub, add, scale, cross, length } from "../math/vec3.js";
import type { Mesh, Bounds } from "./mesh.js";
import { makeMesh, bounds } from "./mesh.js";

/** Size of a bounds box (max - min) per axis. */
export function boundsSize(b: Bounds): Vec3 {
  return sub(b.max, b.min);
}

/** Center point of a bounds box. */
export function boundsCenter(b: Bounds): Vec3 {
  return scale(add(b.min, b.max), 0.5);
}

/** Area of every triangle, indexed by triangle number (indices/3). */
export function faceAreas(m: Mesh): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.positions[m.indices[i]!]!;
    const b = m.positions[m.indices[i + 1]!]!;
    const c = m.positions[m.indices[i + 2]!]!;
    out.push(0.5 * length(cross(sub(b, a), sub(c, a))));
  }
  return out;
}

/** Total surface area of the mesh. */
export function surfaceArea(m: Mesh): number {
  let total = 0;
  for (const a of faceAreas(m)) total += a;
  return total;
}

/** Translate so the mesh bounding-box center sits at `target` (default origin). */
export function centerOn(m: Mesh, target: Vec3 = vec3(0, 0, 0)): Mesh {
  const c = boundsCenter(bounds(m));
  const d = sub(target, c);
  return remap(m, (p) => add(p, d));
}

/** Translate so the mesh sits on the Y=0 ground plane (min.y -> 0), centered in XZ. */
export function groundMesh(m: Mesh): Mesh {
  const b = bounds(m);
  const c = boundsCenter(b);
  const d = vec3(-c.x, -b.min.y, -c.z);
  return remap(m, (p) => add(p, d));
}

export interface MatchSizeOptions {
  /** Per-axis scaling: true keeps aspect by fitting inside the box. */
  uniform?: boolean;
  /** Re-center the result on the target box center. */
  recenter?: boolean;
}

/**
 * Scale (and optionally recenter) a mesh so its bounds match a target size box.
 * With `uniform` (default) it fits inside the box keeping aspect ratio — the
 * common case for dropping a part into a slot without distortion.
 */
export function fitInto(m: Mesh, targetSize: Vec3, opts: MatchSizeOptions = {}): Mesh {
  const uniform = opts.uniform ?? true;
  const recenter = opts.recenter ?? true;
  const b = bounds(m);
  const size = boundsSize(b);
  const center = boundsCenter(b);
  const sx = size.x > 1e-9 ? targetSize.x / size.x : 1;
  const sy = size.y > 1e-9 ? targetSize.y / size.y : 1;
  const sz = size.z > 1e-9 ? targetSize.z / size.z : 1;
  const s = uniform
    ? (() => { const k = Math.min(sx, sy, sz); return vec3(k, k, k); })()
    : vec3(sx, sy, sz);
  return remap(m, (p) => {
    const local = sub(p, center);
    const scaled = vec3(local.x * s.x, local.y * s.y, local.z * s.z);
    return recenter ? scaled : add(scaled, center);
  });
}

/** Match one mesh's bounds size to another mesh's bounds (Houdini matchsize). */
export function matchSize(m: Mesh, reference: Mesh, opts: MatchSizeOptions = {}): Mesh {
  return fitInto(m, boundsSize(bounds(reference)), opts);
}

function remap(m: Mesh, fn: (p: Vec3) => Vec3): Mesh {
  return makeMesh({
    positions: m.positions.map(fn),
    normals: m.normals.map((n) => ({ ...n })),
    uvs: m.uvs.map((u) => ({ ...u })),
    indices: [...m.indices],
  });
}

/**
 * Per-vertex discrete convexity/curvature in [0..1], for edge-wear and
 * dirt/cavity masks. Estimated from the spread of incident face normals: a flat
 * region's neighboring faces share a normal (curvature ~0); a sharp convex edge
 * fans the normals out (curvature ~1).
 *
 * Hard-surface meshes SPLIT vertices along sharp edges (a cube has 24 verts, not
 * 8), so accumulating by vertex index would see only one face direction per
 * vertex and report zero curvature exactly where the wear should be. We instead
 * accumulate by spatial POSITION (quantized hash), so all faces meeting at an
 * edge contribute, then scatter the per-position curvature back to each vertex.
 * Cheap, deterministic, mesh-only — every model gets edge wear for free.
 */
export function computeVertexCurvature(m: Mesh, opts: { gain?: number; weld?: number } = {}): number[] {
  const gain = opts.gain ?? 2.0;
  const weld = opts.weld ?? 1e-4;
  const n = m.positions.length;

  // Map each vertex to a welded position id.
  const key = (p: Vec3) =>
    `${Math.round(p.x / weld)},${Math.round(p.y / weld)},${Math.round(p.z / weld)}`;
  const posId: number[] = new Array(n);
  const idOf = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = key(m.positions[i]!);
    let id = idOf.get(k);
    if (id === undefined) { id = idOf.size; idOf.set(k, id); }
    posId[i] = id;
  }
  const np = idOf.size;
  const sumN: Vec3[] = new Array(np);
  const cnt: number[] = new Array(np).fill(0);
  for (let i = 0; i < np; i++) sumN[i] = vec3(0, 0, 0);

  const faceN: Vec3[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const ia = m.indices[i]!, ib = m.indices[i + 1]!, ic = m.indices[i + 2]!;
    const a = m.positions[ia]!, b = m.positions[ib]!, c = m.positions[ic]!;
    let fn = cross(sub(b, a), sub(c, a));
    const len = length(fn) || 1;
    fn = scale(fn, 1 / len);
    faceN.push(fn);
    for (const v of [ia, ib, ic]) {
      const pid = posId[v]!;
      sumN[pid] = add(sumN[pid]!, fn);
      cnt[pid]!++;
    }
  }
  const meanN = sumN.map((s, i) => {
    const c = cnt[i] || 1;
    const avg = scale(s, 1 / c);
    const l = length(avg) || 1;
    return scale(avg, 1 / l);
  });

  const dev: number[] = new Array(np).fill(0);
  let fi = 0;
  for (let i = 0; i < m.indices.length; i += 3, fi++) {
    const fn = faceN[fi]!;
    for (const v of [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!]) {
      const pid = posId[v]!;
      const d = 1 - Math.max(-1, Math.min(1, dotV(fn, meanN[pid]!)));
      dev[pid]! += d;
    }
  }
  const curvPos: number[] = new Array(np).fill(0);
  for (let i = 0; i < np; i++) {
    const c = cnt[i] || 1;
    curvPos[i] = Math.max(0, Math.min(1, (dev[i]! / c) * gain));
  }
  // Scatter back to per-vertex.
  const out: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = curvPos[posId[i]!]!;
  return out;
}

function dotV(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
