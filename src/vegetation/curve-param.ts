import { scalarRamp, type RampOptions, type ValueRampStop } from "../geometry/ramp.js";

export type Curve1DStop = ValueRampStop<number>;

export type Curve1DInput =
  | number
  | ReadonlyArray<Curve1DStop>
  | Curve1DSpec;

export interface Curve1DSpec extends RampOptions {
  /** Constant value when stops are omitted. */
  value?: number;
  /** Normalized control points. */
  stops?: ReadonlyArray<Curve1DStop>;
  /** Deterministic +/- variation added after ramp sampling. */
  variance?: number;
  /** Variation frequency along t. */
  frequency?: number;
  /** Deterministic salt for variance. */
  seed?: number;
  /** Optional output clamp. */
  min?: number;
  max?: number;
}

export type Curve1DFn = (t: number, index?: number) => number;

export function curve1D(input: Curve1DInput | undefined, fallback = 1): Curve1DFn {
  if (input === undefined) return () => fallback;
  if (typeof input === "number") return () => input;
  if (isCurveStops(input)) return scalarRamp(input);

  const rampOpts: RampOptions = {
    ...(input.interp !== undefined ? { interp: input.interp } : {}),
    ...(input.smooth !== undefined ? { smooth: input.smooth } : {}),
  };
  const base = input.stops
    ? scalarRamp(input.stops, rampOpts)
    : () => input.value ?? fallback;
  const variance = input.variance ?? 0;
  const frequency = input.frequency ?? 1;
  const seed = input.seed ?? 1;
  return (t, index = 0) => {
    let v = base(clamp01(t));
    if (variance !== 0) {
      v += (hash01(seed * 13.37 + index * 31.11 + t * frequency * 97.13) * 2 - 1) * variance;
    }
    if (input.min !== undefined && v < input.min) v = input.min;
    if (input.max !== undefined && v > input.max) v = input.max;
    return v;
  };
}

export function sampleCurve1D(
  input: Curve1DInput | undefined,
  t: number,
  fallback = 1,
  index = 0,
): number {
  return curve1D(input, fallback)(t, index);
}

function hash01(v: number): number {
  const h = Math.sin(v) * 43758.5453123;
  return h - Math.floor(h);
}

function isCurveStops(input: Exclude<Curve1DInput, number | undefined>): input is ReadonlyArray<Curve1DStop> {
  return Array.isArray(input);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
