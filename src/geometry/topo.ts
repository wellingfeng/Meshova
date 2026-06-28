/**
 * P0 topology core — the adjacency layer DCC editors (Maya / 3ds Max / Blender)
 * build their edit tools on. The indexed triangle `Mesh` stays the render/export
 * format; topological operators convert to `TopoMesh`, do their work, then
 * convert back with `fromTopo`.
 *
 * A `TopoMesh` fuses coincident vertices into shared *points*, keeps faces as
 * ordered point loops (triangles for now), and exposes edge/face adjacency so
 * operators can ask: which faces share this edge, where are the open borders,
 * which edges are "hard" (sharp dihedral angle).
 *
 * Immutable by convention like the rest of the kernel: builders return new
 * structures and never mutate inputs.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec3, dot, normalize, length } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh } from "./mesh.js";

/** An undirected edge between two points, plus the faces that use it. */
export interface TopoEdge {
  /** Lower point index. */
  a: number;
  /** Higher point index. */
  b: number;
  /** Faces incident to this edge (1 = border, 2 = manifold interior, >2 = non-manifold). */
  faces: number[];
}

/**
 * Topology view of a mesh: fused points, polygon faces (CCW), and edge
 * adjacency. `pointOfVertex` maps original mesh vertices to fused points so we
 * can carry per-vertex attributes (uvs) back out.
 */
export interface TopoMesh {
  /** Fused point positions. */
  points: Vec3[];
  /** Faces as ordered loops of point indices (length 3 for triangles). */
  faces: number[][];
  /** Edge key "a_b" (a<b) -> edge record. */
  edges: Map<string, TopoEdge>;
  /** Original UV per fused point (first occurrence wins). */
  uvOfPoint: Vec2[];
}

/** Canonical undirected edge key. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

const QUANT = 1e5;
function posKey(p: Vec3): string {
  return `${Math.round(p.x * QUANT)},${Math.round(p.y * QUANT)},${Math.round(p.z * QUANT)}`;
}

/**
 * Build a `TopoMesh` from an indexed triangle `Mesh`, fusing vertices that
 * share a position (within a quantization tolerance). Each triangle becomes a
 * 3-point face; edge adjacency is recorded for every face side.
 */
export function toTopo(mesh: Mesh): TopoMesh {
  const points: Vec3[] = [];
  const uvOfPoint: Vec2[] = [];
  const keyToPoint = new Map<string, number>();
  const pointOfVertex = new Array<number>(mesh.positions.length);

  for (let v = 0; v < mesh.positions.length; v++) {
    const p = mesh.positions[v]!;
    const k = posKey(p);
    let pt = keyToPoint.get(k);
    if (pt === undefined) {
      pt = points.length;
      keyToPoint.set(k, pt);
      points.push({ ...p });
      uvOfPoint.push({ ...(mesh.uvs[v] ?? { x: 0, y: 0 }) });
    }
    pointOfVertex[v] = pt;
  }

  const faces: number[][] = [];
  const edges = new Map<string, TopoEdge>();
  const triCount = mesh.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const pa = pointOfVertex[mesh.indices[t * 3]!]!;
    const pb = pointOfVertex[mesh.indices[t * 3 + 1]!]!;
    const pc = pointOfVertex[mesh.indices[t * 3 + 2]!]!;
    // Skip triangles that collapsed to a degenerate after fusing.
    if (pa === pb || pb === pc || pc === pa) continue;
    const fi = faces.length;
    faces.push([pa, pb, pc]);
    registerEdge(edges, pa, pb, fi);
    registerEdge(edges, pb, pc, fi);
    registerEdge(edges, pc, pa, fi);
  }

  return { points, faces, edges, uvOfPoint };
}

function registerEdge(edges: Map<string, TopoEdge>, a: number, b: number, face: number): void {
  const key = edgeKey(a, b);
  const ex = edges.get(key);
  if (ex) ex.faces.push(face);
  else edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [face] });
}

