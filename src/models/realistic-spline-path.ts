import {
  archetypeRock,
  bounds,
  makeMesh,
  merge,
  polyline,
  recomputeNormals,
  resampleCurve,
  smoothCurve,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { makeRng } from "../random/prng.js";
import { shrub, tree } from "../vegetation/index.js";

type RGB = [number, number, number];

export interface RealisticSplinePathParams {
  length: number;
  width: number;
  meander: number;
  elevation: number;
  padSpacing: number;
  padThickness: number;
  edgeDensity: number;
  spireDensity: number;
  vegetationDensity: number;
  seed: number;
  controlPoints?: ReadonlyArray<Vec3>;
}

export interface RealisticSplinePathResult {
  readonly parts: NamedPart[];
  readonly curve: Curve;
  readonly controlPoints: ReadonlyArray<Vec3>;
  readonly padCount: number;
  readonly edgeRockCount: number;
  readonly spireCount: number;
  readonly vegetationCount: number;
}

export const REALISTIC_SPLINE_PATH_DEFAULTS: RealisticSplinePathParams = {
  length: 34,
  width: 4.2,
  meander: 4.8,
  elevation: 2.2,
  padSpacing: 2.35,
  padThickness: 0.9,
  edgeDensity: 0.82,
  spireDensity: 0.18,
  vegetationDensity: 0.42,
  seed: 42,
};

const SANDSTONE: RGB = [0.57, 0.29, 0.16];
const SAND: RGB = [0.74, 0.54, 0.32];
const EDGE_STONE: RGB = [0.46, 0.23, 0.13];
const DEAD_WOOD: RGB = [0.2, 0.11, 0.065];
const SCRUB: RGB = [0.32, 0.39, 0.12];

export function buildRealisticSplinePath(
  params: Partial<RealisticSplinePathParams> = {},
): RealisticSplinePathResult {
  const resolved = resolveParams(params);
  const rng = makeRng(resolved.seed);
  const controlPoints = resolved.controlPoints?.map((point) => ({ ...point }))
    ?? generatedControlPoints(resolved, rng);
  const curve = smoothCurve(polyline(controlPoints), 8);
  const samples = resampleCurve(curve, { segmentLength: resolved.padSpacing }).points;
  const pads: Mesh[] = [];
  const edgeRocks: Mesh[] = [];
  const spires: Mesh[] = [];
  const deadwood: Mesh[] = [];
  const scrubWood: Mesh[] = [];
  const scrubLeaves: Mesh[] = [];

  for (let index = 0; index < samples.length; index++) {
    const point = samples[index]!;
    const frame = sampleFrame(samples, index);
    const t = samples.length > 1 ? index / (samples.length - 1) : 0.5;
    const taper = 0.48 + 0.52 * Math.pow(Math.sin(Math.PI * t), 0.65);
    const padWidth = resolved.width * taper * rng.range(0.88, 1.14);
    const padLength = resolved.padSpacing * rng.range(1.12, 1.45);
    const padHeight = resolved.padThickness * rng.range(0.78, 1.2);
    pads.push(placeRockTop(
      archetypeRock("strata", {
        seed: resolved.seed + index * 7919,
        radius: 1,
        detail: 2,
        lumpiness: 0.34,
        roughness: 0.16,
        flatBase: 0.5,
        strata: 0.5,
        strataBands: 5,
      }),
      point,
      vec3(padWidth, padHeight, padLength),
      frame.yaw + rng.range(-0.12, 0.12),
      -0.03,
    ));

    for (const side of [-1, 1] as const) {
      if (rng.next() > resolved.edgeDensity * taper) continue;
      const lateral = side * resolved.width * taper * rng.range(0.43, 0.61);
      const edgePoint = vec3(
        point.x + frame.right.x * lateral + frame.tangent.x * rng.range(-0.45, 0.45),
        point.y + rng.range(-0.16, 0.08),
        point.z + frame.right.z * lateral + frame.tangent.z * rng.range(-0.45, 0.45),
      );
      const scale = rng.range(0.38, 0.78) * taper;
      edgeRocks.push(placeRockTop(
        archetypeRock(rng.next() < 0.65 ? "boulder" : "slab", {
          seed: resolved.seed + 100_003 + index * 131 + side,
          radius: 1,
          detail: 1,
          roughness: 0.2,
        }),
        edgePoint,
        vec3(scale * rng.range(1.2, 1.8), scale * rng.range(0.65, 1.05), scale * rng.range(1.05, 1.5)),
        rng.range(-Math.PI, Math.PI),
        0.08,
      ));
    }

    if (index > 1 && index < samples.length - 2 && rng.next() < resolved.spireDensity) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const lateral = side * resolved.width * rng.range(0.58, 0.86);
      const basePoint = vec3(
        point.x + frame.right.x * lateral,
        point.y - resolved.padThickness * 0.35,
        point.z + frame.right.z * lateral,
      );
      const height = rng.range(1.8, 3.8);
      spires.push(placeRockBase(
        archetypeRock("spire", {
          seed: resolved.seed + 200_003 + index * 977,
          radius: 1,
          detail: 2,
          roughness: 0.18,
          strata: 0.32,
          strataBands: 7,
        }),
        basePoint,
        vec3(rng.range(1.2, 1.85), height, rng.range(1.1, 1.7)),
        rng.range(-Math.PI, Math.PI),
      ));
    }

    const landmarkTree = resolved.vegetationDensity > 0 && (
      index === Math.round(samples.length * 0.3)
      || index === Math.round(samples.length * 0.7)
    );
    if (
      index > 1
      && index < samples.length - 2
      && (landmarkTree || rng.next() < resolved.vegetationDensity)
    ) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const lateral = side * resolved.width * rng.range(0.4, 0.7);
      const plantPoint = vec3(
        point.x + frame.right.x * lateral,
        point.y + 0.04,
        point.z + frame.right.z * lateral,
      );
      if (landmarkTree || rng.next() < 0.38) {
        const plant = tree({
          seed: resolved.seed + 300_007 + index * 541,
          height: rng.range(2.4, 4.5),
          trunkRadius: rng.range(0.13, 0.22),
          branchCount: 4,
          depth: 2,
          branchAngle: 56,
          branchGravity: 0.12,
          gnarl: 0.34,
          leaves: false,
        });
        deadwood.push(transform(plant.wood, {
          rotate: vec3(0, rng.range(-Math.PI, Math.PI), rng.range(-0.08, 0.08)),
          translate: plantPoint,
        }));
      } else {
        const plantScale = rng.range(0.52, 0.92);
        const plant = shrub({
          seed: resolved.seed + 400_009 + index * 719,
          height: rng.range(0.65, 1.1),
          stems: 3,
          leafDensity: 4,
          leafSize: 0.1,
        });
        const placement = {
          scale: plantScale,
          rotate: vec3(0, rng.range(-Math.PI, Math.PI), 0),
          translate: plantPoint,
        };
        scrubWood.push(transform(plant.wood, placement));
        scrubLeaves.push(transform(plant.leaves, placement));
      }
    }
  }

  const trail = buildTrailSurface(curve, resolved.width, resolved.seed);
  const parts: NamedPart[] = [
    named("path_pads", "样条岩盘踏板", merge(...pads), SANDSTONE, "sand", 0.92),
    named("walk_surface", "中央砂土步道", trail, SAND, "soil", 0.98),
  ];
  pushPart(parts, "edge_rocks", "路径边缘碎石", edgeRocks, EDGE_STONE, "stone", 0.96);
  pushPart(parts, "feature_spires", "路径标志岩柱", spires, SANDSTONE, "sand", 0.93);
  pushPart(parts, "deadwood", "路径枯树", deadwood, DEAD_WOOD, "wood", 0.9);
  pushPart(parts, "scrub_wood", "荒漠灌木枝干", scrubWood, DEAD_WOOD, "wood", 0.9);
  pushPart(parts, "scrub_foliage", "荒漠灌木叶片", scrubLeaves, SCRUB, "foliage", 0.9);

  return {
    parts,
    curve,
    controlPoints,
    padCount: pads.length,
    edgeRockCount: edgeRocks.length,
    spireCount: spires.length,
    vegetationCount: deadwood.length + scrubLeaves.length,
  };
}

