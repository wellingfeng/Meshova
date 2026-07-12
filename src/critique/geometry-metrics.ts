/**
 * A-tier geometry sanity metrics — the cheap, deterministic layer of the mesh
 * critic. No LLM, no render: read positions/indices and compute structural
 * health. This is what runs every iteration to catch the obvious defects
 * (flipped normals, holes, degenerate faces, blown-up scale) before spending
 * any VLM budget on aesthetics.
 *
 * Determinism: pure functions of the mesh arrays, stable iteration order.
 */
import type { Mesh } from "../geometry/mesh.js";
import { bounds, type Bounds } from "../geometry/mesh.js";
import { faceAreas } from "../geometry/measure.js";
import { rayMesh } from "../geometry/query.js";
import type { Vec3 } from "../math/vec3.js";
import { vec3, sub, cross, dot, length, normalize } from "../math/vec3.js";

export interface MeshMetrics {
  vertices: number;
  triangles: number;
  bounds: Bounds;
  /** max - min per axis. */
  size: Vec3;
  /** Geometric centroid (area-weighted face centers). */
  centroid: Vec3;
  surfaceArea: number;
  /**
   * Zero-area faces whose three welded vertices are all distinct — genuine
   * slivers / collapsed geometry. This is the defect signal the critic scores.
   */
  degenerateFaces: number;
  /**
   * Zero-area faces that are pole/seam caps (two or more welded vertices
   * coincide), the fan closure UV spheres and cones produce by construction.
   * Benign: reported for provenance but NOT counted as a defect.
   */
  capFaces: number;
  /** Faces whose vertex index triple repeats another face. */
  duplicateFaces: number;
  /** Undirected edges used by exactly one face (holes / open shell). */
  boundaryEdges: number;
  /**
   * Undirected welded edges shared by 3+ faces. On render meshes that keep
   * duplicated seam/pole vertices (UV spheres, cylinders, cones) this fires by
   * construction, so it is INFORMATIONAL only — the critic does not score it.
   */
  nonManifoldEdges: number;
  /** No boundary and no non-manifold edges => closed, orientable shell. */
  watertight: boolean;
  /** Faces whose winding normal opposes the stored vertex normals. */
  flippedFaces: number;
  /** Left/right (X) mirror self-similarity, 0..1 (1 = perfectly symmetric). */
  symmetryX: number;
}

const AREA_EPS = 1e-8;

interface Pt2 {
  x: number;
  y: number;
}

interface ZTri {
  part: string;
  partIndex: number;
  face: number;
  normal: Vec3;
  d: number;
  axis: 0 | 1 | 2;
  a: Pt2;
  b: Pt2;
  c: Pt2;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ZFightingPair {
  partA: string;
  partB: string;
  faceA: number;
  faceB: number;
}

export interface ZFightingReport {
  /** Same-facing, coplanar triangle pairs whose projected areas overlap. */
  pairs: number;
  /** Unique triangle faces participating in those pairs. */
  faces: number;
  /** Part names involved in z-fighting. */
  parts: string[];
  /** Small deterministic sample for feedback text and tests. */
  examples: ZFightingPair[];
  /** Number of triangles sampled by the check. */
  testedTriangles: number;
  /** True when very large input was stride-sampled. */
  truncated: boolean;
}

export interface ZFightingOptions {
  /** Plane distance tolerance. Default scales from whole-assembly bbox diagonal. */
  planeTolerance?: number;
  /** Component quantization for face normals. Default 1e-3. */
  normalTolerance?: number;
  /** Triangle cap for live-viewer safety. Large meshes are deterministic-strided. */
  maxTriangles?: number;
  /** Max example pairs returned. */
  maxExamples?: number;
  /** Include overlaps within the same named part. Default true. */
  includeSamePart?: boolean;
}

/** Quantize a position to weld coincident vertices for topology analysis. */
function weldKey(p: Vec3, q: number): string {
  return `${Math.round(p.x / q)},${Math.round(p.y / q)},${Math.round(p.z / q)}`;
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return cross(sub(b, a), sub(c, a));
}

function axisForNormal(n: Vec3): 0 | 1 | 2 {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= ax && ay >= az) return 1;
  return 2;
}

function projectPoint(p: Vec3, axis: 0 | 1 | 2): Pt2 {
  if (axis === 0) return { x: p.y, y: p.z };
  if (axis === 1) return { x: p.x, y: p.z };
  return { x: p.x, y: p.y };
}

