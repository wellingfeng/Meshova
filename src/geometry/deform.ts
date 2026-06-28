/**
 * Local mesh deformation helpers for soft-goods details. These operators keep
 * creases/wrinkles inside the original surface instead of adding separate rods.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, dot, length, lengthSq, normalize } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

/** Axis selector: a literal axis name or an explicit unit vector. */
export type AxisLike = "x" | "y" | "z" | Vec3;

function resolveAxis(a: AxisLike): Vec3 {
  if (a === "x") return vec3(1, 0, 0);
  if (a === "y") return vec3(0, 1, 0);
  if (a === "z") return vec3(0, 0, 1);
  return normalize(a);
}

/** Component of p along unit axis, and the leftover (perpendicular) part. */
function splitAlong(p: Vec3, axis: Vec3): { s: number; perp: Vec3 } {
  const s = dot(p, axis);
  return { s, perp: sub(p, scale(axis, s)) };
}

/** Min/max of the mesh extent projected onto a unit axis. */
function axisRange(mesh: Mesh, axis: Vec3): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of mesh.positions) {
    const s = dot(p, axis);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return { min, max };
}

/** Apply a per-vertex position map, then recompute normals. */
function remap(mesh: Mesh, fn: (p: Vec3) => Vec3): Mesh {
  return recomputeNormals(makeMesh({
    positions: mesh.positions.map(fn),
    normals: [...mesh.normals],
    uvs: [...mesh.uvs],
    indices: [...mesh.indices],
  }));
}

export interface CreaseSegment {
  /** Object-space segment centerline of the crease. */
  from: Vec3;
  to: Vec3;
  /** Positive distance moved along options.direction at the crease center. */
  depth?: number;
  /** Gaussian falloff radius around the segment. */
  width?: number;
}

export interface IndentCreasesOptions {
  /** Direction of the indentation, e.g. vec3(0,-1,0) for a seat top. */
  direction?: Vec3;
  /** Optional surface filter; vertices whose normals face away are ignored. */
  surfaceNormal?: Vec3;
  /** Dot threshold for surfaceNormal filtering. Defaults to 0.25. */
  normalThreshold?: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const denom = lengthSq(ab);
  if (denom === 0) return length(sub(p, a));
  const t = clamp01(dot(sub(p, a), ab) / denom);
  const q = add(a, scale(ab, t));
  return length(sub(p, q));
}

/**
 * Press crease line segments into a mesh by moving nearby vertices along a
 * direction with smooth falloff. Use on subdivided/rounded soft surfaces.
 */
export function indentCreases(
  mesh: Mesh,
  creases: ReadonlyArray<CreaseSegment>,
  options: IndentCreasesOptions = {},
): Mesh {
  const direction = normalize(options.direction ?? vec3(0, -1, 0));
  const surfaceNormal = options.surfaceNormal ? normalize(options.surfaceNormal) : undefined;
  const normalThreshold = options.normalThreshold ?? 0.25;

  const positions = mesh.positions.map((p, i) => {
    const normal = mesh.normals[i]!;
    const normalMask = surfaceNormal
      ? smoothstep(normalThreshold, 1, dot(normalize(normal), surfaceNormal))
      : 1;
    if (normalMask <= 0) return { ...p };

    let amount = 0;
    for (const crease of creases) {
      const width = crease.width ?? 0.04;
      if (width <= 0) continue;
      const d = distanceToSegment(p, crease.from, crease.to);
      if (d > width * 3) continue;
      const depth = crease.depth ?? 0.02;
      const falloff = Math.exp(-(d * d) / (2 * width * width));
      amount += depth * falloff;
    }
    return amount === 0 ? { ...p } : add(p, scale(direction, amount * normalMask));
  });

  return recomputeNormals(makeMesh({
    positions,
    normals: [...mesh.normals],
    uvs: [...mesh.uvs],
    indices: [...mesh.indices],
  }));
}

export interface TaperOptions {
  /** Long axis the taper runs along. Default "y". */
  axis?: AxisLike;
  /** Scale applied to the cross-section at the axis minimum. Default 1. */
  startScale?: number;
  /** Scale applied to the cross-section at the axis maximum. Default 0.5. */
  endScale?: number;
  /** Exponent shaping the start->end falloff (1 = linear). Default 1. */
  curve?: number;
}

/**
 * Taper a mesh: scale each cross-section perpendicular to `axis` by a factor
 * that ramps from startScale (axis min) to endScale (axis max). This turns a
 * cylinder/tube into a cone-like limb or a tapering tail without modelling a
 * separate profile. The axis component of each vertex is preserved.
 */