export function buildRealisticSplinePathParts(
  params: Partial<RealisticSplinePathParams> = {},
): NamedPart[] {
  return buildRealisticSplinePath(params).parts;
}

function generatedControlPoints(
  params: RealisticSplinePathParams,
  rng: ReturnType<typeof makeRng>,
): Vec3[] {
  const points: Vec3[] = [];
  const count = 7;
  for (let index = 0; index < count; index++) {
    const t = index / (count - 1);
    const envelope = Math.sin(Math.PI * t);
    const x = -params.length * 0.5 + params.length * t;
    const z = envelope * (
      Math.sin(t * Math.PI * 2.15 + 0.35) * params.meander
      + Math.sin(t * Math.PI * 5.2) * params.meander * 0.22
      + rng.range(-params.meander * 0.12, params.meander * 0.12)
    );
    const y = envelope * (
      Math.sin(t * Math.PI * 1.7 - 0.4) * params.elevation
      + rng.range(-params.elevation * 0.12, params.elevation * 0.12)
    );
    points.push(vec3(x, y, z));
  }
  return points;
}

function sampleFrame(
  points: ReadonlyArray<Vec3>,
  index: number,
): { tangent: Vec3; right: Vec3; yaw: number } {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const magnitude = Math.hypot(dx, dz) || 1;
  const tangent = vec3(dx / magnitude, 0, dz / magnitude);
  const right = vec3(tangent.z, 0, -tangent.x);
  return { tangent, right, yaw: Math.atan2(tangent.x, tangent.z) };
}

