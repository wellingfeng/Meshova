/**
 * Three-strand braid rope: phase-shifted curves -> resample/sweep. This is the
 * workbook "braid" family in Meshova form: curve frame + tube sweep, no baked
 * mesh.
 */
import { TAU } from "../math/scalar.js";
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  curveLength,
  merge,
  polyline,
  resampleCurve,
  smoothCurve,
  sweep,
  torus,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface BraidRopeParams {
  readonly strands: number;
  readonly length: number;
  readonly braidRadius: number;
  readonly strandRadius: number;
  readonly turns: number;
  readonly segments: number;
  readonly sides: number;
  readonly irregularity: number;
  readonly endBands: boolean;
  readonly seed: number;
}

export const BRAID_ROPE_DEFAULTS: BraidRopeParams = {
  strands: 3,
  length: 5.2,
  braidRadius: 0.24,
  strandRadius: 0.075,
  turns: 5,
  segments: 140,
  sides: 9,
  irregularity: 0.025,
  endBands: true,
  seed: 17,
};

const STRAND_COLORS: RGB[] = [
  [0.78, 0.58, 0.33],
  [0.86, 0.66, 0.38],
  [0.66, 0.45, 0.25],
  [0.72, 0.52, 0.3],
];
const BAND_COLOR: RGB = [0.22, 0.2, 0.18];

function resolveBraid(params: Partial<BraidRopeParams> = {}): BraidRopeParams {
  return {
    ...BRAID_ROPE_DEFAULTS,
    ...params,
    strands: Math.max(2, Math.round(params.strands ?? BRAID_ROPE_DEFAULTS.strands)),
    length: Math.max(0.5, params.length ?? BRAID_ROPE_DEFAULTS.length),
    braidRadius: Math.max(0.02, params.braidRadius ?? BRAID_ROPE_DEFAULTS.braidRadius),
    strandRadius: Math.max(0.01, params.strandRadius ?? BRAID_ROPE_DEFAULTS.strandRadius),
    turns: Math.max(0.5, params.turns ?? BRAID_ROPE_DEFAULTS.turns),
    segments: Math.max(12, Math.round(params.segments ?? BRAID_ROPE_DEFAULTS.segments)),
    sides: Math.max(4, Math.round(params.sides ?? BRAID_ROPE_DEFAULTS.sides)),
    irregularity: Math.max(0, params.irregularity ?? BRAID_ROPE_DEFAULTS.irregularity),
    endBands: params.endBands ?? BRAID_ROPE_DEFAULTS.endBands,
    seed: Math.round(params.seed ?? BRAID_ROPE_DEFAULTS.seed),
  };
}

export function buildBraidRopeCurves(params: Partial<BraidRopeParams> = {}): Curve[] {
  const p = resolveBraid(params);
  const rng = makeRng(p.seed >>> 0);
  const curves: Curve[] = [];
  for (let s = 0; s < p.strands; s++) {
    const phase = (s / p.strands) * TAU + rng.range(-p.irregularity, p.irregularity);
    const amp = p.braidRadius * (1 + rng.range(-p.irregularity, p.irregularity));
    const pts: Vec3[] = [];
    for (let i = 0; i <= p.segments; i++) {
      const t = i / p.segments;
      const x = (t - 0.5) * p.length;
      const a = t * p.turns * TAU + phase;
      const pulse = 0.86 + 0.14 * Math.cos(a * 2);
      const side = Math.cos(a) * amp * pulse;
      const lift = Math.sin(a) * amp * 0.72 + p.braidRadius * 0.8;
      const wob = p.irregularity > 0 ? Math.sin((t * 17 + s * 3.1) * TAU) * p.irregularity * p.strandRadius : 0;
      pts.push(vec3(x, lift + wob, side));
    }
    curves.push(resampleCurve(smoothCurve(polyline(pts), 2), { count: p.segments + 1 }));
  }
  return curves;
}

export function buildBraidRopeMesh(params: Partial<BraidRopeParams> = {}): Mesh {
  const p = resolveBraid(params);
  return merge(
    ...buildBraidRopeCurves(p).map((curve) =>
      sweep(curve, { radius: p.strandRadius, sides: p.sides, caps: true }),
    ),
  );
}

export function buildBraidRopeParts(params: Partial<BraidRopeParams> = {}): NamedPart[] {
  const p = resolveBraid(params);
  const curves = buildBraidRopeCurves(p);
  const parts: NamedPart[] = curves.map((curve, i) => {
    const color = STRAND_COLORS[i % STRAND_COLORS.length]!;
    return {
      name: `strand_${i + 1}`,
      label: `绳股 ${i + 1}`,
      mesh: sweep(curve, { radius: p.strandRadius, sides: p.sides, caps: true }),
      color,
      surface: { type: "fabric", params: { color, roughness: 0.92 } },
      metadata: { source: "AlgorithmicDesignWorkbook-style braid rope" },
    };
  });

  if (p.endBands) {
    const ringR = p.braidRadius + p.strandRadius * 0.75;
    const tube = Math.max(0.018, p.strandRadius * 0.45);
    const bands = merge(
      transform(torus(ringR, tube, 28, 6), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.length * 0.5, p.braidRadius * 0.8, 0) }),
      transform(torus(ringR, tube, 28, 6), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.length * 0.5, p.braidRadius * 0.8, 0) }),
    );
    parts.push({
      name: "end_bands",
      label: "端部金属箍",
      mesh: bands,
      color: BAND_COLOR,
      surface: { type: "metal", params: { color: BAND_COLOR, roughness: 0.35, metallic: 1 } },
      metadata: { source: "AlgorithmicDesignWorkbook-style braid rope" },
    });
  }

  return parts;
}

export function braidRopeCurveLength(params: Partial<BraidRopeParams> = {}): number {
  return curveLength(buildBraidRopeCurves(params)[0]!);
}
