/**
 * P1 DCC-style edit operators built on the `TopoMesh` adjacency layer.
 *
 * These mirror the headline tools every poly-modeler relies on — region
 * extrude, inset, bevel/chamfer, solidify (shell), and bridge — abstracted into
 * pure mesh->mesh functions so AI scripts can compose them. They operate on
 * fused topology (so shared edges build shared walls) and convert back to the
 * indexed triangle `Mesh`, recomputing normals.
 *
 * Reference semantics (not implementation) drawn from public docs of Blender
 * Mesh editing, Maya Modeling Toolkit, and 3ds Max Editable Poly.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, normalize, length, dot, lerpVec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { recomputeNormals } from "./mesh.js";
import {
  type TopoMesh,
  toTopo,
  fromTopo,
  faceNormal,
  faceCentroid,
  edgeKey,
  rebuildEdges,
  boundaryLoops,
} from "./topo.js";

/** Resolve a face selection: explicit indices, normal filter, or all faces. */
export interface FaceSelection {
  /** Explicit face indices (in topology order). */
  faces?: number[];
  /** Keep faces whose normal is within `angleDeg` of this direction. */
  normalDir?: Vec3;
  angleDeg?: number;
}

function resolveFaces(topo: TopoMesh, sel?: FaceSelection): number[] {
  if (!sel || (!sel.faces && !sel.normalDir)) {
    return topo.faces.map((_, i) => i);
  }
  if (sel.faces) return sel.faces.filter((f) => f >= 0 && f < topo.faces.length);
  const d = normalize(sel.normalDir!);
  const cosT = Math.cos(((sel.angleDeg ?? 45) * Math.PI) / 180);
  const out: number[] = [];
  for (let f = 0; f < topo.faces.length; f++) {
    if (dot(faceNormal(topo, f), d) >= cosT) out.push(f);
  }
  return out;
}

/** Average geometric normal over a set of faces (for region extrude direction). */
function avgFaceNormal(topo: TopoMesh, faces: number[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const f of faces) {
    const n = faceNormal(topo, f);
    x += n.x; y += n.y; z += n.z;
  }
  return length(vec3(x, y, z)) > 0 ? normalize(vec3(x, y, z)) : vec3(0, 1, 0);
}

export interface ExtrudeRegionOptions {
  distance?: number;
  /** Explicit world-space direction; defaults to the region's average normal. */
  direction?: Vec3;
  /** Shrink the moved cap toward the region centroid (0 = none, 1 = collapse). */
  taper?: number;
}

/**
 * DCC-style region extrude: lift a connected set of faces along a direction and
 * stitch side walls only along the *boundary* of the selection (shared interior
 * edges stay merged). Replaces the per-triangle `extrude` for clean panels.
 */
export function extrudeRegion(
  mesh: Mesh,
  selection?: FaceSelection,
  opts: ExtrudeRegionOptions = {},
): Mesh {
  const topo = toTopo(mesh);
  const sel = resolveFaces(topo, selection);
  if (sel.length === 0) return mesh;
  const selSet = new Set(sel);
  const distance = opts.distance ?? 0.1;
  const taper = opts.taper ?? 0;
  const regionNormal = opts.direction ? normalize(opts.direction) : avgFaceNormal(topo, sel);
  const regionCentroid = (() => {
    let x = 0, y = 0, z = 0;
    for (const f of sel) { const c = faceCentroid(topo, f); x += c.x; y += c.y; z += c.z; }
    const inv = 1 / sel.length;
    return vec3(x * inv, y * inv, z * inv);
  })();

  // Duplicate every point used by the selection; offset it along the direction.
  const usedPoints = new Set<number>();
  for (const f of sel) for (const p of topo.faces[f]!) usedPoints.add(p);
  const newOf = new Map<number, number>();
  for (const p of usedPoints) {
    const pos = topo.points[p]!;
    let np = add(pos, scale(regionNormal, distance));
    if (taper > 0) np = lerpVec3(np, add(regionCentroid, scale(regionNormal, distance)), taper);
    const idx = topo.points.length;
    topo.points.push(np);
    topo.uvOfPoint.push({ ...(topo.uvOfPoint[p] ?? { x: 0, y: 0 }) });
    newOf.set(p, idx);
  }

  // Count how many selected faces use each directed edge to find region borders.
  const edgeUse = new Map<string, number>();
  for (const f of sel) {
    const loop = topo.faces[f]!;
    for (let i = 0; i < loop.length; i++) {
      const k = edgeKey(loop[i]!, loop[(i + 1) % loop.length]!);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }

  // Build side walls along boundary edges (used by exactly one selected face).
  for (const f of sel) {
    const loop = topo.faces[f]!;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if ((edgeUse.get(edgeKey(a, b)) ?? 0) === 1) {
        const na = newOf.get(a)!;
        const nb = newOf.get(b)!;
        // Wall winding [a, na, nb, b] faces outward from the region.
        topo.faces.push([a, na, nb, b]);
      }
    }
    // Move the cap face onto the duplicated points.
    topo.faces[f] = loop.map((p) => newOf.get(p)!);
  }

  rebuildEdges(topo);
  return recomputeNormals(fromTopo(topo));
}

