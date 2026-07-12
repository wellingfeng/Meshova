import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cone,
  merge,
  polyline,
  roadRibbon,
  rock,
  smoothCurve,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];
type PointXZ = readonly [number, number];

export interface WatabouCityParams {
  size: number;
  riverWidth: number;
  roadDensity: number;
  fieldDensity: number;
  treeDensity: number;
  rockDensity: number;
  buildingDensity: number;
  seed: number;
}

export interface WatabouCitySummary {
  readonly roadCount: number;
  readonly fieldCount: number;
  readonly treeCount: number;
  readonly rockCount: number;
  readonly buildingCount: number;
}

export interface WatabouCity {
  readonly parts: NamedPart[];
  readonly summary: WatabouCitySummary;
}

export const WATABOU_CITY_DEFAULTS: WatabouCityParams = {
  size: 200,
  riverWidth: 18,
  roadDensity: 1,
  fieldDensity: 1,
  treeDensity: 1,
  rockDensity: 0.7,
  buildingDensity: 1,
  seed: 178,
};

const SOURCE_URL = "https://www.youtube.com/watch?v=0OgMqgpCsPo";
const GROUND: RGB = [0.18, 0.23, 0.13];
const FIELD_COLORS: readonly RGB[] = [
  [0.18, 0.19, 0.09],
  [0.24, 0.22, 0.09],
  [0.16, 0.2, 0.1],
];
const CROP: RGB = [0.58, 0.46, 0.18];
const ROAD: RGB = [0.3, 0.22, 0.15];
const ROUNDABOUT: RGB = [0.92, 0.08, 0.14];
const RIVER_BANK: RGB = [0.24, 0.34, 0.17];
const RIVER_WATER: RGB = [0.025, 0.16, 0.21];
const BUILDING_COLORS: readonly RGB[] = [
  [0.32, 0.11, 0.075],
  [0.42, 0.16, 0.08],
  [0.25, 0.09, 0.08],
];
const TREE_COLORS: readonly RGB[] = [
  [0.13, 0.34, 0.09],
  [0.2, 0.43, 0.12],
  [0.3, 0.5, 0.16],
];
const TRUNK: RGB = [0.23, 0.13, 0.07];
const ROCK_COLORS: readonly RGB[] = [
  [0.34, 0.36, 0.31],
  [0.42, 0.4, 0.33],
  [0.28, 0.31, 0.27],
];

interface FieldPlot {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly yaw: number;
}

interface TreeCluster {
  readonly x: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly count: number;
}

interface BuildingZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly count: number;
}

interface PlacedFootprint {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  yaw: number;
}

const RIVER_POINTS: readonly PointXZ[] = [
  [-116, -8], [-99, -28], [-80, -35], [-60, -28], [-45, -4], [-26, 9],
  [-5, 8], [18, -7], [43, -3], [65, -19], [83, -36], [112, -38],
];

const ROAD_PATHS: readonly (readonly PointXZ[])[] = [
  [[-108, 17], [-83, 21], [-58, 32], [-31, 31], [-8, 25], [20, 25], [51, 21], [82, 10], [108, -2]],
  [[-102, 42], [-76, 49], [-50, 55], [-23, 51], [4, 43], [33, 45], [62, 39], [92, 25]],
  [[-97, 66], [-70, 69], [-45, 72], [-15, 67], [12, 62], [41, 65], [70, 55], [99, 42]],
  [[-77, 72], [-70, 53], [-65, 33], [-56, 13]],
  [[-47, 76], [-43, 56], [-38, 38], [-31, 20], [-25, 10]],
  [[-14, 72], [-13, 55], [-10, 39], [-7, 25], [-5, 10]],
  [[18, 70], [17, 53], [18, 39], [20, 25], [16, 8]],
  [[50, 64], [46, 49], [45, 35], [51, 21], [55, 3]],
  [[80, 52], [73, 38], [70, 24], [82, 10], [92, -8]],
  [[-105, -53], [-83, -52], [-61, -46], [-41, -35]],
  [[-55, -62], [-34, -56], [-13, -45], [8, -34], [33, -31], [58, -38], [84, -52], [106, -59]],
  [[-28, -78], [-7, -67], [13, -54], [33, -31]],
  [[13, -80], [26, -61], [41, -47], [58, -38]],
  [[48, -76], [59, -59], [72, -48], [84, -52]],
  [[74, -74], [84, -61], [95, -49], [108, -42]],
  [[-94, 2], [-75, 8], [-56, 13], [-41, 20], [-31, 31]],
  [[-83, 21], [-69, 8], [-60, -8], [-58, -21]],
  [[92, 25], [88, 11], [90, -5], [98, -22], [108, -42]],
];

