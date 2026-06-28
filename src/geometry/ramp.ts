/**
 * First-class ramp curves. Houdini workflows lean heavily on ramps: one
 * normalized value (height, floor index, curve t, mask) drives many parameters.
 */
import type { Vec3 } from "../math/vec3.js";
import { lerpVec3 } from "../math/vec3.js";
import type { ScalarField } from "./field.js";
import { evalScalar } from "./field.js";

export interface ValueRampStop<T> {
  readonly t: number;
  readonly value: T;
}

export interface RampOptions {
  /** Smoothstep interpolation instead of linear interpolation. */
  readonly smooth?: boolean;
  /**
   * Interpolation mode. Overrides `smooth` when set.
   *  - "linear":   straight segments (default)
   *  - "smooth":   smoothstep ease between stops
   *  - "spline":   Catmull-Rom through the stops (VEX `chramp` catmull-rom)
   *  - "constant": step / hold previous value (VEX constant)
   */
  readonly interp?: "linear" | "smooth" | "spline" | "constant";
}

type Interp = NonNullable<RampOptions["interp"]>;

function resolveInterp(opts: RampOptions): Interp {
  if (opts.interp) return opts.interp;
  return opts.smooth ? "smooth" : "linear";
}

/** Build a clamped scalar ramp from sorted or unsorted stops. */
export function scalarRamp(
  stops: ReadonlyArray<ValueRampStop<number>>,
  opts: RampOptions = {},
): (t: number) => number {
  const s = prepareStops(stops, assertFiniteNumber);
  const mode = resolveInterp(opts);
  return (t) => sampleRamp(s, t, mode, lerpNumber, catmullNumber);
}

/** Build a clamped vector ramp from sorted or unsorted stops. */
export function vectorRamp(
  stops: ReadonlyArray<ValueRampStop<Vec3>>,
  opts: RampOptions = {},
): (t: number) => Vec3 {
  const s = prepareStops(stops, assertFiniteVec3);
  const mode = resolveInterp(opts);
  return (t) => sampleRamp(s, t, mode, lerpVec3, catmullVec3);
}

/** Lift a scalar ramp into the mesh Field system. */
export function rampF(
  input: ScalarField,
  stops: ReadonlyArray<ValueRampStop<number>>,
  opts: RampOptions = {},
): ScalarField {
  const r = scalarRamp(stops, opts);
  return (ctx) => r(evalScalar(input, ctx));
}

function prepareStops<T>(
  stops: ReadonlyArray<ValueRampStop<T>>,
  validateValue: (value: T) => void,
): Array<ValueRampStop<T>> {
  if (stops.length === 0) throw new Error("ramp needs at least one stop");
  const out = stops.map((s) => {
    if (!Number.isFinite(s.t)) throw new Error(`invalid ramp stop t: ${s.t}`);
    validateValue(s.value);
    return { t: s.t, value: s.value };
  }).sort((a, b) => a.t - b.t);
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.t === out[i - 1]!.t) {
      throw new Error(`duplicate ramp stop t: ${out[i]!.t}`);
    }
  }
  return out;
}

function sampleRamp<T>(
  stops: ReadonlyArray<ValueRampStop<T>>,
  t: number,
  mode: Interp,
  lerp: (a: T, b: T, k: number) => T,
  catmull: (p0: T, p1: T, p2: T, p3: T, k: number) => T,
): T {
  if (!Number.isFinite(t)) return stops[0]!.value;
  if (t <= stops[0]!.t) return stops[0]!.value;
  const last = stops[stops.length - 1]!;
  if (t >= last.t) return last.value;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      if (mode === "constant") return a.value;
      if (mode === "smooth") return lerp(a.value, b.value, k * k * (3 - 2 * k));
      if (mode === "spline") {
        const p0 = stops[i - 1]?.value ?? a.value;
        const p3 = stops[i + 2]?.value ?? b.value;
        return catmull(p0, a.value, b.value, p3, k);
      }
      return lerp(a.value, b.value, k);
    }
  }
  return last.value;
}

function lerpNumber(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** Catmull-Rom spline interpolation for scalars (uniform parameterization). */
function catmullNumber(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  k: number,
): number {
  const k2 = k * k;
  const k3 = k2 * k;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * k +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * k3)
  );
}

/** Catmull-Rom for Vec3 (per component). */
function catmullVec3(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  k: number,
): Vec3 {
  return {
    x: catmullNumber(p0.x, p1.x, p2.x, p3.x, k),
    y: catmullNumber(p0.y, p1.y, p2.y, p3.y, k),
    z: catmullNumber(p0.z, p1.z, p2.z, p3.z, k),
  };
}

function assertFiniteNumber(value: number): void {
  if (!Number.isFinite(value)) throw new Error(`invalid ramp value: ${value}`);
}

function assertFiniteVec3(value: Vec3): void {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error("invalid ramp vector value");
  }
}