function orient2(a: Pt2, b: Pt2, c: Pt2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function triCentroid2(t: ZTri): Pt2 {
  return {
    x: (t.a.x + t.b.x + t.c.x) / 3,
    y: (t.a.y + t.b.y + t.c.y) / 3,
  };
}

function pointInTriStrict(p: Pt2, t: ZTri, eps: number): boolean {
  const o1 = orient2(t.a, t.b, p);
  const o2 = orient2(t.b, t.c, p);
  const o3 = orient2(t.c, t.a, p);
  const pos = o1 > eps && o2 > eps && o3 > eps;
  const neg = o1 < -eps && o2 < -eps && o3 < -eps;
  return pos || neg;
}

function segmentsCrossStrict(a: Pt2, b: Pt2, c: Pt2, d: Pt2, eps: number): boolean {
  const o1 = orient2(a, b, c);
  const o2 = orient2(a, b, d);
  const o3 = orient2(c, d, a);
  const o4 = orient2(c, d, b);
  return (
    ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
    ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
  );
}

function triOverlapsWithArea(a: ZTri, b: ZTri, eps: number): boolean {
  if (a.maxX <= b.minX + eps || b.maxX <= a.minX + eps) return false;
  if (a.maxY <= b.minY + eps || b.maxY <= a.minY + eps) return false;
  if (pointInTriStrict(triCentroid2(a), b, eps) || pointInTriStrict(triCentroid2(b), a, eps)) {
    return true;
  }
  const ea = [[a.a, a.b], [a.b, a.c], [a.c, a.a]] as const;
  const eb = [[b.a, b.b], [b.b, b.c], [b.c, b.a]] as const;
  for (const [a0, a1] of ea) {
    for (const [b0, b1] of eb) {
      if (segmentsCrossStrict(a0, a1, b0, b1, eps)) return true;
    }
  }
  return false;
}

function normalKey(t: ZTri, normalTol: number): string {
  const nq = Math.max(normalTol, 1e-6);
  return [
    t.axis,
    Math.round(t.normal.x / nq),
    Math.round(t.normal.y / nq),
    Math.round(t.normal.z / nq),
  ].join(":");
}

function modelDiagonal(meshes: Mesh[]): number {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const m of meshes) {
    for (const p of m.positions) {
      if (p.x < minx) minx = p.x;
      if (p.y < miny) miny = p.y;
      if (p.z < minz) minz = p.z;
      if (p.x > maxx) maxx = p.x;
      if (p.y > maxy) maxy = p.y;
      if (p.z > maxz) maxz = p.z;
    }
  }
  if (minx === Infinity) return 0;
  return Math.hypot(maxx - minx, maxy - miny, maxz - minz);
}

/**
 * Detect render-visible z-fighting: two same-facing triangles lie on the same
 * plane and their projected interiors overlap. Opposite-facing shared internal
 * faces and edge-only adjacency are ignored.
 */
