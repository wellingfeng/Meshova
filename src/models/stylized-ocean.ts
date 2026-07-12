import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  plane,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { palm } from "../vegetation/plant.js";
import { buildCloudParts } from "./cloud.js";
import { buildCropoutIslandParts } from "./cropout-island.js";

type RGB = [number, number, number];

export interface StylizedOceanEnvironmentParams {
  worldSize: number;
  islandScale: number;
  islandCount: number;
  palmCount: number;
  cloudCount: number;
  waveHeight: number;
  foamStrength: number;
  seed: number;
}

export const STYLIZED_OCEAN_DEFAULTS: StylizedOceanEnvironmentParams = {
  worldSize: 140,
  islandScale: 1,
  islandCount: 3,
  palmCount: 9,
  cloudCount: 4,
  waveHeight: 0.22,
  foamStrength: 0.82,
  seed: 812,
};

interface IslandSpec {
  key: string;
  label: string;
  x: number;
  z: number;
  size: number;
  stretch: number;
  trees: number;
  rocks: number;
  seed: number;
}

const OCEAN: RGB = [0.025, 0.55, 0.68];
const DEEP_OCEAN: RGB = [0.008, 0.16, 0.3];
const SEAFLOOR: RGB = [0.18, 0.55, 0.48];
const PALM_WOOD: RGB = [0.34, 0.19, 0.075];
const PALM_LEAF: RGB = [0.15, 0.62, 0.28];
const BOAT_RED: RGB = [0.78, 0.18, 0.12];
const BOAT_WOOD: RGB = [0.32, 0.16, 0.07];
const SAIL: RGB = [0.98, 0.88, 0.57];
const FISH: RGB = [0.98, 0.54, 0.16];

export function buildStylizedOceanEnvironmentParts(
  params: Partial<StylizedOceanEnvironmentParams> = {},
): NamedPart[] {
  const resolved = resolveParams(params);
  const rng = makeRng(resolved.seed);
  const waterLevel = -0.46;
  const islandSpecs = makeIslandSpecs(resolved);
  const visibleIslands = islandSpecs.slice(0, resolved.islandCount);
  const parts: NamedPart[] = [
    {
      name: "stylized_ocean_floor",
      label: "浅海沙床",
      mesh: transform(plane(resolved.worldSize, resolved.worldSize, 2, 2), {
        translate: vec3(0, waterLevel - 3.2, 0),
      }),
      color: SEAFLOOR,
      surface: { type: "sand", params: { color: SEAFLOOR, grainScale: 4, seed: resolved.seed + 1 } },
    },
    {
      name: "stylized_ocean_surface",
      label: "风格化广阔海面",
      mesh: transform(plane(resolved.worldSize, resolved.worldSize, 128, 128), {
        translate: vec3(0, waterLevel, 0),
      }),
      color: OCEAN,
      surface: {
        type: "water",
        params: {
          body: "ocean",
          tint: OCEAN,
          deepColor: DEEP_OCEAN,
          roughness: 0.055,
          waveAmplitude: resolved.waveHeight,
          waveScale: 0.42,
          flowSpeed: 0.7,
          foamStrength: resolved.foamStrength,
          shallowWidth: 0.15,
          shallowOpacity: 0.56,
          deepOpacity: 0.96,
          seed: resolved.seed + 2,
        },
      },
      metadata: {
        renderFx: "stylized-ocean",
        waterLevel,
        source: "BV1TqM76nEWf",
        islandMasks: visibleIslands.map((island) => ({
          x: island.x,
          z: island.z,
          radiusX: island.size * 0.39 * Math.sqrt(island.stretch),
          radiusZ: island.size * 0.39 / Math.sqrt(island.stretch),
        })),
      },
    },
  ];

  for (const island of visibleIslands) {
    const islandParts = buildCropoutIslandParts({
      size: island.size,
      islandCount: 1,
      lobeCount: 9,
      segments: 96,
      stretch: island.stretch,
      coastWidth: 0.72,
      terraceHeight: 1,
      trees: island.trees,
      rocks: island.rocks,
      seed: island.seed,
    });
    for (const islandPart of islandParts) {
      if (islandPart.name === "cropout_ocean") continue;
      parts.push({
        ...islandPart,
        name: `${island.key}_${islandPart.name.replace("cropout_", "")}`,
        label: `${island.label}·${islandPart.label ?? islandPart.name}`,
        mesh: transform(islandPart.mesh, { translate: vec3(island.x, 0, island.z) }),
        metadata: {
          ...(islandPart.metadata ?? {}),
          island: island.key,
          fxRole: islandPart.name === "cropout_foam" ? "shore-foam" : "island",
        },
      });
    }
  }

  addPalms(parts, visibleIslands, resolved, rng);
  addClouds(parts, resolved, rng);
  parts.push(...buildBoatParts());
  parts.push(...buildFishParts());
  return parts;
}