export function taperMesh(mesh: Mesh, opts: TaperOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const axis = resolveAxis(opts.axis ?? "y");
  const startScale = opts.startScale ?? 1;
  const endScale = opts.endScale ?? 0.5;
  const curve = opts.curve ?? 1;
  const { min, max } = axisRange(mesh, axis);
  const span = max - min || 1;
  return remap(mesh, (p) => {
    const { s, perp } = splitAlong(p, axis);
    let t = (s - min) / span;
    if (curve !== 1) t = Math.pow(Math.max(0, Math.min(1, t)), curve);
    const f = startScale + (endScale - startScale) * t;
    return add(scale(axis, s), scale(perp, f));
  });
}

export interface TwistOptions {
  /** Axis the mesh is twisted around. Default "y". */
  axis?: AxisLike;
  /** Total twist in radians from axis min to axis max. Default Math.PI/2. */
  angle?: number;
  /** Center of rotation in the perpendicular plane. Default origin. */
  center?: Vec3;
}

/**
 * Twist a mesh around `axis`: rotate each cross-section by an angle that ramps
 * linearly from 0 (axis min) to `angle` (axis max). Drill bits, horns, spiral
 * shells, screw threads.
 */
export function twistMesh(mesh: Mesh, opts: TwistOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const axis = resolveAxis(opts.axis ?? "y");
  const angle = opts.angle ?? Math.PI / 2;
  const center = opts.center ?? vec3(0, 0, 0);
  const { min, max } = axisRange(mesh, axis);
  const span = max - min || 1;
  // Build an orthonormal basis (u,v) spanning the plane perpendicular to axis.
  const ref = Math.abs(axis.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  const u = normalize(sub(ref, scale(axis, dot(ref, axis))));
  const v = normalize(cross3(axis, u));
  return remap(mesh, (p) => {
    const rel = sub(p, center);
    const s = dot(rel, axis);
    const cu = dot(rel, u);
    const cv = dot(rel, v);
    const t = (s - min) / span;
    const a = angle * t;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const ru = cu * cos - cv * sin;
    const rv = cu * sin + cv * cos;
    return add(center, add(scale(axis, s), add(scale(u, ru), scale(v, rv))));
  });
}

export interface BendOptions {
  /** Axis along which the bend accumulates (the "length" axis). Default "y". */
  axis?: AxisLike;
  /** Direction the mesh bends toward. Must differ from axis. Default "z". */
  towards?: AxisLike;
  /** Total bend angle in radians across the full axis span. Default Math.PI/2. */
  angle?: number;
}

/**
 * Bend a mesh along `axis` toward `towards`, arcing it into a curve. Models
 * arching tails, horns, hooks, bent pipes from a straight tube. Implemented as
 * a circular arc remap: the axis coordinate becomes arc length on a circle of
 * radius span/angle, and the perpendicular offset rides along the arc normal.
 */
export function bendMesh(mesh: Mesh, opts: BendOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const axis = resolveAxis(opts.axis ?? "y");
  const towards = resolveAxis(opts.towards ?? "z");
  const angle = opts.angle ?? Math.PI / 2;
  if (Math.abs(angle) < 1e-6) return mesh;
  // Orthonormalize towards against axis so the bend plane is well-defined.
  const bendDir = normalize(sub(towards, scale(axis, dot(towards, axis))));
  const { min, max } = axisRange(mesh, axis);
  const span = max - min || 1;
  const radius = span / angle;
  return remap(mesh, (p) => {
    const s = dot(p, axis);
    const d = dot(p, bendDir);
    // residual = components not in the (axis, bendDir) plane, carried through
    const planar = add(scale(axis, s), scale(bendDir, d));
    const residual = sub(p, planar);
    const t = (s - min) / span; // 0..1 along length
    const theta = angle * t;
    const r = radius - d; // offset from neutral fibre bends the layer
    // Arc: origin at min end, bending in +bendDir. Center sits at distance
    // radius along bendDir from the min-end neutral point.
    const along = Math.sin(theta) * r;
    const off = radius - Math.cos(theta) * r;
    return add(residual, add(scale(axis, min + along), scale(bendDir, off)));
  });
}

export interface StretchOptions {
  /** Axis to stretch/scale along. Default "y". */
  axis?: AxisLike;
  /** Multiplier on the axis extent. Default 1.5. */
  factor?: number;
  /** Pivot along the axis (in axis units). Default the axis minimum. */
  pivot?: number;
}

/**
 * Stretch (or squash) a mesh only along `axis` about a pivot. factor>1
 * elongates, <1 compresses; the perpendicular cross-section is untouched.
 */
export function stretchMesh(mesh: Mesh, opts: StretchOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const axis = resolveAxis(opts.axis ?? "y");
  const factor = opts.factor ?? 1.5;
  const { min } = axisRange(mesh, axis);
  const pivot = opts.pivot ?? min;
  return remap(mesh, (p) => {
    const { s, perp } = splitAlong(p, axis);
    const ns = pivot + (s - pivot) * factor;
    return add(scale(axis, ns), perp);
  });
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