export interface InsetOptions {
  amount?: number;
  /** Inset each face independently (always true here; region inset is future work). */
  individual?: boolean;
}

/**
 * Inset faces: shrink each selected face toward its own centroid by `amount`,
 * leaving a rim of quads around the original boundary. The classic move for
 * panels, buttons, window frames, step treads.
 */
export function insetFaces(mesh: Mesh, selection?: FaceSelection, opts: InsetOptions = {}): Mesh {
  const topo = toTopo(mesh);
  const sel = resolveFaces(topo, selection);
  if (sel.length === 0) return mesh;
  const amount = opts.amount ?? 0.1;

  for (const f of sel) {
    const loop = topo.faces[f]!.slice();
    const c = faceCentroid(topo, f);
    const inner: number[] = [];
    for (const p of loop) {
      const pos = topo.points[p]!;
      const toC = sub(c, pos);
      const d = length(toC);
      const moved = d > 1e-9 ? add(pos, scale(toC, Math.min(amount, d) / d)) : { ...pos };
      const idx = topo.points.length;
      topo.points.push(moved);
      topo.uvOfPoint.push({ ...(topo.uvOfPoint[p] ?? { x: 0, y: 0 }) });
      inner.push(idx);
    }
    // Rim quads: outer edge (pi -> pi+1) to inner edge.
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const ia = inner[i]!;
      const ib = inner[(i + 1) % loop.length]!;
      topo.faces.push([a, b, ib, ia]);
    }
    // Inner face replaces the original.
    topo.faces[f] = inner;
  }

  rebuildEdges(topo);
  return recomputeNormals(fromTopo(topo));
}

export interface EdgeBevelOptions {
  /** Chamfer width — how far each corner pulls back along its edges. */
  width?: number;
  /**
   * Number of segments across the bevel. 1 = flat chamfer; >1 rounds the edge
   * by inserting intermediate rings along a circular arc (DCC rounded bevel).
   */
  segments?: number;
}

/**
 * Bevel (chamfer) every edge of the mesh: pull each face's corners inward along
 * its own edges by `width`, then fill the gaps with bevel strips along edges and
 * corner polygons at vertices. This is the hard-surface staple — boxes get
 * crisp chamfered edges that catch light instead of razor-sharp seams.
 *
 * Operates on the whole mesh (uniform bevel). Per-edge angle selection is a
 * future refinement; for now combine with `computeNormals` for harden-normals.
 */
