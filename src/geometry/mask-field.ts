import type { Vec3 } from "../math/vec3.js";
import { dot, length, normalize, sub } from "../math/vec3.js";
import { fbm3, makeNoise, type FbmOptions } from "../random/noise.js";
import type { Curve } from "./curve.js";
import { makePointCloud, pointContext, type PointCloud, type PointContext, type PointScalar } from "./point-cloud.js";

export type MaskCombineOp = "multiply" | "min" | "max" | "add" | "subtract";

export type MaskField =
  | { readonly type: "constant"; readonly value: number }
  | { readonly type: "attribute"; readonly name: string; readonly fallback?: number; readonly min?: number; readonly max?: number }
  | { readonly type: "vertex-color"; readonly channel?: "r" | "g" | "b" | "a"; readonly attribute?: string; readonly fallback?: number }
  | { readonly type: "height"; readonly min?: number; readonly max?: number; readonly feather?: number }
  | { readonly type: "slope"; readonly minDeg?: number; readonly maxDeg?: number; readonly featherDeg?: number }
  | { readonly type: "direction"; readonly direction: Vec3; readonly minDot?: number; readonly maxDot?: number }
  | { readonly type: "projection"; readonly axis: "x" | "y" | "z"; readonly min?: number; readonly max?: number; readonly feather?: number }
  | { readonly type: "distance"; readonly targets: ReadonlyArray<Vec3>; readonly min?: number; readonly max?: number; readonly feather?: number }
  | { readonly type: "curve-distance"; readonly curve: Curve; readonly min?: number; readonly max?: number; readonly feather?: number }
  | { readonly type: "polygon"; readonly points: ReadonlyArray<Vec3>; readonly feather?: number }
  | { readonly type: "noise"; readonly frequency?: number; readonly seed?: number; readonly fbm?: FbmOptions; readonly floor?: number }
  | { readonly type: "texture"; readonly width: number; readonly height: number; readonly values: ReadonlyArray<number>; readonly uAttribute?: string; readonly vAttribute?: string; readonly wrap?: "clamp" | "repeat" }
  | { readonly type: "combine"; readonly op: MaskCombineOp; readonly fields: ReadonlyArray<MaskField> }
  | { readonly type: "invert"; readonly field: MaskField }
  | { readonly type: "remap"; readonly field: MaskField; readonly inMin?: number; readonly inMax?: number; readonly outMin?: number; readonly outMax?: number; readonly clamp?: boolean };

export interface ApplyMaskFieldOptions {
  readonly attribute?: string;
  readonly combine?: "replace" | MaskCombineOp;
}

export function compileMaskField(field: MaskField): PointScalar {
  switch (field.type) {
    case "constant":
      return clamp01(field.value);
    case "attribute":
      return (ctx) => remap01(ctx.attributes[field.name]?.[ctx.index] ?? field.fallback ?? 0, field.min ?? 0, field.max ?? 1);
    case "vertex-color": {
      const attribute = field.attribute ?? `color${(field.channel ?? "r").toUpperCase()}`;
      return (ctx) => clamp01(ctx.attributes[attribute]?.[ctx.index] ?? field.fallback ?? 0);
    }
    case "height":
      return (ctx) => bandMask(ctx.point.y, field.min, field.max, field.feather);
    case "slope":
      return (ctx) => {
        const slopeDeg = Math.acos(clamp(normalize(ctx.normal).y, -1, 1)) * 180 / Math.PI;
        return bandMask(slopeDeg, field.minDeg, field.maxDeg, field.featherDeg);
      };
    case "direction": {
      const direction = normalize(field.direction);
      return (ctx) => remap01(dot(normalize(ctx.normal), direction), field.minDot ?? -1, field.maxDot ?? 1);
    }
    case "projection":
      return (ctx) => bandMask(ctx.point[field.axis], field.min, field.max, field.feather);
    case "distance":
      return (ctx) => bandMask(nearestPointDistance(ctx.point, field.targets), field.min, field.max, field.feather);
    case "curve-distance":
      return (ctx) => bandMask(distanceToCurve(ctx.point, field.curve), field.min, field.max, field.feather);
    case "polygon":
      return (ctx) => polygonMask(ctx.point, field.points, field.feather ?? 0);
    case "noise": {
      const noise = makeNoise((field.seed ?? 0) >>> 0);
      const frequency = field.frequency ?? 0.05;
      const floor = clamp01(field.floor ?? 0);
      return (ctx) => {
        let value = fbm3(noise, ctx.point.x * frequency, ctx.point.y * frequency, ctx.point.z * frequency, field.fbm) * 0.5 + 0.5;
        if (floor > 0) value = value <= floor ? 0 : (value - floor) / (1 - floor);
        return clamp01(value);
      };
    }
    case "texture":
      return compileTextureField(field);
    case "combine": {
      const fields = field.fields.map(compileMaskField);
      return (ctx) => combineValues(fields.map((child) => evalScalar(child, ctx)), field.op);
    }
    case "invert": {
      const child = compileMaskField(field.field);
      return (ctx) => 1 - clamp01(evalScalar(child, ctx));
    }
    case "remap": {
      const child = compileMaskField(field.field);
      const inMin = field.inMin ?? 0;
      const inMax = field.inMax ?? 1;
      const outMin = field.outMin ?? 0;
      const outMax = field.outMax ?? 1;
      return (ctx) => {
        const t = inverseLerp(inMin, inMax, evalScalar(child, ctx));
        const value = outMin + t * (outMax - outMin);
        return field.clamp ?? true ? clamp01(value) : value;
      };
    }
  }
}

