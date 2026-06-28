/**
 * Implicit-surface fusion via metaballs + marching cubes.
 *
 * This is the organic-fusion path the "string of beads" / "hollow joint"
 * problem needs: instead of merging separate spheres (which leaves seams), we
 * sum a smooth scalar field of blobs and polygonize the iso-surface into ONE
 * continuous, seam-free skin. Heads fuse into thoraxes, limbs into bodies.
 *
 * Determinism: the field is a pure function of the blob list, the sampling
 * grid is derived deterministically from the blob bounds + a fixed resolution,
 * and marching cubes visits cells in a fixed order. Same blobs -> same mesh.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";
import { EDGE_TABLE, TRI_TABLE } from "./mc-tables.js";

export interface Metaball {
  /** Center of the blob in object space. */
  center: Vec3;
  /** Influence radius (finite support — field is 0 beyond this). */
  radius: number;
  /** Field weight; negative carves a dent. Default 1. */
  strength?: number;
}

export interface MetaballOptions {
  /** Iso value the surface is extracted at. Higher = tighter/smaller. Default 0.5. */
  iso?: number;
  /** Grid cells along the LONGEST bounds axis. Higher = smoother + slower. Default 32. */
  resolution?: number;
  /** Padding (in world units) added around the blob bounds. Default auto. */
  padding?: number;
}

/** Wyvill finite-support falloff: smooth, exactly 0 at d>=R, 1 at d=0. */
function wyvill(d2: number, r2: number): number {
  if (d2 >= r2) return 0;
  const t = 1 - d2 / r2;
  return t * t * t;
}

/**
 * Build a fused mesh from metaballs. The classic use: pass a head sphere, a
 * thorax sphere, body segments — they melt into one watertight surface.
 */
export function metaballs(balls: ReadonlyArray<Metaball>, opts: MetaballOptions = {}): Mesh {
  const empty = makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  if (balls.length === 0) return empty;
  const iso = opts.iso ?? 0.5;
  const res = Math.max(4, Math.floor(opts.resolution ?? 32));

  // bounds from finite supports
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxR = 0;
  for (const b of balls) {
    minX = Math.min(minX, b.center.x - b.radius);
    minY = Math.min(minY, b.center.y - b.radius);
    minZ = Math.min(minZ, b.center.z - b.radius);
    maxX = Math.max(maxX, b.center.x + b.radius);
    maxY = Math.max(maxY, b.center.y + b.radius);
    maxZ = Math.max(maxZ, b.center.z + b.radius);
    maxR = Math.max(maxR, b.radius);
  }
  const pad = opts.padding ?? maxR * 0.15;
  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

  const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
  const longest = Math.max(sizeX, sizeY, sizeZ) || 1;
  const cell = longest / res;
  const nx = Math.max(1, Math.ceil(sizeX / cell));
  const ny = Math.max(1, Math.ceil(sizeY / cell));
  const nz = Math.max(1, Math.ceil(sizeZ / cell));

  // precompute squared radii
  const r2 = balls.map((b) => b.radius * b.radius);
  const str = balls.map((b) => b.strength ?? 1);

  const field = (x: number, y: number, z: number): number => {
    let sum = 0;
    for (let i = 0; i < balls.length; i++) {
      const c = balls[i]!.center;
      const dx = x - c.x, dy = y - c.y, dz = z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const w = wyvill(d2, r2[i]!);
      if (w !== 0) sum += w * str[i]!;
    }
    return sum;
  };

  // sample the scalar field on the (nx+1)(ny+1)(nz+1) grid
  const gx = nx + 1, gy = ny + 1, gz = nz + 1;
  const vals = new Float64Array(gx * gy * gz);
  const idx = (i: number, j: number, k: number) => (k * gy + j) * gx + i;
  for (let k = 0; k < gz; k++) {
    const z = minZ + k * cell;
    for (let j = 0; j < gy; j++) {
      const y = minY + j * cell;
      for (let i = 0; i < gx; i++) {
        const x = minX + i * cell;
        vals[idx(i, j, k)] = field(x, y, z);
      }
    }
  }

  const positions: Vec3[] = [];
  const indices: number[] = [];
  // vertex dedup along shared edges keyed by edge id
  const vertCache = new Map<number, number>();

  // corner offsets in MC standard order
  const CORNER = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  // edge -> (cornerA, cornerB)
  const EDGE_CORNERS = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const cornerPos = (ci: number, i: number, j: number, k: number): Vec3 => {
    const o = CORNER[ci]!;
    return vec3(minX + (i + o[0]!) * cell, minY + (j + o[1]!) * cell, minZ + (k + o[2]!) * cell);
  };
  const cornerVal = (ci: number, i: number, j: number, k: number): number => {
    const o = CORNER[ci]!;
    return vals[idx(i + o[0]!, j + o[1]!, k + o[2]!)]!;
  };

  // unique key per grid edge for vertex sharing
  const edgeKey = (i: number, j: number, k: number, edge: number): number => {
    // map each of the 12 cube edges to a canonical (gridEdgeAxis, gridVertex)
    const [a, b] = EDGE_CORNERS[edge]!;
    const oa = CORNER[a!]!, ob = CORNER[b!]!;
    const ax = i + oa[0]!, ay = j + oa[1]!, az = k + oa[2]!;
    const bx = i + ob[0]!, by = j + ob[1]!, bz = k + ob[2]!;
    // lower corner + axis (0:x,1:y,2:z)
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
    const p = vec3(pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t, pa.z + (pb.z - pa.z) * t);
    const vi = positions.length;
    positions.push(p);
    vertCache.set(key, vi);
    return vi;
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          if (cornerVal(c, i, j, k) >= iso) cubeIndex |= 1 << c;
        }
        const edges = EDGE_TABLE[cubeIndex]!;
        if (edges === 0) continue;
        const tri = TRI_TABLE[cubeIndex]!;
        for (let t = 0; tri[t] !== -1; t += 3) {
          const e0 = tri[t]!, e1 = tri[t + 1]!, e2 = tri[t + 2]!;
          const v0 = vertexOnEdge(i, j, k, e0);
          const v1 = vertexOnEdge(i, j, k, e1);
          const v2 = vertexOnEdge(i, j, k, e2);
          // winding: field increases inward, so iso>=corner means inside;
          // emit so normals point outward (away from higher field)
          indices.push(v0, v2, v1);
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

/** Convenience: fuse a set of spheres (center+radius) into one skin. */
export function fuseSpheres(
  spheres: ReadonlyArray<{ center: Vec3; radius: number }>,
  opts: MetaballOptions = {},
): Mesh {
  return metaballs(spheres.map((s) => ({ center: s.center, radius: s.radius * 1.6, strength: 1 })), { iso: 0.6, ...opts });
}
