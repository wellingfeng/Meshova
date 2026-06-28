/**
 * Indexed triangle mesh — the P1 geometry core data structure.
 *
 * Immutable by convention: builder functions return new meshes, they never
 * mutate inputs. This keeps AI reasoning side-effect free (a core DSL
 * principle) and makes deterministic screenshot tests reliable.
 *
 * Layout:
 *  - positions: one Vec3 per vertex
 *  - normals:   one Vec3 per vertex (unit length)
 *  - uvs:       one Vec2 per vertex
 *  - indices:   flat triangle list, 3 indices per face, CCW front-facing
 *
 * Upgrade path: a half-edge structure later, once topological ops (P2
 * extrude/subdivide/boolean) need adjacency. The indexed form stays as the
 * render/export representation.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec3, add, sub, cross, dot, normalize, length } from "../math/vec3.js";

export interface Mesh {
  readonly positions: ReadonlyArray<Vec3>;
  readonly normals: ReadonlyArray<Vec3>;
  readonly uvs: ReadonlyArray<Vec2>;
  /** Flat triangle index list (length is a multiple of 3). */
  readonly indices: ReadonlyArray<number>;
}

export interface MeshData {
  positions: Vec3[];
  normals: Vec3[];
  uvs: Vec2[];
  indices: number[];
}

/** Build a mesh from raw arrays, validating basic invariants. */
export function makeMesh(data: MeshData): Mesh {
  const { positions, normals, uvs, indices } = data;
  if (normals.length !== positions.length) {
    throw new Error(
      `normals length ${normals.length} != positions length ${positions.length}`,
    );
  }
  if (uvs.length !== positions.length) {
    throw new Error(
      `uvs length ${uvs.length} != positions length ${positions.length}`,
    );
  }
  if (indices.length % 3 !== 0) {
    throw new Error(`indices length ${indices.length} is not a multiple of 3`);
  }
  return {
    positions: positions.slice(),
    normals: normals.slice(),
    uvs: uvs.slice(),
    indices: indices.slice(),
  };
}

export function vertexCount(m: Mesh): number {
  return m.positions.length;
}

export function triangleCount(m: Mesh): number {
  return m.indices.length / 3;
}

/**
 * Recompute per-vertex normals as the area-weighted average of adjacent face
 * normals. Use after any operation that moves vertices (transform with
 * non-uniform scale, noise displacement, etc).
 */
export function recomputeNormals(m: Mesh): Mesh {
  const accum: Vec3[] = m.positions.map(() => vec3(0, 0, 0));
  for (let i = 0; i < m.indices.length; i += 3) {
    const ia = m.indices[i]!;
    const ib = m.indices[i + 1]!;
    const ic = m.indices[i + 2]!;
    const a = m.positions[ia]!;
    const b = m.positions[ib]!;
    const c = m.positions[ic]!;
    // Cross product magnitude = 2 * triangle area, so this is area-weighted.
    const faceN = cross(sub(b, a), sub(c, a));
    accum[ia] = add(accum[ia]!, faceN);
    accum[ib] = add(accum[ib]!, faceN);
    accum[ic] = add(accum[ic]!, faceN);
  }
  const normals = accum.map((n) => (length(n) > 0 ? normalize(n) : vec3(0, 1, 0)));
  return {
    positions: m.positions.slice(),
    normals,
    uvs: m.uvs.slice(),
    indices: m.indices.slice(),
  };
}

/**
 * VEX `computenormal` with a cusp angle. Recomputes normals but splits shared
 * vertices wherever two adjacent faces meet at an angle sharper than
 * `cuspAngleDeg`, producing hard edges (faceted) below the threshold and
 * smooth shading above it. Returns a new mesh (vertex count may grow).
 *
 * cuspAngleDeg = 180 -> fully smooth (same as recomputeNormals),
 * cuspAngleDeg = 0   -> fully faceted (flat per-face normals).
 */
