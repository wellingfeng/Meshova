/**
 * Quaternion rotations — VEX parity (quaternion, qmultiply, slerp, qrotate,
 * eulertoquaternion, quaterniontoeuler, dihedral).
 *
 * Stored as {x,y,z,w} where w is the scalar part. Immutable, functional.
 * Right-handed, same convention as the column-major mat4 module so the two
 * compose cleanly. Self-written from standard quaternion algebra.
 */
import type { Vec3 } from "./vec3.js";
import { normalize as normVec3, cross, dot, length as lenVec3 } from "./vec3.js";
import type { Mat4 } from "./mat4.js";

export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w };
}

/** Identity rotation. */
export function qidentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/** VEX `quaternion(angle, axis)`: rotation of `angle` rad around `axis`. */
export function fromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normVec3(axis);
  const h = angle * 0.5;
  const s = Math.sin(h);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(h) };
}

/** VEX `qmultiply`: compose rotations (a applied after b: a*b). */
export function qmultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Conjugate (inverse for unit quaternions). VEX `qinvert`. */
export function qconjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function qlengthSq(q: Quat): number {
  return q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
}

/** True inverse (handles non-unit quaternions). */
export function qinvert(q: Quat): Quat {
  const n = qlengthSq(q);
  if (n === 0) return qidentity();
  const inv = 1 / n;
  return { x: -q.x * inv, y: -q.y * inv, z: -q.z * inv, w: q.w * inv };
}

export function qnormalize(q: Quat): Quat {
  const n = Math.sqrt(qlengthSq(q));
  if (n === 0) return qidentity();
  const inv = 1 / n;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

/** VEX `qrotate`: rotate a vector by a quaternion. */
export function qrotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + q.w*t + cross(q.xyz, t)
  const ux = q.x;
  const uy = q.y;
  const uz = q.z;
  const tx = 2 * (uy * v.z - uz * v.y);
  const ty = 2 * (uz * v.x - ux * v.z);
  const tz = 2 * (ux * v.y - uy * v.x);
  return {
    x: v.x + q.w * tx + (uy * tz - uz * ty),
    y: v.y + q.w * ty + (uz * tx - ux * tz),
    z: v.z + q.w * tz + (ux * ty - uy * tx),
  };
}

/** VEX `slerp`: shortest-arc spherical interpolation between two rotations. */
export function qslerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  // take shorter path
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    // nearly parallel — linear blend + normalize
    return qnormalize({
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    });
  }
  const theta = Math.acos(cos);
  const s = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / s;
  const w1 = Math.sin(t * theta) / s;
  return {
    x: a.x * w0 + bx * w1,
    y: a.y * w0 + by * w1,
    z: a.z * w0 + bz * w1,
    w: a.w * w0 + bw * w1,
  };
}

/**
 * VEX `eulertoquaternion`: Euler angles (radians) to quaternion.
 * order defaults to "xyz" (rotate X then Y then Z, intrinsic).
 */
export function fromEuler(
  rx: number,
  ry: number,
  rz: number,
  order: "xyz" | "zyx" = "xyz",
): Quat {
  const qx = fromAxisAngle({ x: 1, y: 0, z: 0 }, rx);
  const qy = fromAxisAngle({ x: 0, y: 1, z: 0 }, ry);
  const qz = fromAxisAngle({ x: 0, y: 0, z: 1 }, rz);
  return order === "xyz"
    ? qmultiply(qz, qmultiply(qy, qx))
    : qmultiply(qx, qmultiply(qy, qz));
}

/** VEX `quaterniontoeuler`: quaternion to XYZ Euler angles (radians). */
export function toEuler(q: Quat): Vec3 {
  const { x, y, z, w } = qnormalize(q);
  // roll (x)
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const rx = Math.atan2(sinrCosp, cosrCosp);
  // pitch (y)
  const sinp = 2 * (w * y - z * x);
  const ry = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  // yaw (z)
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const rz = Math.atan2(sinyCosp, cosyCosp);
  return { x: rx, y: ry, z: rz };
}

/**
 * VEX `dihedral`: the rotation that takes direction `from` onto `to`
 * (both treated as directions). Handles the antiparallel case.
 */
export function dihedral(from: Vec3, to: Vec3): Quat {
  const a = normVec3(from);
  const b = normVec3(to);
  const d = dot(a, b);
  if (d > 0.999999) return qidentity();
  if (d < -0.999999) {
    // 180°: pick any orthogonal axis
    let axis = cross({ x: 1, y: 0, z: 0 }, a);
    if (lenVec3(axis) < 1e-6) axis = cross({ x: 0, y: 1, z: 0 }, a);
    return fromAxisAngle(normVec3(axis), Math.PI);
  }
  const c = cross(a, b);
  const w = 1 + d;
  return qnormalize({ x: c.x, y: c.y, z: c.z, w });
}

/** Convert a unit quaternion to a column-major rotation Mat4. */
export function quatToMat4(q: Quat): Mat4 {
  const { x, y, z, w } = qnormalize(q);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const m = new Float32Array(16);
  // column-major: m[col*4 + row]
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy + wz);
  m[2] = 2 * (xz - wy);
  m[4] = 2 * (xy - wz);
  m[5] = 1 - 2 * (xx + zz);
  m[6] = 2 * (yz + wx);
  m[8] = 2 * (xz + wy);
  m[9] = 2 * (yz - wx);
  m[10] = 1 - 2 * (xx + yy);
  m[15] = 1;
  return m;
}
