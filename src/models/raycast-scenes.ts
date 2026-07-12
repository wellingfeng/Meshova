import { normalize, scale, vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  copyToPoints,
  cylinder,
  displaceByNoise,
  icosphere,
  makePointCloud,
  merge,
  pointAttribute,
  rayProjectPointCloud,
  storePointColorHSV,
  subdivide,
  transform,
  type Mesh,
  type NamedPart,
  type PointCloud,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface RaycastRoofGardenParams {
  width: number;
  depth: number;
  wallHeight: number;
  roofPitch: number;
  columns: number;
  rows: number;
  density: number;
  plantScale: number;
  seed: number;
}

export const RAYCAST_ROOF_GARDEN_DEFAULTS: RaycastRoofGardenParams = {
  width: 9,
  depth: 7,
  wallHeight: 4.2,
  roofPitch: 22,
  columns: 13,
  rows: 10,
  density: 0.7,
  plantScale: 0.62,
  seed: 14,
};

export function buildRaycastRoofGardenParts(
  params: Partial<RaycastRoofGardenParams> = {},
): NamedPart[] {
  const resolved = { ...RAYCAST_ROOF_GARDEN_DEFAULTS, ...params };
  const width = Math.max(3, resolved.width);
  const depth = Math.max(3, resolved.depth);
  const wallHeight = Math.max(1.5, resolved.wallHeight);
  const pitch = clamp(resolved.roofPitch, 4, 42) * Math.PI / 180;
  const roof = pitchedRoof(width, depth, wallHeight, pitch);
  const candidates = roofGridCandidates(resolved, width, depth, wallHeight);
  const projected = rayProjectPointCloud(candidates, roof, {
    direction: vec3(0, -1, 0),
    maxDistance: width + 5,
    surfaceOffset: 0.035,
  });
  const planterLibrary = roofPlanterLibrary(resolved.plantScale);
  const placement = {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    variant: pointAttribute("variant", 0),
    alignToNormal: true,
  } as const;

  return [
    semanticPart(
      "roof_garden_house",
      "坡顶生态屋主体",
      transform(box(width * 0.88, wallHeight, depth * 0.88), {
        translate: vec3(0, wallHeight * 0.5, 0),
      }),
      [0.57, 0.48, 0.37],
      "plaster",
      { color: [0.57, 0.48, 0.37], roughness: 0.9 },
    ),
    {
      ...semanticPart(
        "roof_garden_surface",
        "射线投射坡屋面",
        roof,
        [0.24, 0.2, 0.17],
        "roofTiles",
        { color: [0.24, 0.2, 0.17], roughness: 0.94 },
      ),
      metadata: {
        generator: "raycast-roof-garden",
        rayDirection: "down",
        candidateCount: candidates.points.length,
        hitCount: projected.points.length,
      },
    },
    semanticPart(
      "roof_garden_planters",
      "随屋面法线对齐的花盆",
      copyToPoints(projected, planterLibrary.pots, placement),
      [0.48, 0.19, 0.08],
      "ceramic",
      { color: [0.48, 0.19, 0.08], roughness: 0.82 },
    ),
    {
      ...semanticPart(
        "roof_garden_foliage",
        "射线命中点屋顶植被",
        copyToPoints(projected, planterLibrary.foliage, placement),
        [0.16, 0.48, 0.12],
        "foliage",
        { color: [0.16, 0.48, 0.12], translucency: 0.24 },
      ),
      metadata: { instanceCount: projected.points.length, alignedToHitNormal: true },
    },
  ];
}

export interface RaycastAsteroidGardenParams {
  radius: number;
  roughness: number;
  samples: number;
  crystalScale: number;
  debugMarkers: boolean;
  seed: number;
}

export const RAYCAST_ASTEROID_GARDEN_DEFAULTS: RaycastAsteroidGardenParams = {
  radius: 4.2,
  roughness: 0.55,
  samples: 52,
  crystalScale: 0.58,
  debugMarkers: true,
  seed: 33,
};

export function buildRaycastAsteroidGardenParts(
  params: Partial<RaycastAsteroidGardenParams> = {},
): NamedPart[] {
  const resolved = { ...RAYCAST_ASTEROID_GARDEN_DEFAULTS, ...params };
  const radius = Math.max(1.5, resolved.radius);
  const asteroid = transform(
    displaceByNoise(icosphere(radius, 2), {
      amount: clamp(resolved.roughness, 0, 1.2),
      scale: 0.72,
      seed: resolved.seed,
    }),
    { scale: vec3(1, 0.82, 0.94), rotate: vec3(0.12, 0.28, -0.08) },
  );
  const candidates = radialCandidates(radius, resolved.samples, resolved.seed);
  const projected = rayProjectPointCloud(candidates, asteroid, {
    direction: (context) => scale(normalize(context.point), -1),
    maxDistance: radius * 2,
    surfaceOffset: 0.045,
  });
  const colored = storePointColorHSV(
    projected,
    (context) => (context.attributes["ray.distance"]?.[context.index] ?? 0) / Math.max(1, radius),
    0.78,
    1,
  );
  const crystals = crystalLibrary(Math.max(0.12, resolved.crystalScale));
  const placement = {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    variant: pointAttribute("variant", 0),
    alignToNormal: true,
  } as const;
  const parts: NamedPart[] = [
    {
      ...semanticPart(
        "asteroid_garden_body",
        "程序化粗糙小行星",
        asteroid,
        [0.24, 0.25, 0.28],
        "rock",
        { color: [0.24, 0.25, 0.28], roughness: 0.98, seed: resolved.seed },
      ),
      metadata: {
        generator: "raycast-asteroid-garden",
        rayDirection: "radial-inward",
        candidateCount: candidates.points.length,
        hitCount: projected.points.length,
      },
    },
    semanticPart(
      "asteroid_garden_crystal_bases",
      "法线对齐晶簇基座",
      copyToPoints(projected, crystals.bases, placement),
      [0.12, 0.16, 0.2],
      "metal",
      { color: [0.12, 0.16, 0.2], metalness: 0.72, roughness: 0.38 },
    ),
    {
      ...semanticPart(
        "asteroid_garden_crystals",
        "径向射线晶体花园",
        copyToPoints(projected, crystals.tips, placement),
        [0.18, 0.72, 0.86],
        "glass",
        { tint: [0.18, 0.72, 0.86], roughness: 0.16 },
      ),
      metadata: { instanceCount: projected.points.length, alignedToHitNormal: true },
    },
  ];
  if (resolved.debugMarkers) {
    const markers = coloredMarkers(colored, Math.max(0.035, radius * 0.014));
    parts.push({
      name: "asteroid_ray_distance_debug",
      label: "HSV 射线距离调试点",
      mesh: markers.mesh,
      colors: markers.colors,
      color: [1, 0.25, 0.08],
      surface: { type: "emissive", params: { intensity: 0.6 } },
      metadata: { colorSource: "ray.distance", markerCount: colored.points.length },
    });
  }
  return parts;
}

export interface RaycastCliffLightsParams {
  width: number;
  height: number;
  columns: number;
  rows: number;
  density: number;
  roughness: number;
  lampScale: number;
  seed: number;
}

export const RAYCAST_CLIFF_LIGHTS_DEFAULTS: RaycastCliffLightsParams = {
  width: 10,
  height: 7,
  columns: 12,
  rows: 8,
  density: 0.62,
  roughness: 0.38,
  lampScale: 0.72,
  seed: 27,
};

export function buildRaycastCliffLightsParts(
  params: Partial<RaycastCliffLightsParams> = {},
): NamedPart[] {
  const resolved = { ...RAYCAST_CLIFF_LIGHTS_DEFAULTS, ...params };
  const width = Math.max(3, resolved.width);
  const height = Math.max(3, resolved.height);
  const cliff = transform(
    displaceByNoise(subdivide(box(width, height, 0.9), 3), {
      amount: clamp(resolved.roughness, 0, 0.9),
      scale: 0.58,
      seed: resolved.seed,
    }),
    { translate: vec3(0, height * 0.5, 0) },
  );
  const candidates = cliffGridCandidates(resolved, width, height);
  const projected = rayProjectPointCloud(candidates, cliff, {
    direction: vec3(0, 0, -1),
    maxDistance: 6,
    surfaceOffset: 0.04,
  });
  const lamps = cliffLampLibrary(Math.max(0.15, resolved.lampScale));
  const placement = {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    variant: pointAttribute("variant", 0),
    alignToNormal: true,
  } as const;

  return [
    {
      ...semanticPart(
        "cliff_lights_wall",
        "任意静态网格岩壁",
        cliff,
        [0.36, 0.32, 0.28],
        "rock",
        { color: [0.36, 0.32, 0.28], roughness: 0.99, seed: resolved.seed },
      ),
      metadata: {
        generator: "raycast-cliff-lights",
        rayDirection: "backward",
        candidateCount: candidates.points.length,
        hitCount: projected.points.length,
      },
    },
    semanticPart(
      "cliff_light_brackets",
      "贴合岩壁法线的灯架",
      copyToPoints(projected, lamps.brackets, placement),
      [0.09, 0.1, 0.11],
      "metal",
      { color: [0.09, 0.1, 0.11], metalness: 0.88, roughness: 0.34 },
    ),
    {
      ...semanticPart(
        "cliff_light_glow",
        "岩壁射线灯阵",
        copyToPoints(projected, lamps.lights, placement),
        [1, 0.48, 0.08],
        "emissive",
        { color: [1, 0.48, 0.08], intensity: 2.2 },
      ),
      metadata: { instanceCount: projected.points.length, alignedToHitNormal: true },
    },
  ];
}

function pitchedRoof(width: number, depth: number, wallHeight: number, pitch: number): Mesh {
  const panelWidth = width * 0.57;
  const rise = Math.sin(pitch) * panelWidth * 0.48;
  return merge(
    transform(box(panelWidth, 0.24, depth), {
      rotate: vec3(0, 0, pitch),
      translate: vec3(-width * 0.245, wallHeight + rise, 0),
    }),
    transform(box(panelWidth, 0.24, depth), {
      rotate: vec3(0, 0, -pitch),
      translate: vec3(width * 0.245, wallHeight + rise, 0),
    }),
  );
}

function roofGridCandidates(
  params: RaycastRoofGardenParams,
  width: number,
  depth: number,
  wallHeight: number,
): PointCloud {
  const random = makeRng(params.seed);
  const points: Vec3[] = [];
  const scales: number[] = [];
  const yaws: number[] = [];
  const variants: number[] = [];
  const columns = Math.max(2, Math.round(params.columns));
  const rows = Math.max(2, Math.round(params.rows));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (random.next() > clamp(params.density, 0.05, 1)) continue;
      const x = ((column + 0.5) / columns - 0.5) * width * 0.88 + random.range(-0.12, 0.12);
      const z = ((row + 0.5) / rows - 0.5) * depth * 0.84 + random.range(-0.12, 0.12);
      points.push(vec3(x, wallHeight + width * 0.75, z));
      scales.push(random.range(0.72, 1.18));
      yaws.push(random.range(-Math.PI, Math.PI));
      variants.push(random.int(0, 1));
    }
  }
  return makePointCloud({ points, attributes: { scale: scales, yaw: yaws, variant: variants } });
}

