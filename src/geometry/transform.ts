/**
 * Apply affine transforms to a mesh. Positions transform as points, normals
 * as directions (then renormalized to stay unit length under scaling).
 */
import type { Vec3 } from "../math/vec3.js";
import { normalize } from "../math/vec3.js";
import type { Mat4 } from "../math/mat4.js";
import {
  chain,
  translation,
  scaling,
  rotationX,
  rotationY,
  rotationZ,
  transformPoint,
  transformDirection,
} from "../math/mat4.js";
import type { Mesh } from "./mesh.js";

/** Apply an arbitrary 4x4 matrix to a mesh. */
export function applyMatrix(m: Mesh, mat: Mat4): Mesh {
  const positions = m.positions.map((p) => transformPoint(mat, p));
  const normals = m.normals.map((n) => normalize(transformDirection(mat, n)));
  return {
    positions,
    normals,
    uvs: m.uvs.slice(),
    indices: m.indices.slice(),
  };
}

export interface TransformOptions {
  translate?: Vec3;
  /** Euler rotation in radians, applied X then Y then Z. */
  rotate?: Vec3;
  scale?: Vec3 | number;
}

/**
 * Convenience transform. Order: scale, then rotate (X,Y,Z), then translate —
 * the intuitive TRS order so AI scripts behave predictably.
 */
export function transform(m: Mesh, opts: TransformOptions): Mesh {
  const mats: Mat4[] = [];
  if (opts.translate) mats.push(translation(opts.translate));
  if (opts.rotate) {
    mats.push(rotationZ(opts.rotate.z));
    mats.push(rotationY(opts.rotate.y));
    mats.push(rotationX(opts.rotate.x));
  }
  if (opts.scale !== undefined) {
    const s =
      typeof opts.scale === "number"
        ? { x: opts.scale, y: opts.scale, z: opts.scale }
        : opts.scale;
    mats.push(scaling(s));
  }
  if (mats.length === 0) {
    return {
      positions: m.positions.slice(),
      normals: m.normals.slice(),
      uvs: m.uvs.slice(),
      indices: m.indices.slice(),
    };
  }
  return applyMatrix(m, chain(...mats));
}

export function translateMesh(m: Mesh, t: Vec3): Mesh {
  return transform(m, { translate: t });
}

export function scaleMesh(m: Mesh, s: Vec3 | number): Mesh {
  return transform(m, { scale: s });
}

export function rotateMesh(m: Mesh, euler: Vec3): Mesh {
  return transform(m, { rotate: euler });
}