function placeRockTop(
  mesh: Mesh,
  point: Vec3,
  rockScale: Vec3,
  yaw: number,
  topOffset: number,
): Mesh {
  const meshBounds = bounds(mesh);
  const fittedScale = dimensionsScale(meshBounds, rockScale);
  return transform(mesh, {
    scale: fittedScale,
    rotate: vec3(0, yaw, 0),
    translate: vec3(point.x, point.y + topOffset - meshBounds.max.y * fittedScale.y, point.z),
  });
}

function placeRockBase(
  mesh: Mesh,
  point: Vec3,
  rockScale: Vec3,
  yaw: number,
): Mesh {
  const meshBounds = bounds(mesh);
  const fittedScale = dimensionsScale(meshBounds, rockScale);
  return transform(mesh, {
    scale: fittedScale,
    rotate: vec3(0, yaw, 0),
    translate: vec3(point.x, point.y - meshBounds.min.y * fittedScale.y, point.z),
  });
}

function dimensionsScale(
  meshBounds: ReturnType<typeof bounds>,
  dimensions: Vec3,
): Vec3 {
  return vec3(
    dimensions.x / Math.max(1e-6, meshBounds.max.x - meshBounds.min.x),
    dimensions.y / Math.max(1e-6, meshBounds.max.y - meshBounds.min.y),
    dimensions.z / Math.max(1e-6, meshBounds.max.z - meshBounds.min.z),
  );
}

function buildTrailSurface(curve: Curve, pathWidth: number, seed: number): Mesh {
  const points = resampleCurve(curve, { segmentLength: 0.45 }).points;
  const widthSegments = 3;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const t = points.length > 1 ? index / (points.length - 1) : 0.5;
    const frame = sampleFrame(points, index);
    const taper = 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * t), 0.48);
    const variation = 0.94 + Math.sin(index * 1.73 + seed * 0.19) * 0.06;
    const halfWidth = pathWidth * 0.27 * taper * variation;
    for (let lateralIndex = 0; lateralIndex <= widthSegments; lateralIndex++) {
      const alpha = lateralIndex / widthSegments;
      const lateral = (alpha * 2 - 1) * halfWidth;
      positions.push(vec3(
        point.x + frame.right.x * lateral,
        point.y + 0.08,
        point.z + frame.right.z * lateral,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(alpha, t * 8));
    }
  }
  const stride = widthSegments + 1;
  for (let index = 0; index < points.length - 1; index++) {
    for (let lateralIndex = 0; lateralIndex < widthSegments; lateralIndex++) {
      const a = index * stride + lateralIndex;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function named(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  roughness: number,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: surfaceType, params: { color, roughness } },
  };
}

function pushPart(
  parts: NamedPart[],
  name: string,
  label: string,
  meshes: Mesh[],
  color: RGB,
  surfaceType: string,
  roughness: number,
): void {
  if (meshes.length > 0) parts.push(named(name, label, merge(...meshes), color, surfaceType, roughness));
}

function resolveParams(params: Partial<RealisticSplinePathParams>): RealisticSplinePathParams {
  const merged = { ...REALISTIC_SPLINE_PATH_DEFAULTS, ...params };
  const controlPoints = merged.controlPoints && merged.controlPoints.length >= 2
    ? merged.controlPoints.map((point) => ({ ...point }))
    : undefined;
  return {
    length: clamp(merged.length, 10, 100),
    width: clamp(merged.width, 1.4, 10),
    meander: clamp(merged.meander, 0, 18),
    elevation: clamp(merged.elevation, 0, 10),
    padSpacing: clamp(merged.padSpacing, 0.9, 5),
    padThickness: clamp(merged.padThickness, 0.25, 2.5),
    edgeDensity: clamp(merged.edgeDensity, 0, 1),
    spireDensity: clamp(merged.spireDensity, 0, 1),
    vegetationDensity: clamp(merged.vegetationDensity, 0, 1),
    seed: Math.round(merged.seed) >>> 0,
    ...(controlPoints ? { controlPoints } : {}),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
