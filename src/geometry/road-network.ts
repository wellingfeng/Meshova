/**
 * Procedural road *network* by parcel subdivision — the "cut the land into
 * city blocks with roads, then drop the sliver leftovers" workflow from the
 * Houdini city tutorial (BV1iz42117sz), rebuilt on Meshova's deterministic
 * kernel.
 *
 * The pipeline mirrors what the tutorial does with recursive cuts +
 * `polyexpand2d` + a 周长/面积 (perimeter/area) filter, but as pure TS on the
 * XZ ground plane (+Y up):
 *
 *   1. subdivideParcel — recursively cut a convex land polygon along its
 *      longest axis. Each cut line IS a street centerline; recursion stops when
 *      a parcel drops below `targetArea` (or hits `maxDepth`).
 *   2. filter — drop parcels below `minArea` / `minPerimeter` (the tutorial's
 *      "remove tiny blocks so they don't get a house").
 *   3. inset — shrink every surviving parcel by `streetWidth/2` so the gaps
 *      between them open up into the actual road strips (the polyexpand2d step).
 *   4. mesh — fan-triangulate the ground slab + each block plate into flat
 *      geometry ready for buildings to sit on.
 *
 * Everything is deterministic: same boundary + params + seed -> same layout.
 * Convex parcels stay convex under straight-line splits, so triangulation is a
 * simple fan and the inset is a robust convex shrink.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import type { Rng } from "../random/prng.js";
import { makeRng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, merge, recomputeNormals } from "./mesh.js";
import { box } from "./primitives.js";
import { transform } from "./transform.js";
import { polyline } from "./curve.js";
import { roadRibbon, roadCurbs, roadEdgeLines, roadLaneLines, type RoadRibbonOptions } from "./road.js";
import { roadJunctionPadMesh, roadJunctionRadius, type RoadJunctionBranch } from "./road-junction.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A city block: a closed convex XZ polygon (CCW, y = groundY) plus metrics. */
export interface Parcel {
  /** Convex ring, CCW winding, all points share the same Y. */
  ring: Vec3[];
  /** Planar area on the XZ plane (world units squared). */
  area: number;
  /** Ring perimeter (world units). */
  perimeter: number;
  /** Recursion depth this parcel was born at (0 = the whole land). */
  depth: number;
}

export interface SubdivideParcelOptions {
  /** Stop splitting a parcel once its area drops to/below this. Default 400. */
  targetArea?: number;
  /** Hard recursion cap regardless of area. Default 8. */
  maxDepth?: number;
  /** Randomize the cut position away from the exact middle, 0..0.45. Default 0.15. */
  splitJitter?: number;
  /** Random chance (0..1) a parcel skips a split it was otherwise due for,
   *  giving an uneven, organic block-size mix. Default 0.1. */
  irregularity?: number;
  /** Drop parcels whose area is below this after subdivision. Default 0. */
  minArea?: number;
  /** Drop parcels whose perimeter is below this after subdivision. Default 0. */
  minPerimeter?: number;
  /** Deterministic seed. Default 1. */
  seed?: number;
}

// ---------------------------------------------------------------------------
// 2D polygon helpers (XZ plane; Y is carried through untouched)
// ---------------------------------------------------------------------------

/** Signed area on XZ (positive => CCW when viewed from +Y down). */
export function polygonSignedAreaXZ(ring: ReadonlyArray<Vec3>): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a * 0.5;
}

/** Unsigned planar area on XZ. */
export function polygonAreaXZ(ring: ReadonlyArray<Vec3>): number {
  return Math.abs(polygonSignedAreaXZ(ring));
}

/** Ring perimeter on XZ. */
export function polygonPerimeterXZ(ring: ReadonlyArray<Vec3>): number {
  let per = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    per += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return per;
}

/** Area-weighted centroid on XZ (keeps the ring's shared Y). */
export function polygonCentroidXZ(ring: ReadonlyArray<Vec3>): Vec3 {
  let cx = 0;
  let cz = 0;
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const cr = p.x * q.z - q.x * p.z;
    a += cr;
    cx += (p.x + q.x) * cr;
    cz += (p.z + q.z) * cr;
  }
  if (Math.abs(a) < 1e-9) {
    let mx = 0;
    let mz = 0;
    for (const p of ring) {
      mx += p.x;
      mz += p.z;
    }
    return vec3(mx / n, ring[0]?.y ?? 0, mz / n);
  }
  const f = 1 / (3 * a);
  return vec3(cx * f, ring[0]?.y ?? 0, cz * f);
}

/** Ensure CCW winding on XZ. Returns the same array or a reversed copy. */
function ensureCCW(ring: Vec3[]): Vec3[] {
  return polygonSignedAreaXZ(ring) < 0 ? ring.slice().reverse() : ring;
}

// ---------------------------------------------------------------------------
// Convex-polygon splitting: cut a ring by an infinite XZ line, keep both sides
// ---------------------------------------------------------------------------

/** Signed distance of (x,z) from the line through `p0` with unit normal n. */
function sideOf(px: number, pz: number, p0: Vec3, nx: number, nz: number): number {
  return (px - p0.x) * nx + (pz - p0.z) * nz;
}

/**
 * Split a convex ring by the infinite line { p | (p - p0) . n = 0 }. Returns the
 * two convex halves (positive side, negative side). Either may be null if the
 * line misses the polygon. Y is interpolated along cut edges.
 */
function splitConvexByLine(
  ring: ReadonlyArray<Vec3>,
  p0: Vec3,
  nx: number,
  nz: number,
): { pos: Vec3[] | null; neg: Vec3[] | null } {
  const n = ring.length;
  const pos: Vec3[] = [];
  const neg: Vec3[] = [];
  const eps = 1e-7;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const da = sideOf(a.x, a.z, p0, nx, nz);
    const db = sideOf(b.x, b.z, p0, nx, nz);
    if (da >= -eps) pos.push(a);
    if (da <= eps) neg.push(a);
    // Edge crosses the line: emit the intersection to both halves.
    if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
      const t = da / (da - db);
      const cut = vec3(
        a.x + t * (b.x - a.x),
        a.y + t * (b.y - a.y),
        a.z + t * (b.z - a.z),
      );
      pos.push(cut);
      neg.push(cut);
    }
  }
  return {
    pos: pos.length >= 3 ? pos : null,
    neg: neg.length >= 3 ? neg : null,
  };
}

