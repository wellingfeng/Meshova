/**
 * Procedural railway track model — assembles the rail-geometry kit (rail.ts)
 * into a fully materialed track: crushed-stone ballast bed, wood/concrete
 * sleepers and two steel rails, swept along a deterministic centerline.
 *
 * The centerline is a smoothed S-curve on the XZ plane; `bend` controls the
 * lateral swing, `length` the run. Same params -> same track.
 *
 * Run: pnpm railway
 */
import {
  bezier,
  polyline,
  smoothCurve,
  railwayBallast,
  railwaySleepers,
  railwayRails,
  type Curve,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const BALLAST: RGB = [0.34, 0.33, 0.31];
const SLEEPER_WOOD: RGB = [0.22, 0.15, 0.09];
const SLEEPER_CONCRETE: RGB = [0.6, 0.6, 0.62];
const STEEL: RGB = [0.5, 0.51, 0.53];

export interface RailwayParams {
  /** Run length (metres). */
  length: number;
  /** Lateral bend amplitude of the S-curve centerline (0 = straight). */
  bend: number;
  /** Track gauge (inner-face distance between rails). Default standard 1.435m. */
  gauge: number;
  /** Along-track sleeper pitch (metres). */
  sleeperSpacing: number;
  /** Concrete sleepers instead of timber. */
  concreteSleepers: boolean;
  /** Centerline sampling step (metres); smaller = smoother sweep. */
  sample: number;
}

export const DEFAULT_RAILWAY: RailwayParams = {
  length: 40,
  bend: 6,
  gauge: 1.435,
  sleeperSpacing: 0.6,
  concreteSleepers: false,
  sample: 0.8,
};

/** Deterministic smoothed S-curve centerline on the XZ plane. */
function railwayCenterline(p: RailwayParams): Curve {
  const half = p.length / 2;
  const curve = bezier(
    { x: -p.bend, y: 0, z: -half },
    { x: p.bend, y: 0, z: -half / 3 },
    { x: -p.bend, y: 0, z: half / 3 },
    { x: p.bend, y: 0, z: half },
    Math.max(8, Math.round(p.length / 2)),
  );
  return smoothCurve(polyline(curve.points), 6);
}

/** Build the railway as separate materialed parts (ballast / sleepers / rails). */
export function buildRailwayParts(params: Partial<RailwayParams> = {}): NamedPart[] {
  const p: RailwayParams = { ...DEFAULT_RAILWAY, ...params };
  const center = railwayCenterline(p);

  const opt = {
    gauge: p.gauge,
    sampleDistance: p.sample,
    sleeperSpacing: p.sleeperSpacing,
    verticalOffset: 0,
  };

  const sleeperColor = p.concreteSleepers ? SLEEPER_CONCRETE : SLEEPER_WOOD;
  const sleeperSurface = p.concreteSleepers
    ? { type: "concrete" as const, params: { color: SLEEPER_CONCRETE, roughness: 0.85 } }
    : { type: "wood" as const, params: { color: SLEEPER_WOOD, roughness: 0.8 } };

  return [
    {
      name: "ballast",
      label: "道砟路基",
      mesh: railwayBallast(center, opt),
      color: BALLAST,
      surface: { type: "concrete", params: { color: BALLAST, roughness: 0.95 } },
    },
    {
      name: "sleepers",
      label: "轨枕",
      mesh: railwaySleepers(center, opt),
      color: sleeperColor,
      surface: sleeperSurface,
    },
    {
      name: "rails",
      label: "钢轨",
      mesh: railwayRails(center, opt),
      color: STEEL,
      surface: { type: "metal", params: { color: STEEL, roughness: 0.35 } },
    },
  ];
}