/** Recompute the edge map from the current `faces` (after edits). */
export function rebuildEdges(topo: TopoMesh): void {
  topo.edges = new Map<string, TopoEdge>();
  for (let f = 0; f < topo.faces.length; f++) {
    const loop = topo.faces[f]!;
    for (let i = 0; i < loop.length; i++) {
      registerEdge(topo.edges, loop[i]!, loop[(i + 1) % loop.length]!, f);
    }
  }
}

/** Geometric normal of a face (Newell's method — robust for n-gons). */
export function faceNormal(topo: TopoMesh, face: number): Vec3 {
  const loop = topo.faces[face]!;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const cur = topo.points[loop[i]!]!;
    const nxt = topo.points[loop[(i + 1) % loop.length]!]!;
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const n = vec3(nx, ny, nz);
  return length(n) > 0 ? normalize(n) : vec3(0, 1, 0);
}

/** Centroid of a face. */
export function faceCentroid(topo: TopoMesh, face: number): Vec3 {
  const loop = topo.faces[face]!;
  let x = 0, y = 0, z = 0;
  for (const p of loop) {
    const pt = topo.points[p]!;
    x += pt.x; y += pt.y; z += pt.z;
  }
  const inv = 1 / loop.length;
  return vec3(x * inv, y * inv, z * inv);
}

/** True if an edge is on a boundary (used by exactly one face). */
export function isBorderEdge(edge: TopoEdge): boolean {
  return edge.faces.length === 1;
}

/**
 * Border (boundary) loops: chains of edges that bound an opening in the mesh.
 * Each returned loop is an ordered list of point indices. Used by bridge / cap
 * / fill operators. A closed manifold returns an empty array.
 */
export function boundaryLoops(topo: TopoMesh): number[][] {
  // Collect border half-edges in face winding order so loops come out oriented.
  const borderNext = new Map<number, number>();
  for (let f = 0; f < topo.faces.length; f++) {
    const loop = topo.faces[f]!;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const e = topo.edges.get(edgeKey(a, b));
      if (e && isBorderEdge(e)) borderNext.set(a, b);
    }
  }
  const loops: number[][] = [];
  const visited = new Set<number>();
  for (const start of borderNext.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur) && borderNext.has(cur) && guard++ < borderNext.size + 1) {
      visited.add(cur);
      loop.push(cur);
      cur = borderNext.get(cur)!;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/**
 * Hard (sharp) edges: interior edges whose two faces meet at a dihedral angle
 * sharper than `angleDeg`. This is the selection `bevelEdges` / `selectEdgesByAngle`
 * feed on. Border edges count as hard.
 */
export function hardEdges(topo: TopoMesh, angleDeg = 30): TopoEdge[] {
  const cosThresh = Math.cos((angleDeg * Math.PI) / 180);
  const out: TopoEdge[] = [];
  for (const e of topo.edges.values()) {
    if (e.faces.length === 1) {
      out.push(e);
    } else if (e.faces.length === 2) {
      const n0 = faceNormal(topo, e.faces[0]!);
      const n1 = faceNormal(topo, e.faces[1]!);
      if (dot(n0, n1) < cosThresh) out.push(e);
    }
  }
  return out;
}

/** Faces whose normal points within `angleDeg` of `dir` (e.g. all up-facing). */
export function selectFacesByNormal(topo: TopoMesh, dir: Vec3, angleDeg = 45): number[] {
  const d = normalize(dir);
  const cosThresh = Math.cos((angleDeg * Math.PI) / 180);
  const out: number[] = [];
  for (let f = 0; f < topo.faces.length; f++) {
    if (dot(faceNormal(topo, f), d) >= cosThresh) out.push(f);
  }
  return out;
}

/** Map every point to the faces that use it (point -> face adjacency). */
export function pointToFaces(topo: TopoMesh): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let f = 0; f < topo.faces.length; f++) {
    for (const p of topo.faces[f]!) {
      const arr = m.get(p);
      if (arr) arr.push(f);
      else m.set(p, [f]);
    }
  }
  return m;
}