export function computeNormals(m: Mesh, cuspAngleDeg = 40): Mesh {
  const triCount = m.indices.length / 3;
  // Per-face normal (normalized).
  const faceN: Vec3[] = [];
  for (let f = 0; f < triCount; f++) {
    const a = m.positions[m.indices[f * 3]!]!;
    const b = m.positions[m.indices[f * 3 + 1]!]!;
    const c = m.positions[m.indices[f * 3 + 2]!]!;
    const n = cross(sub(b, a), sub(c, a));
    faceN.push(length(n) > 0 ? normalize(n) : vec3(0, 1, 0));
  }

  const cosCusp = Math.cos((cuspAngleDeg * Math.PI) / 180);

  // Fuse coincident positions so smoothing groups span shared spatial points
  // even when the input keeps per-face duplicate vertices (Houdini computenormal
  // operates on fused points). Quantize to a tolerance grid for the key.
  const keyOf = (p: Vec3): string => {
    const q = 1e5;
    return `${Math.round(p.x * q)},${Math.round(p.y * q)},${Math.round(p.z * q)}`;
  };
  const pointOfVertex = new Array<number>(m.positions.length);
  const keyToPoint = new Map<string, number>();
  let pointCount = 0;
  for (let v = 0; v < m.positions.length; v++) {
    const k = keyOf(m.positions[v]!);
    let pt = keyToPoint.get(k);
    if (pt === undefined) {
      pt = pointCount++;
      keyToPoint.set(k, pt);
    }
    pointOfVertex[v] = pt;
  }

  // For each fused point, collect incident (face, corner) uses.
  const uses: Array<Array<{ face: number; corner: number }>> = Array.from(
    { length: pointCount },
    () => [],
  );
  for (let f = 0; f < triCount; f++) {
    for (let k = 0; k < 3; k++) {
      const corner = f * 3 + k;
      const pt = pointOfVertex[m.indices[corner]!]!;
      uses[pt]!.push({ face: f, corner });
    }
  }

  const outPositions: Vec3[] = [];
  const outNormals: Vec3[] = [];
  const outUvs: Vec2[] = [];
  const newIndexForCorner = new Array<number>(m.indices.length).fill(-1);

  // Group incident faces of a point into smoothing groups by normal angle,
  // emitting one output vertex per group.
  for (let v = 0; v < pointCount; v++) {
    const incident = uses[v]!;
    const assigned = new Array<boolean>(incident.length).fill(false);
    for (let i = 0; i < incident.length; i++) {
      if (assigned[i]) continue;
      // start a new smoothing group from face i
      const group = [i];
      assigned[i] = true;
      const ni = faceN[incident[i]!.face]!;
      for (let j = i + 1; j < incident.length; j++) {
        if (assigned[j]) continue;
        const nj = faceN[incident[j]!.face]!;
        if (dot(ni, nj) >= cosCusp) {
          group.push(j);
          assigned[j] = true;
        }
      }
      // averaged normal for the group
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const gi of group) {
        const fn = faceN[incident[gi]!.face]!;
        nx += fn.x;
        ny += fn.y;
        nz += fn.z;
      }
      const gn =
        nx * nx + ny * ny + nz * nz > 0
          ? normalize(vec3(nx, ny, nz))
          : vec3(0, 1, 0);
      const newIdx = outPositions.length;
      const repVertex = m.indices[incident[group[0]!]!.corner]!;
      outPositions.push(m.positions[repVertex]!);
      outNormals.push(gn);
      outUvs.push(m.uvs[repVertex]!);
      for (const gi of group) {
        newIndexForCorner[incident[gi]!.corner] = newIdx;
      }
    }
  }

  const outIndices = m.indices.map((_, c) => newIndexForCorner[c]!);
  return {
    positions: outPositions,
    normals: outNormals,
    uvs: outUvs,
    indices: outIndices,
  };
}

/** Merge multiple meshes into one, offsetting indices. */
export function merge(...meshes: Mesh[]): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const m of meshes) {
    for (const p of m.positions) positions.push(p);
    for (const n of m.normals) normals.push(n);
    for (const uv of m.uvs) uvs.push(uv);
    for (const idx of m.indices) indices.push(idx + offset);
    offset += m.positions.length;
  }
  return { positions, normals, uvs, indices };
}

/** Axis-aligned bounding box. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function bounds(m: Mesh): Bounds {
  if (m.positions.length === 0) {
    return { min: vec3(0, 0, 0), max: vec3(0, 0, 0) };
  }
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of m.positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ) };
}
