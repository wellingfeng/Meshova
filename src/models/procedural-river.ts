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
  sampleRiverField,
  torus,
  transform,
  type Mesh,
  type NamedPart,
  type RiverSystem2D,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface ProceduralRiverParams {
  size: number;
  resolution: number;
  riverWidth: number;
  riverDepth: number;
  meander: number;
  relief: number;
  bankRocks: number;
  riverBoulders: number;
  trees: number;
  flowStreaks: number;
  seed: number;
}

export const PROCEDURAL_RIVER_DEFAULTS: ProceduralRiverParams = {
  size: 24,
  resolution: 72,
  riverWidth: 1.8,
  riverDepth: 0.75,
  meander: 3.8,
  relief: 3.6,
  bankRocks: 78,
  riverBoulders: 7,
  trees: 108,
  flowStreaks: 24,
  seed: 27,
};

interface RiverSample {
  position: Vec3;
  tangent: Vec3;
  side: Vec3;
  width: number;
  waterY: number;
}

export function buildProceduralRiverParts(
  params: Partial<ProceduralRiverParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const system = buildRiverSystem2D({
    size: p.size,
    resolution: p.resolution,
    riverWidth: p.riverWidth,
    riverDepth: p.riverDepth,
    meander: p.meander,
    terrainHeight: p.relief,
    seed: p.seed,
  });
  const terrain = terrainMesh(system);
  const terrainColors = terrainVertexColors(system);
  const bank = riverRibbon(system, 1.58, -0.015);
  const water = riverRibbon(system, 0.96, 0.035);
  const rng = makeRng(p.seed * 97 + 11);
  const bankRocks = scatterBankRocks(system, p.bankRocks, rng, p.seed);
  const riverbedPebbles = scatterRiverbedPebbles(system, Math.round(p.bankRocks * 1.6), rng, p.seed);
  const boulders = scatterRiverBoulders(system, p.riverBoulders, rng, p.seed);
  const trees = scatterTrees(system, p.trees, rng);
  const understory = scatterBankUnderstory(system, Math.round(p.trees * 1.35), rng);
  const streaks = buildFlowStreaks(system, p.flowStreaks, rng);

  const parts: NamedPart[] = [
    {
      name: "procedural_river_terrain",
      label: "侵蚀山谷地形",
      mesh: terrain,
      color: [0.34, 0.43, 0.23],
      colors: terrainColors,
      surface: {
        type: "mossyStone",
        params: { color: [0.34, 0.43, 0.23], roughness: 0.94, seed: p.seed },
      },
      metadata: {
        source: "BV1jY5J6pETK",
        channels: ["direction", "accumulation", "erosion", "deposition"],
      },
    },
    namedSurface(
      "procedural_river_bank",
      "河床砾石带",
      bank,
      [0.37, 0.34, 0.29],
      "rock",
      { color: [0.37, 0.34, 0.29], roughness: 0.98, seed: p.seed + 1 },
    ),
    {
      ...namedSurface(
        "procedural_river_water",
        "主河流水面",
        water,
        [0.035, 0.29, 0.42],
        "water",
        {
          body: "river",
          tint: [0.07, 0.44, 0.48],
          deepColor: [0.012, 0.095, 0.12],
          roughness: 0.09,
          attenuationDistance: 1.05,
          shallowOpacity: 0.42,
          deepOpacity: 0.88,
          waveAmplitude: 0.012,
          waveScale: 3.2,
          flowSpeed: 1.05,
          foamStrength: 0.52,
          shallowWidth: 0.12,
          seed: p.seed + 17,
        },
      ),
      doubleSided: true,
      metadata: { flow: "centerline", waterBody: "river", seed: p.seed, source: "BV1jY5J6pETK" },
    },
  ];

  if (bankRocks.positions.length > 0) {
    parts.push(namedSurface(
      "procedural_river_bank_rocks",
      "河岸岩石群",
      bankRocks,
      [0.29, 0.3, 0.28],
      "rock",
      { color: [0.29, 0.3, 0.28], roughness: 0.96, seed: p.seed + 2 },
    ));
  }
  if (riverbedPebbles.positions.length > 0) {
    parts.push(namedSurface(
      "procedural_river_bed_pebbles",
      "水下卵石河床",
      riverbedPebbles,
      [0.31, 0.29, 0.25],
      "rock",
      { color: [0.31, 0.29, 0.25], roughness: 0.97, seed: p.seed + 21 },
    ));
  }
  if (boulders.rocks.positions.length > 0) {
    parts.push(namedSurface(
      "procedural_river_boulders",
      "水中巨石",
      boulders.rocks,
      [0.2, 0.22, 0.21],
      "rock",
      { color: [0.2, 0.22, 0.21], roughness: 0.93, seed: p.seed + 3 },
    ));
    parts.push({
      ...namedSurface(
        "procedural_river_boulder_foam",
        "巨石绕流白沫",
        boulders.foam,
        [0.82, 0.94, 0.96],
        "plastic",
        { color: [0.82, 0.94, 0.96], roughness: 0.22, metallic: 0 },
      ),
      doubleSided: true,
    });
  }
  if (streaks.positions.length > 0) {
    parts.push({
      ...namedSurface(
        "procedural_river_flow_streaks",
        "水面流痕",
        streaks,
        [0.55, 0.82, 0.88],
        "plastic",
        { color: [0.55, 0.82, 0.88], roughness: 0.18, metallic: 0 },
      ),
      doubleSided: true,
    });
  }
  if (trees.positions.length > 0) {
    parts.push(namedSurface(
      "procedural_river_riparian_trees",
      "河岸针叶林",
      trees,
      [0.12, 0.27, 0.11],
      "foliage",
      { color: [0.12, 0.27, 0.11], roughness: 0.9, seed: p.seed + 4 },
    ));
  }
  if (understory.positions.length > 0) {
    parts.push(namedSurface(
      "procedural_river_bank_understory",
      "滨水灌草",
      understory,
      [0.18, 0.34, 0.11],
      "foliage",
      { color: [0.18, 0.34, 0.11], roughness: 0.92, seed: p.seed + 5 },
    ));
  }
  return parts;
}

