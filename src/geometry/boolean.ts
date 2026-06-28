/**
 * Mesh boolean (P14): union / intersect / subtract via BSP-tree CSG.
 *
 * Self-written implementation of the classic constructive-solid-geometry
 * algorithm (Naylor/Thibault BSP clipping, the same family three-csg and
 * Blender's older solver use): convert each mesh to convex polygons, build a
 * BSP tree per operand, clip each tree's polygons against the other, then
 * recombine according to the operation. Inputs should be closed manifolds for
 * clean results.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, dot } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

const EPS = 1e-5;

interface Vertex {
  pos: Vec3;
  normal: Vec3;
  uv: { x: number; y: number };
}

function lerpVertex(a: Vertex, b: Vertex, t: number): Vertex {
  return {
    pos: add(a.pos, scale(sub(b.pos, a.pos), t)),
    normal: normalize(add(a.normal, scale(sub(b.normal, a.normal), t))),
    uv: { x: a.uv.x + (b.uv.x - a.uv.x) * t, y: a.uv.y + (b.uv.y - a.uv.y) * t },
  };
}

interface Plane {
  normal: Vec3;
  w: number;
}

function planeFromPoints(a: Vec3, b: Vec3, c: Vec3): Plane {
  const n = normalize(cross(sub(b, a), sub(c, a)));
  return { normal: n, w: dot(n, a) };
}

interface Polygon {
  vertices: Vertex[];
  plane: Plane;
}

function makePolygon(vertices: Vertex[]): Polygon {
  return {
    vertices,
    plane: planeFromPoints(vertices[0]!.pos, vertices[1]!.pos, vertices[2]!.pos),
  };
}

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/** Split `poly` by `plane`, appending results to the given lists. */
function splitPolygon(
  plane: Plane,
  poly: Polygon,
  coFront: Polygon[],
  coBack: Polygon[],
  front: Polygon[],
  back: Polygon[],
): void {
  let polygonType = 0;
  const types: number[] = [];
  for (const v of poly.vertices) {
    const t = dot(plane.normal, v.pos) - plane.w;
    const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    polygonType |= type;
    types.push(type);
  }

  switch (polygonType) {
    case COPLANAR:
      (dot(plane.normal, poly.plane.normal) > 0 ? coFront : coBack).push(poly);
      break;
    case FRONT:
      front.push(poly);
      break;
    case BACK:
      back.push(poly);
      break;
    case SPANNING: {
      const f: Vertex[] = [];
      const b: Vertex[] = [];
      const n = poly.vertices.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ti = types[i]!;
        const tj = types[j]!;
        const vi = poly.vertices[i]!;
        const vj = poly.vertices[j]!;
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(ti !== BACK ? cloneVertex(vi) : vi);
        if ((ti | tj) === SPANNING) {
          const t = (plane.w - dot(plane.normal, vi.pos)) / dot(plane.normal, sub(vj.pos, vi.pos));
          const v = lerpVertex(vi, vj, t);
          f.push(v);
          b.push(cloneVertex(v));
        }
      }
      if (f.length >= 3) front.push(makePolygon(f));
      if (b.length >= 3) back.push(makePolygon(b));
      break;
    }
  }
}

function cloneVertex(v: Vertex): Vertex {
  return { pos: { ...v.pos }, normal: { ...v.normal }, uv: { ...v.uv } };
}

/** A BSP tree node. Built iteratively-ish via recursion on polygon sets. */
class BspNode {
  plane: Plane | null = null;
  front: BspNode | null = null;
  back: BspNode | null = null;
  polygons: Polygon[] = [];

  constructor(polygons?: Polygon[]) {
    if (polygons) this.build(polygons);
  }

  invert(): void {
    for (const p of this.polygons) {
      p.plane = { normal: scale(p.plane.normal, -1), w: -p.plane.w };
      p.vertices.reverse();
      for (const v of p.vertices) v.normal = scale(v.normal, -1);
    }
    if (this.plane) this.plane = { normal: scale(this.plane.normal, -1), w: -this.plane.w };
    this.front?.invert();
    this.back?.invert();
    const tmp = this.front;
    this.front = this.back;
    this.back = tmp;
  }

