/**
 * 3D vector — immutable, functional style.
 * All operations return new objects; no in-place mutation.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x * b.x, y: a.y * b.y, z: a.z * b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: Vec3): number {
  return Math.sqrt(lengthSq(a));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  const inv = 1 / len;
  return { x: a.x * inv, y: a.y * inv, z: a.z * inv };
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function negate(a: Vec3): Vec3 {
  return { x: -a.x, y: -a.y, z: -a.z };
}

export function equals(a: Vec3, b: Vec3, eps = 1e-9): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  );
}

// --- VEX-parity vector helpers ---------------------------------------------

/** Per-component division. */
export function divVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x / b.x, y: a.y / b.y, z: a.z / b.z };
}

/** Per-component min / max. */
export function minVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
}
export function maxVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
}

/** Per-component abs. */
export function absVec3(a: Vec3): Vec3 {
  return { x: Math.abs(a.x), y: Math.abs(a.y), z: Math.abs(a.z) };
}

/** Largest / smallest component. */
export function maxComponent(a: Vec3): number {
  return Math.max(a.x, a.y, a.z);
}
export function minComponent(a: Vec3): number {
  return Math.min(a.x, a.y, a.z);
}

/**
 * VEX `reflect`: reflect incident I across normal N (N assumed normalized).
 * Returns I - 2*(I.N)*N.
 */
export function reflect(i: Vec3, n: Vec3): Vec3 {
  const d = 2 * dot(i, n);
  return { x: i.x - d * n.x, y: i.y - d * n.y, z: i.z - d * n.z };
}

/**
 * VEX `refract`: refract incident I through normal N with index ratio eta
 * (n1/n2). Returns zero vector on total internal reflection.
 */
export function refract(i: Vec3, n: Vec3, eta: number): Vec3 {
  const ni = dot(n, i);
  const k = 1 - eta * eta * (1 - ni * ni);
  if (k < 0) return { x: 0, y: 0, z: 0 };
  const f = eta * ni + Math.sqrt(k);
  return {
    x: eta * i.x - f * n.x,
    y: eta * i.y - f * n.y,
    z: eta * i.z - f * n.z,
  };
}

/** VEX `project`: projection of a onto b. */
export function project(a: Vec3, b: Vec3): Vec3 {
  const bb = dot(b, b);
  if (bb === 0) return { x: 0, y: 0, z: 0 };
  return scale(b, dot(a, b) / bb);
}

/** Rejection: component of a orthogonal to b. */
export function reject(a: Vec3, b: Vec3): Vec3 {
  return sub(a, project(a, b));
}

/** Angle between two vectors, radians [0, PI]. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = length(a);
  const lb = length(b);
  if (la === 0 || lb === 0) return 0;
  const c = dot(a, b) / (la * lb);
  return Math.acos(c < -1 ? -1 : c > 1 ? 1 : c);
}

/**
 * VEX `makebasis`: build an orthonormal basis given a (normalized) direction.
 * Returns { x: tangent, y: bitangent, z: normal }.
 */
export function makeBasis(dir: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const n = normalize(dir);
  const ref =
    Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const t = normalize(cross(ref, n));
  const b = cross(n, t);
  return { x: t, y: b, z: n };
}

/** Spherical-linear interpolation between two directions (normalized out). */
export function slerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const na = normalize(a);
  const nb = normalize(b);
  let d = dot(na, nb);
  d = d < -1 ? -1 : d > 1 ? 1 : d;
  const theta = Math.acos(d);
  if (theta < 1e-6) return lerpVec3(na, nb, t);
  const s = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / s;
  const w1 = Math.sin(t * theta) / s;
  return add(scale(na, w0), scale(nb, w1));
}
