import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  makeMesh,
  merge,
  polyline,
  recomputeNormals,
  smoothCurve,
  solveBackwaterProfile,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface RiverLakeParams {
  size: number;
  resolution: number;
  riverWidth: number;
  riverDepth: number;
  meander: number;
  relief: number;
  lakeRadiusX: number;
  lakeRadiusZ: number;
  lakeLevel: number;
  backwater: number;
  flowStreaks: number;
  seed: number;
}

export const RIVER_LAKE_DEFAULTS: RiverLakeParams = {
  size: 36,
  resolution: 88,
  riverWidth: 1.25,
  riverDepth: 0.82,
  meander: 4.2,
  relief: 5.2,
  lakeRadiusX: 7.4,
  lakeRadiusZ: 5.4,
  lakeLevel: 0.72,
  backwater: 1,
  flowStreaks: 24,
  seed: 96,
};

interface RiverSample {
  position: Vec3;
  tangent: Vec3;
  side: Vec3;
  t: number;
  distance: number;
  width: number;
  waterY: number;
}

interface LakeShape {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  phase: number;
}

interface NearestRiver {
  distance: number;
  t: number;
}

export function buildRiverLakeParts(params: Partial<RiverLakeParams> = {}): NamedPart[] {
  const p = resolveParams(params);
  const lake: LakeShape = {
    centerX: p.size * 0.08,
    centerZ: p.size * 0.2,
    radiusX: p.lakeRadiusX,
    radiusZ: p.lakeRadiusZ,
    phase: p.seed * 0.173,
  };
  const samples = buildRiverSamples(p, lake);
  const terrainData = buildTerrain(p, lake, samples);
  const riverBank = riverRibbonToLake(samples, lake, 1.58, -0.045, p.lakeLevel);
  const riverWater = riverRibbonToLake(samples, lake, 1, 0.004, p.lakeLevel);
  const bankLeft = riverBank.positions[riverBank.positions.length - 2]!;
  const bankRight = riverBank.positions[riverBank.positions.length - 1]!;
  const inlet = vec3((bankLeft.x + bankRight.x) * 0.5, p.lakeLevel, (bankLeft.z + bankRight.z) * 0.5);
  const inletAngle = Math.atan2(
    (inlet.z - lake.centerZ) / lake.radiusZ,
    (inlet.x - lake.centerX) / lake.radiusX,
  );
  const inletHalfWidth = Math.hypot(bankRight.x - bankLeft.x, bankRight.z - bankLeft.z) * 0.5;
  const inletGap = clamp(inletHalfWidth * 1.5 / Math.min(lake.radiusX, lake.radiusZ) + 0.04, 0.3, 0.7);
  const lakeShore = lakeRing(lake, p.lakeLevel - 0.012, 0.955, 1.035, 96, inletAngle, inletGap);
  const lakeWater = lakeSurface(lake, p.lakeLevel, 96);
  const streaks = flowStreakMesh(samples, p.flowStreaks, p.seed);
  const levels = samples.map((sample) => sample.waterY);
  const naturalLevels = naturalWaterLevels(p, samples);
  const raisedSamples = levels.filter((level, index) => level > naturalLevels[index]! + 1e-4).length;
  const connectedWaterParams = {
    body: "river",
    tint: [0.14, 0.31, 0.23],
    deepColor: [0.025, 0.075, 0.052],
    roughness: 0.11,
    waveAmplitude: 0.014,
    flowSpeed: 0.3,
    foamStrength: 0.18,
    seed: p.seed + 3,
  };

  const parts: NamedPart[] = [
    {
      name: "river_lake_terrain",
      label: "流域侵蚀地形",
      mesh: terrainData.mesh,
      color: [0.48, 0.47, 0.43],
      colors: terrainData.colors,
      surface: {
        type: "stone",
        params: { color: [0.48, 0.47, 0.43], roughness: 0.96, seed: p.seed },
      },
      metadata: {
        source: "BV1ndiWBfEXo",
        channels: ["riverDistance", "lakeBasin", "shoreWetness", "backwater"],
      },
    },
    namedSurface(
      "river_lake_river_bank",
      "河床与湿岸带",
      riverBank,
      [0.43, 0.16, 0.1],
      "sand",
      { color: [0.43, 0.16, 0.1], roughness: 0.98, seed: p.seed + 1 },
    ),
    namedSurface(
      "river_lake_lake_shore",
      "湖泊回水岸线",
      lakeShore,
      [0.48, 0.17, 0.1],
      "sand",
      { color: [0.48, 0.17, 0.1], roughness: 0.97, seed: p.seed + 2 },
    ),
    {
      ...namedSurface(
        "river_lake_lake_water",
        "静水湖面",
        lakeWater,
        [0.14, 0.31, 0.23],
        "water",
        connectedWaterParams,
      ),
      doubleSided: true,
      metadata: { source: "BV1ndiWBfEXo", waterBody: "lake", waterSystem: "river-lake", level: p.lakeLevel },
    },
    {
      ...namedSurface(
        "river_lake_river_water",
        "回水河流水面",
        riverWater,
        [0.14, 0.31, 0.23],
        "water",
        connectedWaterParams,
      ),
      doubleSided: true,
      metadata: {
        source: "BV1ndiWBfEXo",
        waterSystem: "river-lake",
        flow: "upstream-to-lake",
        backwaterStrength: p.backwater,
        raisedSamples,
        waterLevels: levels,
        naturalLevels,
      },
    },
  ];

  if (streaks.positions.length > 0) {
    parts.push({
      ...namedSurface(
        "river_lake_flow_streaks",
        "流量守恒流痕",
        streaks,
        [0.66, 0.89, 0.91],
        "plastic",
        { color: [0.66, 0.89, 0.91], roughness: 0.2, metallic: 0 },
      ),
      doubleSided: true,
    });
  }
  return parts;
}