  /** Remove all polygons in this BSP tree that are inside the other tree. */
  clipPolygons(polygons: Polygon[]): Polygon[] {
    if (!this.plane) return polygons.slice();
    let front: Polygon[] = [];
    let back: Polygon[] = [];
    for (const poly of polygons) {
      splitPolygon(this.plane, poly, front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  }

  clipTo(other: BspNode): void {
    this.polygons = other.clipPolygons(this.polygons);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }

  allPolygons(): Polygon[] {
    let result = this.polygons.slice();
    if (this.front) result = result.concat(this.front.allPolygons());
    if (this.back) result = result.concat(this.back.allPolygons());
    return result;
  }

  build(polygons: Polygon[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) this.plane = { normal: { ...polygons[0]!.plane.normal }, w: polygons[0]!.plane.w };
    const front: Polygon[] = [];
    const back: Polygon[] = [];
    for (const poly of polygons) {
      splitPolygon(this.plane, poly, this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      if (!this.front) this.front = new BspNode();
      this.front.build(front);
    }
    if (back.length) {
      if (!this.back) this.back = new BspNode();
      this.back.build(back);
    }
  }
}

function meshToPolygons(mesh: Mesh): Polygon[] {
  const polys: Polygon[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const verts: Vertex[] = [0, 1, 2].map((k) => {
      const idx = mesh.indices[i + k]!;
      return {
        pos: { ...mesh.positions[idx]! },
        normal: { ...mesh.normals[idx]! },
        uv: { ...mesh.uvs[idx]! },
      };
    });
    // Skip degenerate (zero-area) triangles — e.g. UV-sphere pole fans —
    // because their plane normal is undefined and would corrupt the BSP.
    const faceN = cross(sub(verts[1]!.pos, verts[0]!.pos), sub(verts[2]!.pos, verts[0]!.pos));
    if (dot(faceN, faceN) < EPS * EPS) continue;
    // Some primitives (e.g. sphere) are wound opposite to their outward
    // vertex normals. CSG inside/outside tests rely on consistent outward
    // orientation, so flip the triangle when its winding disagrees with the
    // averaged stored normal.
    const geomN = normalize(faceN);
    const avgN = normalize(
      add(add(verts[0]!.normal, verts[1]!.normal), verts[2]!.normal),
    );
    if (dot(geomN, avgN) < 0) verts.reverse();
    polys.push(makePolygon(verts));
  }
  return polys;
}

function polygonsToMesh(polygons: Polygon[]): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  for (const poly of polygons) {
    // fan-triangulate the (convex) polygon
    const base = positions.length;
    for (const v of poly.vertices) {
      positions.push({ ...v.pos });
      normals.push({ ...v.normal });
      uvs.push({ ...v.uv });
    }
    for (let i = 1; i < poly.vertices.length - 1; i++) {
      indices.push(base, base + i, base + i + 1);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/** Core CSG combine following the standard union recipe with inversions. */
function csg(a: Mesh, b: Mesh, op: "union" | "subtract" | "intersect"): Mesh {
  const na = new BspNode(meshToPolygons(a));
  const nb = new BspNode(meshToPolygons(b));

  if (op === "union") {
    na.clipTo(nb);
    nb.clipTo(na);
    nb.invert();
    nb.clipTo(na);
    nb.invert();
    na.build(nb.allPolygons());
    return recomputeNormals(polygonsToMesh(na.allPolygons()));
  }
  if (op === "subtract") {
    na.invert();
    na.clipTo(nb);
    nb.clipTo(na);
    nb.invert();
    nb.clipTo(na);
    nb.invert();
    na.build(nb.allPolygons());
    na.invert();
    return recomputeNormals(polygonsToMesh(na.allPolygons()));
  }
  // intersect
  na.invert();
  nb.clipTo(na);
  nb.invert();
  na.clipTo(nb);
  nb.clipTo(na);
  na.build(nb.allPolygons());
  na.invert();
  return recomputeNormals(polygonsToMesh(na.allPolygons()));
}

/** Boolean union: A ∪ B (combined solid). */
export function union(a: Mesh, b: Mesh): Mesh {
  return csg(a, b, "union");
}

/** Boolean subtract: A − B (carve B out of A). */
export function subtract(a: Mesh, b: Mesh): Mesh {
  return csg(a, b, "subtract");
}

/** Boolean intersect: A ∩ B (overlap only). */
export function intersect(a: Mesh, b: Mesh): Mesh {
  return csg(a, b, "intersect");
}