const FIELD_PLOTS: readonly FieldPlot[] = [
  { x: -91, z: 59, width: 31, depth: 15, yaw: -0.28 },
  { x: -60, z: 66, width: 27, depth: 16, yaw: 0.08 },
  { x: -29, z: 69, width: 27, depth: 15, yaw: -0.04 },
  { x: 3, z: 69, width: 27, depth: 15, yaw: 0.1 },
  { x: 35, z: 67, width: 25, depth: 15, yaw: 0.22 },
  { x: 66, z: 60, width: 28, depth: 16, yaw: 0.35 },
  { x: 91, z: 43, width: 24, depth: 16, yaw: 0.62 },
  { x: -102, z: 32, width: 25, depth: 15, yaw: -0.55 },
  { x: -91, z: -57, width: 29, depth: 19, yaw: 0.15 },
  { x: -61, z: -66, width: 28, depth: 20, yaw: -0.2 },
  { x: -28, z: -70, width: 29, depth: 18, yaw: -0.32 },
  { x: 7, z: -73, width: 30, depth: 18, yaw: 0.08 },
  { x: 39, z: -72, width: 26, depth: 17, yaw: 0.28 },
  { x: 69, z: -67, width: 27, depth: 17, yaw: 0.45 },
  { x: 96, z: -61, width: 24, depth: 16, yaw: 0.18 },
  { x: 101, z: 13, width: 20, depth: 17, yaw: 0.82 },
];

const TREE_CLUSTERS: readonly TreeCluster[] = [
  { x: -94, z: -68, radiusX: 27, radiusZ: 19, count: 190 },
  { x: -91, z: -4, radiusX: 17, radiusZ: 13, count: 75 },
  { x: -78, z: 43, radiusX: 16, radiusZ: 9, count: 62 },
  { x: -48, z: 48, radiusX: 12, radiusZ: 9, count: 46 },
  { x: -22, z: 34, radiusX: 10, radiusZ: 8, count: 38 },
  { x: 17, z: 42, radiusX: 11, radiusZ: 9, count: 48 },
  { x: 50, z: 31, radiusX: 13, radiusZ: 10, count: 60 },
  { x: 82, z: 59, radiusX: 15, radiusZ: 18, count: 94 },
  { x: 101, z: 18, radiusX: 12, radiusZ: 18, count: 74 },
  { x: 103, z: -66, radiusX: 25, radiusZ: 13, count: 100 },
  { x: 57, z: -47, radiusX: 13, radiusZ: 9, count: 52 },
  { x: 13, z: -49, radiusX: 12, radiusZ: 9, count: 46 },
  { x: -29, z: -45, radiusX: 12, radiusZ: 10, count: 48 },
  { x: -58, z: -32, radiusX: 11, radiusZ: 9, count: 42 },
];