/** One street centerline segment produced by a subdivision cut. */
export interface StreetSegment {
  a: Vec3;
  b: Vec3;
  /** Recursion depth of the cut (0 = the first, widest arterial cut). */
  depth: number;
}

/**
 * Slice a simple polygon (convex OR concave, no holes) by the infinite line
 * { p | (p - p0) . n = 0 }. Returns every closed loop on each side — a concave
 * cut can yield more than one loop per side, which the convex splitter cannot
 * represent. Also returns the interior cut segments (where the line actually
 * runs through the polygon) so callers can lay real road geometry along them.
 *
 * Method: insert intersection points along crossed edges, then walk the
 * augmented ring keeping only edges that stay on the target side, and bridge
 * the dangling cut points in sorted order along the line.
 */
export function slicePolygonByLine(
  ring: ReadonlyArray<Vec3>,
  p0: Vec3,
  nx: number,
  nz: number,
): { pos: Vec3[][]; neg: Vec3[][]; cuts: { a: Vec3; b: Vec3 }[] } {
  const eps = 1e-7;
  const dirX = -nz; // unit direction along the line
  const dirZ = nx;
  const N = ring.length;

  interface AugV {
    p: Vec3;
    s: number; // -1 / 0 / +1 side
    q: number; // parameter along the line
  }
  const aug: AugV[] = [];
  for (let i = 0; i < N; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % N]!;
    const da = sideOf(a.x, a.z, p0, nx, nz);
    const db = sideOf(b.x, b.z, p0, nx, nz);
    const sa = Math.abs(da) < eps ? 0 : da > 0 ? 1 : -1;
    aug.push({ p: a, s: sa, q: (a.x - p0.x) * dirX + (a.z - p0.z) * dirZ });
    if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
      const t = da / (da - db);
      const cp = vec3(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z));
      aug.push({ p: cp, s: 0, q: (cp.x - p0.x) * dirX + (cp.z - p0.z) * dirZ });
    }
  }
  const M = aug.length;

  // Interior cut segments: sort cut points along the line, pair them up.
  const cutIdx = aug.map((v, i) => (v.s === 0 ? i : -1)).filter((i) => i >= 0);
  cutIdx.sort((i, j) => aug[i]!.q - aug[j]!.q);
  const cuts: { a: Vec3; b: Vec3 }[] = [];
  for (let k = 0; k + 1 < cutIdx.length; k += 2) {
    cuts.push({ a: aug[cutIdx[k]!]!.p, b: aug[cutIdx[k + 1]!]!.p });
  }

  const extractSide = (S: number): Vec3[][] => {
    // Keep polygon edge i->i+1 only if it never dips to the -S side.
    const next: number[] = new Array(M).fill(-1);
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      const si = aug[i]!.s;
      const sj = aug[j]!.s;
      if ((si === S || si === 0) && (sj === S || sj === 0)) next[i] = j;
    }
    // Dangling cut points: exits (kept-edge in, none out) and entries (none in).
    const hasOut = (i: number) => next[i] !== -1;
    const inCount: number[] = new Array(M).fill(0);
    for (let i = 0; i < M; i++) if (next[i] !== -1) inCount[next[i]!]!++;
    const exits: number[] = [];
    const entries: number[] = [];
    for (let i = 0; i < M; i++) {
      if (aug[i]!.s !== 0) continue;
      if (!hasOut(i)) exits.push(i);
      if (inCount[i] === 0) entries.push(i);
    }
    // Bridge exits to entries in sorted-line order (pair interior spans).
    exits.sort((a, b) => aug[a]!.q - aug[b]!.q);
    entries.sort((a, b) => aug[a]!.q - aug[b]!.q);
    // For side S the bridge runs opposite the interior-span direction; match
    // each exit to the nearest available entry that closes an interior span.
    const usedEntry = new Set<number>();
    for (const ex of exits) {
      let bestE = -1;
      let bestD = Infinity;
      for (const en of entries) {
        if (usedEntry.has(en)) continue;
        const d = Math.abs(aug[en]!.q - aug[ex]!.q);
        if (d < bestD) {
          bestD = d;
          bestE = en;
        }
      }
      if (bestE >= 0) {
        next[ex] = bestE;
        usedEntry.add(bestE);
      }
    }
    // Trace loops.
    const loops: Vec3[][] = [];
    const seen = new Set<number>();
    for (let start = 0; start < M; start++) {
      if (next[start] === -1 || seen.has(start)) continue;
      const loop: Vec3[] = [];
      let cur = start;
      let guard = 0;
      while (cur !== -1 && !seen.has(cur) && guard++ < M + 4) {
        seen.add(cur);
        loop.push(aug[cur]!.p);
        cur = next[cur]!;
      }
      if (loop.length >= 3 && Math.abs(polygonSignedAreaXZ(loop)) > eps) {
        loops.push(loop);
      }
    }
    return loops;
  };

  return { pos: extractSide(1), neg: extractSide(-1), cuts };
}

/**
 * Oriented bounding box on XZ via a coarse rotating-calipers sweep. Returns the
 * longest axis direction (unit) and the extent along it — the direction we cut
 * perpendicular to, so blocks stay roughly square rather than getting slivered.
 */
function longestAxisXZ(ring: ReadonlyArray<Vec3>): { dirX: number; dirZ: number; extent: number } {
  let best = { dirX: 1, dirZ: 0, extent: 0 };
  const steps = 12; // 0..90deg in 7.5deg increments (box is symmetric).
  for (let s = 0; s < steps; s++) {
    const ang = (s / steps) * (Math.PI / 2);
    const ax = Math.cos(ang);
    const az = Math.sin(ang);
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of ring) {
      const a = p.x * ax + p.z * az;
      const b = -p.x * az + p.z * ax;
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }
    const extA = maxA - minA;
    const extB = maxB - minB;
    if (extA > best.extent) best = { dirX: ax, dirZ: az, extent: extA };
    if (extB > best.extent) best = { dirX: -az, dirZ: ax, extent: extB };
  }
  return best;
}