export function bevelEdges(mesh: Mesh, opts: EdgeBevelOptions = {}): Mesh {
  const width = opts.width ?? 0.05;
  const segments = Math.max(1, Math.floor(opts.segments ?? 1));
  const topo = toTopo(mesh);
  const origFaceCount = topo.faces.length;

  // New corner point per (face, original point) incidence.
  const cornerOf = new Map<string, number>();
  const ck = (f: number, p: number): string => `${f}_${p}`;

  const shrunkFaces: number[][] = [];
  for (let f = 0; f < origFaceCount; f++) {
    const loop = topo.faces[f]!;
    const nl: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const cur = loop[i]!;
      const prev = loop[(i - 1 + loop.length) % loop.length]!;
      const next = loop[(i + 1) % loop.length]!;
      const P = topo.points[cur]!;
      const toPrev = sub(topo.points[prev]!, P);
      const toNext = sub(topo.points[next]!, P);
      const lp = length(toPrev), ln = length(toNext);
      let np = { ...P };
      if (lp > 1e-9) np = add(np, scale(toPrev, Math.min(width, lp * 0.49) / lp));
      if (ln > 1e-9) np = add(np, scale(toNext, Math.min(width, ln * 0.49) / ln));
      const idx = topo.points.length;
      topo.points.push(np);
      topo.uvOfPoint.push({ ...(topo.uvOfPoint[cur] ?? { x: 0, y: 0 }) });
      cornerOf.set(ck(f, cur), idx);
      nl.push(idx);
    }
    shrunkFaces.push(nl);
  }

  // Map each original point -> incident faces (before we overwrite faces).
  const incident = new Map<number, number[]>();
  for (let f = 0; f < origFaceCount; f++) {
    for (const p of topo.faces[f]!) {
      const arr = incident.get(p) ?? [];
      arr.push(f);
      incident.set(p, arr);
    }
  }
  // Original edges -> the (up to two) faces sharing them.
  const edgeFaces = new Map<string, { a: number; b: number; faces: number[] }>();
  for (let f = 0; f < origFaceCount; f++) {
    const loop = topo.faces[f]!;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!, b = loop[(i + 1) % loop.length]!;
      const k = edgeKey(a, b);
      const rec = edgeFaces.get(k) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
      rec.faces.push(f);
      edgeFaces.set(k, rec);
    }
  }

  // Replace original faces with shrunk versions.
  for (let f = 0; f < origFaceCount; f++) topo.faces[f] = shrunkFaces[f]!;

  // Bevel strip along each interior edge shared by exactly two faces. For
  // segments=1 this is one quad; for segments>1 we loft a rounded arc between
  // the two face corners so the edge reads as a fillet, not a flat chamfer.
  for (const rec of edgeFaces.values()) {
    if (rec.faces.length !== 2) continue;
    const [f1, f2] = rec.faces as [number, number];
    const a1 = cornerOf.get(ck(f1, rec.a)), b1 = cornerOf.get(ck(f1, rec.b));
    const a2 = cornerOf.get(ck(f2, rec.a)), b2 = cornerOf.get(ck(f2, rec.b));
    if (a1 === undefined || b1 === undefined || a2 === undefined || b2 === undefined) continue;
    if (segments === 1) {
      topo.faces.push([a1, b1, b2, a2]);
      continue;
    }
    // Build two arcs: one for endpoint `a` (a1->a2), one for `b` (b1->b2),
    // each bulging out around the original edge vertex so the fillet is round.
    const arcA = buildBevelArc(topo, topo.points[rec.a]!, a1, a2, segments);
    const arcB = buildBevelArc(topo, topo.points[rec.b]!, b1, b2, segments);
    for (let s = 0; s < segments; s++) {
      topo.faces.push([arcA[s]!, arcB[s]!, arcB[s + 1]!, arcA[s + 1]!]);
    }
  }

  // Corner cap at each original point. For segments=1 a flat polygon; for
  // segments>1 a spherical dome so the corner rounds to match the edge fillets.
  for (const [p, faces] of incident) {
    if (faces.length < 3) continue;
    const pts = faces
      .map((f) => cornerOf.get(ck(f, p)))
      .filter((x): x is number => x !== undefined);
    if (pts.length < 3) continue;
    const center = topo.points[p]!;
    let nx = 0, ny = 0, nz = 0;
    for (const f of faces) { const n = faceNormal(topo, f); nx += n.x; ny += n.y; nz += n.z; }
    const nrm = length(vec3(nx, ny, nz)) > 0 ? normalize(vec3(nx, ny, nz)) : vec3(0, 1, 0);
    const ordered = orderAroundNormal(topo, pts, center, nrm);
    if (segments === 1) {
      topo.faces.push(ordered);
    } else {
      buildRoundedCorner(topo, center, ordered, segments);
    }
  }

  rebuildEdges(topo);
  return recomputeNormals(fromTopo(topo));
}

