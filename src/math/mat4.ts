/**
 * 4x4 matrix — column-major (same layout WGSL/WebGPU expects, so P3 can hand
 * these straight to the GPU without transposing).
 *
 * Stored as a 16-element Float32Array, columns laid out contiguously:
 *   m[col*4 + row]
 */
import type { Vec3 } from "./vec3.js";

export type Mat4 = Float32Array;

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function translation(t: Vec3): Mat4 {
  const m = identity();
  m[12] = t.x;
  m[13] = t.y;
  m[14] = t.z;
  return m;
}

export function scaling(s: Vec3): Mat4 {
  const m = new Float32Array(16);
  m[0] = s.x;
  m[5] = s.y;
  m[10] = s.z;
  m[15] = 1;
  return m;
}

export function rotationX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotationY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function rotationZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Matrix product a * b (apply b first, then a, to a column vector). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Compose multiple matrices left-to-right: chain(a, b, c) = a*b*c. */
export function chain(...mats: Mat4[]): Mat4 {
  let acc = identity();
  for (const m of mats) acc = multiply(acc, m);
  return acc;
}

/** Transform a point (w = 1, translation applies). */
export function transformPoint(m: Mat4, v: Vec3): Vec3 {
  return {
    x: m[0]! * v.x + m[4]! * v.y + m[8]! * v.z + m[12]!,
    y: m[1]! * v.x + m[5]! * v.y + m[9]! * v.z + m[13]!,
    z: m[2]! * v.x + m[6]! * v.y + m[10]! * v.z + m[14]!,
  };
}

/** Transform a direction (w = 0, translation ignored). */
export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return {
    x: m[0]! * v.x + m[4]! * v.y + m[8]! * v.z,
    y: m[1]! * v.x + m[5]! * v.y + m[9]! * v.z,
    z: m[2]! * v.x + m[6]! * v.y + m[10]! * v.z,
  };
}
