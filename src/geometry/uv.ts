/**
 * UV projection / unwrap helpers.
 *
 * Meshova geometry carries per-vertex UVs, but many procedural ops (extrude,
 * boolean, displace, sweep) either leave UVs at (0,0) or stretch them badly on
 * faces whose orientation differs from the source primitive. These functions
 * re-derive UVs from world-space positions so PBR materials tile without
 * shearing.
 *
 * All functions are pure: they return a new Mesh and never mutate the input,
 * matching the immutable-by-convention rule. Projection is deterministic —
 * same mesh + same params => same UVs.
 *
 * Design notes:
 *  - Planar/box projection needs per-face UVs, so faces on different planes
 *    don't share a stretched vertex. We therefore split shared vertices
 *    (un-weld) into per-corner vertices before assigning UVs. Positions and
 *    normals are preserved; only vertex count and UVs change.
 *  - Cylindrical/spherical projection keeps welded vertices but adds a seam
 *    fix so the wrap-around (u ~1 -> u ~0) triangle doesn't smear across the
 *    whole texture.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import { vec3, sub, cross, normalize, length } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { bounds } from "./mesh.js";

/** Which world axis a face's UV plane is aligned to (box projection). */
type Axis = "x" | "y" | "z";

/**
 * Split every triangle into its own three vertices (fully un-welded / faceted
 * topology). Required before per-face UV assignment so adjacent faces on
 * different planes never share a vertex. Positions and normals are copied from
 * the original corners; UVs are reset to (0,0) and filled by the caller.
 */
function unweld(m: Mesh): {
  positions: Vec3[];
  normals: Vec3[];
  indices: number[];
} {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const indices: number[] = [];
  for (let i = 0; i < m.indices.length; i++) {
    const src = m.indices[i]!;
    positions.push(m.positions[src]!);
    normals.push(m.normals[src]!);
    indices.push(i);
  }
  return { positions, normals, indices };
}

/** Geometric normal of a triangle from its three corner positions. */
function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const n = cross(sub(b, a), sub(c, a));
  return length(n) > 0 ? normalize(n) : vec3(0, 1, 0);
}

/** Pick the dominant axis of a normal (largest absolute component). */
function dominantAxis(n: Vec3): Axis {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}

export interface PlanarUVOptions {
  /** Projection axis (UVs read the two perpendicular world coords). Default "y". */
  axis?: Axis;
  /** World units per one UV tile. Larger => texture repeats less often. Default 1. */
  scale?: number;
  /** UV offset added after projection. Default (0,0). */
  offset?: Vec2;
}

/**
 * Planar projection: drop each vertex's position onto a world plane and use the
 * two in-plane coordinates as UV. No unwelding needed (UV depends only on
 * position), so vertex count is unchanged. Ideal for floors, walls, decals.
 *
 * axis "y" -> UV = (x, z); "x" -> (z, y); "z" -> (x, y).
 */
export function planarUV(m: Mesh, options: PlanarUVOptions = {}): Mesh {
  const axis = options.axis ?? "y";
  const scale = options.scale ?? 1;
  const off = options.offset ?? vec2(0, 0);
  const inv = scale !== 0 ? 1 / scale : 1;
  const uvs: Vec2[] = m.positions.map((p) => {
    let u: number;
    let v: number;
    if (axis === "y") {
      u = p.x;
      v = p.z;
    } else if (axis === "x") {
      u = p.z;
      v = p.y;
    } else {
      u = p.x;
      v = p.y;
    }
    return vec2(u * inv + off.x, v * inv + off.y);
  });
  return {
    positions: m.positions.slice(),
    normals: m.normals.slice(),
    uvs,
    indices: m.indices.slice(),
  };
}

export interface BoxUVOptions {
  /** World units per one UV tile. Default 1. */
  scale?: number;
  /** UV offset added after projection. Default (0,0). */
  offset?: Vec2;
}

/**
 * Box / tri-planar projection (the workhorse for arbitrary meshes). For each
 * triangle we pick the world axis its normal points along, then project the
 * face onto that axis's plane. This gives even, shear-free UVs on any shape —
 * exactly what fixes stretched materials after boolean/extrude ops.
 *
 * Faces are un-welded (one vertex per corner) so neighbouring faces on
 * different planes keep independent UVs. Vertex count becomes 3 * triangleCount.
 */
