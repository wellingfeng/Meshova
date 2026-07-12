import { clamp, lerp } from "../math/scalar.js";
import { dot, length, sub, type Vec3, vec3 } from "../math/vec3.js";
import type { ScalarGrid } from "../geometry/remesh.js";

/** Signed distance function. Negative inside, zero on surface, positive outside. */
export type SDF3D = (point: Vec3) => number;

export function sdfSphere(radius: number, center: Vec3 = vec3()): SDF3D {
  const safeRadius = Math.max(0, radius);
  return (point) => length(sub(point, center)) - safeRadius;
}

/** Sign-correct ellipsoid approximation suited to modeling and polygonization. */
export function sdfEllipsoid(radii: Vec3, center: Vec3 = vec3()): SDF3D {
  const rx = Math.max(1e-6, Math.abs(radii.x));
  const ry = Math.max(1e-6, Math.abs(radii.y));
  const rz = Math.max(1e-6, Math.abs(radii.z));
  const scale = Math.min(rx, ry, rz);
  return (point) => {
    const local = sub(point, center);
    return (Math.sqrt((local.x / rx) ** 2 + (local.y / ry) ** 2 + (local.z / rz) ** 2) - 1) * scale;
  };
}

export function sdfBox(size: Vec3, center: Vec3 = vec3()): SDF3D {
  const half = vec3(Math.abs(size.x) * 0.5, Math.abs(size.y) * 0.5, Math.abs(size.z) * 0.5);
  return (point) => {
    const local = sub(point, center);
    const qx = Math.abs(local.x) - half.x;
    const qy = Math.abs(local.y) - half.y;
    const qz = Math.abs(local.z) - half.z;
    const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2);
    return outside + Math.min(Math.max(qx, qy, qz), 0);
  };
}

export function sdfCapsule(start: Vec3, end: Vec3, radius: number): SDF3D {
  const axis = sub(end, start);
  const axisLengthSq = dot(axis, axis);
  const safeRadius = Math.max(0, radius);
  return (point) => {
    const offset = sub(point, start);
    const t = axisLengthSq === 0 ? 0 : clamp(dot(offset, axis) / axisLengthSq, 0, 1);
    const closest = vec3(start.x + axis.x * t, start.y + axis.y * t, start.z + axis.z * t);
    return length(sub(point, closest)) - safeRadius;
  };
}

export function sdfTranslate(field: SDF3D, offset: Vec3): SDF3D {
  return (point) => field(vec3(point.x - offset.x, point.y - offset.y, point.z - offset.z));
}

export function sdfScale(field: SDF3D, scale: number): SDF3D {
  const safeScale = Math.max(1e-6, Math.abs(scale));
  return (point) => field(vec3(point.x / safeScale, point.y / safeScale, point.z / safeScale)) * safeScale;
}

export function sdfUnion(...fields: readonly SDF3D[]): SDF3D {
  return (point) => {
    let distance = Infinity;
    for (const field of fields) distance = Math.min(distance, field(point));
    return distance;
  };
}

export function sdfIntersection(...fields: readonly SDF3D[]): SDF3D {
  return (point) => {
    let distance = -Infinity;
    for (const field of fields) distance = Math.max(distance, field(point));
    return distance;
  };
}

export function sdfSubtract(base: SDF3D, cutter: SDF3D): SDF3D {
  return (point) => Math.max(base(point), -cutter(point));
}

export function sdfSmoothUnion(a: SDF3D, b: SDF3D, radius: number): SDF3D {
  const smoothing = Math.max(1e-6, radius);
  return (point) => {
    const av = a(point);
    const bv = b(point);
    const h = clamp(0.5 + 0.5 * (bv - av) / smoothing, 0, 1);
    return lerp(bv, av, h) - smoothing * h * (1 - h);
  };
}

export interface SDFGridOptions {
  readonly min: Vec3;
  readonly max: Vec3;
  /** Cell count along longest axis. */
  readonly resolution?: number;
}

/** Sample an analytic SDF onto a uniform grid accepted by marching cubes. */
export function sdfToScalarGrid(field: SDF3D, options: SDFGridOptions): ScalarGrid {
  const resolution = Math.max(4, Math.floor(options.resolution ?? 32));
  const sizeX = Math.max(1e-6, options.max.x - options.min.x);
  const sizeY = Math.max(1e-6, options.max.y - options.min.y);
  const sizeZ = Math.max(1e-6, options.max.z - options.min.z);
  const cell = Math.max(sizeX, sizeY, sizeZ) / resolution;
  const gx = Math.ceil(sizeX / cell) + 1;
  const gy = Math.ceil(sizeY / cell) + 1;
  const gz = Math.ceil(sizeZ / cell) + 1;
  const values = new Float64Array(gx * gy * gz);
  for (let z = 0; z < gz; z++) {
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const point = vec3(
          options.min.x + x * cell,
          options.min.y + y * cell,
          options.min.z + z * cell,
        );
        values[(z * gy + y) * gx + x] = field(point);
      }
    }
  }
  return { gx, gy, gz, origin: options.min, cell, values };
}