export function scoreRiverLake(parts: readonly NamedPart[]): {
  layers: number;
  verts: number;
  tris: number;
  hasLake: boolean;
  hasBackwater: boolean;
  monotonicWater: boolean;
} {
  let verts = 0;
  let tris = 0;
  for (const part of parts) {
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
  }
  const river = parts.find((part) => part.name === "river_lake_river_water");
  const levels = Array.isArray(river?.metadata?.waterLevels)
    ? river.metadata.waterLevels as number[]
    : [];
  return {
    layers: parts.length,
    verts,
    tris,
    hasLake: parts.some((part) => part.name === "river_lake_lake_water"),
    hasBackwater: Number(river?.metadata?.raisedSamples ?? 0) > 0,
    monotonicWater: levels.every((level, index) => index === 0 || level <= levels[index - 1]! + 1e-6),
  };
}

function resolveParams(params: Partial<RiverLakeParams>): RiverLakeParams {
  const p = { ...RIVER_LAKE_DEFAULTS, ...params };
  const size = Math.max(16, p.size);
  return {
    size,
    resolution: clampInt(p.resolution, 24, 180),
    riverWidth: Math.max(0.35, p.riverWidth),
    riverDepth: Math.max(0.15, p.riverDepth),
    meander: Math.max(0, p.meander),
    relief: Math.max(0.5, p.relief),
    lakeRadiusX: clamp(p.lakeRadiusX, 2, size * 0.32),
    lakeRadiusZ: clamp(p.lakeRadiusZ, 2, size * 0.28),
    lakeLevel: p.lakeLevel,
    backwater: clamp01(p.backwater),
    flowStreaks: clampInt(p.flowStreaks, 0, 100),
    seed: Math.round(p.seed),
  };
}

