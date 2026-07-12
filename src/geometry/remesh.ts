/**
 * Voxel remesh — rebuild clean, uniform topology from a messy input mesh.
 *
 * The problem this solves: CSG boolean, extrude and displace leave slivers,
 * T-junctions, non-manifold seams and wildly uneven triangle density. Any
 * downstream op that needs adjacency (subdivide, Catmull-Clark, smooth UV,
 * bevel) chokes on that. The Houdini answer is VDB-from-polygons ->
 * convert-VDB: rasterize the surface into a signed-distance field on a regular
 * grid, then marching-cubes the iso-surface back out. The result is one
 * watertight shell with even, predictable topology.
 *
 * We do the same with the tools already in the repo: `closestPointOnMesh`
 * gives the unsigned distance, `isPointInside` gives the sign, and a generic
 * marching-cubes polygonizer (shared with the metaball path in spirit) pulls
 * the zero-crossing surface out.
 *
 * Determinism: the sampling grid is derived deterministically from the input
 * bounds + resolution, the field is a pure function of the input mesh, and MC
 * visits cells in fixed order. Same mesh + same resolution -> same output.
 *
 * Cost: sampling is O(gridVerts * triangles) because the distance query is
 * brute force. Keep `resolution` moderate (24-48) for typical Meshova meshes;
 * this is a cleanup pass, not a realtime op.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals, bounds } from "./mesh.js";
import { EDGE_TABLE, TRI_TABLE } from "./mc-tables.js";
import { closestPointOnMesh, isPointInside } from "./query.js";

/** A scalar field sampled on a regular grid, ready for marching cubes. */
export interface ScalarGrid {
  /** Grid vertex counts along each axis (cells + 1). */
  gx: number;
  gy: number;
  gz: number;
  /** World-space origin of grid vertex (0,0,0). */
  origin: Vec3;
  /** World size of one cell (uniform cube). */
  cell: number;
  /** Field values, indexed (k*gy + j)*gx + i, length gx*gy*gz. */
  values: Float64Array;
}

export interface PolygonizeOptions {
  /** Iso value the surface is extracted at. Default 0. */
  iso?: number;
  /**
   * If true, flip triangle winding. MC below emits outward normals for a field
   * that is NEGATIVE inside and POSITIVE outside (an SDF). Metaball-style
   * fields (high inside) need `flip: true`. Default false (SDF convention).
   */
  flip?: boolean;
}

// MC standard corner order and edge->corner map (shared convention).
const CORNER = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGE_CORNERS = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Generic marching cubes: polygonize the iso-surface of any scalar grid into a
 * seam-free indexed mesh (vertices shared along grid edges). This is the
 * reusable core the metaball path could also sit on.
 */
export function polygonizeField(grid: ScalarGrid, opts: PolygonizeOptions = {}): Mesh {
  const empty = makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const { gx, gy, gz, origin, cell, values } = grid;
  if (gx < 2 || gy < 2 || gz < 2) return empty;
  const iso = opts.iso ?? 0;
  const flip = opts.flip ?? false;
  const nx = gx - 1, ny = gy - 1, nz = gz - 1;

  const gidx = (i: number, j: number, k: number) => (k * gy + j) * gx + i;
  const cornerVal = (ci: number, i: number, j: number, k: number): number => {
    const o = CORNER[ci]!;
    return values[gidx(i + o[0]!, j + o[1]!, k + o[2]!)]!;
  };
  const cornerPos = (ci: number, i: number, j: number, k: number): Vec3 => {
    const o = CORNER[ci]!;
    return vec3(
      origin.x + (i + o[0]!) * cell,
      origin.y + (j + o[1]!) * cell,
      origin.z + (k + o[2]!) * cell,
    );
  };

  const positions: Vec3[] = [];
  const indices: number[] = [];
  const vertCache = new Map<number, number>();

  const edgeKey = (i: number, j: number, k: number, edge: number): number => {
    const [a, b] = EDGE_CORNERS[edge]!;
    const oa = CORNER[a!]!, ob = CORNER[b!]!;
    const ax = i + oa[0]!, ay = j + oa[1]!, az = k + oa[2]!;
    const bx = i + ob[0]!, by = j + ob[1]!, bz = k + ob[2]!;
    const lx = Math.min(ax, bx), ly = Math.min(ay, by), lz = Math.min(az, bz);
    let axis = 0;
    if (ax !== bx) axis = 0; else if (ay !== by) axis = 1; else axis = 2;
    return ((lz * gy + ly) * gx + lx) * 3 + axis;
  };

  const vertexOnEdge = (i: number, j: number, k: number, edge: number): number => {
    const key = edgeKey(i, j, k, edge);
    const cached = vertCache.get(key);
    if (cached !== undefined) return cached;
    const [a, b] = EDGE_CORNERS[edge]!;
    const pa = cornerPos(a!, i, j, k), pb = cornerPos(b!, i, j, k);
    const va = cornerVal(a!, i, j, k), vb = cornerVal(b!, i, j, k);
    let t = 0.5;
    const denom = vb - va;
    if (Math.abs(denom) > 1e-12) t = (iso - va) / denom;
    t = Math.max(0, Math.min(1, t));
    const p = vec3(
      pa.x + (pb.x - pa.x) * t,
      pa.y + (pb.y - pa.y) * t,
      pa.z + (pb.z - pa.z) * t,
    );
    const vi = positions.length;
    positions.push(p);
    vertCache.set(key, vi);
    return vi;
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let cubeIndex = 0;
        // SDF convention: inside is field < iso, so corner "set" when below iso.
        for (let c = 0; c < 8; c++) {
          if (cornerVal(c, i, j, k) < iso) cubeIndex |= 1 << c;
        }
        const edges = EDGE_TABLE[cubeIndex]!;
        if (edges === 0) continue;
        const tri = TRI_TABLE[cubeIndex]!;
        for (let t = 0; tri[t] !== -1; t += 3) {
          const v0 = vertexOnEdge(i, j, k, tri[t]!);
          const v1 = vertexOnEdge(i, j, k, tri[t + 1]!);
          const v2 = vertexOnEdge(i, j, k, tri[t + 2]!);
          if (flip) indices.push(v0, v1, v2);
          else indices.push(v0, v2, v1);
        }
      }
    }
  }

  if (positions.length === 0) return empty;
  return recomputeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: positions.map(() => ({ x: 0, y: 0 })),
    indices,
  }));
}