export function scoreProceduralRiver(parts: readonly NamedPart[]): {
  layers: number;
  verts: number;
  tris: number;
  hasWater: boolean;
  hasFoam: boolean;
} {
  let verts = 0;
  let tris = 0;
  for (const part of parts) {
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
  }
  return {
    layers: parts.length,
    verts,
    tris,
    hasWater: parts.some((part) => part.name === "procedural_river_water"),
    hasFoam: parts.some((part) => part.name === "procedural_river_boulder_foam"),
  };
}

function resolveParams(params: Partial<ProceduralRiverParams>): ProceduralRiverParams {
  const p = { ...PROCEDURAL_RIVER_DEFAULTS, ...params };
  return {
    size: Math.max(8, p.size),
    resolution: clampInt(p.resolution, 16, 160),
    riverWidth: Math.max(0.2, p.riverWidth),
    riverDepth: Math.max(0.05, p.riverDepth),
    meander: Math.max(0, p.meander),
    relief: Math.max(0.2, p.relief),
    bankRocks: clampInt(p.bankRocks, 0, 240),
    riverBoulders: clampInt(p.riverBoulders, 0, 40),
    trees: clampInt(p.trees, 0, 320),
    flowStreaks: clampInt(p.flowStreaks, 0, 80),
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
        -system.size * 0.5 + (column / last) * system.size,
        system.terrain[index]!,
        -system.size * 0.5 + (row / last) * system.size,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(column / last, row / last));
    }
  }
  for (let row = 0; row < last; row++) {
    for (let column = 0; column < last; column++) {
      const a = row * system.resolution + column;
      const b = a + 1;
      const c = a + system.resolution;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function terrainVertexColors(system: RiverSystem2D): number[] {
  const colors: number[] = [];
  for (let index = 0; index < system.terrain.length; index++) {
    const wet = system.accumulation[index]!;
    const erosion = system.erosion[index]!;
    const deposition = system.deposition[index]!;
    const height = system.terrain[index]! / Math.max(0.001, system.size * 0.2);
    const rock = clamp01(height * 0.35 + erosion * 0.45);
    colors.push(
      0.19 + rock * 0.2 + deposition * 0.12,
      0.29 + wet * 0.15 - rock * 0.03,
      0.13 + wet * 0.09 + deposition * 0.06,
    );
  }
  return colors;
}

function riverRibbon(system: RiverSystem2D, widthScale: number, yOffset: number): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const points = system.centerline.points;
  const samples = points.map((_, index) => sampleCenterline(system, index / Math.max(1, points.length - 1)));
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    const width = sample.width * widthScale;
    const bend = ribbonBend(samples, index);
    const negativeWidth = bend.turn < 0 ? Math.min(width, bend.radius * 0.5) : width;
    const positiveWidth = bend.turn > 0 ? Math.min(width, bend.radius * 0.5) : width;
    positions.push(
      offsetRiverPoint(sample, sample.side, -negativeWidth, yOffset),
      offsetRiverPoint(sample, sample.side, positiveWidth, yOffset),
    );
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    const textureV = (index / Math.max(1, samples.length - 1)) * 4;
    uvs.push(vec2(0, textureV), vec2(1, textureV));
  }

  for (let index = 0; index < samples.length - 1; index++) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  return makeMesh({ positions, normals, uvs, indices });
}