/** Oriented bounding box of a parcel ring on XZ — for placing buildings that
 *  align to the block rather than the world axes. `u`/`v` are the unit box
 *  axes, `extU`/`extV` their extents, `center` the box middle (ring Y kept). */
export interface ParcelOBB {
  center: Vec3;
  u: { x: number; z: number };
  v: { x: number; z: number };
  extU: number;
  extV: number;
  /** CCW rotation about +Y (radians) that maps world +X onto axis `u`. */
  angleY: number;
}

export function parcelOBB(ring: ReadonlyArray<Vec3>): ParcelOBB {
  const axis = longestAxisXZ(ring);
  const ux = axis.dirX;
  const uz = axis.dirZ;
  const vx = -uz;
  const vz = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let y = 0;
  for (const p of ring) {
    const a = p.x * ux + p.z * uz;
    const b = p.x * vx + p.z * vz;
    if (a < minU) minU = a;
    if (a > maxU) maxU = a;
    if (b < minV) minV = b;
    if (b > maxV) maxV = b;
    y = p.y;
  }
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  return {
    center: vec3(ux * midU + vx * midV, y, uz * midU + vz * midV),
    u: { x: ux, z: uz },
    v: { x: vx, z: vz },
    extU: maxU - minU,
    extV: maxV - minV,
    // world +X (1,0) rotated by -angleY about +Y lands on u=(ux,uz):
    // rotationY(theta) maps +X to (cos, -sin) in XZ, so angle = atan2(-uz, ux).
    angleY: Math.atan2(-uz, ux),
  };
}

/** Result of a subdivision that also records the street network. */
export interface CitySubdivision {
  /** Buildable city blocks (leaves of the recursion, after the filter). */
  parcels: Parcel[];
  /** Every interior cut segment — the street centerlines. */
  streets: StreetSegment[];
}

/**
 * Recursively subdivide a land polygon into city blocks, recording the cut
 * lines as a street network. Each recursion cuts the parcel perpendicular to
 * its longest axis; the general polygon slicer handles convex AND concave land,
 * so an L- or U-shaped plot splits faithfully (a cut may spawn more than one
 * child per side). Parcels stop dividing at `targetArea` / `maxDepth`.
 *
 * The boundary may be given CW or CCW; it is normalized to CCW.
 */
export function subdivideCity(
  boundary: ReadonlyArray<Vec3>,
  opts: SubdivideParcelOptions = {},
): CitySubdivision {
  const targetArea = opts.targetArea ?? 400;
  const maxDepth = opts.maxDepth ?? 8;
  const splitJitter = Math.max(0, Math.min(0.45, opts.splitJitter ?? 0.15));
  const irregularity = Math.max(0, Math.min(1, opts.irregularity ?? 0.1));
  const minArea = opts.minArea ?? 0;
  const minPerimeter = opts.minPerimeter ?? 0;
  const rng = makeRng((opts.seed ?? 1) >>> 0);

  const root = ensureCCW(boundary.slice());
  const parcels: Parcel[] = [];
  const streets: StreetSegment[] = [];

  const leaf = (ring: Vec3[], depth: number): void => {
    const area = polygonAreaXZ(ring);
    const perimeter = polygonPerimeterXZ(ring);
    if (area >= minArea && perimeter >= minPerimeter) {
      parcels.push({ ring, area, perimeter, depth });
    }
  };

  const recurse = (ring: Vec3[], depth: number, r: Rng): void => {
    const area = polygonAreaXZ(ring);
    const smallEnough = area <= targetArea || depth >= maxDepth;
    const skip = depth > 0 && r.next() < irregularity;
    if (smallEnough || skip) {
      leaf(ring, depth);
      return;
    }
    const axis = longestAxisXZ(ring);
    const c = polygonCentroidXZ(ring);
    const jitter = (r.next() * 2 - 1) * splitJitter;
    const p0 = vec3(
      c.x + axis.dirX * axis.extent * jitter,
      c.y,
      c.z + axis.dirZ * axis.extent * jitter,
    );
    const { pos, neg, cuts } = slicePolygonByLine(ring, p0, axis.dirX, axis.dirZ);
    if (pos.length === 0 || neg.length === 0) {
      leaf(ring, depth); // Degenerate cut — accept as a leaf.
      return;
    }
    for (const cut of cuts) streets.push({ a: cut.a, b: cut.b, depth });
    for (const loop of pos) recurse(loop, depth + 1, r.fork());
    for (const loop of neg) recurse(loop, depth + 1, r.fork());
  };

  recurse(root, 0, rng);
  return { parcels, streets };
}

/**
 * Recursively subdivide a land polygon into city blocks (convex or concave).
 * Convenience wrapper over {@link subdivideCity} that returns just the blocks.
 */
export function subdivideParcel(
  boundary: ReadonlyArray<Vec3>,
  opts: SubdivideParcelOptions = {},
): Parcel[] {
  return subdivideCity(boundary, opts).parcels;
}

// ---------------------------------------------------------------------------
// Convex inset — shrink a parcel toward its interior to open up road gaps
// ---------------------------------------------------------------------------

/**
 * Inset a convex ring inward by `dist` (world units) on XZ. Each edge is pushed
 * along its inward normal; consecutive pushed edges are re-intersected to find
 * the new corner. Returns null if the ring collapses (parcel narrower than
 * 2*dist). Assumes CCW winding.
 */