export function zFightingReport(
  parts: ReadonlyArray<{ name?: string; mesh: Mesh }>,
  opts: ZFightingOptions = {},
): ZFightingReport {
  const meshes = parts.map((p) => p.mesh);
  const totalTriangles = meshes.reduce((sum, m) => sum + m.indices.length / 3, 0);
  const maxTriangles = Math.max(1, opts.maxTriangles ?? 20000);
  const stride = Math.max(1, Math.ceil(totalTriangles / maxTriangles));
  const truncated = stride > 1;
  const diag = Math.max(modelDiagonal(meshes), 1e-6);
  const planeTol = opts.planeTolerance ?? Math.max(diag * 1e-5, 1e-7);
  const normalTol = opts.normalTolerance ?? 1e-3;
  const uvEps = Math.max(diag * 1e-8, 1e-9);
  const maxExamples = Math.max(0, opts.maxExamples ?? 8);
  const includeSamePart = opts.includeSamePart ?? true;

  const bins = new Map<string, Map<number, ZTri[]>>();
  const faceSet = new Set<string>();
  const partSet = new Set<string>();
  const examples: ZFightingPair[] = [];
  let testedTriangles = 0;
  let globalFace = 0;

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex]!;
    const m = part.mesh;
    const partName = part.name ?? `part_${partIndex}`;
    const tris = m.indices.length / 3;
    for (let f = 0; f < tris; f++, globalFace++) {
      if (globalFace % stride !== 0) continue;
      const ia = m.indices[f * 3]!;
      const ib = m.indices[f * 3 + 1]!;
      const ic = m.indices[f * 3 + 2]!;
      const a3 = m.positions[ia]!;
      const b3 = m.positions[ib]!;
      const c3 = m.positions[ic]!;
      const rawN = faceNormal(a3, b3, c3);
      if (length(rawN) < AREA_EPS) continue;
      const normal = normalize(rawN);
      const axis = axisForNormal(normal);
      const a = projectPoint(a3, axis);
      const b = projectPoint(b3, axis);
      const c = projectPoint(c3, axis);
      const tri: ZTri = {
        part: partName,
        partIndex,
        face: f,
        normal,
        d: dot(normal, a3),
        axis,
        a,
        b,
        c,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y),
        maxY: Math.max(a.y, b.y, c.y),
      };
      testedTriangles++;
      const key = normalKey(tri, normalTol);
      let planeBins = bins.get(key);
      if (!planeBins) {
        planeBins = new Map();
        bins.set(key, planeBins);
      }
      const planeIndex = Math.round(tri.d / planeTol);
      let bin = planeBins.get(planeIndex);
      if (!bin) {
        bin = [];
        planeBins.set(planeIndex, bin);
      }
      bin.push(tri);
    }
  }

  let pairs = 0;
  const scanBins = (left: ZTri[], right?: ZTri[]): void => {
    const entries = right
      ? [
          ...left.map((tri) => ({ tri, side: 0 })),
          ...right.map((tri) => ({ tri, side: 1 })),
        ]
      : left.map((tri) => ({ tri, side: 0 }));
    entries.sort((a, b) =>
      a.tri.minX - b.tri.minX ||
      a.tri.partIndex - b.tri.partIndex ||
      a.tri.face - b.tri.face ||
      a.side - b.side,
    );
    const active: Array<{ tri: ZTri; side: number }> = [];
    for (const entry of entries) {
      const tri = entry.tri;
      let kept = 0;
      for (const candidate of active) {
        if (candidate.tri.maxX <= tri.minX + uvEps) continue;
        active[kept++] = candidate;
      }
      active.length = kept;

      for (const candidate of active) {
        if (right && candidate.side === entry.side) continue;
        const prev = candidate.tri;
        if (!includeSamePart && prev.partIndex === tri.partIndex) continue;
        if (prev.maxY <= tri.minY + uvEps || tri.maxY <= prev.minY + uvEps) continue;
        if (dot(prev.normal, tri.normal) < 1 - normalTol * 2) continue;
        if (Math.abs(prev.d - tri.d) > planeTol) continue;
        if (!triOverlapsWithArea(prev, tri, uvEps)) continue;
        pairs++;
        faceSet.add(`${prev.partIndex}:${prev.face}`);
        faceSet.add(`${tri.partIndex}:${tri.face}`);
        partSet.add(prev.part);
        partSet.add(tri.part);
        if (examples.length < maxExamples) {
          examples.push({
            partA: prev.part,
            partB: tri.part,
            faceA: prev.face,
            faceB: tri.face,
          });
        }
      }
      active.push(entry);
    }
  };

  for (const planeBins of bins.values()) {
    const planeIndices = [...planeBins.keys()].sort((a, b) => a - b);
    for (const planeIndex of planeIndices) {
      const bin = planeBins.get(planeIndex)!;
      scanBins(bin);
      const adjacent = planeBins.get(planeIndex + 1);
      if (adjacent) scanBins(bin, adjacent);
    }
  }

  return {
    pairs,
    faces: faceSet.size,
    parts: [...partSet].sort(),
    examples,
    testedTriangles,
    truncated,
  };
}