export function evaluateMaskField(field: MaskField, ctx: PointContext): number {
  return evalScalar(compileMaskField(field), ctx);
}

export function sampleMaskField(pc: PointCloud, field: MaskField): number[] {
  const compiled = compileMaskField(field);
  return pc.points.map((_, index) => clamp01(evalScalar(compiled, pointContext(pc, index))));
}

export function applyMaskField(pc: PointCloud, field: MaskField, options: ApplyMaskFieldOptions = {}): PointCloud {
  const attribute = options.attribute ?? "mask";
  const combine = options.combine ?? "replace";
  const values = sampleMaskField(pc, field);
  const previous = pc.attributes[attribute];
  const combined = combine === "replace" || !previous
    ? values
    : values.map((value, index) => combineValues([previous[index] ?? 0, value], combine));
  return makePointCloud({
    points: pc.points,
    normals: pc.normals,
    attributes: { ...pc.attributes, [attribute]: combined },
  });
}

export function ruleMaskField(field: MaskField, options: ApplyMaskFieldOptions = {}): (pc: PointCloud) => PointCloud {
  return (pc) => applyMaskField(pc, field, options);
}

function compileTextureField(field: Extract<MaskField, { type: "texture" }>): PointScalar {
  const width = Math.floor(field.width);
  const height = Math.floor(field.height);
  if (width < 1 || height < 1) throw new Error("texture mask dimensions must be positive");
  if (field.values.length !== width * height) throw new Error(`texture mask values length ${field.values.length} != ${width * height}`);
  const uAttribute = field.uAttribute ?? "u";
  const vAttribute = field.vAttribute ?? "v";
  return (ctx) => {
    const u = wrapUv(ctx.attributes[uAttribute]?.[ctx.index] ?? 0, field.wrap ?? "clamp");
    const v = wrapUv(ctx.attributes[vAttribute]?.[ctx.index] ?? 0, field.wrap ?? "clamp");
    const x = u * (width - 1);
    const y = v * (height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = field.values[y0 * width + x0] ?? 0;
    const b = field.values[y0 * width + x1] ?? 0;
    const c = field.values[y1 * width + x0] ?? 0;
    const d = field.values[y1 * width + x1] ?? 0;
    return clamp01(lerp(lerp(a, b, tx), lerp(c, d, tx), ty));
  };
}

function polygonMask(point: Vec3, polygon: ReadonlyArray<Vec3>, feather: number): number {
  if (polygon.length < 3) return 0;
  const inside = pointInPolygonXZ(point.x, point.z, polygon);
  if (inside) return 1;
  if (feather <= 0) return 0;
  return clamp01(1 - distanceToPolylineXZ(point, polygon, true) / feather);
}

function pointInPolygonXZ(x: number, z: number, polygon: ReadonlyArray<Vec3>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToCurve(point: Vec3, curve: Curve): number {
  return distanceToPolylineXZ(point, curve.points, curve.closed);
}

function distanceToPolylineXZ(point: Vec3, points: ReadonlyArray<Vec3>, closed: boolean): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0]!.x, point.z - points[0]!.z);
  let best = Infinity;
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const denom = dx * dx + dz * dz;
    const t = denom > 0 ? clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / denom, 0, 1) : 0;
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
  }
  return best;
}

function nearestPointDistance(point: Vec3, targets: ReadonlyArray<Vec3>): number {
  let best = Infinity;
  for (const target of targets) best = Math.min(best, length(sub(point, target)));
  return best;
}

function bandMask(value: number, min = -Infinity, max = Infinity, feather = 0): number {
  if (min > max) return 0;
  const edge = Math.max(0, feather);
  if (value < min) return edge > 0 ? smoothstep(min - edge, min, value) : 0;
  if (value > max) return edge > 0 ? 1 - smoothstep(max, max + edge, value) : 0;
  return 1;
}

function combineValues(values: ReadonlyArray<number>, op: MaskCombineOp): number {
  if (values.length === 0) return op === "multiply" || op === "min" ? 1 : 0;
  let result = values[0] ?? 0;
  for (let index = 1; index < values.length; index++) {
    const value = values[index] ?? 0;
    if (op === "multiply") result *= value;
    else if (op === "min") result = Math.min(result, value);
    else if (op === "max") result = Math.max(result, value);
    else if (op === "add") result += value;
    else result -= value;
  }
  return clamp01(result);
}

function evalScalar(field: PointScalar, ctx: PointContext): number {
  return typeof field === "function" ? field(ctx) : field;
}

function remap01(value: number, min: number, max: number): number {
  return clamp01(inverseLerp(min, max, value));
}

function inverseLerp(min: number, max: number, value: number): number {
  return Math.abs(max - min) < 1e-12 ? (value >= max ? 1 : 0) : (value - min) / (max - min);
}

function wrapUv(value: number, wrap: "clamp" | "repeat"): number {
  return wrap === "repeat" ? ((value % 1) + 1) % 1 : clamp01(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