function ribbonBend(samples: readonly RiverSample[], index: number): { turn: number; radius: number } {
  if (index === 0 || index === samples.length - 1) return { turn: 0, radius: Infinity };
  const previous = samples[index - 1]!.position;
  const current = samples[index]!.position;
  const next = samples[index + 1]!.position;
  const incomingX = current.x - previous.x;
  const incomingZ = current.z - previous.z;
  const outgoingX = next.x - current.x;
  const outgoingZ = next.z - current.z;
  const incomingLength = Math.hypot(incomingX, incomingZ);
  const outgoingLength = Math.hypot(outgoingX, outgoingZ);
  const chordLength = Math.hypot(next.x - previous.x, next.z - previous.z);
  const turn = incomingX * outgoingZ - incomingZ * outgoingX;
  const radius = Math.abs(turn) < 1e-8
    ? Infinity
    : (incomingLength * outgoingLength * chordLength) / (2 * Math.abs(turn));
  return { turn, radius };
}

function offsetRiverPoint(sample: RiverSample, side: Vec3, offset: number, yOffset: number): Vec3 {
  return vec3(
    sample.position.x + side.x * offset,
    sample.waterY + yOffset,
    sample.position.z + side.z * offset,
  );
}

function scatterBankRocks(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
  seed: number,
): Mesh {
  const meshes: Mesh[] = [];
  const dominantSide = seed % 2 === 0 ? -1 : 1;
  for (let index = 0; index < count; index++) {
    const sample = sampleCenterline(system, rng.range(0.04, 0.96));
    const sideSign = rng.next() < 0.72 ? dominantSide : -dominantSide;
    const offset = sample.width * rng.range(1.02, 1.52) + rng.range(0.02, 0.28);
    const x = sample.position.x + sample.side.x * offset * sideSign;
    const z = sample.position.z + sample.side.z * offset * sideSign;
    if (!inside(system, x, z)) continue;
    const radius = rng.range(0.18, 0.58);
    const y = sampleTerrain(system, x, z) - radius * 0.2;
    meshes.push(transform(archetypeRock(index % 5 === 0 ? "strata" : "boulder", {
      seed: seed * 409 + index * 31,
      radius,
      detail: 1,
      roughness: 0.16,
    }), {
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, y, z),
    }));
  }
  return merge(...meshes);
}

