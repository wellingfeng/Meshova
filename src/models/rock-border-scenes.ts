import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  buildRockBorder,
  makeMesh,
  plane,
  polyline,
  resampleCurve,
  smoothCurve,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
  type RockBorderStyle,
} from "../geometry/index.js";

export type RockBorderScenePreset = "river-gorge" | "crater-lake" | "mesa-rim";

export interface RockBorderSceneOptions {
  preset?: RockBorderScenePreset;
  seed?: number;
  spacing?: number;
  borderHeight?: number;
  tiers?: number;
  roughness?: number;
  style?: RockBorderStyle;
}

interface ResolvedOptions {
  preset: RockBorderScenePreset;
  seed: number;
  spacing: number;
  borderHeight: number;
  tiers: number;
  roughness: number;
  style: RockBorderStyle;
}

const ROCK_COLOR: [number, number, number] = [0.34, 0.31, 0.28];
const GROUND_COLOR: [number, number, number] = [0.25, 0.29, 0.2];
const WATER_COLOR: [number, number, number] = [0.055, 0.3, 0.36];

export function buildRockBorderSceneParts(options: RockBorderSceneOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  if (resolved.preset === "crater-lake") return buildCraterLake(resolved);
  if (resolved.preset === "mesa-rim") return buildMesaRim(resolved);
  return buildRiverGorge(resolved);
}

function buildRiverGorge(options: ResolvedOptions): NamedPart[] {
  const controls: Vec3[] = [];
  for (let index = 0; index < 12; index++) {
    const t = index / 11;
    controls.push(vec3(
      Math.sin(t * Math.PI * 1.8 + options.seed * 0.17) * 1.5
        + Math.sin(t * Math.PI * 4.2) * 0.28,
      1.35 + Math.cos(t * Math.PI) * 0.25,
      -9 + t * 18,
    ));
  }
  const center = resampleCurve(smoothCurve(polyline(controls), 5), { count: 58 });
  const leftBank = offsetCurve(center, 1.65, 0);
  const rightBank = offsetCurve(center, -1.65, 0);
  const leftGround = offsetCurve(leftBank, 2.35, 0.08);
  const rightGround = offsetCurve(rightBank, -2.35, 0.08);
  const waterLeft = offsetCurve(center, 1.38, -1.18);
  const waterRight = offsetCurve(center, -1.38, -1.18);
  const leftBorder = buildRockBorder(leftBank, {
    seed: options.seed,
    spacing: options.spacing,
    height: options.borderHeight,
    depth: 0.78,
    tiers: options.tiers,
    side: "right",
    style: options.style,
    roughness: options.roughness,
    overlap: 0.38,
    jitter: 0.28,
    anchor: "top",
  });
  const rightBorder = buildRockBorder(rightBank, {
    seed: options.seed + 1009,
    spacing: options.spacing,
    height: options.borderHeight,
    depth: 0.78,
    tiers: options.tiers,
    side: "left",
    style: options.style,
    roughness: options.roughness,
    overlap: 0.38,
    jitter: 0.28,
    anchor: "top",
  });

  return [
    groundPart("river_gorge_banks", "河谷高岸", mergeMeshes(
      stripBetween(leftBank, leftGround),
      stripBetween(rightGround, rightBank),
    ), options.seed),
    rockPart("river_gorge_border", "河谷岩石包边", mergeMeshes(leftBorder.mesh, rightBorder.mesh), {
      preset: options.preset,
      placementCount: leftBorder.placements.length + rightBorder.placements.length,
      technique: "sealed-cliff-backing-staggered-multi-archetype-modules",
    }),
    waterPart("river_gorge_water", "河谷水体", stripBetween(waterLeft, waterRight), options.seed),
  ];
}

function buildCraterLake(options: ResolvedOptions): NamedPart[] {
  const rim = organicLoop(5.4, 4.2, 1.45, 64, options.seed);
  const outer = offsetCurve(rim, -4.2, 0.08);
  const waterLoop = scaleLoop(rim, 0.78, -1.25);
  const border = buildRockBorder(rim, {
    seed: options.seed,
    spacing: options.spacing,
    height: options.borderHeight * 1.08,
    depth: 0.86,
    tiers: options.tiers,
    side: "left",
    style: options.style,
    roughness: options.roughness,
    overlap: 0.42,
    jitter: 0.3,
    anchor: "top",
  });
  return [
    groundPart("crater_lake_ground", "火山湖外岸", stripBetween(rim, outer), options.seed),
    rockPart("crater_lake_border", "火山湖岩石包边", border.mesh, {
      preset: options.preset,
      placementCount: border.placements.length,
      technique: "sealed-closed-boundary-inward-staggered-tiering",
    }),
    waterPart("crater_lake_water", "火山湖水面", fillLoop(waterLoop), options.seed),
  ];
}

function buildMesaRim(options: ResolvedOptions): NamedPart[] {
  const top = organicLoop(5.2, 3.8, 2.6, 60, options.seed + 7);
  const border = buildRockBorder(top, {
    seed: options.seed,
    spacing: options.spacing,
    height: options.borderHeight * 1.15,
    depth: 0.9,
    tiers: options.tiers + 1,
    side: "right",
    style: options.style === "boulder" ? "cliff" : options.style,
    roughness: options.roughness,
    overlap: 0.44,
    jitter: 0.26,
    anchor: "top",
  });
  return [
    {
      ...groundPart("mesa_ground", "台地基底", transform(plane(20, 18, 1, 1), {
        translate: vec3(0, -2.1, 0),
      }), options.seed),
      color: [0.2, 0.22, 0.16],
    },
    groundPart("mesa_top", "台地顶面", fillLoop(top), options.seed + 1),
    rockPart("mesa_rock_border", "台地悬崖包边", border.mesh, {
      preset: options.preset,
      placementCount: border.placements.length,
      technique: "sealed-closed-boundary-outward-staggered-tiering",
    }),
  ];
}

