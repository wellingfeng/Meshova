import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  archetypeRock,
  buildRiverSystem2D,
  cone,
  cylinder,
  makeMesh,
  merge,
  recomputeNormals,
  roadRibbon,
  sampleRiverField,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
  type RiverSystem2D,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface PcgBiomeRiverParams {
  size: number;
  resolution: number;
  riverWidth: number;
  meander: number;
  reeds: number;
  dryReeds: number;
  waterLilies: number;
  shrubs: number;
  rocks: number;
  snags: number;
  seed: number;
}

export const PCG_BIOME_RIVER_DEFAULTS: PcgBiomeRiverParams = {
  size: 30,
  resolution: 64,
  riverWidth: 3.4,
  meander: 3.2,
  reeds: 150,
  dryReeds: 54,
  waterLilies: 42,
  shrubs: 28,
  rocks: 18,
  snags: 7,
  seed: 53,
};

interface PathSample {
  position: Vec3;
  tangent: Vec3;
  side: Vec3;
}

export function buildPcgBiomeRiverParts(
  params: Partial<PcgBiomeRiverParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const system = buildRiverSystem2D({
    size: p.size,
    resolution: p.resolution,
    riverWidth: p.riverWidth,
    riverDepth: 0.58,
    meander: p.meander,
    terrainHeight: 0.72,
    points: 11,
    seed: p.seed,
  });
  const waterLevel = 0.55;
  const rng = makeRng(p.seed * 131 + 17);
  const lily = scatterWaterLilies(system, p.waterLilies, waterLevel, rng);
  const greenReeds = scatterReeds(system, p.reeds, false, waterLevel, rng);
  const dryReeds = scatterReeds(system, p.dryReeds, true, waterLevel, rng);

  const parts: NamedPart[] = [
    {
      name: "pcg_biome_river_terrain",
      label: "湿地河谷地形",
      mesh: terrainMesh(system),
      color: [0.3, 0.34, 0.18],
      colors: terrainColors(system),
      surface: { type: "mossyStone", params: { color: [0.3, 0.34, 0.18], roughness: 0.97, seed: p.seed } },
      metadata: { sourceAsset: "PCG_BiomeRiver", stage: "landscape-projection" },
    },
    namedSurface(
      "pcg_biome_river_mud_bank",
      "泥泞河岸带",
      transform(roadRibbon(system.centerline, {
        halfWidth: p.riverWidth * 1.32,
        sampleDistance: 0.45,
        widthSubdivisions: 3,
      }), { translate: vec3(0, waterLevel - 0.06, 0) }),
      [0.24, 0.22, 0.14],
      "soil",
      { color: [0.24, 0.22, 0.14], roughness: 1, seed: p.seed + 1 },
    ),
    {
      ...namedSurface(
        "pcg_biome_river_water",
        "缓流水面",
        transform(roadRibbon(system.centerline, {
          halfWidth: p.riverWidth * 0.94,
          sampleDistance: 0.36,
          widthSubdivisions: 4,
        }), { translate: vec3(0, waterLevel, 0) }),
        [0.12, 0.27, 0.25],
        "water",
        {
          body: "river",
          tint: [0.16, 0.4, 0.34],
          deepColor: [0.035, 0.12, 0.11],
          roughness: 0.16,
          waveAmplitude: 0.012,
          flowSpeed: 0.34,
          foamStrength: 0.08,
          seed: p.seed + 11,
        },
      ),
      doubleSided: true,
      metadata: { sourceAsset: "SM_WaterPlane_Reeds", flow: "spline", waterBody: "river" },
    },
  ];

  addLayer(parts, "pcg_biome_river_reeds", "水边香蒲与芦苇", greenReeds.foliage,
    [0.25, 0.39, 0.12], "foliage", { color: [0.25, 0.39, 0.12], roughness: 0.92, seed: p.seed + 2 }, true);
  addLayer(parts, "pcg_biome_river_dry_reeds", "枯黄香蒲与芦苇", dryReeds.foliage,
    [0.49, 0.39, 0.17], "foliage", { color: [0.49, 0.39, 0.17], roughness: 0.95, seed: p.seed + 3 }, true);
  addLayer(parts, "pcg_biome_river_cattail_heads", "香蒲花穗", combineMeshes(greenReeds.seedHeads, dryReeds.seedHeads),
    [0.24, 0.13, 0.055], "foliage", { color: [0.24, 0.13, 0.055], roughness: 0.96, seed: p.seed + 8 });
  addLayer(parts, "pcg_biome_river_lily_pads", "睡莲叶片", lily.pads,
    [0.16, 0.35, 0.14], "foliage", { color: [0.16, 0.35, 0.14], roughness: 0.78, seed: p.seed + 4 }, true);
  addLayer(parts, "pcg_biome_river_lily_flowers", "睡莲花", lily.flowers,
    [0.88, 0.69, 0.72], "ceramic", { color: [0.88, 0.69, 0.72], roughness: 0.64 }, true);
  addLayer(parts, "pcg_biome_river_shrubs", "河岸槭树灌丛", scatterShrubs(system, p.shrubs, rng),
    [0.15, 0.31, 0.11], "foliage", { color: [0.15, 0.31, 0.11], roughness: 0.9, seed: p.seed + 5 });
  addLayer(parts, "pcg_biome_river_rocks", "河岸岩石", scatterRocks(system, p.rocks, rng, p.seed),
    [0.29, 0.28, 0.24], "rock", { color: [0.29, 0.28, 0.24], roughness: 0.98, seed: p.seed + 6 });
  addLayer(parts, "pcg_biome_river_snags", "漂流枯木", scatterSnags(system, p.snags, waterLevel, rng),
    [0.28, 0.17, 0.08], "wood", { color: [0.28, 0.17, 0.08], roughness: 0.96, seed: p.seed + 7 });

  return parts;
}