/** Compute the full A-tier metric bundle for one mesh. */
export function meshMetrics(m: Mesh): MeshMetrics {
  const bb = bounds(m);
  const size = sub(bb.max, bb.min);
  const diag = Math.max(length(size), 1e-6);
  const weldQ = diag * 1e-5 || 1e-6;

  const areas = faceAreas(m);
  let surfaceArea = 0;
  let degenerateFaces = 0;
  let capFaces = 0;
  let centAccumX = 0;
  let centAccumY = 0;
  let centAccumZ = 0;
  let centWeight = 0;

  // Weld map for manifold edge counting.
  const weld = new Map<string, number>();
  const weldOf = (i: number): number => {
    const key = weldKey(m.positions[i]!, weldQ);
    let id = weld.get(key);
    if (id === undefined) {
      id = weld.size;
      weld.set(key, id);
    }
    return id;
  };

  const edgeUse = new Map<string, number>();
  const faceKeys = new Map<string, number>();
  let duplicateFaces = 0;
  let flippedFaces = 0;

  const tris = m.indices.length / 3;
  for (let f = 0; f < tris; f++) {
    const ia = m.indices[f * 3]!;
    const ib = m.indices[f * 3 + 1]!;
    const ic = m.indices[f * 3 + 2]!;
    const a = m.positions[ia]!;
    const b = m.positions[ib]!;
    const c = m.positions[ic]!;
    const area = areas[f] ?? 0;
    surfaceArea += area;

    // Area-weighted centroid.
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    centAccumX += cx * area;
    centAccumY += cy * area;
    centAccumZ += cz * area;
    centWeight += area;

    // Welded topology ids for edge / duplicate analysis.
    const wa = weldOf(ia);
    const wb = weldOf(ib);
    const wc = weldOf(ic);

    // Classify zero-area faces: if two welded vertices coincide, this is a
    // pole/seam cap (benign, UV-sphere/cone construction); otherwise it is a
    // genuine sliver (a real defect).
    if (area < AREA_EPS) {
      if (wa === wb || wb === wc || wc === wa) capFaces++;
      else degenerateFaces++;
    }

    const edge = (u: number, v: number): string => (u < v ? `${u}_${v}` : `${v}_${u}`);
    for (const e of [edge(wa, wb), edge(wb, wc), edge(wc, wa)]) {
      edgeUse.set(e, (edgeUse.get(e) ?? 0) + 1);
    }
    const fk = [wa, wb, wc].sort((x, y) => x - y).join("_");
    const seen = faceKeys.get(fk) ?? 0;
    if (seen > 0) duplicateFaces++;
    faceKeys.set(fk, seen + 1);

    // Flipped-normal check: winding normal vs stored vertex normals.
    const fn = faceNormal(a, b, c);
    const na = m.normals[ia];
    const nb = m.normals[ib];
    const nc = m.normals[ic];
    if (na && nb && nc && area >= AREA_EPS) {
      const avg = vec3(
        (na.x + nb.x + nc.x) / 3,
        (na.y + nb.y + nc.y) / 3,
        (na.z + nb.z + nc.z) / 3,
      );
      if (dot(fn, avg) < 0) flippedFaces++;
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const centroid =
    centWeight > 0
      ? vec3(centAccumX / centWeight, centAccumY / centWeight, centAccumZ / centWeight)
      : bounds00(bb);

  return {
    vertices: m.positions.length,
    triangles: tris,
    bounds: bb,
    size,
    centroid,
    surfaceArea,
    degenerateFaces,
    capFaces,
    duplicateFaces,
    boundaryEdges,
    nonManifoldEdges,
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && tris > 0,
    flippedFaces,
    symmetryX: symmetryScore(m, bb),
  };
}

function bounds00(bb: Bounds): Vec3 {
  return vec3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
}

/**
 * Mirror self-similarity about the X=center plane. Samples up to N vertices,
 * mirrors each, finds the nearest original vertex, and maps mean distance
 * (relative to model diagonal) to a 0..1 score. Cheap and deterministic:
 * downsamples with a fixed stride, no RNG.
 */
export function symmetryScore(m: Mesh, bb: Bounds = bounds(m)): number {
  const n = m.positions.length;
  if (n < 4) return 1;
  const cx = (bb.min.x + bb.max.x) / 2;
  const diag = Math.max(length(sub(bb.max, bb.min)), 1e-6);
  const sampleCap = 400;
  const stride = Math.max(1, Math.floor(n / sampleCap));
  const candStride = Math.max(1, Math.floor(n / 1500));

  let total = 0;
  let samples = 0;
  for (let i = 0; i < n; i += stride) {
    const p = m.positions[i]!;
    const mx = 2 * cx - p.x;
    let best = Infinity;
    for (let j = 0; j < n; j += candStride) {
      const q = m.positions[j]!;
      const dx = mx - q.x;
      const dy = p.y - q.y;
      const dz = p.z - q.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    total += Math.sqrt(best);
    samples++;
  }
  const meanDist = samples > 0 ? total / samples : 0;
  // Normalize: distance of ~2% of the diagonal counts as effectively symmetric.
  const norm = meanDist / (diag * 0.02);
  return Math.max(0, Math.min(1, 1 - norm));
}

export interface SealTest {
  /** Fraction of all rays that hit a surface, 0..1 (1 = fully enclosed). */
  enclosure: number;
  /** Fraction of near-horizontal (side-wall) rays that hit, 0..1. */
  sideEnclosure: number;
  /** Number of rays cast. */
  rays: number;
}

/**
 * Assembly-level sealedness test: fire rays outward from the interior center in
 * a Fibonacci-sphere spread and measure how many escape without hitting a
 * surface. A solid or properly closed vessel encloses ~1.0; a staved barrel
 * with gaps between planks leaks (rays slip through the seams), so enclosure
 * drops well below 1. This catches "looks watertight per-part but the assembly
 * has gaps" — exactly the case single-part watertight checks miss.
 *
 * Deterministic: fixed Fibonacci directions, no RNG. Uses the merged mesh so
 * multi-piece assemblies (many independent plank boxes) are tested as a whole.
 */
export function sealTest(m: Mesh, rays = 400): SealTest {
  const n = Math.max(24, Math.floor(rays));
  const bb = bounds(m);
  const c = vec3(
    (bb.min.x + bb.max.x) / 2,
    (bb.min.y + bb.max.y) / 2,
    (bb.min.z + bb.max.z) / 2,
  );
  const golden = Math.PI * (3 - Math.sqrt(5));
  let hit = 0;
  let side = 0;
  let sideHit = 0;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden;
    const dir = vec3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    const h = rayMesh(m, c, dir);
    if (h) hit++;
    // Near-horizontal rays test the side wall specifically (a tank leaks at the
    // staves, not necessarily at the roof/floor).
    if (Math.abs(y) < 0.5) {
      side++;
      if (h) sideHit++;
    }
  }
  return {
    enclosure: hit / n,
    sideEnclosure: side > 0 ? sideHit / side : 1,
    rays: n,
  };
}

/** Bounding-box diagonal length of a mesh (0 for empty). */
export function bboxDiagonal(m: Mesh): number {
  if (m.positions.length === 0) return 0;
  const bb = bounds(m);
  return length(sub(bb.max, bb.min));
}

/** Downsample a mesh's vertices to at most `cap` points (fixed stride, no RNG). */
function sampleVerts(m: Mesh, cap: number): Vec3[] {
  const n = m.positions.length;
  if (n === 0) return [];
  const stride = Math.max(1, Math.floor(n / cap));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i += stride) out.push(m.positions[i]!);
  return out;
}

/** Min distance between two vertex-sampled point clouds (brute force). */
function minGap(a: Vec3[], b: Vec3[]): number {
  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dz = p.z - q.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/**
 * Split a mesh into connected components by welding coincident vertices and
 * union-find over triangle edges. Returns, per component, its vertex positions
 * plus bbox. This is what turns a merged "leaves" part back into individual
 * leaf cards so each can be tested for floating / oversize.
 */
interface Component {
  verts: Vec3[];
  min: Vec3;
  max: Vec3;
  diagonal: number;
}

function connectedComponents(m: Mesh, weldQ: number): Component[] {
  const n = m.positions.length;
  if (n === 0) return [];
  // Weld coincident vertices to representative ids.
  const map = new Map<string, number>();
  const repOf = (i: number): number => {
    const p = m.positions[i]!;
    const k = `${Math.round(p.x / weldQ)},${Math.round(p.y / weldQ)},${Math.round(p.z / weldQ)}`;
    let r = map.get(k);
    if (r === undefined) {
      r = i;
      map.set(k, i);
    }
    return r;
  };
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (parent.get(ra) === undefined) parent.set(ra, ra);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = repOf(m.indices[t]!);
    const b = repOf(m.indices[t + 1]!);
    const c = repOf(m.indices[t + 2]!);
    parent.set(find(a), find(a));
    union(a, b);
    union(b, c);
  }
  // Group original vertices by their component root.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(repOf(i));
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(i);
  }
  const comps: Component[] = [];
  for (const idxs of groups.values()) {
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    const verts: Vec3[] = [];
    for (const i of idxs) {
      const p = m.positions[i]!;
      verts.push(p);
      if (p.x < mnx) mnx = p.x;
      if (p.y < mny) mny = p.y;
      if (p.z < mnz) mnz = p.z;
      if (p.x > mxx) mxx = p.x;
      if (p.y > mxy) mxy = p.y;
      if (p.z > mxz) mxz = p.z;
    }
    const min = vec3(mnx, mny, mnz);
    const max = vec3(mxx, mxy, mxz);
    comps.push({ verts, min, max, diagonal: length(sub(max, min)) });
  }
  return comps;
}

