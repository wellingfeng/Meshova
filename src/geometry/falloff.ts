import { clamp } from "../math/scalar.js";
import type { Vec3 } from "../math/vec3.js";
import { distance } from "../math/vec3.js";
import type { ScalarField } from "./field.js";

export type FalloffCurve = "linear" | "smooth" | "smoother" | "quadratic" | "cubic";

export interface FalloffOptions {
  /** Full influence inside this distance. Default 0. */
  readonly innerRadius?: number;
  /** Influence reaches 0 at this distance. Default 1. */
  readonly radius?: number;
  /** Shape of the 1..0 transition. Default "smooth". */
  readonly curve?: FalloffCurve;
  /** Return 1-weight. Useful for repulsors / negative space. */
  readonly invert?: boolean;
}

export interface Attractor {
  readonly position: Vec3;
  readonly radius?: number;
  readonly strength?: number;
}

export interface AttractorWeightOptions extends FalloffOptions {
  readonly combine?: "max" | "sum" | "average";
}

/** Distance falloff: 1 near the center, 0 at radius and beyond. */
export function radialFalloff(distanceValue: number, options: FalloffOptions = {}): number {
  if (!Number.isFinite(distanceValue)) return options.invert ? 1 : 0;
  const inner = Math.max(0, options.innerRadius ?? 0);
  const radius = Math.max(inner + 1e-9, options.radius ?? 1);
  const t = clamp((distanceValue - inner) / (radius - inner), 0, 1);
  let w = 1 - t;
  switch (options.curve ?? "smooth") {
    case "linear":
      break;
    case "smoother":
      w = w * w * w * (w * (w * 6 - 15) + 10);
      break;
    case "quadratic":
      w *= w;
      break;
    case "cubic":
      w = w * w * w;
      break;
    case "smooth":
    default:
      w = w * w * (3 - 2 * w);
      break;
  }
  return options.invert ? 1 - w : w;
}

/** Position falloff against one attractor center. */
export function pointFalloff(position: Vec3, center: Vec3, options: FalloffOptions = {}): number {
  return radialFalloff(distance(position, center), options);
}

/** Mesh field wrapper for pointFalloff. */
export function pointFalloffF(center: Vec3, options: FalloffOptions = {}): ScalarField {
  return (ctx) => pointFalloff(ctx.position, center, options);
}

/** Combine multiple attractors into one normalized 0..1 weight. */
export function attractorWeight(
  position: Vec3,
  attractors: ReadonlyArray<Attractor>,
  options: AttractorWeightOptions = {},
): number {
  if (attractors.length === 0) return options.invert ? 1 : 0;
  const combine = options.combine ?? "max";
  let total = 0;
  let maxW = 0;
  for (const a of attractors) {
    const strength = a.strength ?? 1;
    const radius = a.radius ?? options.radius;
    const w = radialFalloff(distance(position, a.position), {
      ...(options.innerRadius !== undefined ? { innerRadius: options.innerRadius } : {}),
      ...(radius !== undefined ? { radius } : {}),
      ...(options.curve !== undefined ? { curve: options.curve } : {}),
      invert: false,
    }) * strength;
    total += w;
    if (w > maxW) maxW = w;
  }
  const raw = combine === "sum"
    ? total
    : combine === "average"
      ? total / attractors.length
      : maxW;
  const clamped = clamp(raw, 0, 1);
  return options.invert ? 1 - clamped : clamped;
}

/** Mesh field wrapper for attractorWeight. */
export function attractorWeightF(
  attractors: ReadonlyArray<Attractor>,
  options: AttractorWeightOptions = {},
): ScalarField {
  return (ctx) => attractorWeight(ctx.position, attractors, options);
}