function scatterRiverbedPebbles(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
  seed: number,
): Mesh {
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = sampleCenterline(system, rng.range(0.025, 0.975));
    const lateral = rng.range(-sample.width * 0.88, sample.width * 0.88);
    const along = rng.range(-0.24, 0.24);
    const x = sample.position.x + sample.side.x * lateral + sample.tangent.x * along;
    const z = sample.position.z + sample.side.z * lateral + sample.tangent.z * along;
    const radius = rng.range(0.055, 0.22);
    meshes.push(transform(archetypeRock(index % 4 === 0 ? "eroded" : "boulder", {
      seed: seed * 977 + index * 53,
      radius,
      detail: 0,
      roughness: 0.12,
    }), {
      scale: vec3(rng.range(1.1, 1.8), rng.range(0.3, 0.62), rng.range(0.8, 1.35)),
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sampleTerrain(system, x, z) - radius * 0.06, z),
    }));
  }
  return merge(...meshes);
}

function scatterRiverBoulders(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
  seed: number,
): { rocks: Mesh; foam: Mesh } {
  const rocks: Mesh[] = [];
  const foam: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = sampleCenterline(system, (index + 1) / (count + 1) + rng.range(-0.035, 0.035));
    const lateral = rng.range(-sample.width * 0.42, sample.width * 0.42);
    const x = sample.position.x + sample.side.x * lateral;
    const z = sample.position.z + sample.side.z * lateral;
    const radius = Math.min(sample.width * 0.58, rng.range(0.38, 0.82));
    rocks.push(transform(archetypeRock(index % 2 === 0 ? "eroded" : "boulder", {
      seed: seed * 701 + index * 43,
      radius,
      detail: 2,
      roughness: 0.2,
    }), {
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sample.waterY - radius * 0.42, z),
    }));
    foam.push(transform(torus(radius * 0.78, Math.max(0.035, radius * 0.075), 18, 6), {
      scale: vec3(1.45, 1, 0.72),
      rotate: vec3(0, Math.atan2(sample.tangent.x, sample.tangent.z), 0),
      translate: vec3(x, sample.waterY + 0.075, z),
    }));
  }
  return { rocks: merge(...rocks), foam: merge(...foam) };
}

function scatterTrees(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
): Mesh {
  const base = coniferTreeMesh();
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = sampleCenterline(system, rng.range(0.01, 0.99));
    const sideSign = rng.next() < 0.5 ? -1 : 1;
    const offset = sample.width * rng.range(2.1, 4.6) + rng.range(0.3, 2.8);
    const along = rng.range(-0.7, 0.7);
    const x = sample.position.x + sample.side.x * offset * sideSign + sample.tangent.x * along;
    const z = sample.position.z + sample.side.z * offset * sideSign + sample.tangent.z * along;
    if (!inside(system, x, z)) continue;
    const scale = rng.range(0.55, 1.45);
    meshes.push(transform(base, {
      scale: vec3(scale * rng.range(0.85, 1.12), scale, scale * rng.range(0.85, 1.12)),
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sampleTerrain(system, x, z), z),
    }));
  }
  return merge(...meshes);
}

function scatterBankUnderstory(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
): Mesh {
  const base = riparianShrubMesh();
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const sample = sampleCenterline(system, rng.range(0.015, 0.985));
    const sideSign = rng.next() < 0.5 ? -1 : 1;
    const offset = sample.width * rng.range(1.45, 3.0) + rng.range(0.12, 1.15);
    const along = rng.range(-0.45, 0.45);
    const x = sample.position.x + sample.side.x * offset * sideSign + sample.tangent.x * along;
    const z = sample.position.z + sample.side.z * offset * sideSign + sample.tangent.z * along;
    if (!inside(system, x, z)) continue;
    const scale = rng.range(0.35, 0.95);
    meshes.push(transform(base, {
      scale: vec3(scale * rng.range(0.7, 1.25), scale, scale * rng.range(0.7, 1.25)),
      rotate: vec3(0, rng.range(0, Math.PI * 2), 0),
      translate: vec3(x, sampleTerrain(system, x, z), z),
    }));
  }
  return merge(...meshes);
}

