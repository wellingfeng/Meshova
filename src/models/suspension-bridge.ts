import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import { catenaryCurve, layoutPiecesOnCurve } from "../geometry/curve-pieces.js";
import { curveLength, polyline, resampleCurve, type Curve } from "../geometry/curve.js";
import type { NamedPart } from "../geometry/export.js";
import { computeNormals, merge, type Mesh } from "../geometry/mesh.js";
import { box } from "../geometry/primitives.js";
import { profileSweep, rectProfile } from "../geometry/shapes.js";
import { transform } from "../geometry/transform.js";

export interface SuspensionBridgeParams {
  readonly controlPoints?: ReadonlyArray<Vec3>;
  seed: number;
  spanLength: number;
  towerCount: number;
  bridgeWidth: number;
  towerHeight: number;
  valleyDepth: number;
  pathBend: number;
  towerJitter: number;
  deckSag: number;
  cableSag: number;
  plankSpacing: number;
  hangerSpacing: number;
}

export const SUSPENSION_BRIDGE_DEFAULTS: SuspensionBridgeParams = {
  seed: 83,
  spanLength: 90,
  towerCount: 6,
  bridgeWidth: 3.8,
  towerHeight: 5.2,
  valleyDepth: 5.5,
  pathBend: 3.2,
  towerJitter: 0.35,
  deckSag: 0.024,
  cableSag: 0.11,
  plankSpacing: 0.58,
  hangerSpacing: 2.1,
};

const DECK_COLOR: [number, number, number] = [0.46, 0.28, 0.13];
const FRAME_COLOR: [number, number, number] = [0.31, 0.17, 0.08];
const ROOF_COLOR: [number, number, number] = [0.22, 0.12, 0.07];
const ROPE_COLOR: [number, number, number] = [0.13, 0.1, 0.07];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveSuspensionBridgeParams(
  params: Partial<SuspensionBridgeParams> = {},
): SuspensionBridgeParams {
  return {
    ...(params.controlPoints && params.controlPoints.length >= 2
      ? { controlPoints: params.controlPoints.map((point) => vec3(point.x, point.y, point.z)) }
      : {}),
    seed: Math.floor(params.seed ?? SUSPENSION_BRIDGE_DEFAULTS.seed),
    spanLength: clamp(params.spanLength ?? SUSPENSION_BRIDGE_DEFAULTS.spanLength, 18, 180),
    towerCount: Math.round(clamp(params.towerCount ?? SUSPENSION_BRIDGE_DEFAULTS.towerCount, 2, 12)),
    bridgeWidth: clamp(params.bridgeWidth ?? SUSPENSION_BRIDGE_DEFAULTS.bridgeWidth, 1.4, 8),
    towerHeight: clamp(params.towerHeight ?? SUSPENSION_BRIDGE_DEFAULTS.towerHeight, 2.4, 12),
    valleyDepth: clamp(params.valleyDepth ?? SUSPENSION_BRIDGE_DEFAULTS.valleyDepth, 0, 18),
    pathBend: clamp(params.pathBend ?? SUSPENSION_BRIDGE_DEFAULTS.pathBend, 0, 24),
    towerJitter: clamp(params.towerJitter ?? SUSPENSION_BRIDGE_DEFAULTS.towerJitter, 0, 2.5),
    deckSag: clamp(params.deckSag ?? SUSPENSION_BRIDGE_DEFAULTS.deckSag, 0, 0.09),
    cableSag: clamp(params.cableSag ?? SUSPENSION_BRIDGE_DEFAULTS.cableSag, 0.02, 0.28),
    plankSpacing: clamp(params.plankSpacing ?? SUSPENSION_BRIDGE_DEFAULTS.plankSpacing, 0.28, 1.4),
    hangerSpacing: clamp(params.hangerSpacing ?? SUSPENSION_BRIDGE_DEFAULTS.hangerSpacing, 0.8, 5),
  };
}

function stationHeading(stations: readonly Vec3[], index: number): number {
  const previous = stations[Math.max(0, index - 1)]!;
  const next = stations[Math.min(stations.length - 1, index + 1)]!;
  return Math.atan2(next.z - previous.z, next.x - previous.x);
}

function offsetPoint(point: Vec3, heading: number, distance: number, y = point.y): Vec3 {
  return vec3(point.x - Math.sin(heading) * distance, y, point.z + Math.cos(heading) * distance);
}

function offsetCurve(curve: Curve, distance: number): Curve {
  return polyline(curve.points.map((point, index) => {
    const previous = curve.points[Math.max(0, index - 1)]!;
    const next = curve.points[Math.min(curve.points.length - 1, index + 1)]!;
    const heading = Math.atan2(next.z - previous.z, next.x - previous.x);
    return offsetPoint(point, heading, distance);
  }));
}

function beamBetween(a: Vec3, b: Vec3, thickness: number): Mesh {
  return profileSweep(polyline([a, b]), rectProfile(thickness / 2, thickness / 2), { caps: true });
}

function cableMesh(curve: Curve, thickness: number): Mesh {
  return profileSweep(curve, rectProfile(thickness / 2, thickness / 2), { caps: true });
}