export function insetConvexRingXZ(ring: ReadonlyArray<Vec3>, dist: number): Vec3[] | null {
  if (dist <= 0) return ring.slice();
  const n = ring.length;
  if (n < 3) return null;
  // Inward normal of edge (a->b) for CCW ring is (-dz, dx) normalized... but
  // we detect orientation from signed area to be safe.
  const ccw = polygonSignedAreaXZ(ring) >= 0;
  interface Line {
    px: number;
    pz: number;
    nx: number;
    nz: number;
  }
  const lines: Line[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Left normal for CCW points inward; flip for CW.
    let nx = -dz / len;
    let nz = dx / len;
    if (!ccw) {
      nx = -nx;
      nz = -nz;
    }
    lines.push({ px: a.x + nx * dist, pz: a.z + nz * dist, nx, nz });
  }
  const result: Vec3[] = [];
  const y = ring[0]!.y;
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n]!;
    const l2 = lines[i]!;
    // Intersect the two offset lines (point + direction perpendicular to normal).
    const d1x = -l1.nz;
    const d1z = l1.nx;
    const d2x = -l2.nz;
    const d2z = l2.nx;
    const denom = d1x * d2z - d1z * d2x;
    if (Math.abs(denom) < 1e-9) {
      result.push(vec3(l2.px, y, l2.pz));
      continue;
    }
    const t = ((l2.px - l1.px) * d2z - (l2.pz - l1.pz) * d2x) / denom;
    result.push(vec3(l1.px + d1x * t, y, l1.pz + d1z * t));
  }
  // Reject collapsed / inverted rings (inset >= half the parcel's min width).
  // A valid convex inset must (a) keep the original winding and (b) enclose a
  // strictly smaller area than the source ring.
  const srcArea = Math.abs(polygonSignedAreaXZ(ring));
  const outSigned = polygonSignedAreaXZ(result);
  if (Math.abs(outSigned) < 1e-6) return null;
  if ((outSigned >= 0) !== ccw) return null;
  if (Math.abs(outSigned) >= srcArea) return null;
  if (!isSimpleRingXZ(result)) return null;
  if (!hasUpwardTriangulationXZ(result)) return null;
  return result;
}

/** True if every interior angle is convex (polygon has no reflex vertices). */
function isConvexXZ(ring: ReadonlyArray<Vec3>): boolean {
  const n = ring.length;
  if (n < 4) return true;
  const ccw = polygonSignedAreaXZ(ring) >= 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const c = ring[(i + 2) % n]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (ccw ? cross < -1e-7 : cross > 1e-7) return false;
  }
  return true;
}

function isSimpleRingXZ(ring: ReadonlyArray<Vec3>): boolean {
  const n = ring.length;
  if (n < 3) return false;
  const orient = (a: Vec3, b: Vec3, c: Vec3): number =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const onSegment = (a: Vec3, b: Vec3, p: Vec3): boolean =>
    p.x >= Math.min(a.x, b.x) - 1e-7 &&
    p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.z >= Math.min(a.z, b.z) - 1e-7 &&
    p.z <= Math.max(a.z, b.z) + 1e-7;
  const intersects = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean => {
    const abC = orient(a, b, c);
    const abD = orient(a, b, d);
    const cdA = orient(c, d, a);
    const cdB = orient(c, d, b);
    if (((abC > 1e-7 && abD < -1e-7) || (abC < -1e-7 && abD > 1e-7)) &&
        ((cdA > 1e-7 && cdB < -1e-7) || (cdA < -1e-7 && cdB > 1e-7))) return true;
    if (Math.abs(abC) <= 1e-7 && onSegment(a, b, c)) return true;
    if (Math.abs(abD) <= 1e-7 && onSegment(a, b, d)) return true;
    if (Math.abs(cdA) <= 1e-7 && onSegment(c, d, a)) return true;
    if (Math.abs(cdB) <= 1e-7 && onSegment(c, d, b)) return true;
    return false;
  };
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (intersects(a, b, c, d)) return false;
    }
  }
  return true;
}

function hasUpwardTriangulationXZ(ring: ReadonlyArray<Vec3>): boolean {
  const indices = earClipXZ(ring);
  if (indices.length !== Math.max(0, ring.length - 2) * 3) return false;
  for (let i = 0; i < indices.length; i += 3) {
    const a = ring[indices[i]!]!;
    const b = ring[indices[i + 1]!]!;
    const c = ring[indices[i + 2]!]!;
    const windingY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (windingY <= 1e-8) return false;
  }
  return true;
}

/**
 * Inset any simple ring inward by `dist` on XZ. Uses the exact edge-offset for
 * convex rings; for concave rings it falls back to an edge-offset that clamps
 * reflex corners (good enough to open road gaps around L/U blocks). Returns
 * null if the ring would collapse.
 */
export function insetRingXZ(ring: ReadonlyArray<Vec3>, dist: number): Vec3[] | null {
  if (dist <= 0) return ring.slice();
  if (isConvexXZ(ring)) return insetConvexRingXZ(ring, dist);

  // Concave: offset each edge inward, intersect neighbours, then verify the
  // result is still simple-ish by area/winding. Reflex corners can overshoot,
  // so clamp each new vertex toward the centroid if it flips outside.
  const n = ring.length;
  const ccw = polygonSignedAreaXZ(ring) >= 0;
  const y = ring[0]!.y;
  const c = polygonCentroidXZ(ring);
  const result: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    // Inward normals of the two edges meeting at `cur`.
    const inN = (ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      let nx = -dz / len;
      let nz = dx / len;
      if (!ccw) {
        nx = -nx;
        nz = -nz;
      }
      return { nx, nz };
    };
    const n1 = inN(prev.x, prev.z, cur.x, cur.z);
    const n2 = inN(cur.x, cur.z, next.x, next.z);
    let mx = (n1.nx + n2.nx) / 2;
    let mz = (n1.nz + n2.nz) / 2;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    result.push(vec3(cur.x + mx * dist, y, cur.z + mz * dist));
  }
  const srcArea = Math.abs(polygonSignedAreaXZ(ring));
  const outSigned = polygonSignedAreaXZ(result);
  if (Math.abs(outSigned) < 1e-6) return null;
  if ((outSigned >= 0) !== ccw) return null;
  if (Math.abs(outSigned) >= srcArea) return null;
  if (!isSimpleRingXZ(result)) return null;
  if (!hasUpwardTriangulationXZ(result)) return null;
  return result;
}

// ---------------------------------------------------------------------------
// Meshing — fan-triangulate flat convex rings on the XZ plane
// ---------------------------------------------------------------------------

