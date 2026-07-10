/**
 * Procedural elevated viaduct / overpass — Meshova's take on CitySample's
 * `FreewayBridge` (Content/City/Big_City/PBC). Unlike `buildFreewayParts`, which
 * simply lifts a whole freeway to a flat elevation, a viaduct is a *crossing*
 * structure: it ramps up from the ground at both approaches, spans a flat main
 * deck at height, then ramps back down — carried by a row of pier bents.
 *
 * Reference (CitySample FreewayBridge decomposition, self-rewritten):
 *   FreewayDeckVisible  -> deck ribbon + box-beam girders (roadRibbon + roadDeck)
 *   FreewayPillars      -> pier columns dropping to ground (roadPillars)
 *   pier caps           -> transverse cap beams at each bent (roadPierCaps)
 *   FreewayBarriers     -> Jersey barriers on both edges (roadGuardrail)
 *   abutments           -> chunky end blocks where the deck meets ground
 *
 * The centerline runs straight along Z with a trapezoidal elevation profile:
 * a rise ramp, a flat span, a fall ramp. Same params -> same bridge.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import {
  polyline,
  box,
  transform,
  roadRibbon,
  roadDeck,
  roadGuardrail,
  roadPillars,
  roadPierCaps,
  type Curve,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const ASPHALT: RGB = [0.08, 0.08, 0.09];
const CONCRETE: RGB = [0.66, 0.66, 0.68];
const CONCRETE_DK: RGB = [0.5, 0.5, 0.53];

export interface ViaductParams {
  /** Total run length along Z (metres). */
  length: number;
  /** Deck half-width (metres); full carriageway = 2 * halfWidth. */
  halfWidth: number;
  /** Peak deck height of the flat main span above ground. */
  clearance: number;
  /** Fraction of the run spent ramping up (and equally, down). 0.05..0.45. */
  rampFraction: number;
  /** Spacing between pier bents along the run. */
  pierSpacing: number;
  /** Pier column radius. */
  pierRadius: number;
  /** Pier cross-section: round cylinder or square pier. */
  pierShape: "round" | "square";
  /** Pier taper (1 = straight column, <1 = narrower at the top). */
  pierTaper: number;
  /** Deck slab (box girder) thickness. */
  deckThickness: number;
  /** Draw Jersey crash barriers along both deck edges. */
  barriers: boolean;
  /** Draw solid abutment end-blocks at both ground approaches. */
  abutments: boolean;
  /** Arc-length sample spacing (lower = smoother). */
  sample: number;
}

export const VIADUCT_DEFAULTS: ViaductParams = {
  length: 80,
  halfWidth: 6,
  clearance: 8,
  rampFraction: 0.28,
  pierSpacing: 12,
  pierRadius: 0.9,
  pierShape: "round",
  pierTaper: 1,
  deckThickness: 0.9,
  barriers: true,
  abutments: true,
  sample: 1.2,
};

/**
 * Trapezoidal elevation profile: 0 at the two ends, `clearance` across the flat
 * middle span, with smooth cubic-smoothstep ramps between. Returns Y for a given
 * normalized position t in [0,1] along the run.
 */
function deckHeight(t: number, clearance: number, rampFraction: number): number {
  const rf = Math.min(0.45, Math.max(0.05, rampFraction));
  const smooth = (x: number): number => x * x * (3 - 2 * x); // smoothstep
  if (t < rf) return clearance * smooth(t / rf);
  if (t > 1 - rf) return clearance * smooth((1 - t) / rf);
  return clearance;
}