function resolveParams(params: Partial<StylizedOceanEnvironmentParams>): StylizedOceanEnvironmentParams {
  const merged = { ...STYLIZED_OCEAN_DEFAULTS, ...params };
  return {
    worldSize: clamp(merged.worldSize, 56, 180),
    islandScale: clamp(merged.islandScale, 0.6, 1.5),
    islandCount: clampInt(merged.islandCount, 1, 3),
    palmCount: clampInt(merged.palmCount, 0, 24),
    cloudCount: clampInt(merged.cloudCount, 0, 6),
    waveHeight: clamp(merged.waveHeight, 0.02, 0.6),
    foamStrength: clamp(merged.foamStrength, 0, 1),
    seed: Math.round(merged.seed) >>> 0,
  };
}

function makeIslandSpecs(params: StylizedOceanEnvironmentParams): IslandSpec[] {
  const scale = params.islandScale;
  return [
    { key: "sunset_island", label: "主岛", x: -18, z: -5, size: 21 * scale, stretch: 1.18, trees: 8, rocks: 8, seed: params.seed + 11 },
    { key: "lagoon_island", label: "泻湖岛", x: 18, z: 12, size: 13 * scale, stretch: 1.32, trees: 5, rocks: 5, seed: params.seed + 29 },
    { key: "reef_island", label: "礁石岛", x: 23, z: -19, size: 9 * scale, stretch: 0.92, trees: 2, rocks: 7, seed: params.seed + 47 },
  ];
}

function addPalms(
  parts: NamedPart[],
  islands: IslandSpec[],
  params: StylizedOceanEnvironmentParams,
  rng: ReturnType<typeof makeRng>,
): void {
  if (params.palmCount === 0) return;
  const wood: Mesh[] = [];
  const leaves: Mesh[] = [];
  for (let index = 0; index < params.palmCount; index++) {
    const island = islands[index % islands.length]!;
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(0.8, island.size * 0.16);
    const height = rng.range(2.15, 3.35) * params.islandScale;
    const generated = palm({
      seed: params.seed + 101 + index * 17,
      height,
      trunkRadius: height * 0.035,
      fronds: 7,
      frondLength: height * 0.34,
      leafletPairs: 8,
      lean: rng.range(-0.24, 0.34),
    });
    const transformOptions = {
      translate: vec3(island.x + Math.cos(angle) * radius, 0.22, island.z + Math.sin(angle) * radius),
      rotate: vec3(0, rng.range(-Math.PI, Math.PI), 0),
    };
    wood.push(transform(generated.wood, transformOptions));
    leaves.push(transform(generated.leaves, transformOptions));
  }
  parts.push({
    name: "ocean_palm_trunks",
    label: "海岛棕榈树干",
    mesh: merge(...wood),
    color: PALM_WOOD,
    surface: { type: "bark", params: { color: PALM_WOOD, seed: params.seed + 151 } },
    metadata: { fxRole: "island" },
  });
  parts.push({
    name: "ocean_palm_fronds",
    label: "海岛棕榈叶",
    mesh: merge(...leaves),
    color: PALM_LEAF,
    surface: { type: "leaf", params: { color: PALM_LEAF, seed: params.seed + 152 } },
    doubleSided: true,
    metadata: { fxRole: "island" },
  });
}