export interface FoliageMetrics {
  /** Number of leaf cards (connected components). */
  cards: number;
  /** Mean long/mid bbox-axis ratio across cards (>1; a leaf is a flat card). */
  meanAspect: number;
  /** Worst single-card long/mid ratio. */
  maxAspect: number;
  /** Largest single leaf-card diagonal divided by the full foliage bbox diagonal. */
  maxCardDiagonalRatio: number;
  /** Fraction of cards larger than the configured crown-relative size limit. */
  largeCardRatio: number;
  /**
   * Fraction of cards whose long/mid ratio exceeds `slenderAt` — sliver/torn
   * strips rather than leaf-shaped cards. This is the "shredded" tell.
   */
  slenderRatio: number;
  /** 0..1 density score for leaf cards piling into the same occupied cells. */
  crowding: number;
  /**
   * Triangle fraction taken up by CLOSED solid components inside the foliage —
   * interior occluder spheres ("green balls") leaking through the leaf shell.
   * Leaf cards are thin open surfaces, so any closed solid volume in a foliage
   * part is bare occluder geometry that should be hidden but isn't. 0 = clean,
   * >0 = exposed blob.
   */
  blobRatio: number;
}

/**
 * Foliage-specific morphology metrics — the layer that catches "leaves came out
 * as torn strips / a stacked mess", which the topology checks miss because each
 * leaf card is a legitimately-thin open surface. Splits the merged foliage mesh
 * into per-leaf connected components and measures card slenderness plus spatial
 * clumping (voxel co-occupancy). Deterministic and linear: weld + union-find
 * components, per-card bbox, one voxel hash pass — no O(n^2) gap search, so it
 * is safe to run live in the viewer.
 */