export function scorePcgBiomeRiver(parts: readonly NamedPart[]): {
  layers: number;
  verts: number;
  tris: number;
  hasAquaticPlants: boolean;
  hasDebris: boolean;
} {
  return {
    layers: parts.length,
    verts: parts.reduce((sum, part) => sum + part.mesh.positions.length, 0),
    tris: parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0),
    hasAquaticPlants: parts.some((part) => part.name === "pcg_biome_river_reeds")
      && parts.some((part) => part.name === "pcg_biome_river_lily_pads"),
    hasDebris: parts.some((part) => part.name === "pcg_biome_river_snags"),
  };
}

function resolveParams(params: Partial<PcgBiomeRiverParams>): PcgBiomeRiverParams {
  const p = { ...PCG_BIOME_RIVER_DEFAULTS, ...params };
  return {
    size: Math.max(12, p.size),
    resolution: clampInt(p.resolution, 16, 144),
    riverWidth: Math.max(0.8, p.riverWidth),
    meander: Math.max(0, p.meander),
    reeds: clampInt(p.reeds, 0, 360),
    dryReeds: clampInt(p.dryReeds, 0, 180),
    waterLilies: clampInt(p.waterLilies, 0, 160),
    shrubs: clampInt(p.shrubs, 0, 120),
    rocks: clampInt(p.rocks, 0, 100),
    snags: clampInt(p.snags, 0, 40),
    seed: Math.round(p.seed),
  };
}