export function boxUV(m: Mesh, options: BoxUVOptions = {}): Mesh {
  const scale = options.scale ?? 1;
  const off = options.offset ?? vec2(0, 0);
  const inv = scale !== 0 ? 1 / scale : 1;
  const { positions, normals, indices } = unweld(m);
  const uvs: Vec2[] = new Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]!;
    const ib = indices[t + 1]!;
    const ic = indices[t + 2]!;
    const a = positions[ia]!;
    const b = positions[ib]!;
    const c = positions[ic]!;
    const axis = dominantAxis(faceNormal(a, b, c));
    for (const idx of [ia, ib, ic]) {
      const p = positions[idx]!;
      let u: number;
      let v: number;
      if (axis === "x") {
        u = p.z;
        v = p.y;
      } else if (axis === "y") {
        u = p.x;
        v = p.z;
      } else {
        u = p.x;
        v = p.y;
      }
      uvs[idx] = vec2(u * inv + off.x, v * inv + off.y);
    }
  }
  return { positions, normals, uvs, indices };
}

export interface CylindricalUVOptions {
  /** Central axis of the cylinder. Default "y". */
  axis?: Axis;
  /** Center of the cylinder in world space. Default = bounds center. */
  center?: Vec3;
  /** World units per one V (height) tile. Default 1. */
  vScale?: number;
  /** Number of times u wraps around the circumference. Default 1. */
  uRepeat?: number;
}

/**
 * Cylindrical projection: u = angle around the axis, v = distance along it.
 * Fits pipes, cables, bottles, tree trunks. The angular seam (where u jumps
 * from ~1 back to 0) is fixed per-triangle by unwrapping wrapped corners, so
 * no face smears the full texture width across the seam.
 *
 * Unwelds the mesh (the seam fix needs per-face UVs).
 */
export function cylindricalUV(m: Mesh, options: CylindricalUVOptions = {}): Mesh {
  const axis = options.axis ?? "y";
  const vScale = options.vScale ?? 1;
  const uRepeat = options.uRepeat ?? 1;
  const c = options.center ?? boundsCenter(m);
  const invV = vScale !== 0 ? 1 / vScale : 1;
  const { positions, normals, indices } = unweld(m);
  const uvs: Vec2[] = new Array(positions.length);

  // Per-vertex angle (u in [0,1)) and height (raw v).
  const rawU = new Array<number>(positions.length);
  const rawV = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    let a: number;
    let b: number;
    let h: number;
    if (axis === "y") {
      a = p.x - c.x;
      b = p.z - c.z;
      h = p.y - c.y;
    } else if (axis === "x") {
      a = p.z - c.z;
      b = p.y - c.y;
      h = p.x - c.x;
    } else {
      a = p.x - c.x;
      b = p.y - c.y;
      h = p.z - c.z;
    }
    const ang = Math.atan2(b, a) / (2 * Math.PI); // [-0.5, 0.5]
    rawU[i] = ang + 0.5; // [0, 1)
    rawV[i] = h * invV;
  }

  // Seam fix: within each triangle, if u spans more than half the range the
  // face straddles the seam — lift the small-u corners by +1 so the triangle
  // stays contiguous in UV space.
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!;
    const i1 = indices[t + 1]!;
    const i2 = indices[t + 2]!;
    let u0 = rawU[i0]!;
    let u1 = rawU[i1]!;
    let u2 = rawU[i2]!;
    const maxU = Math.max(u0, u1, u2);
    const minU = Math.min(u0, u1, u2);
    if (maxU - minU > 0.5) {
      if (u0 < 0.5) u0 += 1;
      if (u1 < 0.5) u1 += 1;
      if (u2 < 0.5) u2 += 1;
    }
    uvs[i0] = vec2(u0 * uRepeat, rawV[i0]!);
    uvs[i1] = vec2(u1 * uRepeat, rawV[i1]!);
    uvs[i2] = vec2(u2 * uRepeat, rawV[i2]!);
  }
  return { positions, normals, uvs, indices };
}