const BUILDING_ZONES: readonly BuildingZone[] = [
  { minX: -77, maxX: -45, minZ: 6, maxZ: 28, count: 38 },
  { minX: -43, maxX: -10, minZ: 12, maxZ: 40, count: 54 },
  { minX: -7, maxX: 30, minZ: 13, maxZ: 38, count: 58 },
  { minX: 32, maxX: 68, minZ: 8, maxZ: 33, count: 46 },
  { minX: -4, maxX: 32, minZ: -57, maxZ: -25, count: 38 },
  { minX: 36, maxX: 77, minZ: -56, maxZ: -25, count: 44 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function surface(type: string, color: RGB, roughness: number): PartSurfaceRef {
  return { type, params: { color, roughness } };
}

function footprintsOverlap(a: PlacedFootprint, b: PlacedFootprint, gap: number): boolean {
  const axes = [
    { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) },
    { x: Math.sin(a.yaw), z: Math.cos(a.yaw) },
    { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) },
    { x: Math.sin(b.yaw), z: Math.cos(b.yaw) },
  ];
  const deltaX = b.x - a.x;
  const deltaZ = b.z - a.z;
  const radiusOn = (footprint: PlacedFootprint, axis: { x: number; z: number }) => {
    const xAxis = { x: Math.cos(footprint.yaw), z: -Math.sin(footprint.yaw) };
    const zAxis = { x: Math.sin(footprint.yaw), z: Math.cos(footprint.yaw) };
    return footprint.halfWidth * Math.abs(axis.x * xAxis.x + axis.z * xAxis.z) +
      footprint.halfDepth * Math.abs(axis.x * zAxis.x + axis.z * zAxis.z);
  };
  return axes.every((axis) => {
    const distance = Math.abs(deltaX * axis.x + deltaZ * axis.z);
    return distance < radiusOn(a, axis) + radiusOn(b, axis) + gap;
  });
}

function scaledPoints(points: readonly PointXZ[], scale: number, y: number): Vec3[] {
  return points.map(([x, z]) => vec3(x * scale, y, z * scale));
}

function pathRibbon(
  points: readonly PointXZ[],
  scale: number,
  y: number,
  halfWidth: number,
  closed = false,
): Mesh {
  const curve = smoothCurve(polyline(scaledPoints(points, scale, y), closed), 5);
  const path = closed && curve.points.length
    ? polyline([...curve.points, { ...curve.points[0]! }], false)
    : curve;
  return roadRibbon(path, {
    halfWidth: halfWidth * scale,
    sampleDistance: Math.max(0.45, 1.2 * scale),
    widthSubdivisions: 1,
    adaptiveCurvature: true,
    verticalOffset: 0,
  });
}

function addFields(parts: NamedPart[], p: WatabouCityParams, scale: number): number {
  const count = Math.min(FIELD_PLOTS.length, Math.max(0, Math.round(FIELD_PLOTS.length * clamp(p.fieldDensity, 0, 1.5))));
  const platesByColor: Mesh[][] = FIELD_COLORS.map(() => []);
  const rows: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const plot = FIELD_PLOTS[index]!;
    const colorIndex = index % FIELD_COLORS.length;
    const plotInset = 0.86;
    platesByColor[colorIndex]!.push(transform(box(plot.width * plotInset * scale, 0.08 * scale, plot.depth * plotInset * scale), {
      rotate: vec3(0, plot.yaw, 0),
      translate: vec3(plot.x * scale, 0, plot.z * scale),
    }));
    const rowCount = Math.max(4, Math.round(plot.depth * 0.7 * clamp(p.fieldDensity, 0.25, 1.5)));
    for (let row = 0; row < rowCount; row++) {
      const localZ = -plot.depth * 0.42 + (plot.depth * 0.84 * (row + 0.5)) / rowCount;
      rows.push(transform(box(plot.width * 0.78 * scale, 0.035 * scale, 0.11 * scale), {
        rotate: vec3(0, plot.yaw, 0),
        translate: vec3(
          (plot.x + Math.sin(plot.yaw) * localZ) * scale,
          0.075 * scale,
          (plot.z + Math.cos(plot.yaw) * localZ) * scale,
        ),
      }));
    }
  }
  for (let index = 0; index < platesByColor.length; index++) {
    const meshes = platesByColor[index]!;
    if (!meshes.length) continue;
    const color = FIELD_COLORS[index]!;
    parts.push({
      name: `field_plots_${index + 1}`,
      label: `农田地块${index + 1}`,
      mesh: merge(...meshes),
      color,
      surface: surface("mossyStone", color, 0.96),
    });
  }
  if (rows.length) {
    parts.push({
      name: "crop_rows",
      label: "作物行线",
      mesh: merge(...rows),
      color: CROP,
      surface: surface("plastic", CROP, 0.78),
    });
  }
  return count;
}