/** Straight centerline along Z carrying the trapezoidal height profile. */
function viaductCenterline(p: ViaductParams): Curve {
  const half = p.length / 2;
  const steps = Math.max(24, Math.round(p.length / p.sample));
  const pts: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = -half + t * p.length;
    const y = deckHeight(t, p.clearance, p.rampFraction);
    pts.push(vec3(0, y, z));
  }
  return polyline(pts);
}
/** Build the full viaduct as named, materialed parts. */
export function buildViaductParts(params: Partial<ViaductParams> = {}): NamedPart[] {
  const p: ViaductParams = { ...VIADUCT_DEFAULTS, ...params };
  const center = viaductCenterline(p);
  const half = p.length / 2;

  const opt = {
    halfWidth: p.halfWidth,
    sampleDistance: p.sample,
    widthSubdivisions: 4,
    adaptiveCurvature: false,
    verticalOffset: 0.02,
    uvLengthScale: 8,
  };

  const parts: NamedPart[] = [];

  // Driving surface (asphalt ribbon following the ramped centerline). Lift it a
  // few cm above the box-girder's top face so the two coplanar surfaces don't
  // z-fight — otherwise the dark slab top bleeds through the light ribbon as
  // black splotches. The slab keeps opt.verticalOffset; the ribbon sits above.
  parts.push({
    name: "deck_surface",
    label: "桥面沥青",
    mesh: roadRibbon(center, { ...opt, verticalOffset: opt.verticalOffset + 0.05 }),
    color: ASPHALT,
    surface: { type: "concrete", params: { color: ASPHALT, roughness: 0.9 } },
  });

  // Box-girder slab under the surface — the structural bridge deck.
  parts.push({
    name: "deck_slab",
    label: "箱梁桥面板",
    mesh: roadDeck(center, { ...opt, thickness: p.deckThickness }),
    color: CONCRETE,
    surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.82 } },
  });

  // Jersey crash barriers along both outer edges.
  if (p.barriers) {
    for (const side of [1, -1] as const) {
      parts.push({
        name: side > 0 ? "barrier_r" : "barrier_l",
        label: side > 0 ? "护栏-右" : "护栏-左",
        mesh: roadGuardrail(center, {
          ...opt,
          side,
          lateral: p.halfWidth + 0.1,
          postSpacing: 3,
          railHeight: 0.9,
          postSize: 0.18,
        }),
        color: CONCRETE,
        surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.72 } },
      });
    }
  }

  // Pier bents: only under the elevated portion (skip where the deck meets ground
  // at the ramp ends, otherwise pillars collapse to zero height).
  parts.push({
    name: "piers",
    label: "桥墩",
    mesh: roadPillars(center, {
      sampleDistance: p.sample,
      verticalOffset: 0.02,
      spacing: p.pierSpacing,
      radius: p.pierRadius,
      groundY: 0,
      deckThickness: p.deckThickness,
      shape: p.pierShape,
      taper: p.pierTaper,
    }),
    color: CONCRETE_DK,
    surface: { type: "concrete", params: { color: CONCRETE_DK, roughness: 0.85 } },
  });

  // Transverse pier caps carrying the deck at each bent.
  parts.push({
    name: "pier_caps",
    label: "盖梁",
    mesh: roadPierCaps(center, {
      sampleDistance: p.sample,
      verticalOffset: 0.02,
      spacing: p.pierSpacing,
      capWidth: p.halfWidth * 2 + 1.0,
      capHeight: 0.8,
      capLength: 1.4,
      deckThickness: p.deckThickness,
    }),
    color: CONCRETE_DK,
    surface: { type: "concrete", params: { color: CONCRETE_DK, roughness: 0.82 } },
  });

  // Solid abutment end-blocks where the ramps meet the ground at both ends.
  if (p.abutments) {
    const aw = p.halfWidth * 2 + 1.2;
    const ad = 2.2;
    const ah = 1.4;
    for (const z of [-half + ad / 2, half - ad / 2]) {
      parts.push({
        name: z < 0 ? "abutment_s" : "abutment_n",
        label: z < 0 ? "南桥台" : "北桥台",
        mesh: transform(box(aw, ah, ad), { translate: vec3(0, ah / 2, z) }),
        color: CONCRETE_DK,
        surface: { type: "concrete", params: { color: CONCRETE_DK, roughness: 0.88 } },
      });
    }
  }

  // No model-owned ground plane. A flat opaque box is unfixable: sized tight it
  // shows a hard square edge against the sky (cropping), sized large it occludes
  // the ramping deck at low camera angles. The web viewer already provides a
  // faded shadow/reflective floor + IBL gradient sky that handles the horizon
  // cleanly, so the bridge simply sits on that instead.

  return parts;
}