function radialCandidates(radius: number, countValue: number, seed: number): PointCloud {
  const random = makeRng(seed + 1);
  const count = Math.max(8, Math.round(countValue));
  const points: Vec3[] = [];
  const scales: number[] = [];
  const yaws: number[] = [];
  const variants: number[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index++) {
    const y = 1 - ((index + 0.5) / count) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * goldenAngle + random.range(-0.06, 0.06);
    const shellRadius = radius + random.range(1.1, 2.35);
    points.push(vec3(
      Math.cos(angle) * radial * shellRadius,
      y * shellRadius * 0.82,
      Math.sin(angle) * radial * shellRadius * 0.94,
    ));
    scales.push(random.range(0.68, 1.28));
    yaws.push(random.range(-Math.PI, Math.PI));
    variants.push(random.int(0, 1));
  }
  return makePointCloud({ points, attributes: { scale: scales, yaw: yaws, variant: variants } });
}

function cliffGridCandidates(
  params: RaycastCliffLightsParams,
  width: number,
  height: number,
): PointCloud {
  const random = makeRng(params.seed + 2);
  const points: Vec3[] = [];
  const scales: number[] = [];
  const yaws: number[] = [];
  const variants: number[] = [];
  const columns = Math.max(2, Math.round(params.columns));
  const rows = Math.max(2, Math.round(params.rows));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (random.next() > clamp(params.density, 0.05, 1)) continue;
      points.push(vec3(
        ((column + 0.5) / columns - 0.5) * width * 0.86 + random.range(-0.16, 0.16),
        ((row + 0.5) / rows) * height * 0.88 + height * 0.05 + random.range(-0.12, 0.12),
        3,
      ));
      scales.push(random.range(0.75, 1.2));
      yaws.push(random.range(-0.28, 0.28));
      variants.push(random.int(0, 1));
    }
  }
  return makePointCloud({ points, attributes: { scale: scales, yaw: yaws, variant: variants } });
}