function resolveOptions(options: RockBorderSceneOptions): ResolvedOptions {
  return {
    preset: options.preset ?? "river-gorge",
    seed: Math.round(options.seed ?? 31) >>> 0,
    spacing: Math.max(0.35, options.spacing ?? 0.92),
    borderHeight: Math.max(0.4, options.borderHeight ?? 1.65),
    tiers: Math.max(1, Math.min(6, Math.round(options.tiers ?? 2))),
    roughness: Math.max(0, Math.min(0.6, options.roughness ?? 0.2)),
    style: options.style ?? "cliff",
  };
}

function organicLoop(radiusX: number, radiusZ: number, y: number, segments: number, seed: number): Curve {
  const rng = makeRng(seed);
  const phaseA = rng.range(0, Math.PI * 2);
  const phaseB = rng.range(0, Math.PI * 2);
  const points: Vec3[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const radius = 1
      + Math.sin(angle * 3 + phaseA) * 0.08
      + Math.sin(angle * 7 + phaseB) * 0.035;
    points.push(vec3(
      Math.cos(angle) * radiusX * radius,
      y + Math.sin(angle * 2 + phaseB) * 0.12,
      Math.sin(angle) * radiusZ * radius,
    ));
  }
  return polyline(points, true);
}

function offsetCurve(curve: Curve, distance: number, yOffset: number): Curve {
  const points = curve.points.map((point, index) => {
    const tangent = curveTangent(curve, index);
    return vec3(point.x - tangent.z * distance, point.y + yOffset, point.z + tangent.x * distance);
  });
  return polyline(points, curve.closed);
}

function scaleLoop(curve: Curve, scale: number, yOffset: number): Curve {
  const center = curveCenter(curve);
  return polyline(curve.points.map((point) => vec3(
    center.x + (point.x - center.x) * scale,
    point.y + yOffset,
    center.z + (point.z - center.z) * scale,
  )), true);
}

function stripBetween(first: Curve, second: Curve): Mesh {
  const count = Math.min(first.points.length, second.points.length);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let index = 0; index < count; index++) {
    positions.push(first.points[index]!, second.points[index]!);
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    const v = index / Math.max(1, count - (first.closed ? 0 : 1));
    uvs.push(vec2(0, v), vec2(1, v));
  }
  const spans = first.closed && second.closed ? count : count - 1;
  for (let index = 0; index < spans; index++) {
    const next = (index + 1) % count;
    const a = index * 2;
    const b = next * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function fillLoop(loop: Curve): Mesh {
  const center = curveCenter(loop);
  const positions = [center, ...loop.points];
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = positions.map((point) => vec2(point.x * 0.05 + 0.5, point.z * 0.05 + 0.5));
  const indices: number[] = [];
  for (let index = 0; index < loop.points.length; index++) {
    indices.push(0, ((index + 1) % loop.points.length) + 1, index + 1);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function curveCenter(curve: Curve): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of curve.points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const divisor = Math.max(1, curve.points.length);
  return vec3(x / divisor, y / divisor, z / divisor);
}

function curveTangent(curve: Curve, index: number): Vec3 {
  const count = curve.points.length;
  const previous = curve.closed
    ? curve.points[(index - 1 + count) % count]!
    : curve.points[Math.max(0, index - 1)]!;
  const next = curve.closed
    ? curve.points[(index + 1) % count]!
    : curve.points[Math.min(count - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return vec3(dx / length, 0, dz / length);
}

function groundPart(name: string, label: string, mesh: Mesh, seed: number): NamedPart {
  return {
    name,
    label,
    mesh,
    color: GROUND_COLOR,
    surface: { type: "soil", params: { color: GROUND_COLOR, roughness: 0.98, scale: 2.4, seed } },
    doubleSided: true,
  };
}

function rockPart(name: string, label: string, mesh: Mesh, metadata: Record<string, unknown>): NamedPart {
  return {
    name,
    label,
    mesh,
    color: ROCK_COLOR,
    surface: { type: "stone", params: { color: ROCK_COLOR, roughness: 0.94, scale: 1.8 } },
    doubleSided: true,
    metadata: { source: "BV12H4y1578d", ...metadata },
  };
}

function waterPart(name: string, label: string, mesh: Mesh, seed: number): NamedPart {
  return {
    name,
    label,
    mesh,
    color: WATER_COLOR,
    surface: {
      type: "water",
      params: { body: "river", tint: WATER_COLOR, roughness: 0.1, waveAmplitude: 0.018, seed },
    },
    doubleSided: true,
  };
}

function mergeMeshes(...meshes: Mesh[]): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  let offset = 0;
  for (const mesh of meshes) {
    positions.push(...mesh.positions);
    normals.push(...mesh.normals);
    uvs.push(...mesh.uvs);
    indices.push(...mesh.indices.map((index) => index + offset));
    offset += mesh.positions.length;
  }
  return makeMesh({ positions, normals, uvs, indices });
}
