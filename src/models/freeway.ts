/**
 * Procedural freeway / highway model — Meshova's take on the CitySample freeway
 * kit (Kit_Freeway_A). Assembles the road-geometry primitives into a complete,
 * materialed multi-lane carriageway:
 *
 *   deck (roadRibbon) + median crash barrier (roadMedianBarrier) + lane markings
 *   (roadLaneLines + roadEdgeLines) + edge guardrails (roadGuardrail) + optional
 *   viaduct pillars (roadPillars) when elevated.
 *
 * The centerline is a deterministic cubic bezier on the XZ plane; when
 * `elevation > 0` the whole deck lifts to that Y and pillars drop to the ground,
 * matching CitySample's elevated freeway sections. Same params -> same road.
 *
 * A freeway differs from a city street by: two opposing carriageways split by a
 * central Jersey barrier, more lanes per side, guardrails instead of curbs, and
 * (optionally) an elevated deck on pillars.
 */
import { vec3, add, cross, normalize, scale, type Vec3 } from "../math/vec3.js";
import {
  bezier,
  polyline,
  roadRibbon,
  roadDeck,
  roadMedianBarrier,
  roadGuardrail,
  roadLaneLines,
  roadEdgeLines,
  roadPillars,
  roadPierCaps,
  roadSignGantry,
  type Curve,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const ASPHALT: RGB = [0.08, 0.08, 0.09];
const CONCRETE: RGB = [0.62, 0.62, 0.64];
const PAINT_WHITE: RGB = [0.92, 0.92, 0.9];
const PAINT_YELLOW: RGB = [0.95, 0.82, 0.15];
const STEEL: RGB = [0.55, 0.56, 0.58];

export interface FreewayParams {
  /** Total run length (metres). */
  length: number;
  /** Lateral bend amplitude of the S-curve centerline (0 = straight). */
  bend: number;
  /** Lanes per carriageway (each direction). */
  lanesPerSide: number;
  /** Single lane width (metres). */
  laneWidth: number;
  /** Central median barrier width (metres). */
  medianWidth: number;
  /** Deck elevation above ground (0 = ground-level freeway, >0 = viaduct on pillars). */
  elevation: number;
  /** Edge guardrails on the outer edges. */
  guardrails: boolean;
  /** Draw viaduct support pillars when elevated. */
  pillars: boolean;
  /** Pillar spacing along the run. */
  pillarSpacing: number;
  /** Draw overhead sign gantries straddling the carriageways. */
  signGantry: boolean;
  /** Spacing between overhead sign gantries along the run. */
  signSpacing: number;
  /** Deck slab thickness — gives the elevated deck a solid underside. */
  deckThickness: number;
  /** Arc-length sample spacing (lower = smoother curve). */
  sample: number;
}

export const FREEWAY_DEFAULTS: FreewayParams = {
  length: 60,
  bend: 8,
  lanesPerSide: 3,
  laneWidth: 3.5,
  medianWidth: 1.4,
  elevation: 0,
  guardrails: true,
  pillars: true,
  pillarSpacing: 12,
  signGantry: true,
  signSpacing: 36,
  deckThickness: 0.6,
  sample: 1.5,
};

/** Build the S-curve centerline on the XZ plane, lifted to `elevation`. */
function freewayCenterline(p: FreewayParams): Curve {
  const half = p.length / 2;
  const y = p.elevation;
  if (p.bend <= 0.001) {
    return polyline([vec3(0, y, -half), vec3(0, y, half)]);
  }
  return bezier(
    vec3(-p.bend, y, -half),
    vec3(p.bend, y, -half / 3),
    vec3(-p.bend, y, half / 3),
    vec3(p.bend, y, half),
    Math.max(24, Math.round(p.length)),
  );
}

/**
 * Build one carriageway (deck + lane lines + edge line) offset laterally from
 * the median centerline by `sideSign * (medianHalf + carriageHalf)`.
 */
function carriageway(
  center: Curve,
  p: FreewayParams,
  sideSign: 1 | -1,
): NamedPart[] {
  const carriageWidth = p.lanesPerSide * p.laneWidth;
  const carriageHalf = carriageWidth / 2;
  const medianHalf = p.medianWidth / 2;
  // Offset the centerline laterally: shift each point by the side offset along X.
  // Since the bezier lies mostly along Z, a constant X offset is a good stylized
  // approximation of parallel carriageways (keeps geometry simple + deterministic).
  const offset = sideSign * (medianHalf + carriageHalf);
  // Offset each point along the local road normal (right vector) so the two
  // carriageways stay parallel through bends — a constant X shift would open a
  // gap on curves. Right = normalize(cross(tangent, up)), tangent from neighbors.
  const up = vec3(0, 1, 0);
  const pts = center.points;
  const shifted: Vec3[] = pts.map((pt, i) => {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const tan = normalize(vec3(next.x - prev.x, 0, next.z - prev.z));
    const right = normalize(cross(tan, up));
    return add(pt, scale(right, offset));
  });
  const cw = polyline(shifted);

  const opt = {
    halfWidth: carriageHalf,
    sampleDistance: p.sample,
    widthSubdivisions: Math.max(2, p.lanesPerSide * 2),
    adaptiveCurvature: true,
    curvatureThresholdDeg: 6,
    verticalOffset: 0.02,
    uvLengthScale: 8,
  };

  const tag = sideSign > 0 ? "r" : "l";
  const parts: NamedPart[] = [
    { name: `deck_${tag}`, label: `车行道-${tag}`, mesh: roadRibbon(cw, opt), color: ASPHALT, surface: { type: "concrete", params: { color: ASPHALT, roughness: 0.9 } } },
  ];

  // Elevated sections get a solid box-beam slab under the driving surface so the
  // viaduct reads as a chunky bridge deck from below, not a paper sheet.
  if (p.elevation > 0.01) {
    parts.push({
      name: `slab_${tag}`,
      label: `桥面板-${tag}`,
      mesh: roadDeck(cw, { ...opt, thickness: p.deckThickness }),
      color: CONCRETE,
      surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.85 } },
    });
  }

  parts.push(
    { name: `lanes_${tag}`, label: `车道线-${tag}`, mesh: roadLaneLines(cw, { ...opt, lanes: p.lanesPerSide, dashed: true, dashLength: 3, gapLength: 4, lineWidth: 0.14, skipCenter: false }), color: PAINT_WHITE, surface: { type: "ceramic", params: { color: PAINT_WHITE } } },
    { name: `edge_${tag}`, label: `边线-${tag}`, mesh: roadEdgeLines(cw, { ...opt, lineWidth: 0.14, edgeInset: 0.25 }), color: PAINT_YELLOW, surface: { type: "ceramic", params: { color: PAINT_YELLOW } } },
  );

  if (p.guardrails) {
    parts.push({
      name: `guardrail_${tag}`,
      label: `护栏-${tag}`,
      mesh: roadGuardrail(cw, { ...opt, side: sideSign > 0 ? 1 : -1, lateral: carriageHalf + 0.25, postSpacing: 4, railHeight: 0.6 }),
      color: STEEL,
      surface: { type: "metal", params: { color: STEEL, roughness: 0.4 } },
    });
  }
  return parts;
}