/** Sort point indices CCW around `normal` as seen from outside, about `center`. */
function orderAroundNormal(topo: TopoMesh, pts: number[], center: Vec3, normal: Vec3): number[] {
  const ref = topo.points[pts[0]!]!;
  let tangent = sub(ref, center);
  tangent = sub(tangent, scale(normal, dot(tangent, normal)));
  if (length(tangent) < 1e-9) tangent = vec3(1, 0, 0);
  tangent = normalize(tangent);
  const bitan = normalize(crossVec(normal, tangent));
  return pts
    .map((p) => {
      const d = sub(topo.points[p]!, center);
      const ang = Math.atan2(dot(d, bitan), dot(d, tangent));
      return { p, ang };
    })
    .sort((u, v) => u.ang - v.ang)
    .map((o) => o.p);
}

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

/**
 * Build a rounded arc of `segments`+1 points from existing corner point `i1` to
/**
 * Build a rounded arc of `segments`+1 points from existing corner point `i1` to
 * `i2`, bulging outward toward the original edge vertex `center` (where the
 * sharp edge used to be). Endpoints reuse the existing indices; interior
 * samples are a quadratic Bezier whose control point is mirrored through the
 * apex, so the apex sits between the chord midpoint and the vertex — giving a
 * convex fillet that never bulges past the original surface.
 */
function buildBevelArc(topo: TopoMesh, center: Vec3, i1: number, i2: number, segments: number): number[] {
  const out: number[] = new Array(segments + 1);
  out[0] = i1;
  out[segments] = i2;
  const p1 = topo.points[i1]!;
  const p2 = topo.points[i2]!;
  const mid = scale(add(p1, p2), 0.5);
  // Apex bulges from the chord midpoint toward the original vertex.
  const apex = lerpVec3(mid, center, 0.6);
  // Bezier control point so B(0.5) == apex.
  const ctrl = sub(scale(apex, 2), mid);
  for (let s = 1; s < segments; s++) {
    const t = s / segments;
    const mt = 1 - t;
    const pos = add(add(scale(p1, mt * mt), scale(ctrl, 2 * mt * t)), scale(p2, t * t));
    const idx = topo.points.length;
    topo.points.push(pos);
    topo.uvOfPoint.push({ x: 0, y: 0 });
    out[s] = idx;
  }
  return out;
}

/**
 * Cap a beveled corner with a spherical dome so it rounds to match the edge
 * fillets, instead of a flat polygon. The boundary ring `ring` (existing corner
 * points, CCW) is lofted inward through `segments` concentric rings toward an
 * apex along the corner normal, each ring's direction slerped from the boundary
 * direction toward the apex. Appends the dome's faces to the topology.
 */
function buildRoundedCorner(
  topo: TopoMesh, center: Vec3, ring: number[], segments: number,
): void {
  const m = ring.length;
  // Ring centroid; apex bulges from it toward the original vertex (bounded so
  // the dome never passes the original surface, matching the edge fillets).
  let cx = 0, cy = 0, cz = 0;
  for (const idx of ring) { const p = topo.points[idx]!; cx += p.x; cy += p.y; cz += p.z; }
  const ringC = vec3(cx / m, cy / m, cz / m);
  const apex = lerpVec3(ringC, center, 0.6);

  // Concentric rings: level 0 = boundary, level `segments` = apex point. Each
  // intermediate ring is a Bezier blend of the boundary point and the apex,
  // with the ring centroid as control, giving a convex dome.
  let prev = ring.slice();
  const boundaryPos = ring.map((idx) => ({ ...topo.points[idx]! }));
  for (let lv = 1; lv <= segments; lv++) {
    const t = lv / segments;
    if (lv === segments) {
      const apexIdx = topo.points.length;
      topo.points.push({ ...apex });
      topo.uvOfPoint.push({ x: 0.5, y: 0.5 });
      for (let i = 0; i < m; i++) {
        topo.faces.push([prev[i]!, prev[(i + 1) % m]!, apexIdx]);
      }
    } else {
      const cur: number[] = [];
      for (let i = 0; i < m; i++) {
        const b = boundaryPos[i]!;
        const mt = 1 - t;
        // Quadratic Bezier b -> apex with ringC as control: convex bulge.
        const pos = add(add(scale(b, mt * mt), scale(ringC, 2 * mt * t)), scale(apex, t * t));
        const idx = topo.points.length;
        topo.points.push(pos);
        topo.uvOfPoint.push({ x: 0, y: 0 });
        cur.push(idx);
      }
      for (let i = 0; i < m; i++) {
        topo.faces.push([prev[i]!, prev[(i + 1) % m]!, cur[(i + 1) % m]!, cur[i]!]);
      }
      prev = cur;
    }
  }
}