function roofPlanterLibrary(scaleValue: number): { pots: Mesh[]; foliage: Mesh[] } {
  const size = Math.max(0.12, scaleValue);
  const pot = transform(cone(size * 0.22, size * 0.34, 8, true), {
    translate: vec3(0, size * 0.17, 0),
  });
  const lowLeaves = merge(
    transform(icosphere(size * 0.23, 1), { scale: vec3(1.1, 0.62, 0.9), translate: vec3(0, size * 0.47, 0) }),
    transform(icosphere(size * 0.16, 1), { translate: vec3(size * 0.12, size * 0.62, 0) }),
  );
  const tallLeaves = merge(
    transform(cone(size * 0.22, size * 0.74, 7, true), { translate: vec3(0, size * 0.55, 0) }),
    transform(icosphere(size * 0.13, 1), { translate: vec3(0, size * 0.94, 0) }),
  );
  return { pots: [pot, transform(pot, { scale: 0.88 })], foliage: [lowLeaves, tallLeaves] };
}

function crystalLibrary(scaleValue: number): { bases: Mesh[]; tips: Mesh[] } {
  const baseA = transform(cylinder(scaleValue * 0.24, scaleValue * 0.16, 7, true), {
    translate: vec3(0, scaleValue * 0.08, 0),
  });
  const baseB = transform(baseA, { scale: 0.82 });
  const tipA = transform(cone(scaleValue * 0.2, scaleValue * 1.05, 6, true), {
    translate: vec3(0, scaleValue * 0.62, 0),
  });
  const tipB = merge(
    transform(cone(scaleValue * 0.15, scaleValue * 0.82, 5, true), {
      rotate: vec3(0, 0, 0.22),
      translate: vec3(-scaleValue * 0.11, scaleValue * 0.48, 0),
    }),
    transform(cone(scaleValue * 0.12, scaleValue * 0.66, 5, true), {
      rotate: vec3(0, 0, -0.28),
      translate: vec3(scaleValue * 0.15, scaleValue * 0.4, 0),
    }),
  );
  return { bases: [baseA, baseB], tips: [tipA, tipB] };
}