/**
 * Triangulate a flat (constant-Y) ring into an upward-facing (+Y) plate.
 * Handles convex AND concave rings via ear clipping, so blocks cut from an
 * L-shaped plot mesh correctly. `lift` offsets the plate above the ring's Y
 * (e.g. to sit blocks just above the road slab and avoid z-fighting).
 */
export function ringToPlate(ring: ReadonlyArray<Vec3>, lift = 0): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  for (const p of ring) {
    positions.push(vec3(p.x, p.y + lift, p.z));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2((p.x - minX) / spanX, (p.z - minZ) / spanZ));
  }
  const indices = earClipXZ(ring);
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * Ear-clipping triangulation of a simple XZ polygon (no holes). Returns a flat
 * index list winding CCW-up. Works for convex and concave rings.
 */
function earClipXZ(ring: ReadonlyArray<Vec3>): number[] {
  const n = ring.length;
  if (n < 3) return [];
  const ccw = polygonSignedAreaXZ(ring) >= 0;
  // Work on an index list in CCW order.
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);

  const area2 = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const pointInTri = (
    px: number, pz: number,
    ax: number, az: number, bx: number, bz: number, cx: number, cz: number,
  ): boolean => {
    const d1 = area2(px, pz, ax, az, bx, bz);
    const d2 = area2(px, pz, bx, bz, cx, cz);
    const d3 = area2(px, pz, cx, cz, ax, az);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  const out: number[] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length]!;
      const i1 = idx[i]!;
      const i2 = idx[(i + 1) % idx.length]!;
      const a = ring[i0]!;
      const b = ring[i1]!;
      const c = ring[i2]!;
      // Convex corner? (CCW => positive area)
      if (area2(a.x, a.z, b.x, b.z, c.x, c.z) <= 0) continue;
      // No other vertex inside the ear triangle?
      let ok = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = ring[j]!;
        if (pointInTri(p.x, p.z, a.x, a.z, b.x, b.z, c.x, c.z)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Emit ear, winding for +Y up (CCW ring already normalized): (i0,i2,i1).
      out.push(i0, i2, i1);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // Degenerate — bail with what we have.
  }
  if (idx.length === 3) out.push(idx[0]!, idx[2]!, idx[1]!);
  return out;
}

function emptyMesh(): Mesh {
  return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
}

function merged(meshes: Mesh[]): Mesh {
  return meshes.length ? recomputeNormals(merge(...meshes)) : emptyMesh();
}

function streetLen(s: StreetSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
}

function streetHalfWidth(streetWidth: number, taper: number, minDepth: number, s: StreetSegment): number {
  const level = Math.max(0, s.depth - (isFinite(minDepth) ? minDepth : 0));
  return (streetWidth / 2) * Math.pow(taper, level);
}

function stableSignedNoise(s: StreetSegment, seed: number): number {
  const n = Math.sin((s.a.x * 12.9898 + s.a.z * 78.233 + s.b.x * 37.719 + s.b.z * 11.13 + seed * 0.731) * 43758.5453);
  return (n - Math.floor(n)) * 2 - 1;
}

function curvedStreetPoints(s: StreetSegment, groundY: number, curveAmount: number, seed: number): Vec3[] {
  const a = vec3(s.a.x, groundY, s.a.z);
  const b = vec3(s.b.x, groundY, s.b.z);
  const len = streetLen(s);
  if (curveAmount <= 1e-6 || len < 1e-6) return [a, b];
  const tx = (b.x - a.x) / len;
  const tz = (b.z - a.z) / len;
  const rx = -tz;
  const rz = tx;
  const bend = Math.max(-len * 0.18, Math.min(len * 0.18, curveAmount * stableSignedNoise(s, seed)));
  const mid = vec3((a.x + b.x) * 0.5 + rx * bend, groundY, (a.z + b.z) * 0.5 + rz * bend);
  return [a, mid, b];
}

function offsetPathXZ(points: ReadonlyArray<Vec3>, lateral: number): Vec3[] {
  if (points.length < 2 || Math.abs(lateral) < 1e-9) return points.slice();
  const out: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const rx = -dz / len;
    const rz = dx / len;
    const p = points[i]!;
    out.push(vec3(p.x + rx * lateral, p.y, p.z + rz * lateral));
  }
  return out;
}

function axisAngleYForX(x: number, z: number): number {
  return Math.atan2(-z, x);
}

function orientedFlatBox(width: number, depth: number, center: Vec3, axisX: { x: number; z: number }, height: number): Mesh {
  return transform(box(width, height, depth), {
    rotate: vec3(0, axisAngleYForX(axisX.x, axisX.z), 0),
    translate: center,
  });
}

function circlePlate(center: Vec3, radius: number, y: number, segments = 40): Mesh {
  const ring: Vec3[] = [];
  const n = Math.max(12, Math.floor(segments));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push(vec3(center.x + Math.cos(a) * radius, y, center.z + Math.sin(a) * radius));
  }
  return ringToPlate(ring);
}