export interface SphericalUVOptions {
  /** Center of the sphere in world space. Default = bounds center. */
  center?: Vec3;
  /** Number of times u wraps around longitude. Default 1. */
  uRepeat?: number;
}

/**
 * Spherical / lat-long projection: u = longitude, v = latitude. Fits balls,
 * domes, planets, gems. Same seam fix as cylindrical for the longitude wrap.
 * Unwelds the mesh.
 */
export function sphericalUV(m: Mesh, options: SphericalUVOptions = {}): Mesh {
  const uRepeat = options.uRepeat ?? 1;
  const c = options.center ?? boundsCenter(m);
  const { positions, normals, indices } = unweld(m);
  const uvs: Vec2[] = new Array(positions.length);
  const rawU = new Array<number>(positions.length);
  const rawV = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    const d = normalize(vec3(p.x - c.x, p.y - c.y, p.z - c.z));
    rawU[i] = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5; // [0,1)
    rawV[i] = Math.asin(Math.max(-1, Math.min(1, d.y))) / Math.PI + 0.5; // [0,1]
  }
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!;
    const i1 = indices[t + 1]!;
    const i2 = indices[t + 2]!;
    let u0 = rawU[i0]!;
    let u1 = rawU[i1]!;
    let u2 = rawU[i2]!;
    const maxU = Math.max(u0, u1, u2);
    const minU = Math.min(u0, u1, u2);
    if (maxU - minU > 0.5) {
      if (u0 < 0.5) u0 += 1;
      if (u1 < 0.5) u1 += 1;
      if (u2 < 0.5) u2 += 1;
    }
    uvs[i0] = vec2(u0 * uRepeat, rawV[i0]!);
    uvs[i1] = vec2(u1 * uRepeat, rawV[i1]!);
    uvs[i2] = vec2(u2 * uRepeat, rawV[i2]!);
  }
  return { positions, normals, uvs, indices };
}

function boundsCenter(m: Mesh): Vec3 {
  const b = bounds(m);
  return vec3(
    (b.min.x + b.max.x) / 2,
    (b.min.y + b.max.y) / 2,
    (b.min.z + b.max.z) / 2,
  );
}

/**
 * Rescale existing UVs so they fit exactly into the unit [0,1] square,
 * preserving aspect ratio (uniform scale by the larger extent). Useful after a
 * projection when you want the whole shell to land in one texture tile. Does
 * not unweld; operates on whatever UVs the mesh already has.
 */
export function normalizeUV(m: Mesh): Mesh {
  if (m.uvs.length === 0) return m;
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const uv of m.uvs) {
    if (uv.x < minU) minU = uv.x;
    if (uv.y < minV) minV = uv.y;
    if (uv.x > maxU) maxU = uv.x;
    if (uv.y > maxV) maxV = uv.y;
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const span = Math.max(spanU, spanV);
  const inv = span > 0 ? 1 / span : 1;
  const uvs = m.uvs.map((uv) => vec2((uv.x - minU) * inv, (uv.y - minV) * inv));
  return {
    positions: m.positions.slice(),
    normals: m.normals.slice(),
    uvs,
    indices: m.indices.slice(),
  };
}

export interface TransformUVOptions {
  /** Uniform or per-axis scale applied to UVs. Default 1. */
  scale?: number | Vec2;
  /** Rotation in degrees around UV origin. Default 0. */
  rotateDeg?: number;
  /** Translation added last. Default (0,0). */
  offset?: Vec2;
}

/**
 * Affine transform of existing UVs (scale -> rotate -> translate). Lets AI
 * scripts tile, rotate, or shift a texture without reprojecting. Pure.
 */
export function transformUV(m: Mesh, options: TransformUVOptions = {}): Mesh {
  const s = options.scale ?? 1;
  const sx = typeof s === "number" ? s : s.x;
  const sy = typeof s === "number" ? s : s.y;
  const rad = ((options.rotateDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const off = options.offset ?? vec2(0, 0);
  const uvs = m.uvs.map((uv) => {
    const x = uv.x * sx;
    const y = uv.y * sy;
    return vec2(x * cos - y * sin + off.x, x * sin + y * cos + off.y);
  });
  return {
    positions: m.positions.slice(),
    normals: m.normals.slice(),
    uvs,
    indices: m.indices.slice(),
  };
}
