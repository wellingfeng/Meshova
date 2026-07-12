import {
  drapeCurveToHeightfield,
  fbmHeightfield,
  heightfieldToMesh,
  makePointCloud,
  pathfind,
  polyline,
  ruleNormalToDensity,
  sampleHeight,
  smoothCurve,
  sphere,
  stampHeightfield,
  sweep,
  translateMesh,
  type Curve,
  type Heightfield,
  type NamedPart,
  type PathfindResult,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

export interface PcgPathfindingParams {
  size: number;
  resolution: number;
  terrainRelief: number;
  mountainHeight: number;
  slopePreferenceDeg: number;
  slopeLimitDeg: number;
  pathSmoothness: number;
  pathLift: number;
  pathRadius: number;
  seed: number;
}

export interface PcgPathfindingModel {
  readonly parts: NamedPart[];
  readonly terrain: Heightfield;
  readonly route: PathfindResult;
  readonly displayCurve: Curve;
}

export const PCG_PATHFINDING_DEFAULTS: PcgPathfindingParams = {
  size: 120,
  resolution: 65,
  terrainRelief: 18,
  mountainHeight: 22,
  slopePreferenceDeg: 12,
  slopeLimitDeg: 38,
  pathSmoothness: 3,
  pathLift: 0.55,
  pathRadius: 0.55,
  seed: 19,
};

export function buildPcgPathfinding(
  params: Partial<PcgPathfindingParams> = {},
): PcgPathfindingModel {
  const p = { ...PCG_PATHFINDING_DEFAULTS, ...params };
  const size = Math.max(24, p.size);
  const resolution = Math.max(17, Math.min(129, Math.round(p.resolution)));
  const terrainRelief = Math.max(0, p.terrainRelief);
  const mountainHeight = Math.max(0, p.mountainHeight);
  const terrain = stampHeightfield(
    fbmHeightfield({
      cols: resolution,
      rows: resolution,
      size,
      amplitude: terrainRelief,
      featureScale: size * 0.32,
      octaves: 5,
      ridged: 0.7,
      seed: Math.round(p.seed),
    }),
    [
      { x: 0, z: 0, radius: size * 0.25, height: mountainHeight, shape: "dome" },
      { x: size * 0.15, z: -size * 0.125, radius: size / 6, height: mountainHeight * 0.55, shape: "cone" },
    ],
  );

  const terrainMesh = heightfieldToMesh(terrain);
  const startAngle = clamp(p.slopePreferenceDeg, 0, 75);
  const endAngle = clamp(Math.max(startAngle + 1, p.slopeLimitDeg), 1, 85);
  const surface = ruleNormalToDensity({
    startAngle: degreesToRadians(startAngle),
    endAngle: degreesToRadians(endAngle),
  })(makePointCloud({
    points: terrainMesh.positions,
    normals: terrainMesh.normals,
  }));

  const start = vec3(-size * 0.433, sampleHeight(terrain, -size * 0.433, -size / 3), -size / 3);
  const goal = vec3(size * 0.433, sampleHeight(terrain, size * 0.433, size / 3), size / 3);
  const cellSize = size / (resolution - 1);
  const route = pathfind(surface, start, goal, {
    searchDistance: cellSize * 1.55,
    costMode: "fitness",
    costAttribute: "density",
    fitnessFloor: 0.02,
    fitnessExponent: 2,
    hardRejectBelow: 0.015,
    heuristicWeight: 1,
    acceptPartialPath: true,
  });

  const smoothness = Math.max(1, Math.min(8, Math.round(p.pathSmoothness)));
  const smoothed = smoothCurve(polyline(route.curve.points), smoothness);
  const displayCurve = drapeCurveToHeightfield(terrain, smoothed, Math.max(0, p.pathLift));
  const marker = sphere(Math.max(0.5, p.pathRadius * 2.5), 16, 10);
  const parts: NamedPart[] = [
    {
      name: "terrain",
      label: "地形",
      mesh: terrainMesh,
      color: [0.32, 0.38, 0.31],
      surface: { type: "mossyStone", params: { seed: Math.round(p.seed) } },
    },
    {
      name: "preferred-path",
      label: "坡度偏好路径",
      mesh: sweep(displayCurve, { radius: Math.max(0.08, p.pathRadius), sides: 8 }),
      color: [1, 0.28, 0.04],
      surface: { type: "plastic", params: { color: [1, 0.28, 0.04], roughness: 0.38 } },
    },
    {
      name: "start",
      label: "起点",
      mesh: translateMesh(marker, vec3(start.x, start.y + Math.max(0, p.pathLift), start.z)),
      color: [0.1, 0.9, 0.35],
    },
    {
      name: "goal",
      label: "终点",
      mesh: translateMesh(marker, vec3(goal.x, goal.y + Math.max(0, p.pathLift), goal.z)),
      color: [0.2, 0.55, 1],
    },
  ];

  return { parts, terrain, route, displayCurve };
}

export function buildPcgPathfindingParts(
  params: Partial<PcgPathfindingParams> = {},
): NamedPart[] {
  return buildPcgPathfinding(params).parts;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