/**
 * Grow a face selection by one ring: add every face that shares at least one
 * point with the current selection. DCC "grow selection". Repeat `steps` times.
 */
export function growSelection(topo: TopoMesh, faces: number[], steps = 1): number[] {
  const adj = pointToFaces(topo);
  let cur = new Set(faces);
  for (let s = 0; s < steps; s++) {
    const next = new Set(cur);
    for (const f of cur) {
      for (const p of topo.faces[f]!) {
        for (const nf of adj.get(p) ?? []) next.add(nf);
      }
    }
    cur = next;
  }
  return [...cur].sort((a, b) => a - b);
}

/**
 * Shrink a face selection by one ring: drop any selected face that touches a
 * non-selected face (i.e. keep only interior faces). DCC "shrink selection".
 */
export function shrinkSelection(topo: TopoMesh, faces: number[], steps = 1): number[] {
  const adj = pointToFaces(topo);
  let cur = new Set(faces);
  for (let s = 0; s < steps; s++) {
    const next = new Set<number>();
    for (const f of cur) {
      let interior = true;
      for (const p of topo.faces[f]!) {
        for (const nf of adj.get(p) ?? []) {
          if (!cur.has(nf)) { interior = false; break; }
        }
        if (!interior) break;
      }
      if (interior) next.add(f);
    }
    cur = next;
  }
  return [...cur].sort((a, b) => a - b);
}

/**
 * Boundary faces of a selection: selected faces that border at least one
 * unselected face. Useful for ringing/insetting just the rim of a region.
 */
export function selectionBoundary(topo: TopoMesh, faces: number[]): number[] {
  const sel = new Set(faces);
  const adj = pointToFaces(topo);
  const out: number[] = [];
  for (const f of sel) {
    let onBoundary = false;
    for (const p of topo.faces[f]!) {
      for (const nf of adj.get(p) ?? []) {
        if (!sel.has(nf)) { onBoundary = true; break; }
      }
      if (onBoundary) break;
    }
    if (onBoundary) out.push(f);
  }
  return out.sort((a, b) => a - b);
}

/** Manifold / cleanliness diagnostics for a topology. */
export interface TopoDiagnostics {
  pointCount: number;
  faceCount: number;
  edgeCount: number;
  borderEdges: number;
  nonManifoldEdges: number;
  boundaryLoops: number;
  isClosed: boolean;
}

export function diagnose(topo: TopoMesh): TopoDiagnostics {
  let border = 0;
  let nonManifold = 0;
  for (const e of topo.edges.values()) {
    if (e.faces.length === 1) border++;
    else if (e.faces.length > 2) nonManifold++;
  }
  return {
    pointCount: topo.points.length,
    faceCount: topo.faces.length,
    edgeCount: topo.edges.size,
    borderEdges: border,
    nonManifoldEdges: nonManifold,
    boundaryLoops: boundaryLoops(topo).length,
    isClosed: border === 0 && nonManifold === 0,
  };
}

/**
 * Convert a `TopoMesh` back to an indexed triangle `Mesh`. Faces are fan-
 * triangulated (fine for convex polys produced by these operators). Normals are
 * left flat per-face; callers should run `computeNormals`/`recomputeNormals`.
 */