function annulusPlate(center: Vec3, innerRadius: number, outerRadius: number, y: number, segments = 48): Mesh {
  const seg = Math.max(12, Math.floor(segments));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    positions.push(
      vec3(center.x + ca * innerRadius, y, center.z + sa * innerRadius),
      vec3(center.x + ca * outerRadius, y, center.z + sa * outerRadius),
    );
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    uvs.push(vec2(0, i / seg), vec2(1, i / seg));
  }
  for (let i = 0; i < seg; i++) {
    const inner0 = i * 2;
    const outer0 = inner0 + 1;
    const inner1 = inner0 + 2;
    const outer1 = inner0 + 3;
    indices.push(outer0, inner1, outer1, outer0, inner0, inner1);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

interface StreetArm {
  dirX: number;
  dirZ: number;
  halfWidth: number;
}

interface StreetNode {
  point: Vec3;
  arms: StreetArm[];
}

interface StreetJunctionTrim {
  point: Vec3;
  radius: number;
}

function segmentIntersectionXZ(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 | null {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = c.x - a.x;
  const qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return vec3(a.x + rx * t, a.y + (b.y - a.y) * t, a.z + rz * t);
}

function pointSegParamXZ(p: Vec3, a: Vec3, b: Vec3): { u: number; dist: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-12) return { u: 0, dist: Math.hypot(p.x - a.x, p.z - a.z) };
  const raw = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  const u = Math.max(0, Math.min(1, raw));
  const x = a.x + dx * u;
  const z = a.z + dz * u;
  return { u, dist: Math.hypot(p.x - x, p.z - z) };
}

function addCandidatePoint(points: Vec3[], p: Vec3, eps: number): void {
  for (const q of points) {
    if (Math.hypot(q.x - p.x, q.z - p.z) <= eps) return;
  }
  points.push(p);
}

function addArm(arms: StreetArm[], dirX: number, dirZ: number, halfWidth: number): void {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-8) return;
  const ax = dirX / len;
  const az = dirZ / len;
  for (const arm of arms) {
    if (arm.dirX * ax + arm.dirZ * az > 0.985) {
      arm.halfWidth = Math.max(arm.halfWidth, halfWidth);
      return;
    }
  }
  arms.push({ dirX: ax, dirZ: az, halfWidth });
}

function streetNodes(streets: ReadonlyArray<StreetSegment>, halfWidths: ReadonlyArray<number>, groundY: number): StreetNode[] {
  const candidates: Vec3[] = [];
  const eps = 1e-4;
  for (const s of streets) {
    addCandidatePoint(candidates, vec3(s.a.x, groundY, s.a.z), eps);
    addCandidatePoint(candidates, vec3(s.b.x, groundY, s.b.z), eps);
  }
  for (let i = 0; i < streets.length; i++) {
    for (let j = i + 1; j < streets.length; j++) {
      const hit = segmentIntersectionXZ(streets[i]!.a, streets[i]!.b, streets[j]!.a, streets[j]!.b);
      if (hit) addCandidatePoint(candidates, vec3(hit.x, groundY, hit.z), eps);
    }
  }

  const nodes: StreetNode[] = [];
  for (const p of candidates) {
    const arms: StreetArm[] = [];
    for (let i = 0; i < streets.length; i++) {
      const s = streets[i]!;
      const len = streetLen(s);
      if (len < 1e-6) continue;
      const hit = pointSegParamXZ(p, s.a, s.b);
      if (hit.dist > 1e-3) continue;
      const hw = halfWidths[i] ?? 1;
      if (hit.u > 1e-4 && hit.u < 1 - 1e-4) {
        addArm(arms, s.a.x - p.x, s.a.z - p.z, hw);
        addArm(arms, s.b.x - p.x, s.b.z - p.z, hw);
      } else if (hit.u <= 1e-4) {
        addArm(arms, s.b.x - s.a.x, s.b.z - s.a.z, hw);
      } else {
        addArm(arms, s.a.x - s.b.x, s.a.z - s.b.z, hw);
      }
    }
    if (arms.length >= 2) nodes.push({ point: p, arms });
  }
  return nodes;
}

function pointAtNormalizedPathPosition(points: ReadonlyArray<Vec3>, position: number): Vec3 {
  const scaled = Math.max(0, Math.min(1, position)) * (points.length - 1);
  const segmentIndex = Math.min(points.length - 2, Math.floor(scaled));
  const alpha = scaled - segmentIndex;
  const start = points[segmentIndex]!;
  const end = points[segmentIndex + 1]!;
  return vec3(
    start.x + (end.x - start.x) * alpha,
    start.y + (end.y - start.y) * alpha,
    start.z + (end.z - start.z) * alpha,
  );
}

function sliceNormalizedPath(points: ReadonlyArray<Vec3>, start: number, end: number): Vec3[] {
  const sliced = [pointAtNormalizedPathPosition(points, start)];
  for (let index = 1; index < points.length - 1; index++) {
    const position = index / (points.length - 1);
    if (position > start + 1e-8 && position < end - 1e-8) sliced.push(points[index]!);
  }
  sliced.push(pointAtNormalizedPathPosition(points, end));
  return sliced;
}

function trimmedStreetPaths(
  street: StreetSegment,
  points: ReadonlyArray<Vec3>,
  junctions: ReadonlyArray<StreetJunctionTrim>,
): Vec3[][] {
  const length = streetLen(street);
  if (length < 1e-8) return [];
  const excluded: Array<{ start: number; end: number }> = [];
  for (const junction of junctions) {
    const hit = pointSegParamXZ(junction.point, street.a, street.b);
    if (hit.dist > 1e-3) continue;
    const trim = junction.radius / length;
    excluded.push({ start: Math.max(0, hit.u - trim), end: Math.min(1, hit.u + trim) });
  }
  excluded.sort((first, second) => first.start - second.start);
  const mergedExclusions: Array<{ start: number; end: number }> = [];
  for (const interval of excluded) {
    const previous = mergedExclusions[mergedExclusions.length - 1];
    if (previous && interval.start <= previous.end + 1e-8) previous.end = Math.max(previous.end, interval.end);
    else mergedExclusions.push({ ...interval });
  }

  const included: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const interval of mergedExclusions) {
    if (interval.start - cursor > 1e-5) included.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (1 - cursor > 1e-5) included.push({ start: cursor, end: 1 });
  return included
    .filter((interval) => (interval.end - interval.start) * length >= 0.05)
    .map((interval) => sliceNormalizedPath(points, interval.start, interval.end));
}

function zebraCrosswalk(node: StreetNode, arm: StreetArm, radius: number, y: number): Mesh {
  const meshes: Mesh[] = [];
  const right = { x: -arm.dirZ, z: arm.dirX };
  const barLength = arm.halfWidth * 1.9;
  const barDepth = 0.34;
  const gap = 0.28;
  const count = 5;
  const start = radius + 0.75 + barDepth * 0.5;
  for (let i = 0; i < count; i++) {
    const d = start + i * (barDepth + gap);
    const c = vec3(node.point.x + arm.dirX * d, y, node.point.z + arm.dirZ * d);
    meshes.push(orientedFlatBox(barLength, barDepth, c, right, 0.006));
  }
  return merged(meshes);
}

