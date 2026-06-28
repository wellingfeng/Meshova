/**
 * Catmull-Clark subdivision surface (P11): smooth subdivision that rounds a
 * blocky mesh toward a limit surface. Self-written from the standard
 * Catmull-Clark rules (face points, edge points, vertex repositioning).
 *
 * Input is our triangle mesh; we weld coincident vertices first (primitives
 * duplicate verts at seams), subdivide topologically into quads, apply the
 * smoothing rules, then triangulate quads back for rendering.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

interface Topo {
  verts: Vec3[];
  /** Each face is a list of vertex indices (triangles after weld). */
  faces: number[][];
}

/** Weld vertices that share a position (within epsilon) into one index. */
function weld(mesh: Mesh, eps = 1e-5): Topo {
  const verts: Vec3[] = [];
  const map = new Map<string, number>();
  const remap = new Array<number>(mesh.positions.length);
  const key = (p: Vec3) =>
    `${Math.round(p.x / eps)}_${Math.round(p.y / eps)}_${Math.round(p.z / eps)}`;
  mesh.positions.forEach((p, i) => {
    const k = key(p);
    let idx = map.get(k);
    if (idx === undefined) {
      idx = verts.length;
      verts.push({ ...p });
      map.set(k, idx);
    }
    remap[i] = idx;
  });
  const faces: number[][] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]!]!;
    const b = remap[mesh.indices[i + 1]!]!;
    const c = remap[mesh.indices[i + 2]!]!;
    if (a !== b && b !== c && a !== c) faces.push([a, b, c]);
  }
  return { verts, faces };
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** One Catmull-Clark step. Returns quad topology (faces are 4-index). */
function catmullClarkStep(topo: Topo): { verts: Vec3[]; quads: number[][] } {
  const { verts, faces } = topo;

  // 1. Face points: centroid of each face.
  const facePoints: Vec3[] = faces.map((f) => {
    let c = vec3(0, 0, 0);
    for (const vi of f) c = add(c, verts[vi]!);
    return scale(c, 1 / f.length);
  });

  // Build edge -> incident faces and endpoints.
  interface EdgeInfo { a: number; b: number; faces: number[]; }
  const edgeMap = new Map<string, EdgeInfo>();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]!;
      const b = f[(i + 1) % f.length]!;
      const k = edgeKey(a, b);
      let e = edgeMap.get(k);
      if (!e) { e = { a, b, faces: [] }; edgeMap.set(k, e); }
      e.faces.push(fi);
    }
  });

  // 2. Edge points: average of edge endpoints + adjacent face points
  //    (boundary edges just use the edge midpoint).
  const edgePointIndex = new Map<string, number>();
  const edgePoints: Vec3[] = [];
  for (const [k, e] of edgeMap) {
    const mid = scale(add(verts[e.a]!, verts[e.b]!), 0.5);
    let ep: Vec3;
    if (e.faces.length === 2) {
      const fp = add(facePoints[e.faces[0]!]!, facePoints[e.faces[1]!]!);
      ep = scale(add(scale(add(verts[e.a]!, verts[e.b]!), 1), fp), 0.25);
    } else {
      ep = mid;
    }
    edgePointIndex.set(k, edgePoints.length);
    edgePoints.push(ep);
  }

  // 3. Reposition original vertices.
  //    Interior: (F + 2R + (n-3)P) / n, F=avg adj face pts, R=avg edge mids.
  //    Boundary: (P*6 + sum of boundary edge mids) / 8 style crease rule.
  const vertFaces: number[][] = verts.map(() => []);
  faces.forEach((f, fi) => { for (const vi of f) vertFaces[vi]!.push(fi); });
  const vertEdges: Map<number, Set<string>> = new Map();
  for (const [k, e] of edgeMap) {
    if (!vertEdges.has(e.a)) vertEdges.set(e.a, new Set());
    if (!vertEdges.has(e.b)) vertEdges.set(e.b, new Set());
    vertEdges.get(e.a)!.add(k);
    vertEdges.get(e.b)!.add(k);
  }

  const newVerts: Vec3[] = verts.map((P, vi) => {
    const edges = [...(vertEdges.get(vi) ?? [])].map((k) => edgeMap.get(k)!);
    const boundaryEdges = edges.filter((e) => e.faces.length === 1);
    if (boundaryEdges.length > 0) {
      // crease/boundary rule
      let sum = scale(P, 6);
      for (const e of boundaryEdges) {
        const other = e.a === vi ? e.b : e.a;
        sum = add(sum, verts[other]!);
      }
      return scale(sum, 1 / (6 + boundaryEdges.length));
    }
    const fcs = vertFaces[vi]!;
    const n = fcs.length;
    if (n === 0) return { ...P };
    let F = vec3(0, 0, 0);
    for (const fi of fcs) F = add(F, facePoints[fi]!);
    F = scale(F, 1 / n);
    let R = vec3(0, 0, 0);
    for (const e of edges) R = add(R, scale(add(verts[e.a]!, verts[e.b]!), 0.5));
    R = scale(R, 1 / edges.length);
    // (F + 2R + (n-3)P) / n
    const sum = add(add(F, scale(R, 2)), scale(P, n - 3));
    return scale(sum, 1 / n);
  });

  // 4. Assemble new vertex list: [movedOriginals, facePoints, edgePoints].
  const outVerts: Vec3[] = [...newVerts, ...facePoints, ...edgePoints];
  const faceBase = newVerts.length;
  const edgeBase = faceBase + facePoints.length;

  // 5. Each face -> one quad per corner: V, edge(V,next), facePt, edge(prev,V).
  const quads: number[][] = [];
  faces.forEach((f, fi) => {
    const fp = faceBase + fi;
    for (let i = 0; i < f.length; i++) {
      const v = f[i]!;
      const next = f[(i + 1) % f.length]!;
      const prev = f[(i - 1 + f.length) % f.length]!;
      const eNext = edgeBase + edgePointIndex.get(edgeKey(v, next))!;
      const ePrev = edgeBase + edgePointIndex.get(edgeKey(prev, v))!;
      quads.push([v, eNext, fp, ePrev]);
    }
  });

  return { verts: outVerts, quads };
}

/**
 * Apply Catmull-Clark subdivision `iterations` times and return a triangle
 * mesh with recomputed smooth normals. UVs are reset to a planar projection
 * (Catmull-Clark does not preserve the original UVs meaningfully).
 */
export function catmullClark(mesh: Mesh, iterations = 1): Mesh {
  let topo = weld(mesh);
  let quads: number[][] = topo.faces.map((f) => f); // not used until step
  for (let it = 0; it < Math.max(1, Math.floor(iterations)); it++) {
    const step = catmullClarkStep(topo);
    topo = { verts: step.verts, faces: step.quads };
    quads = step.quads;
  }

  // Triangulate quads (and any polys) into the final mesh.
  const positions: Vec3[] = topo.verts.map((v) => ({ ...v }));
  const indices: number[] = [];
  for (const f of quads) {
    for (let i = 1; i < f.length - 1; i++) {
      indices.push(f[0]!, f[i]!, f[i + 1]!);
    }
  }
  const normals = positions.map(() => vec3(0, 1, 0));
  // simple planar UV from XZ bounds
  const uvs = positions.map((p) => vec2(p.x, p.z));
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}
