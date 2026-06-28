/**
 * blast (delete-by-selection) + cleanMesh (weld + degenerate removal).
 *
 * `blast` is the most frequent destructive operator in real Houdini files: keep
 * or delete triangles by a per-face predicate (group/normal/height/island).
 * `cleanMesh` is the standard post-boolean / post-merge tidy: fuse coincident
 * points and drop zero-area faces so downstream ops see clean topology.
 *
 * Pure by convention: return new meshes, never mutate input.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, cross, normalize, dot, length } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";
import { toTopo, fromTopo, cleanupTopo, connectivity } from "./topo.js";

/** Per-face data passed to a blast predicate. */
export interface FaceInfo {
  /** Triangle index (indices/3). */
  index: number;
  /** Face centroid. */
  center: Vec3;
  /** Geometric face normal (CCW). */
  normal: Vec3;
  /** Triangle area. */
  area: number;
  /** The three corner positions. */
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface BlastOptions {
  /** If true, keep the selected faces instead of deleting them. */
  keep?: boolean;
  /** Recompute vertex normals on the result (default true). */
  recompute?: boolean;
}

/**
 * Delete (or keep) triangles for which `predicate` returns true. By default the
 * selected faces are removed (Houdini blast). Set `keep:true` to invert and
 * keep only the selection.
 */
export function blast(
  mesh: Mesh,
  predicate: (f: FaceInfo) => boolean,
  opts: BlastOptions = {},
): Mesh {
  const keep = opts.keep ?? false;
  const recompute = opts.recompute ?? true;
  const triCount = mesh.indices.length / 3;

  const newIndices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    const a = mesh.positions[ia]!;
    const b = mesh.positions[ib]!;
    const c = mesh.positions[ic]!;
    const cr = cross(sub(b, a), sub(c, a));
    const info: FaceInfo = {
      index: t,
      center: vec3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3),
      normal: normalize(cr),
      area: 0.5 * length(cr),
      a, b, c,
    };
    const selected = predicate(info);
    // delete-mode: drop selected. keep-mode: drop unselected.
    if (keep ? selected : !selected) {
      newIndices.push(ia, ib, ic);
    }
  }

  // Rebuild with only referenced vertices to avoid orphan points.
  return compact(mesh, newIndices, recompute);
}

/** Delete faces whose normal points along `axis` within an angular threshold. */
export function blastByNormal(
  mesh: Mesh,
  axis: Vec3,
  threshold = 0.5,
  opts: BlastOptions = {},
): Mesh {
  const ax = normalize(axis);
  return blast(mesh, (f) => dot(f.normal, ax) >= threshold, opts);
}

/** Delete faces whose centroid is inside a height band along `axis`. */
export function blastByHeight(
  mesh: Mesh,
  axis: Vec3,
  min: number,
  max: number,
  opts: BlastOptions = {},
): Mesh {
  const ax = normalize(axis);
  return blast(mesh, (f) => {
    const h = dot(f.center, ax);
    return h >= min && h <= max;
  }, opts);
}

/** Keep only the island (connected component) with the given id. */
export function keepIsland(mesh: Mesh, islandId: number, opts: BlastOptions = {}): Mesh {
  const topo = toTopo(mesh);
  const { faceIsland } = connectivity(topo);
  // Map topo faces back is non-trivial; instead recompute per-triangle island
  // by point membership using the triangle's first vertex position match.
  // Simpler: use per-triangle centroid lookup via fromTopo is overkill, so we
  // reuse the triangle predicate against a point->island table.
  const triIsland = trianglesToIslands(mesh, topo, faceIsland);
  return blast(mesh, (f) => triIsland[f.index] === islandId, { ...opts, keep: true });
}

function trianglesToIslands(mesh: Mesh, topo: ReturnType<typeof toTopo>, faceIsland: number[]): number[] {
  // Build point-position -> island via topo faces.
  const QUANT = 1e4;
  const key = (p: Vec3) => `${Math.round(p.x * QUANT)},${Math.round(p.y * QUANT)},${Math.round(p.z * QUANT)}`;
  const posIsland = new Map<string, number>();
  for (let f = 0; f < topo.faces.length; f++) {
    for (const pi of topo.faces[f]!) {
      posIsland.set(key(topo.points[pi]!), faceIsland[f]!);
    }
  }
  const triCount = mesh.indices.length / 3;
  const out = new Array<number>(triCount).fill(-1);
  for (let t = 0; t < triCount; t++) {
    const p = mesh.positions[mesh.indices[t * 3]!]!;
    out[t] = posIsland.get(key(p)) ?? -1;
  }
  return out;
}

/**
 * Weld coincident points and drop degenerate faces. The standard cleanup after
 * boolean ops or merging many primitives. Welding fuses points within
 * `tolerance`; zero-area triangles (collapsed or colinear) are then removed.
 */
export function cleanMesh(mesh: Mesh, tolerance = 1e-4): Mesh {
  const topo = toTopo(mesh);
  const { topo: cleaned } = cleanupTopo(topo, tolerance);
  const welded = fromTopo(cleaned);
  // Drop remaining zero-area triangles (e.g. colinear but non-coincident).
  const areaEps = Math.max(tolerance * tolerance, 1e-12);
  return blast(welded, (f) => f.area <= areaEps, { recompute: true });
}

function compact(mesh: Mesh, indices: number[], recompute: boolean): Mesh {
  const remap = new Map<number, number>();
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const out: number[] = [];
  for (const idx of indices) {
    let ni = remap.get(idx);
    if (ni === undefined) {
      ni = positions.length;
      remap.set(idx, ni);
      positions.push({ ...mesh.positions[idx]! });
      normals.push({ ...mesh.normals[idx]! });
      uvs.push({ ...mesh.uvs[idx]! });
    }
    out.push(ni);
  }
  const m = makeMesh({ positions, normals, uvs, indices: out });
  return recompute ? recomputeNormals(m) : m;
}