export interface RemeshOptions {
  /**
   * Grid cells along the LONGEST bounds axis. Higher = finer + much slower
   * (cost grows ~cubically). Default 32. Practical range 16-64.
   */
  resolution?: number;
  /**
   * Padding around the input bounds, as a fraction of the longest axis, so the
   * shell isn't clipped at the border. Default 0.05.
   */
  padding?: number;
}

/**
 * Sample a signed-distance field of `mesh` onto a regular grid. Distance is
 * unsigned magnitude from `closestPointOnMesh`; the sign is negative inside
 * (via `isPointInside`) and positive outside — the SDF convention
 * `polygonizeField` expects. The input should be reasonably closed for the
 * inside test to be meaningful.
 */
export function meshToSDF(mesh: Mesh, opts: RemeshOptions = {}): ScalarGrid {
  const res = Math.max(4, Math.floor(opts.resolution ?? 32));
  const b = bounds(mesh);
  const sizeX = b.max.x - b.min.x;
  const sizeY = b.max.y - b.min.y;
  const sizeZ = b.max.z - b.min.z;
  const longest = Math.max(sizeX, sizeY, sizeZ) || 1;
  const padFrac = opts.padding ?? 0.05;
  const pad = longest * padFrac + longest / res; // at least one cell of margin
  const minX = b.min.x - pad, minY = b.min.y - pad, minZ = b.min.z - pad;
  const maxX = b.max.x + pad, maxY = b.max.y + pad, maxZ = b.max.z + pad;

  const paddedLongest = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const cell = paddedLongest / res;
  const gx = Math.max(2, Math.ceil((maxX - minX) / cell) + 1);
  const gy = Math.max(2, Math.ceil((maxY - minY) / cell) + 1);
  const gz = Math.max(2, Math.ceil((maxZ - minZ) / cell) + 1);

  const values = new Float64Array(gx * gy * gz);
  const idx = (i: number, j: number, k: number) => (k * gy + j) * gx + i;
  for (let k = 0; k < gz; k++) {
    const z = minZ + k * cell;
    for (let j = 0; j < gy; j++) {
      const y = minY + j * cell;
      for (let i = 0; i < gx; i++) {
        const x = minX + i * cell;
        const p = vec3(x, y, z);
        const d = closestPointOnMesh(mesh, p).distance;
        const sign = isPointInside(mesh, p) ? -1 : 1;
        values[idx(i, j, k)] = sign * d;
      }
    }
  }

  return { gx, gy, gz, origin: vec3(minX, minY, minZ), cell, values };
}

/**
 * Voxel remesh: rebuild `mesh` as a single watertight shell with uniform
 * topology, at the given resolution. The Houdini VDB-remesh workflow in one
 * call. Use it after CSG boolean / heavy extrude to get a clean base before
 * subdividing, smoothing or unwrapping.
 *
 * Trade-offs: sharp corners round off at the voxel scale (raise `resolution`
 * to keep detail); thin features below one cell can vanish. This is lossy by
 * nature — it trades fidelity for a clean, predictable mesh.
 */
export function voxelRemesh(mesh: Mesh, opts: RemeshOptions = {}): Mesh {
  if (mesh.positions.length === 0 || mesh.indices.length === 0) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const grid = meshToSDF(mesh, opts);
  return polygonizeField(grid, { iso: 0, flip: false });
}