export interface CityRoadMeshes {
  /** Swept asphalt road ribbons. */
  asphaltMesh: Mesh;
  /** Lane lines, edge lines and roundabout ring markings. */
  markingMesh: Mesh;
  /** Raised pedestrian sidewalk strips beside roads. */
  sidewalkMesh: Mesh;
  /** Curbstones along road edges. */
  curbMesh: Mesh;
  /** Filled asphalt pads at arbitrary-angle junctions. */
  intersectionMesh: Mesh;
  /** Zebra crossings around junctions / roundabouts. */
  crosswalkMesh: Mesh;
  /** Asphalt discs for generated roundabouts. */
  roundaboutMesh: Mesh;
  /** Raised centre islands inside roundabouts. */
  islandMesh: Mesh;
}

export interface CityBlocksOptions extends SubdivideParcelOptions {
  /** Width of the streets carved between blocks (world units). Default 6. */
  streetWidth?: number;
  /** Y height of the block plates above the ground slab. Default 0.05. */
  blockLift?: number;
  /** Also emit a ground slab under everything. Default true. */
  groundSlab?: boolean;
  /** Ground slab Y (top surface). Default 0. */
  groundY?: number;
  /**
   * Build real swept road ribbons (asphalt + lane lines) along the street
   * centerlines instead of relying on the bare ground slab showing through the
   * gaps. Default true. Set false for just block plates + ground.
   */
  realRoads?: boolean;
  /** Narrow deeper (minor) streets: multiplier per depth level, clamped. Default 0.82. */
  streetTaper?: number;
  /** Width of each sidewalk strip outside the carriageway. Default 2. */
  sidewalkWidth?: number;
  /** Draw curbstones on both road edges. Default true. */
  curbs?: boolean;
  /** Curb height. Default 0.16. */
  curbHeight?: number;
  /** Curb width. Default 0.18. */
  curbWidth?: number;
  /** Draw lane divider markings. Default true. */
  laneLines?: boolean;
  /** Draw solid road edge markings. Default true. */
  edgeLines?: boolean;
  /** Draw zebra crossings at junction arms. Default true. */
  crosswalks?: boolean;
  /** Fill arbitrary-angle junctions with asphalt pads. Default true. */
  intersectionPads?: boolean;
  /** Replace 3+ arm junction pads with roundabouts. Default false. */
  roundabouts?: boolean;
  /** Minimum junction arm count to become a roundabout. Default 3. */
  roundaboutMinArms?: number;
  /** Override roundabout outer radius. Default derives from road width. */
  roundaboutRadius?: number;
  /** Override roundabout centre island radius. Default derives from road width. */
  roundaboutIslandRadius?: number;
  /** Road sampling distance for swept ribbons. Default 1. */
  roadSampleDistance?: number;
  /** Total lane count across road width. Default 2. */
  roadLanes?: number;
  /** Visual bend amount for swept road centerlines, in world units. Default 0. */
  roadCurveAmount?: number;
}

export interface CityBlocksResult {
  /** Surviving blocks after subdivision + inset (the buildable parcels). */
  blocks: Parcel[];
  /** The inset ring per block (what you place buildings inside). */
  insetRings: Vec3[][];
  /** The street centerline segments (arterials at depth 0, minor deeper). */
  streets: StreetSegment[];
  /** Combined ground + roads + block-plate mesh, ready to render. */
  mesh: Mesh;
  /** Combined road-related mesh. Use `roadParts` for separate materials. */
  roadMesh: Mesh;
  /** Road network split into material groups. */
  roadParts: CityRoadMeshes;
  /** Ground slab + block plates only (no roads), for a separate base material. */
  baseMesh: Mesh;
}

/**
 * Full tutorial pipeline in one call: take a land boundary, cut it into a road
 * network of blocks (convex or concave), drop the slivers, inset each block by
 * half the street width to open the roads, sweep real asphalt ribbons + lane
 * lines along the street centerlines, and triangulate everything into one mesh.
 */