function buildFlowStreaks(
  system: RiverSystem2D,
  count: number,
  rng: ReturnType<typeof makeRng>,
): Mesh {
  const meshes: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const start = rng.range(0.035, 0.92);
    const length = rng.range(0.55, 2.4) / system.size;
    const segments = 4 + Math.floor(rng.next() * 4);
    const lateralRatio = rng.range(-0.68, 0.68);
    const width = rng.range(0.018, 0.065);
    const positions: Vec3[] = [];
    const normals: Vec3[] = [];
    const uvs = [];
    const indices: number[] = [];
    for (let segment = 0; segment <= segments; segment++) {
      const progress = segment / segments;
      const sample = sampleCenterline(system, start + length * progress);
      const lateral = sample.width * lateralRatio;
      const taper = Math.sin(progress * Math.PI) * 0.7 + 0.3;
      const halfWidth = width * taper;
      const center = vec3(
        sample.position.x + sample.side.x * lateral,
        sample.waterY + 0.072,
        sample.position.z + sample.side.z * lateral,
      );
      positions.push(
        vec3(center.x - sample.side.x * halfWidth, center.y, center.z - sample.side.z * halfWidth),
        vec3(center.x + sample.side.x * halfWidth, center.y, center.z + sample.side.z * halfWidth),
      );
      normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
      uvs.push(vec2(0, progress), vec2(1, progress));
      if (segment < segments) {
        const base = segment * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    meshes.push(makeMesh({ positions, normals, uvs, indices }));
  }
  return merge(...meshes);
}

function coniferTreeMesh(): Mesh {
  const trunk = transform(cylinder(0.08, 0.85, 7), { translate: vec3(0, 0.425, 0) });
  const lower = transform(cone(0.58, 1.15, 8), { translate: vec3(0, 1.0, 0) });
  const middle = transform(cone(0.45, 1.0, 8), { translate: vec3(0, 1.55, 0) });
  const crown = transform(cone(0.3, 0.82, 8), { translate: vec3(0, 2.02, 0) });
  return merge(trunk, lower, middle, crown);
}

function riparianShrubMesh(): Mesh {
  const stem = transform(cylinder(0.035, 0.58, 5), { translate: vec3(0, 0.29, 0) });
  const lower = transform(cone(0.28, 0.62, 7), { translate: vec3(0, 0.53, 0) });
  const crown = transform(cone(0.2, 0.5, 7), { translate: vec3(0.03, 0.82, -0.02) });
  return merge(stem, lower, crown);
}

function sampleCenterline(system: RiverSystem2D, t: number): RiverSample {
  const points = system.centerline.points;
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = points[index]!;
  const b = points[index + 1]!;
  const tangentA = centerlineTangent(points, index);
  const tangentB = centerlineTangent(points, index + 1);
  const tangentX = tangentA.x + (tangentB.x - tangentA.x) * local;
  const tangentZ = tangentA.z + (tangentB.z - tangentA.z) * local;
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  const position = vec3(
    a.x + (b.x - a.x) * local,
    0,
    a.z + (b.z - a.z) * local,
  );
  const tangent = vec3(tangentX / tangentLength, 0, tangentZ / tangentLength);
  const side = vec3(-tangent.z, 0, tangent.x);
  const width = sampleRiverField(system, system.width, position.x, position.z);
  const terrainY = sampleRiverField(system, system.terrain, position.x, position.z);
  const depth = sampleRiverField(system, system.depth, position.x, position.z);
  return { position, tangent, side, width, waterY: terrainY + depth * 0.72 };
}

function centerlineTangent(points: readonly Vec3[], index: number): Vec3 {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return vec3(dx / length, 0, dz / length);
}

function sampleTerrain(system: RiverSystem2D, x: number, z: number): number {
  return sampleRiverField(system, system.terrain, x, z);
}

function inside(system: RiverSystem2D, x: number, z: number): boolean {
  const edge = system.size * 0.48;
  return Math.abs(x) < edge && Math.abs(z) < edge;
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