function addClouds(
  parts: NamedPart[],
  params: StylizedOceanEnvironmentParams,
  rng: ReturnType<typeof makeRng>,
): void {
  const positions = [
    [-31, 13, -20],
    [28, 15, -12],
    [-9, 16, 24],
    [35, 12, 22],
    [-37, 17, 13],
    [5, 14, -27],
  ] as const;
  for (let index = 0; index < params.cloudCount; index++) {
    const cloudPart = buildCloudParts({
      seed: params.seed + 211 + index * 23,
      size: rng.range(1.45, 2.35),
      blobs: 7 + index % 4,
      flatten: rng.range(0.42, 0.68),
      resolution: 24,
      smooth: 0,
      puff: 0.08,
      puffScale: 1.4,
    })[0]!;
    const position = positions[index]!;
    parts.push({
      ...cloudPart,
      name: `ocean_cloud_${index + 1}`,
      label: `漂浮积云 ${index + 1}`,
      mesh: transform(cloudPart.mesh, {
        translate: vec3(position[0], position[1], position[2]),
        scale: vec3(rng.range(1.2, 1.8), rng.range(0.8, 1.15), rng.range(1.1, 1.55)),
      }),
      metadata: { fxRole: "ocean-cloud", drift: rng.range(0.35, 0.7), index },
    });
  }
}

function buildBoatParts(): NamedPart[] {
  const boatMetadata = { fxRole: "ocean-boat" };
  const hull = merge(
    transform(icosphere(1, 2), { scale: vec3(1.75, 0.38, 0.72), translate: vec3(0, 0.08, 0) }),
    transform(box(1.85, 0.14, 0.92), { translate: vec3(0, 0.31, -0.03) }),
  );
  const sail = makeMesh({
    positions: [vec3(0.04, 0.62, 0), vec3(0.04, 2.12, 0), vec3(1.05, 0.82, 0)],
    normals: [vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1)],
    uvs: [vec2(0, 0), vec2(0, 1), vec2(1, 0)],
    indices: [0, 1, 2, 0, 2, 1],
  });
  return [
    { name: "ocean_boat_hull", label: "航行小船·船体", mesh: hull, color: BOAT_RED, surface: { type: "paintedWood", params: { color: BOAT_RED } }, metadata: boatMetadata },
    { name: "ocean_boat_deck", label: "航行小船·甲板", mesh: transform(box(1.05, 0.12, 0.62), { translate: vec3(-0.18, 0.45, -0.05) }), color: BOAT_WOOD, surface: { type: "wood", params: { color: BOAT_WOOD } }, metadata: boatMetadata },
    { name: "ocean_boat_mast", label: "航行小船·桅杆", mesh: transform(cylinder(0.045, 1.9, 8, true), { translate: vec3(0.03, 1.25, 0) }), color: BOAT_WOOD, surface: { type: "wood", params: { color: BOAT_WOOD } }, metadata: boatMetadata },
    { name: "ocean_boat_sail", label: "航行小船·船帆", mesh: sail, color: SAIL, surface: { type: "fabric", params: { color: SAIL } }, doubleSided: true, metadata: boatMetadata },
  ];
}

function buildFishParts(): NamedPart[] {
  const parts: NamedPart[] = [];
  for (let index = 0; index < 3; index++) {
    const body = transform(icosphere(0.42, 1), { scale: vec3(1.35, 0.62, 0.55) });
    const tail = transform(cone(0.28, 0.52, 6, true), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(-0.68, 0, 0),
    });
    parts.push({
      name: `ocean_fish_${index + 1}`,
      label: `跃出水面的鱼 ${index + 1}`,
      mesh: transform(merge(body, tail), {
        rotate: vec3(0, index * 0.07, 0),
        translate: vec3(0, index * 0.03, 0),
      }),
      color: FISH,
      surface: { type: "plastic", params: { color: FISH, roughness: 0.28 } },
      metadata: { fxRole: "ocean-fish", index },
    });
  }
  return parts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