function buildRiverSamples(p: RiverLakeParams, lake: LakeShape): RiverSample[] {
  const rng = makeRng(p.seed * 41 + 7);
  const controlPoints: Vec3[] = [];
  const pointCount = 15;
  const startZ = -p.size * 0.48;
  const endZ = lake.centerZ - lake.radiusZ * 0.56;
  const startX = -p.size * 0.18;
  const endX = lake.centerX - lake.radiusX * 0.08;
  for (let index = 0; index < pointCount; index++) {
    const t = index / (pointCount - 1);
    const envelope = Math.sin(Math.PI * t);
    const x = startX + (endX - startX) * t
      + (Math.sin(t * Math.PI * 3.4 + p.seed * 0.11) * 0.72
        + Math.sin(t * Math.PI * 7.2 - p.seed * 0.05) * 0.18
        + (rng.next() - 0.5) * 0.16) * p.meander * envelope;
    controlPoints.push(vec3(x, 0, startZ + (endZ - startZ) * t));
  }
  const points = smoothCurve(polyline(controlPoints), 5).points;
  const distances = cumulativeDistances(points);
  const natural = points.map((_, index) => {
    const t = index / Math.max(1, points.length - 1);
    return p.lakeLevel - p.riverDepth * 0.42 + p.relief * 0.52 * (1 - t) ** 1.55;
  });
  const levels = solveBackwaterProfile(natural, {
    outletLevel: p.lakeLevel,
    minSlope: 0.0025,
    strength: p.backwater,
    distances,
  });

  return points.map((position, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const tangent = vec3(dx / length, 0, dz / length);
    const t = index / Math.max(1, points.length - 1);
    const inletFan = smoothstep(0.64, 0.88, t) * p.backwater;
    return {
      position,
      tangent,
      side: vec3(-tangent.z, 0, tangent.x),
      t,
      distance: distances[index]!,
      width: p.riverWidth
        * (0.78 + t * 0.3 + inletFan * 0.58),
      waterY: levels[index]!,
    };
  });
}

function naturalWaterLevels(p: RiverLakeParams, samples: readonly RiverSample[]): number[] {
  return samples.map((sample) => (
    p.lakeLevel - p.riverDepth * 0.42 + p.relief * 0.52 * (1 - sample.t) ** 1.55
  ));
}

function buildTerrain(
  p: RiverLakeParams,
  lake: LakeShape,
  samples: readonly RiverSample[],
): { mesh: Mesh; colors: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const noise = makeNoise(p.seed + 301);
  const half = p.size * 0.5;
  const last = p.resolution;
  const startZ = samples[0]!.position.z;
  const endZ = lake.centerZ;

  for (let row = 0; row <= last; row++) {
    const z = -half + (row / last) * p.size;
    for (let column = 0; column <= last; column++) {
      const x = -half + (column / last) * p.size;
      const upstream = 1 - clamp01((z - startZ) / Math.max(0.001, endZ - startZ));
      const edgeRidge = (Math.abs(x) / half) ** 1.45 * p.relief * 0.62;
      const rolling = noise.noise2(x * 0.075, z * 0.075) * p.relief * 0.24
        + noise.noise2(x * 0.21 + 11, z * 0.21 - 7) * p.relief * 0.07;
      let height = p.lakeLevel + p.relief * (0.11 + upstream * 0.47) + edgeRidge + rolling;

      const nearest = nearestRiver(samples, x, z);
      const sample = sampleAt(samples, nearest.t);
      const riverNormalized = nearest.distance / Math.max(0.001, sample.width);
      const riverMask = smoothstep(1.62, 0.82, riverNormalized);
      const bed = sample.waterY - p.riverDepth * (0.98 - Math.min(1, riverNormalized) ** 2 * 0.72);
      height += (bed - height) * riverMask;

      const lakeQ = lakeNormalizedRadius(lake, x, z);
      const lakeMask = smoothstep(1.06, 0.94, lakeQ);
      const lakeDepth = p.riverDepth * (0.45 + 1.05 * (1 - clamp01(lakeQ)));
      const lakeBed = p.lakeLevel - lakeDepth;
      height += (Math.min(height, lakeBed) - height) * lakeMask;
      positions.push(vec3(x, height, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(column / last, row / last));

      const lakeShore = smoothstep(1.22, 1.01, lakeQ) * (1 - smoothstep(1.01, 0.93, lakeQ));
      const riverShore = smoothstep(1.72, 1.02, riverNormalized) * (1 - smoothstep(1.02, 0.8, riverNormalized));
      const wetShore = Math.max(lakeShore, riverShore);
      const rock = clamp01((height - p.lakeLevel) / Math.max(0.001, p.relief * 0.7));
      colors.push(
        0.43 + rock * 0.16 + wetShore * 0.16,
        0.42 + rock * 0.13 - wetShore * 0.25,
        0.38 + rock * 0.11 - wetShore * 0.25,
      );
    }
  }

  const stride = last + 1;
  for (let row = 0; row < last; row++) {
    for (let column = 0; column < last; column++) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices })),
    colors,
  };
}