export interface SolidifyOptions {
  thickness?: number;
  /** Offset of the original surface within the shell: 0 outer, 1 inner, 0.5 centered. */
  offset?: number;
}

/**
 * Solidify (shell): give an open or single-sided mesh thickness by adding an
 * inner offset surface and stitching the borders. Blender Solidify / 3ds Max
 * Shell. Essential for plates, panels, cloth, casings.
 */
export function solidify(mesh: Mesh, opts: SolidifyOptions = {}): Mesh {
  const thickness = opts.thickness ?? 0.05;
  const offset = opts.offset ?? 0;
  const topo = toTopo(mesh);
  const borders = boundaryLoops(topo);

  // Per-point inner normal = average of incident face normals.
  const accum = topo.points.map(() => vec3(0, 0, 0));
  for (let f = 0; f < topo.faces.length; f++) {
    const n = faceNormal(topo, f);
    for (const p of topo.faces[f]!) accum[p] = add(accum[p]!, n);
  }
  const pn = accum.map((n) => (length(n) > 0 ? normalize(n) : vec3(0, 1, 0)));

  const outerShift = thickness * offset;
  const innerShift = thickness * (1 - offset);
  const innerOf = new Map<number, number>();
  const origCount = topo.points.length;
  for (let p = 0; p < origCount; p++) {
    if (outerShift !== 0) topo.points[p] = add(topo.points[p]!, scale(pn[p]!, outerShift));
    const inner = add(topo.points[p]!, scale(pn[p]!, -innerShift - outerShift));
    const idx = topo.points.length;
    topo.points.push(inner);
    topo.uvOfPoint.push({ ...(topo.uvOfPoint[p] ?? { x: 0, y: 0 }) });
    innerOf.set(p, idx);
  }

  // Inner faces with reversed winding.
  const faceCount = topo.faces.length;
  for (let f = 0; f < faceCount; f++) {
    const loop = topo.faces[f]!;
    topo.faces.push(loop.map((p) => innerOf.get(p)!).reverse());
  }

  // Rim walls along boundary loops.
  for (const loop of borders) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const ia = innerOf.get(a)!;
      const ib = innerOf.get(b)!;
      topo.faces.push([b, a, ia, ib]);
    }
  }

  rebuildEdges(topo);
  return recomputeNormals(fromTopo(topo));
}

export interface BridgeOptions {
  /** Reverse the second loop's pairing (flip if the bridge twists). */
  flip?: boolean;
  /** Rotate the pairing offset on loopB (to align starting points). */
  shift?: number;
}

/**
 * Bridge two edge loops (given as ordered point lists in world space) with a
 * band of quads. Connects holes, pipe sections, limb segments. The loops should
 * have the same point count; mismatched counts return the input unchanged.
 *
 * The loops are appended as new geometry to `mesh`.
 */
export function bridgeLoops(mesh: Mesh, loopA: Vec3[], loopB: Vec3[], opts: BridgeOptions = {}): Mesh {
  if (loopA.length < 3 || loopA.length !== loopB.length) return mesh;
  const topo = toTopo(mesh);
  const n = loopA.length;
  const aIdx: number[] = [];
  const bIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    aIdx.push(topo.points.length);
    topo.points.push({ ...loopA[i]! });
    topo.uvOfPoint.push({ x: i / n, y: 0 });
  }
  for (let i = 0; i < n; i++) {
    bIdx.push(topo.points.length);
    topo.points.push({ ...loopB[i]! });
    topo.uvOfPoint.push({ x: i / n, y: 1 });
  }
  const shift = ((opts.shift ?? 0) % n + n) % n;
  for (let i = 0; i < n; i++) {
    const a0 = aIdx[i]!;
    const a1 = aIdx[(i + 1) % n]!;
    let j0 = (i + shift) % n;
    let j1 = (i + 1 + shift) % n;
    if (opts.flip) { j0 = (n - j0) % n; j1 = (n - j1) % n; }
    const b0 = bIdx[j0]!;
    const b1 = bIdx[j1]!;
    topo.faces.push([a0, a1, b1, b0]);
  }
  rebuildEdges(topo);
  return recomputeNormals(fromTopo(topo));
}