export function foliageMetrics(
  m: Mesh,
  opts: { slenderAt?: number; largeCardAt?: number; maxComponents?: number; crowdLo?: number; crowdHi?: number; blobMinTris?: number; blobSizeMul?: number } = {},
): FoliageMetrics {
  const slenderAt = opts.slenderAt ?? 3;
  const largeCardAt = opts.largeCardAt ?? 0.18;
  const maxComponents = opts.maxComponents ?? 4000;
  const crowdLo = opts.crowdLo ?? 2.5;  // leaves per occupied cell: uncrowded (0) at/below
  const crowdHi = opts.crowdHi ?? 7;    // fully crowded (1) at/above
  const empty: FoliageMetrics = {
    cards: 0,
    meanAspect: 0,
    maxAspect: 0,
    maxCardDiagonalRatio: 0,
    largeCardRatio: 0,
    slenderRatio: 0,
    crowding: 0,
    blobRatio: 0,
  };
  if (m.positions.length === 0 || m.indices.length === 0) return empty;

  const bb = bounds(m);
  const diag = Math.max(length(sub(bb.max, bb.min)), 1e-6);
  const weldQ = diag * 1e-4 || 1e-6;
  const comps = connectedComponents(m, weldQ);
  if (comps.length === 0) return empty;
  const cards = Math.min(comps.length, maxComponents);

  // Per-card slenderness: long/mid of the two largest bbox axes (the thin axis
  // is the card thickness ~0, so long/mid is the in-plane aspect).
  let aspectSum = 0;
  let maxAspect = 0;
  let maxCardDiagonalRatio = 0;
  let slender = 0;
  let largeCards = 0;
  const cardSize: number[] = [];
  for (let k = 0; k < cards; k++) {
    const c = comps[k]!;
    const dims = [Math.abs(c.max.x - c.min.x), Math.abs(c.max.y - c.min.y), Math.abs(c.max.z - c.min.z)].sort((a, b) => a - b);
    const mid = Math.max(dims[1]!, 1e-6);
    const long = Math.max(dims[2]!, 1e-6);
    const aspect = long / mid;
    const cardDiagonalRatio = Math.hypot(dims[0]!, dims[1]!, dims[2]!) / diag;
    aspectSum += aspect;
    if (aspect > maxAspect) maxAspect = aspect;
    if (cardDiagonalRatio > maxCardDiagonalRatio) maxCardDiagonalRatio = cardDiagonalRatio;
    if (cardDiagonalRatio > largeCardAt) largeCards++;
    if (aspect > slenderAt) slender++;
    cardSize.push(long);
  }
  const meanAspect = aspectSum / cards;

  // Crowding = leaves per occupied cell. Bin each CARD CENTER (one point per
  // leaf) into a grid sized to the median leaf. Well-spread foliage lands ~one
  // leaf per cell (ratio≈1); leaves piled at the same spots collapse many cards
  // into few cells (ratio≫1). Using card centers (not verts) makes crossed
  // quads count as one leaf and is bbox-independent, so it doesn't false-fire on
  // normal dense canopies.
  const sizes = [...cardSize].sort((a, b) => a - b);
  const medianCard = Math.max(sizes[Math.floor(sizes.length / 2)]!, diag * 1e-3);
  const voxel = Math.max(medianCard, 1e-6);
  const occupied = new Set<string>();
  for (let k = 0; k < cards; k++) {
    const c = comps[k]!;
    const cx = (c.min.x + c.max.x) / 2, cy = (c.min.y + c.max.y) / 2, cz = (c.min.z + c.max.z) / 2;
    occupied.add(`${Math.round(cx / voxel)},${Math.round(cy / voxel)},${Math.round(cz / voxel)}`);
  }
  const leavesPerCell = cards / Math.max(occupied.size, 1);
  // Map ratio in [crowdLo, crowdHi] to [0,1]. crowdLo>1 leaves headroom so
  // normal dense foliage (some natural clustering) stays at 0.
  const crowding = Math.max(0, Math.min(1, (leavesPerCell - crowdLo) / Math.max(1e-6, crowdHi - crowdLo)));

  // Blob artifact: leaf foliage should be thin open cards. A CLOSED solid
  // component inside it (no boundary edges, enough tris to be a real volume) is
  // an interior occluder sphere — the "green ball" — leaking through the leaf
  // shell. Measure the triangle fraction such closed solids take up; a nonzero
  // fraction means bare occluder geometry is exposed in the crown.
  const blobMinTris = opts.blobMinTris ?? 20;
  const rootTris = new Map<number, number>();
  const rootEdges = new Map<number, Map<string, number>>();
  const repFor = new Map<number, number>(); // vertex index -> weld id
  const wq = weldQ;
  const idOf = (i: number): number => {
    let r = repFor.get(i);
    if (r !== undefined) return r;
    const p = m.positions[i]!;
    const k = `${Math.round(p.x / wq)},${Math.round(p.y / wq)},${Math.round(p.z / wq)}`;
    // Reuse the component weld map indirectly: bucket by quantized key.
    r = keyBucket.get(k);
    if (r === undefined) { r = keyBucket.size; keyBucket.set(k, r); }
    repFor.set(i, r);
    return r;
  };
  const keyBucket = new Map<string, number>();
  // Union-find over welded ids to group triangles into components.
  const parent2: number[] = [];
  const find2 = (x: number): number => {
    while (parent2[x] !== undefined && parent2[x] !== x) { parent2[x] = parent2[parent2[x]!]!; x = parent2[x]!; }
    return x;
  };
  const union2 = (a: number, b: number): void => {
    if (parent2[a] === undefined) parent2[a] = a;
    if (parent2[b] === undefined) parent2[b] = b;
    const ra = find2(a), rb = find2(b);
    if (ra !== rb) parent2[ra] = rb;
  };
  const II = m.indices;
  for (let t = 0; t + 2 < II.length; t += 3) {
    const a = idOf(II[t]!), b = idOf(II[t + 1]!), c = idOf(II[t + 2]!);
    if (parent2[a] === undefined) parent2[a] = a;
    union2(a, b); union2(b, c);
  }
  // Per-component bbox, to size a closed solid against a typical leaf.
  const rootMin = new Map<number, { x: number; y: number; z: number }>();
  const rootMax = new Map<number, { x: number; y: number; z: number }>();
  const grow = (root: number, p: Vec3): void => {
    let mn = rootMin.get(root), mx = rootMax.get(root);
    if (!mn) { mn = { x: p.x, y: p.y, z: p.z }; rootMin.set(root, mn); mx = { x: p.x, y: p.y, z: p.z }; rootMax.set(root, mx); return; }
    mx = rootMax.get(root)!;
    if (p.x < mn.x) mn.x = p.x; if (p.y < mn.y) mn.y = p.y; if (p.z < mn.z) mn.z = p.z;
    if (p.x > mx.x) mx.x = p.x; if (p.y > mx.y) mx.y = p.y; if (p.z > mx.z) mx.z = p.z;
  };
  for (let t = 0; t + 2 < II.length; t += 3) {
    const ia = II[t]!, ib = II[t + 1]!, ic = II[t + 2]!;
    const a = idOf(ia), b = idOf(ib), c = idOf(ic);
    const root = find2(a);
    rootTris.set(root, (rootTris.get(root) ?? 0) + 1);
    let em = rootEdges.get(root);
    if (!em) { em = new Map(); rootEdges.set(root, em); }
    const ek = (u: number, v: number): string => (u < v ? `${u}_${v}` : `${v}_${u}`);
    for (const e of [ek(a, b), ek(b, c), ek(c, a)]) em.set(e, (em.get(e) ?? 0) + 1);
    grow(root, m.positions[ia]!); grow(root, m.positions[ib]!); grow(root, m.positions[ic]!);
  }
  // Median leaf-card diagonal: a real occluder blob is much bigger than this.
  const cardDiags = [...cardSize].sort((a, b) => a - b);
  const medianLeaf = Math.max(cardDiags[Math.floor(cardDiags.length / 2)] ?? 0, diag * 1e-3);
  const blobSizeMul = opts.blobSizeMul ?? 2;
  let blobTris = 0;
  let totalTris = 0;
  for (const [root, tc] of rootTris) {
    totalTris += tc;
    if (tc < blobMinTris) continue;
    let boundary = 0;
    for (const cnt of rootEdges.get(root)!.values()) if (cnt === 1) boundary++;
    if (boundary !== 0) continue; // open shell => a leaf card, not a solid
    // Closed AND much larger than a typical leaf => an exposed occluder sphere.
    // A closed leaf card (curved/stitched leaf) is ~leaf-sized, so it's spared.
    const mn = rootMin.get(root)!, mx = rootMax.get(root)!;
    const d = Math.hypot(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z);
    if (d > medianLeaf * blobSizeMul) blobTris += tc;
  }
  const blobRatio = totalTris > 0 ? blobTris / totalTris : 0;

  return {
    cards,
    meanAspect,
    maxAspect,
    maxCardDiagonalRatio,
    largeCardRatio: largeCards / cards,
    slenderRatio: slender / cards,
    crowding,
    blobRatio,
  };
}