export function fromTopo(topo: TopoMesh): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let f = 0; f < topo.faces.length; f++) {
    const loop = topo.faces[f]!;
    if (loop.length < 3) continue;
    const n = faceNormal(topo, f);
    const base = positions.length;
    for (const p of loop) {
      positions.push({ ...topo.points[p]! });
      normals.push({ ...n });
      uvs.push({ ...(topo.uvOfPoint[p] ?? { x: 0, y: 0 }) });
    }
    // Fan triangulation.
    for (let i = 1; i < loop.length - 1; i++) {
      indices.push(base, base + i, base + i + 1);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * Weld points closer than `tolerance` and drop degenerate faces. Returns the
 * cleaned topology plus warnings describing what was removed — operators can
 * surface these to the AI loop instead of silently emitting bad geometry.
 */
export interface CleanupResult {
  topo: TopoMesh;
  warnings: string[];
}

export function cleanupTopo(topo: TopoMesh, tolerance = 1e-4): CleanupResult {
  const warnings: string[] = [];
  const q = 1 / Math.max(tolerance, 1e-9);
  const keyToNew = new Map<string, number>();
  const remap = new Array<number>(topo.points.length);
  const points: Vec3[] = [];
  const uvOfPoint: Vec2[] = [];
  for (let i = 0; i < topo.points.length; i++) {
    const p = topo.points[i]!;
    const k = `${Math.round(p.x * q)},${Math.round(p.y * q)},${Math.round(p.z * q)}`;
    let ni = keyToNew.get(k);
    if (ni === undefined) {
      ni = points.length;
      keyToNew.set(k, ni);
      points.push({ ...p });
      uvOfPoint.push({ ...(topo.uvOfPoint[i] ?? { x: 0, y: 0 }) });
    }
    remap[i] = ni;
  }
  let welded = topo.points.length - points.length;
  if (welded > 0) warnings.push(`welded ${welded} coincident point(s)`);

  const faces: number[][] = [];
  let dropped = 0;
  for (const loop of topo.faces) {
    const nl: number[] = [];
    for (const p of loop) {
      const r = remap[p]!;
      if (nl.length === 0 || nl[nl.length - 1] !== r) nl.push(r);
    }
    if (nl.length >= 2 && nl[0] === nl[nl.length - 1]) nl.pop();
    if (nl.length < 3) { dropped++; continue; }
    faces.push(nl);
  }
  if (dropped > 0) warnings.push(`dropped ${dropped} degenerate face(s)`);

  const out: TopoMesh = { points, faces, edges: new Map(), uvOfPoint };
  rebuildEdges(out);
  return { topo: out, warnings };
}

/**
 * Connectivity / islands (Houdini `connectivity`): label each face with the id
 * of the connected component (island) it belongs to. Faces are connected when
 * they share a point. Returns one id per face plus the island count — the basis
 * for per-island randomization (color, scale, deletion) that makes scattered
 * geometry look hand-varied instead of cloned.
 */
export function connectivity(topo: TopoMesh): { faceIsland: number[]; count: number } {
  const nf = topo.faces.length;
  const faceIsland = new Array<number>(nf).fill(-1);
  const p2f = pointToFaces(topo);

  let island = 0;
  for (let start = 0; start < nf; start++) {
    if (faceIsland[start] !== -1) continue;
    // Flood fill from this unvisited face.
    const stack = [start];
    faceIsland[start] = island;
    while (stack.length > 0) {
      const f = stack.pop()!;
      for (const p of topo.faces[f]!) {
        for (const nf2 of p2f.get(p) ?? []) {
          if (faceIsland[nf2] === -1) {
            faceIsland[nf2] = island;
            stack.push(nf2);
          }
        }
      }
    }
    island++;
  }
  return { faceIsland, count: island };
}

/**
 * Per-point island ids, derived from face connectivity. Convenient when you
 * want to drive a vertex field (e.g. tint each island differently).
 */
export function pointIslands(topo: TopoMesh): { pointIsland: number[]; count: number } {
  const { faceIsland, count } = connectivity(topo);
  const pointIsland = new Array<number>(topo.points.length).fill(0);
  for (let f = 0; f < topo.faces.length; f++) {
    for (const p of topo.faces[f]!) pointIsland[p] = faceIsland[f]!;
  }
  return { pointIsland, count };
}