/** Build the full freeway as named, materialed parts. */
export function buildFreewayParts(params: Partial<FreewayParams> = {}): NamedPart[] {
  const p: FreewayParams = { ...FREEWAY_DEFAULTS, ...params };
  const center = freewayCenterline(p);

  const parts: NamedPart[] = [];
  parts.push(...carriageway(center, p, 1));
  parts.push(...carriageway(center, p, -1));

  // Central Jersey crash barrier on the median centerline.
  parts.push({
    name: "median_barrier",
    label: "中央隔离带",
    mesh: roadMedianBarrier(center, {
      halfWidth: p.medianWidth / 2,
      sampleDistance: p.sample,
      verticalOffset: 0.02,
      barrierHeight: 0.9,
      barrierWidth: p.medianWidth,
    }),
    color: CONCRETE,
    surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.75 } },
  });

  // Viaduct pillars + pier cap cross-beams when the deck is elevated.
  if (p.elevation > 0.01 && p.pillars) {
    const totalHalf = p.medianWidth / 2 + p.lanesPerSide * p.laneWidth;
    parts.push({
      name: "pillars",
      label: "桥墩",
      mesh: roadPillars(center, {
        sampleDistance: p.sample,
        verticalOffset: 0.02,
        spacing: p.pillarSpacing,
        radius: Math.max(0.5, totalHalf * 0.18),
        groundY: 0,
        deckThickness: p.deckThickness,
      }),
      color: CONCRETE,
      surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.8 } },
    });
    // Wide transverse pier caps carrying the deck at each pillar station.
    parts.push({
      name: "pier_caps",
      label: "盖梁",
      mesh: roadPierCaps(center, {
        sampleDistance: p.sample,
        verticalOffset: 0.02,
        spacing: p.pillarSpacing,
        capWidth: totalHalf * 2 + 0.8,
        capHeight: 0.7,
        capLength: 1.2,
        deckThickness: p.deckThickness,
      }),
      color: CONCRETE,
      surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.78 } },
    });
  }

  // Overhead sign gantries straddling both carriageways.
  if (p.signGantry) {
    const totalHalf = p.medianWidth / 2 + p.lanesPerSide * p.laneWidth;
    parts.push({
      name: "sign_gantry",
      label: "龙门标志架",
      mesh: roadSignGantry(center, {
        sampleDistance: p.sample,
        halfWidth: totalHalf,
        verticalOffset: 0.02,
        spacing: p.signSpacing,
        clearance: 5.5,
        poleRadius: 0.2,
        beamThickness: 0.24,
        panelSpan: totalHalf * 0.9,
        panelHeight: 1.6,
        overhang: 0.6,
      }),
      color: STEEL,
      surface: { type: "metal", params: { color: STEEL, roughness: 0.45 } },
    });
  }

  return parts;
}