function terrainMesh(system: RiverSystem2D): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const last = system.resolution - 1;
  for (let row = 0; row < system.resolution; row++) {
    for (let column = 0; column < system.resolution; column++) {
      const index = row * system.resolution + column;
      positions.push(vec3(
        -system.size * 0.5 + column / last * system.size,
        system.terrain[index]!,
        -system.size * 0.5 + row / last * system.size,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(column / last, row / last));
    }
  }
  for (let row = 0; row < last; row++) {
    for (let column = 0; column < last; column++) {
      const first = row * system.resolution + column;
      indices.push(first, first + system.resolution, first + 1);
      indices.push(first + 1, first + system.resolution, first + system.resolution + 1);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function terrainColors(system: RiverSystem2D): number[] {
  const colors: number[] = [];
  for (let index = 0; index < system.terrain.length; index++) {
    const wet = system.accumulation[index]!;
    const deposit = system.deposition[index]!;
    colors.push(
      0.27 - wet * 0.08 + deposit * 0.06,
      0.3 + wet * 0.08,
      0.14 - wet * 0.025,
    );
  }
  return colors;
}

function scatterReeds(
  system: RiverSystem2D,
  count: number,
  dry: boolean,
  waterLevel: number,
  rng: ReturnType<typeof makeRng>,
): { foliage?: Mesh; seedHeads?: Mesh } {
  if (count === 0) return {};
  const base = reedClump(dry);
  const foliage: Mesh[] = [];
  const seedHeads: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = samplePath(system, rng.range(0.015, 0.985));
    const sign = rng.next() < 0.5 ? -1 : 1;
    const distance = system.width[Math.floor(system.width.length * rng.next())]!;
    const band = dry ? rng.range(1.18, 1.72) : rng.range(0.72, 1.35);
    const lateral = Math.max(system.size * 0.035, distance) * band * sign;
    const along = rng.range(-0.55, 0.55);
    const x = sample.position.x + sample.side.x * lateral + sample.tangent.x * along;
    const z = sample.position.z + sample.side.z * lateral + sample.tangent.z * along;
    const terrainY = sampleTerrain(system, x, z);
    const scale = rng.range(dry ? 0.72 : 0.78, dry ? 1.18 : 1.35);
    const placement = {
      scale: vec3(scale * rng.range(0.85, 1.15), scale, scale * rng.range(0.85, 1.15)),
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, Math.max(terrainY, waterLevel - 0.16), z),
    };
    foliage.push(transform(base.foliage, placement));
    seedHeads.push(transform(base.seedHeads, placement));
  }
  return { foliage: merge(...foliage), seedHeads: merge(...seedHeads) };
}

function reedClump(dry: boolean): { foliage: Mesh; seedHeads: Mesh } {
  const stems: Mesh[] = [];
  const seedHeads: Mesh[] = [];
  const offsets = [[0, 0], [0.12, 0.055], [-0.095, 0.075]];
  for (let index = 0; index < offsets.length; index++) {
    const [x, z] = offsets[index]!;
    const height = (dry ? 1.4 : 1.62) * (0.9 + index * 0.045);
    const tiltX = (index - 1) * 0.018;
    const tiltZ = (1 - index) * 0.024;
    stems.push(transform(cylinder(0.014, height, 5, true), {
      rotate: vec3(tiltX, 0, tiltZ),
      translate: vec3(x!, height * 0.5, z!),
    }));
    if (index !== 1) {
      seedHeads.push(transform(cattailHead(), {
        rotate: vec3(tiltX, 0, tiltZ),
        scale: vec3(dry ? 0.9 : 1, dry ? 0.88 : 1, dry ? 0.9 : 1),
        translate: vec3(x!, height - 0.055, z!),
      }));
    }
  }

  const bladeCount = 7;
  for (let index = 0; index < bladeCount; index++) {
    const angle = index / bladeCount * Math.PI * 2 + (index % 2) * 0.17;
    const height = (dry ? 1.05 : 1.28) * (0.76 + (index % 4) * 0.075);
    const bend = (0.16 + (index % 3) * 0.055) * (index % 2 === 0 ? 1 : -1);
    stems.push(transform(reedBlade(height, dry ? 0.032 : 0.04, bend), {
      rotate: vec3(0, angle, 0),
      translate: vec3(Math.cos(angle) * 0.055, 0, Math.sin(angle) * 0.055),
    }));
  }

  return { foliage: merge(...stems), seedHeads: merge(...seedHeads) };
}

function cattailHead(): Mesh {
  const radius = 0.038;
  const halfLength = 0.09;
  return merge(
    cylinder(radius, halfLength * 2, 7, true),
    transform(sphere(radius, 7, 4), {
      scale: vec3(1, 0.58, 1),
      translate: vec3(0, halfLength, 0),
    }),
    transform(sphere(radius, 7, 4), {
      scale: vec3(1, 0.58, 1),
      translate: vec3(0, -halfLength, 0),
    }),
  );
}

function reedBlade(height: number, width: number, bend: number): Mesh {
  const segments = 6;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const center = bend * t * t;
    const halfWidth = Math.max(0.001, width * (1 - t) * (0.35 + Math.sin(Math.PI * t) * 0.65));
    positions.push(vec3(center - halfWidth, height * t, 0), vec3(center + halfWidth, height * t, 0));
    normals.push(vec3(0, 0, 1), vec3(0, 0, 1));
    uvs.push(vec2(0, t), vec2(1, t));
    if (index < segments) {
      const first = index * 2;
      indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function scatterWaterLilies(
  system: RiverSystem2D,
  count: number,
  waterLevel: number,
  rng: ReturnType<typeof makeRng>,
): { pads?: Mesh; flowers?: Mesh } {
  if (count === 0) return {};
  const pad = cylinder(0.24, 0.025, 12);
  const flower = merge(
    transform(cone(0.1, 0.09, 7), { translate: vec3(0, 0.045, 0) }),
    transform(sphere(0.045, 7, 4), { translate: vec3(0, 0.1, 0) }),
  );
  const pads: Mesh[] = [];
  const flowers: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = samplePath(system, rng.range(0.04, 0.96));
    const lateral = rng.range(-system.size * 0.075, system.size * 0.075);
    const x = sample.position.x + sample.side.x * lateral;
    const z = sample.position.z + sample.side.z * lateral;
    const scale = rng.range(0.68, 1.28);
    const rotation = rng.range(0, Math.PI * 2);
    pads.push(transform(pad, {
      scale: vec3(scale * rng.range(0.8, 1.2), 1, scale),
      rotate: vec3(0, rotation, 0),
      translate: vec3(x, waterLevel + 0.025, z),
    }));
    if (index % 4 === 0) {
      flowers.push(transform(flower, {
        scale: vec3(scale, scale, scale),
        translate: vec3(x, waterLevel + 0.045, z),
      }));
    }
  }
  return { pads: merge(...pads), flowers: merge(...flowers) };
}

function scatterShrubs(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
): Mesh | undefined {
  if (count === 0) return undefined;
  const base = shrubMesh();
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = samplePath(system, rng.range(0.02, 0.98));
    const sign = rng.next() < 0.5 ? -1 : 1;
    const lateral = system.size * rng.range(0.13, 0.28) * sign;
    const x = sample.position.x + sample.side.x * lateral + rng.range(-0.8, 0.8);
    const z = sample.position.z + sample.side.z * lateral + rng.range(-0.8, 0.8);
    const scale = rng.range(0.7, 1.45);
    meshes.push(transform(base, {
      scale: vec3(scale * rng.range(0.8, 1.25), scale, scale * rng.range(0.8, 1.25)),
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sampleTerrain(system, x, z), z),
    }));
  }
  return merge(...meshes);
}