export function cityBlocks(
  boundary: ReadonlyArray<Vec3>,
  opts: CityBlocksOptions = {},
): CityBlocksResult {
  const streetWidth = opts.streetWidth ?? 6;
  const blockLift = opts.blockLift ?? 0.05;
  const groundY = opts.groundY ?? 0;
  const wantGround = opts.groundSlab ?? true;
  const wantRoads = opts.realRoads ?? true;
  const taper = Math.max(0.4, Math.min(1, opts.streetTaper ?? 0.82));
  const sidewalkWidth = Math.max(0, opts.sidewalkWidth ?? 2);
  const wantCurbs = opts.curbs ?? true;
  const wantLaneLines = opts.laneLines ?? true;
  const wantEdgeLines = opts.edgeLines ?? true;
  const wantCrosswalks = opts.crosswalks ?? true;
  const wantPads = opts.intersectionPads ?? true;
  const wantRoundabouts = opts.roundabouts ?? false;
  const roundaboutMinArms = Math.max(3, Math.round(opts.roundaboutMinArms ?? 3));
  const sampleDistance = Math.max(0.25, opts.roadSampleDistance ?? 1);
  const laneCount = Math.max(2, Math.round(opts.roadLanes ?? 2));
  const roadCurveAmount = Math.max(0, opts.roadCurveAmount ?? 0);
  const seed = (opts.seed ?? 1) >>> 0;
  const markingRibbonOffset = Math.max(0.035, blockLift + 0.004);
  const raisedMarkingY = groundY + Math.max(0.052, blockLift + 0.014);
  const raisedCrosswalkY = groundY + 0.039;

  const { parcels, streets } = subdivideCity(boundary, opts);
  const blocks: Parcel[] = [];
  const insetRings: Vec3[][] = [];
  const meshes: Mesh[] = [];
  const asphalt: Mesh[] = [];
  const markings: Mesh[] = [];
  const sidewalks: Mesh[] = [];
  const curbs: Mesh[] = [];
  const intersections: Mesh[] = [];
  const crosswalks: Mesh[] = [];
  const roundabouts: Mesh[] = [];
  const islands: Mesh[] = [];

  if (wantGround) {
    const g = ensureCCW(boundary.slice()).map((p) => vec3(p.x, groundY, p.z));
    meshes.push(ringToPlate(g, 0));
  }

  // Real roads: sweep asphalt, paint, sidewalks and junction geometry.
  if (wantRoads) {
    const minDepth = streets.reduce((m, s) => Math.min(m, s.depth), Infinity);
    const halfWidths = streets.map((s) => streetHalfWidth(streetWidth, taper, minDepth, s));
    const nodes = streetNodes(streets, halfWidths, groundY);
    const nodeRadius = new Map<StreetNode, number>();
    const junctionTrims: StreetJunctionTrim[] = [];
    for (const node of nodes) {
      const maxHalf = node.arms.reduce((m, a) => Math.max(m, a.halfWidth), streetWidth / 2);
      const junctionBranches: RoadJunctionBranch[] = node.arms.map((arm) => ({
        angleRadians: Math.atan2(arm.dirZ, arm.dirX),
        halfWidth: arm.halfWidth,
      }));
      const isRoundabout = wantRoundabouts && node.arms.length >= roundaboutMinArms;
      const radius = isRoundabout
        ? Math.max(maxHalf * 1.7, opts.roundaboutRadius ?? streetWidth * 1.25)
        : node.arms.length >= 3
          ? Math.max(maxHalf * 1.22, roadJunctionRadius(junctionBranches))
          : maxHalf * 1.22;
      nodeRadius.set(node, radius);
      if (node.arms.length >= 3) junctionTrims.push({ point: node.point, radius });
      if (isRoundabout) {
        const islandR = Math.max(maxHalf * 0.45, opts.roundaboutIslandRadius ?? radius * 0.38);
        roundabouts.push(circlePlate(node.point, radius, groundY + 0.031, 56));
        islands.push(circlePlate(node.point, islandR, groundY + 0.102, 40));
        markings.push(annulusPlate(node.point, islandR + 0.28, islandR + 0.42, raisedMarkingY, 56));
      } else if (wantPads && node.arms.length >= 3) {
        intersections.push(transform(
          roadJunctionPadMesh(junctionBranches, { radius, top: groundY + 0.02 }),
          { translate: vec3(node.point.x, 0, node.point.z) },
        ));
      }
    }
    if (wantCrosswalks) {
      for (const node of nodes) {
        if (node.arms.length < 3) continue;
        const radius = nodeRadius.get(node) ?? streetWidth * 0.7;
        for (const arm of node.arms) {
          crosswalks.push(zebraCrosswalk(node, arm, radius, raisedCrosswalkY));
        }
      }
    }

    for (let i = 0; i < streets.length; i++) {
      const s = streets[i]!;
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
      if (len < streetWidth * 0.75) continue; // skip stubs shorter than the road is wide
      const halfWidth = halfWidths[i]!;
      const points = curvedStreetPoints(s, groundY, roadCurveAmount, seed + i * 17);
      for (const roadPoints of trimmedStreetPaths(s, points, junctionTrims)) {
        const line = polyline(roadPoints);
        const ribOpts: RoadRibbonOptions = {
          halfWidth,
          sampleDistance,
          widthSubdivisions: 2,
          verticalOffset: 0.02,
        };
        asphalt.push(roadRibbon(line, ribOpts));
        if (wantLaneLines) {
          markings.push(roadLaneLines(line, {
            ...ribOpts,
            lanes: laneCount,
            lineWidth: 0.18,
            dashed: true,
            dashLength: 2.4,
            gapLength: 3.2,
            skipCenter: false,
            verticalOffset: markingRibbonOffset,
          }));
        }
        if (wantEdgeLines) {
          markings.push(roadEdgeLines(line, { ...ribOpts, lineWidth: 0.12, edgeInset: 0.28, verticalOffset: markingRibbonOffset }));
        }
        if (sidewalkWidth > 0) {
          for (const side of [-1, 1] as const) {
            const walkLine = polyline(offsetPathXZ(roadPoints, side * (halfWidth + sidewalkWidth * 0.5 + 0.2)));
            sidewalks.push(roadRibbon(walkLine, {
              halfWidth: sidewalkWidth * 0.5,
              sampleDistance,
              widthSubdivisions: 1,
              verticalOffset: Math.max(0.08, blockLift + 0.025),
            }));
          }
        }
        if (wantCurbs) {
          curbs.push(roadCurbs(line, {
            ...ribOpts,
            curbHeight: opts.curbHeight ?? 0.16,
            curbWidth: opts.curbWidth ?? 0.18,
            verticalOffset: Math.max(0.045, blockLift + 0.005),
          }));
        }
      }
    }
  }

  for (const parcel of parcels) {
    const inset = insetRingXZ(parcel.ring, streetWidth / 2);
    if (!inset) continue; // Block too small to survive the road inset -> a road island.
    blocks.push(parcel);
    insetRings.push(inset);
    meshes.push(ringToPlate(inset, blockLift));
  }

  const roadParts: CityRoadMeshes = {
    asphaltMesh: merged(asphalt),
    markingMesh: merged(markings),
    sidewalkMesh: merged(sidewalks),
    curbMesh: merged(curbs),
    intersectionMesh: merged(intersections),
    crosswalkMesh: merged(crosswalks),
    roundaboutMesh: merged(roundabouts),
    islandMesh: merged(islands),
  };
  const roadMesh = merged([
    roadParts.asphaltMesh,
    roadParts.markingMesh,
    roadParts.sidewalkMesh,
    roadParts.curbMesh,
    roadParts.intersectionMesh,
    roadParts.crosswalkMesh,
    roadParts.roundaboutMesh,
    roadParts.islandMesh,
  ]);
  const baseMesh = meshes.length ? recomputeNormals(merge(...meshes)) : emptyMesh();
  const mesh = recomputeNormals(merge(baseMesh, roadMesh));
  return { blocks, insetRings, streets, mesh, roadMesh, roadParts, baseMesh };
}
