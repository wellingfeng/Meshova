/**
 * P2 cutting operators — planar slice and a scriptable knife.
 *
 * DCC knife/multi-cut tools are interactive; for a deterministic script DSL the
 * useful primitive is a *plane cut*: split every triangle that straddles a
 * plane, then keep one side, both sides, or cap the opening. Repeated plane
 * cuts compose into the "panel lines / chamfered slices / sectioning" workflows
 * a knife is used for, while staying reproducible (same plane -> same result).
 *
 * Loop cut (insert a supporting edge ring) is also here: it subdivides a band
 * of faces along a plane without removing anything, the scriptable form of
 * Blender's Loop Cut / 3ds Max Connect.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, dot, normalize, length } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";
import { closestPointOnMesh, sampleNormalAt } from "./query.js";

export interface Plane {
  /** A point on the plane. */
  point: Vec3;
  /** Plane normal (need not be unit; normalized internally). */
  normal: Vec3;
}

export type CutKeep = "positive" | "negative" | "both";

export interface PlaneCutOptions {
  /** Which side(s) to keep, relative to the plane normal. Default "both". */
  keep?: CutKeep;
  /** Fill the cut cross-section with a cap polygon. Default false. */
  cap?: boolean;
}

interface VertexLite {
  pos: Vec3;
  uv: Vec2;
}

const EPS = 1e-7;

/**
 * Slice a mesh with an infinite plane. Triangles fully on one side are kept as
 * is; straddling triangles are split along the plane intersection. Returns a
 * new mesh containing the requested side(s), optionally capped.
 */