function makeStations(params: SuspensionBridgeParams): Vec3[] {
  if (params.controlPoints && params.controlPoints.length >= 2) {
    const curve = polyline(params.controlPoints.map((point) => vec3(point.x, point.y, point.z)));
    return resampleCurve(curve, { count: params.towerCount }).points.slice();
  }
  const rng = makeRng(params.seed);
  const stations: Vec3[] = [];
  for (let index = 0; index < params.towerCount; index++) {
    const t = index / (params.towerCount - 1);
    const endpoint = index === 0 || index === params.towerCount - 1;
    const jitter = endpoint ? 0 : rng.range(-params.towerJitter, params.towerJitter);
    stations.push(vec3(
      (t - 0.5) * params.spanLength,
      -Math.sin(Math.PI * t) * params.valleyDepth + jitter,
      Math.sin(Math.PI * 2 * t) * params.pathBend,
    ));
  }
  return stations;
}

function makeDeckCurve(stations: readonly Vec3[], sag: number, segmentsPerSpan: number): Curve {
  const points: Vec3[] = [];
  for (let index = 0; index < stations.length - 1; index++) {
    const span = catenaryCurve(stations[index]!, stations[index + 1]!, { segments: segmentsPerSpan, sag });
    points.push(...span.points.slice(index === 0 ? 0 : 1));
  }
  return polyline(points);
}

function makeTowerLocal(params: SuspensionBridgeParams): { frame: Mesh; roof: Mesh } {
  const halfWidth = params.bridgeWidth / 2 + 0.28;
  const post = Math.max(0.18, params.bridgeWidth * 0.075);
  const roofLength = params.bridgeWidth * 0.72;
  const roofHalfWidth = halfWidth + 0.65;
  const roofRise = Math.max(0.55, params.bridgeWidth * 0.24);
  const roofSlope = Math.hypot(roofHalfWidth, roofRise);
  const roofPitch = Math.atan2(roofRise, roofHalfWidth);
  const braceReach = Math.min(2.1, params.spanLength / (params.towerCount - 1) * 0.16);
  const frameMeshes: Mesh[] = [];

  for (const side of [-1, 1] as const) {
    const sideZ = side * halfWidth;
    frameMeshes.push(transform(box(post, params.towerHeight + 0.45, post), {
      translate: vec3(0, params.towerHeight / 2 - 0.18, sideZ),
    }));
    frameMeshes.push(transform(box(roofLength, post, post), {
      translate: vec3(0, params.towerHeight - post * 0.25, sideZ),
    }));
    frameMeshes.push(beamBetween(
      vec3(-braceReach, -0.18, sideZ),
      vec3(0, params.towerHeight * 0.68, sideZ),
      post * 0.72,
    ));
    frameMeshes.push(beamBetween(
      vec3(braceReach, -0.18, sideZ),
      vec3(0, params.towerHeight * 0.68, sideZ),
      post * 0.72,
    ));
  }

  frameMeshes.push(transform(box(post, post * 1.15, params.bridgeWidth + 1.5), {
    translate: vec3(0, params.towerHeight, 0),
  }));

  const roofMeshes: Mesh[] = [];
  for (const side of [-1, 1] as const) {
    roofMeshes.push(transform(box(roofLength + 0.55, 0.16, roofSlope), {
      rotate: vec3(side * roofPitch, 0, 0),
      translate: vec3(0, params.towerHeight + roofRise / 2 + 0.16, side * roofHalfWidth / 2),
    }));
  }

  return {
    frame: computeNormals(merge(...frameMeshes), 35),
    roof: computeNormals(merge(...roofMeshes), 35),
  };
}

function namedPart(
  name: string,
  label: string,
  mesh: Mesh,
  color: [number, number, number],
  surfaceType: string,
  seed: number,
): NamedPart {
  return {
    name,
    label,
    mesh: computeNormals(mesh, 38),
    color,
    surface: { type: surfaceType, params: { color, roughness: 0.86, seed } },
    metadata: { source: "BV1xJcuzsEow", procedural: true },
  };
}