export interface AssemblyReport {
  /** Whole-assembly bbox diagonal. */
  diagonal: number;
  /** Number of connected components across all parts. */
  components: number;
  /** Largest single component's bbox diagonal / assembly diagonal. */
  maxComponentSizeRatio: number;
  /** Fraction of components whose nearest-neighbour gap exceeds the threshold. */
  floatingRatio: number;
  /** Worst (largest) floating gap ratio seen. */
  maxGapRatio: number;
}

/**
 * Assembly-level spatial analysis over CONNECTED COMPONENTS (not just parts):
 * a merged "leaves" part is split back into individual leaf cards, so each can
 * be checked for floating (a big gap to everything else) and oversize (one card
 * as big as the whole plant). This catches the "leaves detached and huge" case
 * that per-part and whole-bbox checks miss.
 *
 * Deterministic: position-weld + union-find components, fixed-stride vertex
 * sampling, brute-force nearest gap. Component count is capped to stay cheap.
 */
export function analyzeAssembly(
  partMeshes: Mesh[],
  opts: { sampleCap?: number; floatGapRatio?: number; maxComponents?: number } = {},
): AssemblyReport {
  const cap = opts.sampleCap ?? 24;
  const floatGapRatio = opts.floatGapRatio ?? 0.06;
  const maxComponents = opts.maxComponents ?? 600;

  const nonEmpty = partMeshes.filter((m) => m.positions.length > 0);
  // Whole-assembly bounds & diagonal.
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const m of nonEmpty) {
    const bb = bounds(m);
    if (bb.min.x < minx) minx = bb.min.x;
    if (bb.min.y < miny) miny = bb.min.y;
    if (bb.min.z < minz) minz = bb.min.z;
    if (bb.max.x > maxx) maxx = bb.max.x;
    if (bb.max.y > maxy) maxy = bb.max.y;
    if (bb.max.z > maxz) maxz = bb.max.z;
  }
  const diagonal = nonEmpty.length > 0 ? Math.hypot(maxx - minx, maxy - miny, maxz - minz) : 0;
  const diag = Math.max(diagonal, 1e-6);
  const weldQ = diag * 1e-4 || 1e-6;

  // Split every part into connected components.
  const comps: Component[] = [];
  for (const m of nonEmpty) {
    for (const c of connectedComponents(m, weldQ)) {
      comps.push(c);
      if (comps.length > maxComponents) break;
    }
    if (comps.length > maxComponents) break;
  }

  let maxComponentSizeRatio = 0;
  for (const c of comps) {
    const r = c.diagonal / diag;
    if (r > maxComponentSizeRatio) maxComponentSizeRatio = r;
  }

  // Nearest-neighbour gap per component (component centroid-sampled).
  const samples = comps.map((c) => {
    const stride = Math.max(1, Math.floor(c.verts.length / cap));
    const out: Vec3[] = [];
    for (let i = 0; i < c.verts.length; i += stride) out.push(c.verts[i]!);
    return out;
  });
  let floating = 0;
  let maxGapRatio = 0;
  if (comps.length >= 2) {
    for (let i = 0; i < comps.length; i++) {
      // Quick bbox-based reject before per-vertex gap: nearest bbox distance.
      let best = Infinity;
      for (let j = 0; j < comps.length; j++) {
        if (i === j) continue;
        const g = minGap(samples[i]!, samples[j]!);
        if (g < best) best = g;
        if (best === 0) break;
      }
      if (best === Infinity) continue;
      const ratio = best / diag;
      if (ratio > maxGapRatio) maxGapRatio = ratio;
      if (ratio > floatGapRatio) floating++;
    }
  }
  const floatingRatio = comps.length > 0 ? floating / comps.length : 0;

  return {
    diagonal,
    components: comps.length,
    maxComponentSizeRatio,
    floatingRatio,
    maxGapRatio,
  };
}