export function planeCut(mesh: Mesh, plane: Plane, opts: PlaneCutOptions = {}): Mesh {
  const keep = opts.keep ?? "both";
  const n = normalize(plane.normal);
  const d = dot(n, plane.point);
  const signedDist = (p: Vec3): number => dot(n, p) - d;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  // Edges that lie on the cut plane, for capping (pairs of world positions).
  const capEdges: Array<[Vec3, Vec3]> = [];

  const wantPos = keep === "positive" || keep === "both";
  const wantNeg = keep === "negative" || keep === "both";

  const emit = (tri: VertexLite[]): void => {
    const base = positions.length;
    for (const v of tri) {
      positions.push({ ...v.pos });
      normals.push(vec3(0, 1, 0));
      uvs.push({ ...v.uv });
    }
    indices.push(base, base + 1, base + 2);
  };

  const lerpV = (a: VertexLite, b: VertexLite, t: number): VertexLite => ({
    pos: add(a.pos, scale(sub(b.pos, a.pos), t)),
    uv: { x: a.uv.x + (b.uv.x - a.uv.x) * t, y: a.uv.y + (b.uv.y - a.uv.y) * t },
  });

  const triCount = mesh.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const verts: VertexLite[] = [];
    for (let k = 0; k < 3; k++) {
      const idx = mesh.indices[t * 3 + k]!;
      verts.push({ pos: mesh.positions[idx]!, uv: mesh.uvs[idx] ?? { x: 0, y: 0 } });
    }
    const dists = verts.map((v) => signedDist(v.pos));
    const sides = dists.map((dd) => (dd > EPS ? 1 : dd < -EPS ? -1 : 0));

    const allNonNeg = sides.every((s) => s >= 0);
    const allNonPos = sides.every((s) => s <= 0);
    if (allNonNeg) {
      if (wantPos) emit(verts);
      continue;
    }
    if (allNonPos) {
      if (wantNeg) emit(verts);
      continue;
    }

    // Straddling triangle: split into pos/neg polygons along the plane.
    const posPoly: VertexLite[] = [];
    const negPoly: VertexLite[] = [];
    const onPlane: VertexLite[] = [];
    for (let k = 0; k < 3; k++) {
      const cur = verts[k]!;
      const nxt = verts[(k + 1) % 3]!;
      const dc = dists[k]!;
      const dn = dists[(k + 1) % 3]!;
      if (dc >= -EPS) posPoly.push(cur);
      if (dc <= EPS) negPoly.push(cur);
      // Edge crosses the plane -> compute intersection vertex.
      if ((dc > EPS && dn < -EPS) || (dc < -EPS && dn > EPS)) {
        const tt = dc / (dc - dn);
        const ip = lerpV(cur, nxt, tt);
        posPoly.push(ip);
        negPoly.push(ip);
        onPlane.push(ip);
      }
    }
    if (onPlane.length === 2) capEdges.push([onPlane[0]!.pos, onPlane[1]!.pos]);
    if (wantPos) fanEmit(posPoly, emit);
    if (wantNeg) fanEmit(negPoly, emit);
  }

  if (opts.cap && capEdges.length >= 3) {
    capCrossSection(positions, normals, uvs, indices, capEdges, n);
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/** Fan-triangulate a small convex polygon (3 or 4 verts) and emit triangles. */
function fanEmit(poly: VertexLite[], emit: (tri: VertexLite[]) => void): void {
  for (let i = 1; i < poly.length - 1; i++) {
    emit([poly[0]!, poly[i]!, poly[i + 1]!]);
  }
}

/**
 * Cap the cut opening: order the cut-edge endpoints into a loop around their
 * centroid (projected onto the plane) and fan-triangulate. Works for a single
 * convex opening; multiple/holey sections may cap imperfectly.
 */
function capCrossSection(
  positions: Vec3[], normals: Vec3[], uvs: Vec2[], indices: number[],
  capEdges: Array<[Vec3, Vec3]>, planeN: Vec3,
): void {
  // Collect unique points.
  const pts: Vec3[] = [];
  const keyToIdx = new Map<string, number>();
  const keyOf = (p: Vec3) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  for (const [a, b] of capEdges) {
    for (const p of [a, b]) {
      const k = keyOf(p);
      if (!keyToIdx.has(k)) { keyToIdx.set(k, pts.length); pts.push(p); }
    }
  }
  if (pts.length < 3) return;
  // Centroid + a tangent basis on the plane.
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
  const c = vec3(cx / pts.length, cy / pts.length, cz / pts.length);
  let tangent = sub(pts[0]!, c);
  tangent = normalize(sub(tangent, scale(planeN, dot(tangent, planeN))));
  const bitan = normalize(cross(planeN, tangent));
  const ordered = pts
    .map((p) => {
      const dlt = sub(p, c);
      return { p, ang: Math.atan2(dot(dlt, bitan), dot(dlt, tangent)) };
    })
    .sort((u, v) => u.ang - v.ang)
    .map((o) => o.p);

  // Emit two caps (one per side winding) so "both" stays watertight-ish.
  for (const flip of [false, true]) {
    const base = positions.length;
    const cIdx = base;
    positions.push({ ...c });
    normals.push(flip ? scale(planeN, -1) : planeN);
    uvs.push({ x: 0.5, y: 0.5 });
    const ring0 = positions.length;
    for (const p of ordered) {
      positions.push({ ...p });
      normals.push(flip ? scale(planeN, -1) : planeN);
      uvs.push({ x: 0, y: 0 });
    }
    for (let i = 0; i < ordered.length; i++) {
      const a = ring0 + i;
      const b = ring0 + ((i + 1) % ordered.length);
      if (flip) indices.push(cIdx, b, a);
      else indices.push(cIdx, a, b);
    }
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export interface LoopCutOptions {
  /** Number of parallel cuts inserted in the band. Default 1. */
  cuts?: number;
}

/**
 * Loop cut: insert supporting edge rings by slicing the mesh with one or more
 * parallel planes but keeping *both* sides (no removal). The scriptable form of
 * Blender Loop Cut / 3ds Max Connect — adds edges that sharpen a later
 * Catmull-Clark/subdivision near the cut. Cuts are spread across the band
 * spanned by the mesh along the plane normal.
 */
export function loopCut(mesh: Mesh, plane: Plane, opts: LoopCutOptions = {}): Mesh {
  const cuts = Math.max(1, Math.floor(opts.cuts ?? 1));
  const n = normalize(plane.normal);
  // Span of the mesh along the normal, to place interior cuts.
  let lo = Infinity, hi = -Infinity;
  for (const p of mesh.positions) {
    const s = dot(n, p);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  let cur = mesh;
  for (let i = 0; i < cuts; i++) {
    // Evenly spaced interior offsets (avoid the exact boundaries).
    const f = (i + 1) / (cuts + 1);
    const offset = lo + (hi - lo) * f;
    const point = scale(n, offset);
    cur = planeCut(cur, { point, normal: n }, { keep: "both" });
  }
  return cur;
}

export interface KnifeOptions {
  /**
   * Projection direction the knife cuts along (think "into the screen"). Each
   * path segment plus this direction defines a cutting plane. Default -Z.
   * Ignored when `projectToSurface` is set (the local surface normal is used).
   */
  direction?: Vec3;
  /**
   * Project the path onto the mesh surface and orient each cut by the local
   * surface normal instead of a fixed direction, so the incision follows a
   * curved surface (a seam wrapping a sphere, a panel line on a fender) rather
   * than slicing along one global axis.
   */
  projectToSurface?: boolean;
}

/**
 * Knife cut along an arbitrary 3D path. Each consecutive pair of path points,
 * together with the projection `direction`, defines a plane; the mesh is sliced
 * by every such plane (keeping both sides) so the path's projection is
 * inscribed onto the surface as new edges. The scriptable, deterministic form
 * of Blender Knife / Maya Multi-Cut — feeds panel lines, seams, custom edge
 * loops for later inset/extrude/bevel.
 *
 * With `projectToSurface`, path points are snapped to the closest surface point
 * and each cut plane uses the local surface normal × segment direction, so the
 * cut tracks the curvature of the model instead of a single axis.
 *
 * This adds edges (topology) without removing geometry. To actually open or
 * remove material, follow with `planeCut` or select+`extrudeRegion`.
 */
export function knifeCut(mesh: Mesh, path: Vec3[], opts: KnifeOptions = {}): Mesh {
  if (path.length < 2) return mesh;
  let cur = mesh;
  if (opts.projectToSurface) {
    // Snap each path point to the surface, then cut each segment with a plane
    // spanned by the segment and the local surface normal (sampled fresh on the
    // current mesh so it tracks curvature).
    for (let i = 0; i < path.length - 1; i++) {
      const cpA = closestPointOnMesh(cur, path[i]!);
      const cpB = closestPointOnMesh(cur, path[i + 1]!);
      const a = cpA.position;
      const edge = sub(cpB.position, a);
      if (length(edge) < 1e-9) continue;
      const sn = sampleNormalAt(cur, a);
      let n = crossVec3(normalize(edge), sn);
      if (length(n) < 1e-9) continue;
      n = normalize(n);
      cur = planeCut(cur, { point: a, normal: n }, { keep: "both" });
    }
    return cur;
  }
  const dir = normalize(opts.direction ?? vec3(0, 0, -1));
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const edge = sub(b, a);
    if (length(edge) < 1e-9) continue;
    // Plane contains the segment and the cut direction; its normal is edge x dir.
    let n = crossVec3(edge, dir);
    if (length(n) < 1e-9) continue; // segment parallel to direction: skip
    n = normalize(n);
    cur = planeCut(cur, { point: a, normal: n }, { keep: "both" });
  }
  return cur;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