function shrubMesh(): Mesh {
  return merge(
    transform(cylinder(0.08, 1.15, 6), { translate: vec3(0, 0.575, 0) }),
    transform(sphere(0.62, 8, 5), { scale: vec3(1.15, 0.85, 0.9), translate: vec3(0, 1.22, 0) }),
    transform(sphere(0.42, 7, 4), { scale: vec3(1, 0.9, 0.85), translate: vec3(0.46, 1.1, 0.08) }),
    transform(sphere(0.38, 7, 4), { scale: vec3(0.9, 1, 1.1), translate: vec3(-0.38, 1.3, -0.12) }),
  );
}

function scatterRocks(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
  seed: number,
): Mesh | undefined {
  if (count === 0) return undefined;
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = samplePath(system, rng.range(0.025, 0.975));
    const sign = rng.next() < 0.5 ? -1 : 1;
    const lateral = system.size * rng.range(0.075, 0.15) * sign;
    const x = sample.position.x + sample.side.x * lateral;
    const z = sample.position.z + sample.side.z * lateral;
    const radius = rng.range(0.22, 0.68);
    meshes.push(transform(archetypeRock(index % 3 === 0 ? "eroded" : "boulder", {
      seed: seed * 211 + index * 37,
      radius,
      detail: 1,
      roughness: 0.18,
    }), {
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sampleTerrain(system, x, z) - radius * 0.18, z),
    }));
  }
  return merge(...meshes);
}

function scatterSnags(
  system: RiverSystem2D,
  count: number,
  waterLevel: number,
  rng: ReturnType<typeof makeRng>,
): Mesh | undefined {
  if (count === 0) return undefined;
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = samplePath(system, (index + 1) / (count + 1) + rng.range(-0.04, 0.04));
    const lateral = rng.range(-system.size * 0.05, system.size * 0.05);
    const length = rng.range(1.2, 2.7);
    const log = merge(
      cylinder(0.12, length, 7),
      transform(cylinder(0.055, length * 0.42, 6), {
        rotate: vec3(0, 0, -0.75),
        translate: vec3(0.12, length * 0.05, 0),
      }),
    );
    meshes.push(transform(log, {
      rotate: vec3(Math.PI * 0.5, Math.atan2(sample.tangent.x, sample.tangent.z) + rng.range(-0.35, 0.35), 0),
      translate: vec3(
        sample.position.x + sample.side.x * lateral,
        waterLevel + 0.08,
        sample.position.z + sample.side.z * lateral,
      ),
    }));
  }
  return merge(...meshes);
}

function samplePath(system: RiverSystem2D, t: number): PathSample {
  const points = system.centerline.points;
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const first = points[index]!;
  const second = points[index + 1]!;
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const length = Math.hypot(dx, dz) || 1;
  const tangent = vec3(dx / length, 0, dz / length);
  return {
    position: vec3(first.x + dx * local, 0, first.z + dz * local),
    tangent,
    side: vec3(-tangent.z, 0, tangent.x),
  };
}

function sampleTerrain(system: RiverSystem2D, x: number, z: number): number {
  return sampleRiverField(system, system.terrain, x, z);
}

function addLayer(
  parts: NamedPart[],
  name: string,
  label: string,
  mesh: Mesh | undefined,
  color: RGB,
  type: string,
  params: Record<string, unknown>,
  doubleSided = false,
): void {
  if (!mesh || mesh.positions.length === 0) return;
  parts.push({ ...namedSurface(name, label, mesh, color, type, params), doubleSided });
}

function combineMeshes(...meshes: Array<Mesh | undefined>): Mesh | undefined {
  const present = meshes.filter((mesh): mesh is Mesh => mesh !== undefined);
  return present.length > 0 ? merge(...present) : undefined;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