export function buildSuspensionBridgeParts(
  input: Partial<SuspensionBridgeParams> = {},
): NamedPart[] {
  const params = resolveSuspensionBridgeParams(input);
  const stations = makeStations(params);
  const stationSpan = params.spanLength / (params.towerCount - 1);
  const segmentsPerSpan = Math.max(10, Math.round(stationSpan / params.plankSpacing) + 1);
  const deckCurve = makeDeckCurve(stations, params.deckSag, segmentsPerSpan);
  const deckHalfWidth = params.bridgeWidth / 2;
  const cableOffset = deckHalfWidth + 0.3;
  const ropeThickness = Math.max(0.045, params.bridgeWidth * 0.018);
  const deckMeshes: Mesh[] = [];
  const frameMeshes: Mesh[] = [];
  const roofMeshes: Mesh[] = [];
  const mainCableMeshes: Mesh[] = [];
  const handrailMeshes: Mesh[] = [];
  const hangerMeshes: Mesh[] = [];
  const anchorMeshes: Mesh[] = [];

  const plankDepth = params.plankSpacing * 0.76;
  const plank = box(params.bridgeWidth, 0.16, plankDepth);
  deckMeshes.push(layoutPiecesOnCurve(deckCurve, {
    count: Math.max(2, Math.floor(curveLength(deckCurve) / params.plankSpacing)),
    pieces: [plank],
    pieceLengths: [plankDepth],
    rigid: true,
  }));

  for (const side of [-1, 1] as const) {
    deckMeshes.push(cableMesh(offsetCurve(deckCurve, side * deckHalfWidth), 0.13));
  }

  const towerLocal = makeTowerLocal(params);
  for (let index = 0; index < stations.length; index++) {
    const station = stations[index]!;
    const heading = stationHeading(stations, index);
    frameMeshes.push(transform(towerLocal.frame, { rotate: vec3(0, -heading, 0), translate: station }));
    roofMeshes.push(transform(towerLocal.roof, { rotate: vec3(0, -heading, 0), translate: station }));
  }

  for (let spanIndex = 0; spanIndex < stations.length - 1; spanIndex++) {
    const start = stations[spanIndex]!;
    const end = stations[spanIndex + 1]!;
    const startHeading = stationHeading(stations, spanIndex);
    const endHeading = stationHeading(stations, spanIndex + 1);
    const hangerCount = Math.max(4, Math.round(stationSpan / params.hangerSpacing));
    const deckSpan = catenaryCurve(start, end, { segments: hangerCount + 1, sag: params.deckSag });

    for (const side of [-1, 1] as const) {
      const mainStart = offsetPoint(start, startHeading, side * cableOffset, start.y + params.towerHeight * 0.82);
      const mainEnd = offsetPoint(end, endHeading, side * cableOffset, end.y + params.towerHeight * 0.82);
      const mainCable = catenaryCurve(mainStart, mainEnd, { segments: hangerCount + 1, sag: params.cableSag });
      mainCableMeshes.push(cableMesh(mainCable, ropeThickness * 1.35));

      const handrailStart = offsetPoint(start, startHeading, side * cableOffset, start.y + 1.15);
      const handrailEnd = offsetPoint(end, endHeading, side * cableOffset, end.y + 1.15);
      handrailMeshes.push(cableMesh(catenaryCurve(handrailStart, handrailEnd, {
        segments: hangerCount + 1,
        sag: params.deckSag * 0.55,
      }), ropeThickness));

      for (let hangerIndex = 1; hangerIndex < hangerCount; hangerIndex++) {
        const deckPoint = deckSpan.points[hangerIndex]!;
        const t = hangerIndex / hangerCount;
        const heading = startHeading + (endHeading - startHeading) * t;
        const bottom = offsetPoint(deckPoint, heading, side * cableOffset, deckPoint.y + 0.15);
        const top = mainCable.points[hangerIndex]!;
        if (top.y > bottom.y + 0.18) hangerMeshes.push(beamBetween(bottom, top, ropeThickness * 0.62));
      }
    }
  }

  for (const endpointIndex of [0, stations.length - 1]) {
    const station = stations[endpointIndex]!;
    const heading = stationHeading(stations, endpointIndex);
    const outward = endpointIndex === 0 ? -1 : 1;
    for (const side of [-1, 1] as const) {
      const towerTop = offsetPoint(station, heading, side * cableOffset, station.y + params.towerHeight * 0.82);
      const anchorCenter = vec3(
        station.x + Math.cos(heading) * outward * Math.min(7, stationSpan * 0.42),
        station.y - 1.35,
        station.z + Math.sin(heading) * outward * Math.min(7, stationSpan * 0.42),
      );
      const anchor = offsetPoint(anchorCenter, heading, side * cableOffset, anchorCenter.y);
      anchorMeshes.push(cableMesh(catenaryCurve(towerTop, anchor, { segments: 12, sag: 0.035 }), ropeThickness * 1.35));
      anchorMeshes.push(transform(box(0.65, 0.5, 0.65), { translate: anchor }));
    }
  }

  return [
    namedPart("deck_planks", "桥面木板", merge(...deckMeshes), DECK_COLOR, "wood", params.seed),
    namedPart("tower_frames", "门式桥塔", merge(...frameMeshes), FRAME_COLOR, "wood", params.seed + 1),
    namedPart("tower_roofs", "桥塔坡屋顶", merge(...roofMeshes), ROOF_COLOR, "wood", params.seed + 2),
    namedPart("main_cables", "主悬索", merge(...mainCableMeshes), ROPE_COLOR, "fabric", params.seed + 3),
    namedPart("handrail_cables", "扶手索", merge(...handrailMeshes), ROPE_COLOR, "fabric", params.seed + 4),
    namedPart("vertical_hangers", "垂吊索", merge(...hangerMeshes), ROPE_COLOR, "fabric", params.seed + 5),
    namedPart("anchor_cables", "端部锚索", merge(...anchorMeshes), FRAME_COLOR, "wood", params.seed + 6),
  ];
}