function riverRibbonToLake(
  samples: readonly RiverSample[],
  lake: LakeShape,
  widthScale: number,
  yOffset: number,
  terminalY: number,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const leftT = riverEdgeLakeIntersection(samples, lake, widthScale, -1);
  const rightT = riverEdgeLakeIntersection(samples, lake, widthScale, 1);
  const bodyEndT = Math.min(leftT, rightT);
  const bodySamples = samples.filter((sample) => sample.t < bodyEndT - 1e-6);
  for (const sample of bodySamples) {
    positions.push(riverEdgePoint(sample, widthScale, -1, yOffset), riverEdgePoint(sample, widthScale, 1, yOffset));
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    uvs.push(vec2(0, sample.distance * 0.22), vec2(1, sample.distance * 0.22));
  }
  const leftSample = sampleAt(samples, leftT);
  const rightSample = sampleAt(samples, rightT);
  const left = riverEdgePoint(leftSample, widthScale, -1, yOffset);
  const right = riverEdgePoint(rightSample, widthScale, 1, yOffset);
  positions.push(vec3(left.x, terminalY + yOffset, left.z), vec3(right.x, terminalY + yOffset, right.z));
  normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
  uvs.push(vec2(0, leftSample.distance * 0.22), vec2(1, rightSample.distance * 0.22));
  for (let index = 0; index < positions.length / 2 - 1; index++) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function riverEdgeLakeIntersection(
  samples: readonly RiverSample[],
  lake: LakeShape,
  widthScale: number,
  side: -1 | 1,
): number {
  let previous = samples[0]!;
  let previousPoint = riverEdgePoint(previous, widthScale, side, 0);
  let previousRadius = lakeNormalizedRadius(lake, previousPoint.x, previousPoint.z);
  for (let index = 1; index < samples.length; index++) {
    const current = samples[index]!;
    const currentPoint = riverEdgePoint(current, widthScale, side, 0);
    const currentRadius = lakeNormalizedRadius(lake, currentPoint.x, currentPoint.z);
    if (previousRadius > 1 && currentRadius <= 1) {
      let outsideT = previous.t;
      let insideT = current.t;
      for (let iteration = 0; iteration < 14; iteration++) {
        const midpointT = (outsideT + insideT) * 0.5;
        const midpointSample = sampleAt(samples, midpointT);
        const midpoint = riverEdgePoint(midpointSample, widthScale, side, 0);
        if (lakeNormalizedRadius(lake, midpoint.x, midpoint.z) > 1) outsideT = midpointT;
        else insideT = midpointT;
      }
      return insideT;
    }
    previous = current;
    previousPoint = currentPoint;
    previousRadius = currentRadius;
  }
  return samples[samples.length - 1]!.t;
}

function riverEdgePoint(sample: RiverSample, widthScale: number, side: -1 | 1, yOffset: number): Vec3 {
  const width = sample.width * widthScale * side;
  return vec3(
    sample.position.x + sample.side.x * width,
    sample.waterY + yOffset,
    sample.position.z + sample.side.z * width,
  );
}

function lakeSurface(lake: LakeShape, y: number, segments: number): Mesh {
  const positions = [vec3(lake.centerX, y, lake.centerZ)];
  const normals = [vec3(0, 1, 0)];
  const uvs = [vec2(0.5, 0.5)];
  const indices: number[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const radius = lakeRadiusFactor(lake, angle);
    const x = Math.cos(angle) * lake.radiusX * radius;
    const z = Math.sin(angle) * lake.radiusZ * radius;
    positions.push(vec3(lake.centerX + x, y, lake.centerZ + z));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(0.5 + x / (lake.radiusX * 2.3), 0.5 + z / (lake.radiusZ * 2.3)));
  }
  for (let index = 0; index < segments; index++) {
    const current = index + 1;
    const next = ((index + 1) % segments) + 1;
    indices.push(0, next, current);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function lakeRing(
  lake: LakeShape,
  y: number,
  innerScale: number,
  outerScale: number,
  segments: number,
  gapCenter?: number,
  gapHalfAngle = 0,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const radius = lakeRadiusFactor(lake, angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(
      vec3(lake.centerX + cos * lake.radiusX * radius * innerScale, y, lake.centerZ + sin * lake.radiusZ * radius * innerScale),
      vec3(lake.centerX + cos * lake.radiusX * radius * outerScale, y, lake.centerZ + sin * lake.radiusZ * radius * outerScale),
    );
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    uvs.push(vec2(0, index / segments), vec2(1, index / segments));
  }
  for (let index = 0; index < segments; index++) {
    const midpointAngle = ((index + 0.5) / segments) * Math.PI * 2;
    if (gapCenter !== undefined && angleDistance(midpointAngle, gapCenter) < gapHalfAngle) continue;
    const base = index * 2;
    const next = ((index + 1) % segments) * 2;
    indices.push(base, next, base + 1, base + 1, next, next + 1);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function angleDistance(a: number, b: number): number {
  const wrapped = ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return Math.abs(wrapped);
}

function flowStreakMesh(samples: readonly RiverSample[], count: number, seed: number): Mesh {
  const rng = makeRng(seed * 83 + 19);
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const t = (index + 0.5) / Math.max(1, count) * 0.88 + rng.range(-0.012, 0.012);
    const sample = sampleAt(samples, clamp01(t));
    const lateral = rng.range(-sample.width * 0.62, sample.width * 0.62);
    meshes.push(transform(box(rng.range(0.025, 0.055), 0.012, rng.range(0.28, 0.78)), {
      rotate: vec3(0, Math.atan2(sample.tangent.x, sample.tangent.z), 0),
      translate: vec3(
        sample.position.x + sample.side.x * lateral,
        sample.waterY + 0.075,
        sample.position.z + sample.side.z * lateral,
      ),
    }));
  }
  return merge(...meshes);
}

function nearestRiver(samples: readonly RiverSample[], x: number, z: number): NearestRiver {
  let best: NearestRiver = { distance: Infinity, t: 0 };
  for (let index = 0; index < samples.length - 1; index++) {
    const a = samples[index]!.position;
    const b = samples[index + 1]!.position;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const local = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
    const distance = Math.hypot(x - (a.x + dx * local), z - (a.z + dz * local));
    if (distance < best.distance) {
      best = { distance, t: (index + local) / (samples.length - 1) };
    }
  }
  return best;
}

function sampleAt(samples: readonly RiverSample[], t: number): RiverSample {
  const scaled = clamp01(t) * (samples.length - 1);
  const index = Math.min(samples.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = samples[index]!;
  const b = samples[index + 1]!;
  return {
    position: lerpVec3(a.position, b.position, local),
    tangent: normalizeXZ(lerpVec3(a.tangent, b.tangent, local)),
    side: normalizeXZ(lerpVec3(a.side, b.side, local)),
    t,
    distance: lerp(a.distance, b.distance, local),
    width: lerp(a.width, b.width, local),
    waterY: lerp(a.waterY, b.waterY, local),
  };
}

function cumulativeDistances(points: readonly Vec3[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    distances.push(distances[index - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return distances;
}

function lakeNormalizedRadius(lake: LakeShape, x: number, z: number): number {
  const dx = (x - lake.centerX) / lake.radiusX;
  const dz = (z - lake.centerZ) / lake.radiusZ;
  const angle = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / lakeRadiusFactor(lake, angle);
}

function lakeRadiusFactor(lake: LakeShape, angle: number): number {
  return 1
    + Math.sin(angle * 3 + lake.phase) * 0.095
    + Math.sin(angle * 5 - lake.phase * 0.7) * 0.052
    + Math.sin(angle * 7 + lake.phase * 0.31) * 0.025;
}

function namedSurface(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown>,
): NamedPart {
  return { name, label, mesh, color, surface: { type, params } };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function normalizeXZ(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.z) || 1;
  return vec3(value.x / length, 0, value.z / length);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