function cliffLampLibrary(scaleValue: number): { brackets: Mesh[]; lights: Mesh[] } {
  const bracket = merge(
    transform(cylinder(scaleValue * 0.07, scaleValue * 0.52, 7, true), {
      translate: vec3(0, scaleValue * 0.26, 0),
    }),
    transform(cylinder(scaleValue * 0.16, scaleValue * 0.08, 8, true), {
      translate: vec3(0, scaleValue * 0.04, 0),
    }),
  );
  const lightA = transform(icosphere(scaleValue * 0.16, 1), {
    scale: vec3(0.82, 1.2, 0.82),
    translate: vec3(0, scaleValue * 0.6, 0),
  });
  const lightB = transform(cone(scaleValue * 0.18, scaleValue * 0.34, 7, true), {
    translate: vec3(0, scaleValue * 0.57, 0),
  });
  return { brackets: [bracket, transform(bracket, { scale: 0.86 })], lights: [lightA, lightB] };
}

function coloredMarkers(pointCloud: PointCloud, radius: number): { mesh: Mesh; colors: number[] } {
  const meshes: Mesh[] = [];
  const colors: number[] = [];
  const red = pointCloud.attributes["color.r"] ?? [];
  const green = pointCloud.attributes["color.g"] ?? [];
  const blue = pointCloud.attributes["color.b"] ?? [];
  for (let index = 0; index < pointCloud.points.length; index++) {
    const marker = transform(icosphere(radius, 0), { translate: pointCloud.points[index]! });
    meshes.push(marker);
    for (let vertex = 0; vertex < marker.positions.length; vertex++) {
      colors.push(red[index] ?? 1, green[index] ?? 1, blue[index] ?? 1);
    }
  }
  return { mesh: merge(...meshes), colors };
}

function semanticPart(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown>,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: surfaceType, params: surfaceParams },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