function splitCurveOutsideRiver(points: readonly Vec3[], river: readonly Vec3[], clearance: number): Vec3[][] {
  const segments: Vec3[][] = [];
  let current: Vec3[] = [];
  for (const point of points) {
    if (pointCurveDistance(point, river) >= clearance) {
      current.push(point);
    } else if (current.length > 1) {
      segments.push(current);
      current = [];
    } else {
      current = [];
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function addRoads(parts: NamedPart[], p: WatabouCityParams, scale: number, river: readonly Vec3[]): number {
  const count = Math.min(ROAD_PATHS.length, Math.max(4, Math.round(ROAD_PATHS.length * clamp(p.roadDensity, 0.2, 1.5))));
  const roads: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const halfWidth = index < 3 ? 0.52 : 0.34;
    const y = (0.11 + (index % 3) * 0.002) * scale;
    const curve = smoothCurve(polyline(scaledPoints(ROAD_PATHS[index]!, scale, y), false), 5);
    const clearance = (Math.max(6, p.riverWidth) * 0.5 + halfWidth + 0.65) * scale;
    for (const segment of splitCurveOutsideRiver(curve.points, river, clearance)) {
      roads.push(roadRibbon(polyline(segment, false), {
        halfWidth: halfWidth * scale,
        sampleDistance: Math.max(0.45, 1.2 * scale),
        widthSubdivisions: 1,
        adaptiveCurvature: true,
      }));
    }
  }
  parts.push({
    name: "road_network",
    label: "道路曲线网",
    mesh: merge(...roads),
    color: ROAD,
    surface: surface("dirtRoad", ROAD, 0.9),
    metadata: { riverClipped: true },
  });

  const circle: PointXZ[] = [];
  for (let index = 0; index < 40; index++) {
    const angle = (index / 40) * Math.PI * 2;
    circle.push([9 + Math.cos(angle) * 7, 18 + Math.sin(angle) * 7]);
  }
  const roundabout = pathRibbon(circle, scale, 0.135 * scale, 0.42, true);
  const islandTrunk = transform(box(0.36 * scale, 1.4 * scale, 0.36 * scale), {
    translate: vec3(9 * scale, 0.84 * scale, 18 * scale),
  });
  const island = transform(sphere(1, 7, 5), {
    scale: vec3(1.05 * scale, 1.35 * scale, 0.95 * scale),
    translate: vec3(9 * scale, 2.32 * scale, 18 * scale),
  });
  parts.push({
    name: "roundabout_ring",
    label: "红色环岛",
    mesh: roundabout,
    color: ROUNDABOUT,
    surface: surface("plastic", ROUNDABOUT, 0.55),
  });
  parts.push({
    name: "roundabout_tree_trunk",
    label: "环岛树干",
    mesh: islandTrunk,
    color: TRUNK,
    surface: surface("bark", TRUNK, 0.92),
  });
  parts.push({
    name: "roundabout_tree",
    label: "环岛树冠",
    mesh: island,
    color: TREE_COLORS[1]!,
    surface: surface("foliage", TREE_COLORS[1]!, 0.72),
  });
  return count;
}

function addRiver(parts: NamedPart[], p: WatabouCityParams, scale: number): Vec3[] {
  const riverWidth = Math.max(6, p.riverWidth);
  const centerline = smoothCurve(polyline(scaledPoints(RIVER_POINTS, scale, 0.16 * scale), false), 5).points;
  const inner = roadRibbon(polyline(centerline, false), {
    halfWidth: riverWidth * 0.5 * scale,
    sampleDistance: Math.max(0.45, 1.2 * scale),
    widthSubdivisions: 1,
  });
  parts.push({
    name: "river_water",
    label: "主河道",
    mesh: inner,
    color: RIVER_WATER,
    surface: {
      type: "water",
      params: {
        body: "river",
        tint: [0.04, 0.3, 0.43],
        deepColor: RIVER_WATER,
        roughness: 0.14,
        flowSpeed: 0.68,
        waveAmplitude: 0.014 * scale,
        seed: p.seed + 23,
      },
    },
  });
  const bankOffset = (riverWidth * 0.5 + 0.3) * scale;
  const banks = [-1, 1].map((side) => {
    const points = centerline.map((point, index) => {
      const previous = centerline[Math.max(0, index - 1)]!;
      const next = centerline[Math.min(centerline.length - 1, index + 1)]!;
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      return vec3(
        point.x - (dz / length) * bankOffset * side,
        0.21 * scale,
        point.z + (dx / length) * bankOffset * side,
      );
    });
    return roadRibbon(polyline(points, false), {
      halfWidth: 0.34 * scale,
      sampleDistance: Math.max(0.45, 1.2 * scale),
      widthSubdivisions: 1,
    });
  });
  parts.push({
    name: "river_bank_outline",
    label: "河岸植被带",
    mesh: merge(...banks),
    color: RIVER_BANK,
    surface: surface("mossyStone", RIVER_BANK, 0.92),
  });
  const bridgePaths: readonly (readonly PointXZ[])[] = [
    [[-45, 24], [-43, 10], [-41, -7], [-39, -24], [-36, -40]],
    [[54, 18], [58, 5], [61, -10], [64, -27], [69, -43]],
  ];
  parts.push({
    name: "river_bridges",
    label: "跨河桥",
    mesh: merge(...bridgePaths.map((points) => pathRibbon(points, scale, 0.23 * scale, 0.72))),
    color: ROAD,
    surface: surface("concrete", ROAD, 0.7),
  });
  return centerline;
}

function pointCurveDistance(point: Vec3, curve: readonly Vec3[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < curve.length - 1; index++) {
    const a = curve[index]!;
    const b = curve[index + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared, 0, 1);
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
  }
  return best;
}

function addBuildings(
  parts: NamedPart[],
  p: WatabouCityParams,
  scale: number,
  rng: Rng,
  river: readonly Vec3[],
): number {
  const byColor: Mesh[][] = BUILDING_COLORS.map(() => []);
  const occupied: PlacedFootprint[] = [];
  let placed = 0;
  for (const zone of BUILDING_ZONES) {
    const target = Math.max(0, Math.round(zone.count * clamp(p.buildingDensity, 0, 1.5)));
    let attempts = 0;
    let zonePlaced = 0;
    while (zonePlaced < target && attempts < target * 20) {
      attempts++;
      const x = rng.range(zone.minX, zone.maxX) * scale;
      const z = rng.range(zone.minZ, zone.maxZ) * scale;
      const point = vec3(x, 0, z);
      if (pointCurveDistance(point, river) < (p.riverWidth * 0.6 + 2) * scale) continue;
      const width = rng.range(1.4, 3.8) * scale;
      const depth = rng.range(1.2, 3.2) * scale;
      const height = rng.range(0.35, 1.3) * scale;
      const yaw = rng.range(-0.22, 0.22);
      const footprint: PlacedFootprint = {
        x,
        z,
        halfWidth: width * 0.5,
        halfDepth: depth * 0.5,
        yaw,
      };
      if (occupied.some((other) => footprintsOverlap(footprint, other, 0.16 * scale))) continue;
      const colorIndex = rng.int(0, BUILDING_COLORS.length - 1);
      byColor[colorIndex]!.push(transform(box(width, height, depth), {
        rotate: vec3(0, yaw, 0),
        translate: vec3(x, 0.12 * scale + height * 0.5, z),
      }));
      occupied.push(footprint);
      placed++;
      zonePlaced++;
    }
  }
  for (let index = 0; index < byColor.length; index++) {
    const meshes = byColor[index]!;
    if (!meshes.length) continue;
    const color = BUILDING_COLORS[index]!;
    parts.push({
      name: `building_footprints_${index + 1}`,
      label: `聚落建筑${index + 1}`,
      mesh: merge(...meshes),
      color,
      surface: surface("brick", color, 0.88),
    });
  }
  return byColor.reduce((sum, group) => sum + group.length, 0);
}

function addTrees(
  parts: NamedPart[],
  p: WatabouCityParams,
  scale: number,
  rng: Rng,
  river: readonly Vec3[],
): number {
  const crownSources = [sphere(1, 7, 5), sphere(1, 6, 4), cone(1, 2, 7, true)];
  const trunkSource = box(1, 1, 1);
  const crownsByColor: Mesh[][] = TREE_COLORS.map(() => []);
  const trunks: Mesh[] = [];
  let placed = 0;
  for (const cluster of TREE_CLUSTERS) {
    const count = Math.max(0, Math.round(cluster.count * clamp(p.treeDensity, 0, 1.5)));
    let clusterPlaced = 0;
    let attempts = 0;
    while (clusterPlaced < count && attempts < count * 4) {
      attempts++;
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next());
      const x = (cluster.x + Math.cos(angle) * cluster.radiusX * radius) * scale;
      const z = (cluster.z + Math.sin(angle) * cluster.radiusZ * radius) * scale;
      if (pointCurveDistance(vec3(x, 0, z), river) < (Math.max(6, p.riverWidth) * 0.62 + 1) * scale) continue;
      const size = rng.range(0.62, 1.12) * scale;
      const trunkHeight = size * rng.range(0.8, 1.25);
      const crownHeight = size * rng.range(1.25, 1.75);
      const crownWidth = size * rng.range(0.72, 1.05);
      const yaw = rng.range(-Math.PI, Math.PI);
      const shapeIndex = rng.next() < 0.16 ? 2 : rng.int(0, 1);
      trunks.push(transform(trunkSource, {
        scale: vec3(size * 0.2, trunkHeight, size * 0.2),
        rotate: vec3(0, yaw, 0),
        translate: vec3(x, 0.16 * scale + trunkHeight * 0.5, z),
      }));
      const colorIndex = rng.int(0, TREE_COLORS.length - 1);
      crownsByColor[colorIndex]!.push(transform(crownSources[shapeIndex]!, {
        scale: vec3(crownWidth, crownHeight, crownWidth * rng.range(0.82, 1.08)),
        rotate: vec3(rng.range(-0.08, 0.08), yaw, rng.range(-0.08, 0.08)),
        translate: vec3(
          x + rng.range(-0.12, 0.12) * size,
          0.16 * scale + trunkHeight + crownHeight * 0.58,
          z + rng.range(-0.12, 0.12) * size,
        ),
      }));
      if (shapeIndex !== 2 && rng.next() < 0.58) {
        const lobeSize = size * rng.range(0.42, 0.68);
        const lobeAngle = rng.range(0, Math.PI * 2);
        crownsByColor[colorIndex]!.push(transform(crownSources[1]!, {
          scale: vec3(lobeSize, lobeSize * rng.range(0.78, 1.15), lobeSize * rng.range(0.82, 1.08)),
          rotate: vec3(rng.range(-0.12, 0.12), yaw, rng.range(-0.12, 0.12)),
          translate: vec3(
            x + Math.cos(lobeAngle) * crownWidth * 0.58,
            0.16 * scale + trunkHeight + crownHeight * rng.range(0.48, 0.78),
            z + Math.sin(lobeAngle) * crownWidth * 0.58,
          ),
        }));
      }
      placed++;
      clusterPlaced++;
    }
  }
  if (trunks.length) {
    parts.push({
      name: "tree_trunks",
      label: "林地树干",
      mesh: merge(...trunks),
      color: TRUNK,
      surface: surface("bark", TRUNK, 0.94),
    });
  }
  for (let index = 0; index < crownsByColor.length; index++) {
    const crowns = crownsByColor[index]!;
    if (!crowns.length) continue;
    const color = TREE_COLORS[index]!;
    parts.push({
      name: index === 0 ? "tree_points" : `tree_canopies_${index + 1}`,
      label: `林地树冠${index + 1}`,
      mesh: merge(...crowns),
      color,
      surface: surface("foliage", color, 0.76),
    });
  }
  return placed;
}

function addRiverRocks(
  parts: NamedPart[],
  p: WatabouCityParams,
  scale: number,
  rng: Rng,
  river: readonly Vec3[],
): number {
  const count = Math.max(0, Math.round(84 * clamp(p.rockDensity, 0, 1.5)));
  const prototypes = ROCK_COLORS.map((_, index) => rock({
    seed: p.seed + 101 + index * 37,
    radius: 1,
    detail: 1,
    lumpiness: 0.34 + index * 0.04,
    roughness: 0.12,
    flatBase: 0.42,
    cusp: 22,
  }));
  const meshesByColor: Mesh[][] = ROCK_COLORS.map(() => []);
  for (let index = 0; index < count; index++) {
    const curveIndex = rng.int(1, river.length - 2);
    const center = river[curveIndex]!;
    const previous = river[curveIndex - 1]!;
    const next = river[curveIndex + 1]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = rng.next() < 0.5 ? -1 : 1;
    const bankDistance = (Math.max(6, p.riverWidth) * 0.5 + rng.range(0.7, 2.8)) * scale;
    const x = center.x - (dz / length) * bankDistance * side + rng.range(-0.7, 0.7) * scale;
    const z = center.z + (dx / length) * bankDistance * side + rng.range(-0.7, 0.7) * scale;
    const size = rng.range(0.52, 1.35) * scale;
    const heightScale = rng.range(0.42, 0.78);
    const colorIndex = rng.int(0, ROCK_COLORS.length - 1);
    const prototype = prototypes[colorIndex]!;
    const minY = prototype.positions.reduce((value, point) => Math.min(value, point.y), Number.POSITIVE_INFINITY);
    meshesByColor[colorIndex]!.push(transform(prototype, {
      scale: vec3(size * rng.range(0.9, 1.45), size * heightScale, size * rng.range(0.85, 1.35)),
      rotate: vec3(rng.range(-0.08, 0.08), rng.range(-Math.PI, Math.PI), rng.range(-0.08, 0.08)),
      translate: vec3(x, 0.03 * scale - minY * size * heightScale, z),
    }));
  }
  for (let index = 0; index < meshesByColor.length; index++) {
    const meshes = meshesByColor[index]!;
    if (!meshes.length) continue;
    const color = ROCK_COLORS[index]!;
    parts.push({
      name: `river_bank_rocks_${index + 1}`,
      label: `河岸岩石${index + 1}`,
      mesh: merge(...meshes),
      color,
      surface: surface(index === 2 ? "mossyStone" : "stone", color, 0.94),
    });
  }
  return count;
}

export function buildWatabouCity(params: Partial<WatabouCityParams> = {}): WatabouCity {
  const p: WatabouCityParams = { ...WATABOU_CITY_DEFAULTS, ...params };
  const scale = Math.max(0.3, p.size / 200);
  const parts: NamedPart[] = [];
  parts.push({
    name: "data_canvas",
    label: "城市数据底板",
    mesh: transform(box(244 * scale, 0.5 * scale, 178 * scale), { translate: vec3(0, -0.29 * scale, 0) }),
    color: GROUND,
    surface: { type: "wetGround", params: { color: GROUND, roughness: 0.96, wetness: 0.14, seed: p.seed + 1 } },
    metadata: { sourceUrl: SOURCE_URL, referenceStyle: "Watabou Bridge UE PCG data visualization" },
  });

  const river = addRiver(parts, p, scale);
  const fieldCount = addFields(parts, p, scale);
  const roadCount = addRoads(parts, p, scale, river);
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const buildingCount = addBuildings(parts, p, scale, rng.fork(), river);
  const treeCount = addTrees(parts, p, scale, rng.fork(), river);
  const rockCount = addRiverRocks(parts, p, scale, rng.fork(), river);

  return {
    parts,
    summary: { roadCount, fieldCount, treeCount, rockCount, buildingCount },
  };
}

export function buildWatabouCityParts(params: Partial<WatabouCityParams> = {}): NamedPart[] {
  return buildWatabouCity(params).parts;
}
