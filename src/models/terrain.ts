/**
 * Procedural terrain island: heightfield landform + river cut + coastline +
 * cliffs + rocks + vegetation proxies.
 *
 * This is a reusable natural-world category, not a one-off displaced plane.
 * Parameters drive macro silhouette (island falloff, mountain height), erosion-
 * style features (river incision, cliff bands) and semantic parts for matched
 * material rendering.
 */
import { vec2, length2, type Vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { fbm2, makeNoise } from "../random/noise.js";
import {
  bounds,
  box,
  cone,
  cylinder,
  merge,
  recomputeNormals,
  sphere,
  transform,
  triangleCount,
  vertexCount,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { makeMesh } from "../geometry/mesh.js";
import { vec2 as makeVec2 } from "../math/vec2.js";

type RGB = [number, number, number];

export interface TerrainIslandParams {
  /** Terrain square width/depth. */
  size: number;
  /** Grid cells per side. */
  resolution: number;
  /** Mountain height multiplier. */
  height: number;
  /** Frequency of the large height noise. */
  noiseScale: number;
  /** Radial island falloff; higher values make sharper coasts. */
  islandFalloff: number;
  /** Water plane height. */
  seaLevel: number;
  /** River corridor width in world units. */
  riverWidth: number;
  /** River down-cut depth. */
  riverDepth: number;
  /** Cliff mask strength on steep/shore slopes. */
  cliffStrength: number;
  /** Scatter count for boulders. */
  rocks: number;
  /** Scatter count for tree/brush proxies. */
  trees: number;
  /** Variant seed. */
  seed: number;
}

export interface TerrainIslandScore {
  score: number;
  metrics: {
    landform: number;
    hydrology: number;
    cliffDetail: number;
    scatterDetail: number;
    materialSeparation: number;
  };
  feedback: string;
}

interface HeightSample {
  height: number;
  river: number;
  cliff: number;
  moisture: number;
}

export const TERRAIN_ISLAND_DEFAULTS: TerrainIslandParams = {
  size: 10,
  resolution: 64,
  height: 2.2,
  noiseScale: 1.25,
  islandFalloff: 1.55,
  seaLevel: 0.05,
  riverWidth: 0.46,
  riverDepth: 0.55,
  cliffStrength: 0.65,
  rocks: 26,
  trees: 52,
  seed: 43,
};

const SAND: RGB = [0.72, 0.62, 0.42];
const GRASS: RGB = [0.24, 0.42, 0.17];
const ROCK: RGB = [0.39, 0.38, 0.34];
const DARK_ROCK: RGB = [0.25, 0.25, 0.24];
const WATER: RGB = [0.28, 0.58, 0.72];
const RIVERBED: RGB = [0.28, 0.22, 0.16];
const BARK: RGB = [0.28, 0.18, 0.1];
const LEAF: RGB = [0.15, 0.36, 0.12];

function surf(
  name: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  return { name, mesh, color, surface: { type, params: { color, ...params } } };
}

function pushMerged(
  parts: NamedPart[],
  name: string,
  meshes: Mesh[],
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): void {
  if (meshes.length > 0) parts.push(surf(name, merge(...meshes), color, type, params));
}

/** Build a parameterized island terrain scene as semantic named parts. */
export function buildTerrainIslandParts(
  params: Partial<TerrainIslandParams> = {},
): NamedPart[] {
  const p: TerrainIslandParams = { ...TERRAIN_ISLAND_DEFAULTS, ...params };
  const size = Math.max(3, p.size);
  const res = Math.max(8, Math.min(160, Math.round(p.resolution)));
  const height = Math.max(0.2, p.height);
  const sea = p.seaLevel;
  const seed = Math.round(p.seed) >>> 0;
  const rng = makeRng(seed);
  const noise = makeNoise(seed);

  const sampler = makeSampler({
    ...p,
    size,
    resolution: res,
    height,
    seed,
  });

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const step = size / res;
  const half = size / 2;

  for (let z = 0; z <= res; z++) {
    const vz = -half + z * step;
    for (let x = 0; x <= res; x++) {
      const vx = -half + x * step;
      const sample = sampler(vx, vz);
      positions.push(vec3(vx, sample.height, vz));
      normals.push(vec3(0, 1, 0));
      uvs.push(makeVec2(x / res, z / res));
      const c = terrainColor(sample, sea);
      colors.push(c[0], c[1], c[2]);
    }
  }

  const stride = res + 1;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const a = z * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const terrain = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  const parts: NamedPart[] = [
    {
      name: "terrain",
      mesh: terrain,
      color: GRASS,
      colors,
      surface: { type: "mossyStone", params: { moss: 0.58, seed } },
    },
  ];

  const water = makeWaterMesh(size * 1.06, sea + 0.01, seed);
  parts.push(surf("water", water, WATER, "water", {
    body: "ocean",
    tint: [0.12, 0.38, 0.58],
    deepColor: [0.012, 0.065, 0.15],
    waveAmplitude: 0.08,
    waveScale: 0.42,
    foamStrength: 0.38,
    seed: seed + 1,
  }));

  const riverbed = makeRiverRibbon(size, sea - 0.035, sea, p.riverWidth * 1.45, sampler, seed);
  if (riverbed) {
    parts.push(surf("riverbed", riverbed, RIVERBED, "sand", { color: RIVERBED, seed: seed + 2 }));
  }

  const cliffMeshes = makeCliffMarkers(size, sampler, p.cliffStrength, seed);
  pushMerged(parts, "cliff_faces", cliffMeshes, DARK_ROCK, "stone", { scale: 9, seed: seed + 3 });

  const rockMeshes = makeRocks(size, sampler, p.rocks, sea, rng);
  pushMerged(parts, "boulders", rockMeshes, ROCK, "stone", { scale: 7, seed: seed + 4 });

  const treeParts = makeTreeProxies(size, sampler, p.trees, sea, rng);
  pushMerged(parts, "tree_trunks", treeParts.trunks, BARK, "bark", { color: BARK, seed: seed + 5 });
  if (treeParts.canopies.length > 0) {
    const leaves = merge(...treeParts.canopies);
    parts.push({
      name: "tree_canopies",
      mesh: leaves,
      color: LEAF,
      surface: { type: "leaf", params: { color: LEAF, seed: seed + 6 } },
      windWeight: leaves.positions.map((v) => (v.y > sea + height * 0.22 ? 1 : 0.35)),
    });
  }

  return parts;
}

export function scoreTerrainIsland(parts: NamedPart[]): TerrainIslandScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const terrain = byName.get("terrain");
  const water = byName.get("water");
  const river = byName.get("riverbed");
  const cliffs = byName.get("cliff_faces");
  const rocks = byName.get("boulders");
  const trees = byName.get("tree_canopies");

  let landform = 0;
  if (terrain) {
    const bb = bounds(terrain.mesh);
    const relief = bb.max.y - bb.min.y;
    landform = clamp01(relief / 1.8) * 0.6 + clamp01(vertexCount(terrain.mesh) / 2500) * 0.4;
  }

  const hydrology = (water ? 0.45 : 0) + (river ? 0.55 : 0);
  const cliffDetail = cliffs ? clamp01(triangleCount(cliffs.mesh) / 80) : 0;
  const scatterDetail =
    (rocks ? 0.45 * clamp01(triangleCount(rocks.mesh) / 250) : 0) +
    (trees ? 0.55 * clamp01(triangleCount(trees.mesh) / 400) : 0);
  const surfaceTypes = new Set(parts.map((p) => p.surface?.type).filter((x): x is string => !!x));
  const materialSeparation = clamp01(surfaceTypes.size / 5);

  const metrics = {
    landform: clamp01(landform),
    hydrology: clamp01(hydrology),
    cliffDetail,
    scatterDetail: clamp01(scatterDetail),
    materialSeparation,
  };
  const score = clamp01(
    metrics.landform * 0.3 +
      metrics.hydrology * 0.22 +
      metrics.cliffDetail * 0.16 +
      metrics.scatterDetail * 0.18 +
      metrics.materialSeparation * 0.14,
  );

  const tips: string[] = [];
  if (metrics.landform < 0.65) tips.push("increase relief or resolution");
  if (metrics.hydrology < 1) tips.push("include sea plane and riverbed");
  if (metrics.cliffDetail < 0.5) tips.push("raise cliffStrength for readable cliff bands");
  if (metrics.scatterDetail < 0.55) tips.push("add rocks and tree proxies");
  if (metrics.materialSeparation < 0.8) tips.push("separate terrain, water, stone, sand and foliage materials");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Reads as a complete island terrain.`;

  return { score, metrics, feedback };
}

function makeSampler(p: TerrainIslandParams): (x: number, z: number) => HeightSample {
  const n = makeNoise(p.seed);
  const ridge = makeNoise(p.seed + 17);
  const riverNoise = makeNoise(p.seed + 31);
  const half = p.size / 2;
  const falloff = Math.max(0.25, p.islandFalloff);
  const noiseScale = Math.max(0.15, p.noiseScale);
  const riverWidth = Math.max(0.05, p.riverWidth);
  const riverDepth = Math.max(0, p.riverDepth);

  return (x: number, z: number): HeightSample => {
    const nx = x / half;
    const nz = z / half;
    const radial = clamp01(1 - Math.pow(length2(vec2(nx, nz)), falloff));
    const macro = fbm2(n, nx * noiseScale + 1.7, nz * noiseScale - 2.3, {
      octaves: 5,
      gain: 0.52,
    }) * 0.5 + 0.5;
    const ridgeValue = 1 - Math.abs(fbm2(ridge, nx * noiseScale * 2.2, nz * noiseScale * 2.2, {
      octaves: 4,
      gain: 0.48,
    }));
    const mountain = Math.pow(radial, 0.65) * (0.58 * macro + 0.42 * ridgeValue);
    const shoreShelf = smoothstep(0.03, 0.35, radial);
    const riverCenter = riverCurveX(z, p.size, riverNoise);
    const riverDist = Math.abs(x - riverCenter);
    const river = 1 - smoothstep(riverWidth * 0.35, riverWidth, riverDist);
    const riverLongitudinal = smoothstep(-half * 0.92, -half * 0.2, z) * (1 - smoothstep(half * 0.55, half * 0.96, z));
    const riverMask = river * riverLongitudinal * shoreShelf;
    const cliffNoise = fbm2(n, nx * 5.0 + 11.3, nz * 5.0 - 4.7, { octaves: 3 }) * 0.5 + 0.5;
    const shoreCliff = smoothstep(0.17, 0.42, radial) * (1 - smoothstep(0.48, 0.74, radial));
    const highCliff = smoothstep(0.58, 0.9, ridgeValue) * smoothstep(0.32, 0.85, radial);
    const cliff = clamp01((shoreCliff * 0.45 + highCliff * 0.55) * cliffNoise * p.cliffStrength);
    let h = p.seaLevel - 0.38 + mountain * p.height * shoreShelf;
    h += cliff * p.height * 0.24;
    h -= riverMask * riverDepth * (0.55 + 0.45 * radial);
    h += fbm2(n, nx * 8.0 - 7.1, nz * 8.0 + 2.6, { octaves: 3 }) * 0.055 * p.height * shoreShelf;
    const moisture = clamp01(riverMask + (1 - radial) * 0.4);
    return { height: h, river: riverMask, cliff, moisture };
  };
}

function terrainColor(sample: HeightSample, seaLevel: number): RGB {
  const beach = 1 - smoothstep(seaLevel + 0.02, seaLevel + 0.35, sample.height);
  const highRock = smoothstep(seaLevel + 0.9, seaLevel + 1.8, sample.height);
  const cliff = sample.cliff;
  let c = mixColor(GRASS, SAND, clamp01(beach));
  c = mixColor(c, ROCK, clamp01(highRock * 0.55 + cliff * 0.8));
  c = mixColor(c, [0.18, 0.36, 0.14], sample.moisture * 0.25);
  return c;
}

function makeWaterMesh(size: number, y: number, seed: number): Mesh {
  const res = 24;
  const half = size / 2;
  const n = makeNoise(seed + 101);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let z = 0; z <= res; z++) {
    for (let x = 0; x <= res; x++) {
      const u = x / res;
      const v = z / res;
      const wx = -half + u * size;
      const wz = -half + v * size;
      const ripple = fbm2(n, u * 6, v * 6, { octaves: 3 }) * 0.015;
      positions.push(vec3(wx, y + ripple, wz));
      normals.push(vec3(0, 1, 0));
      uvs.push(makeVec2(u, v));
    }
  }
  const stride = res + 1;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const a = z * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function makeRiverRibbon(
  size: number,
  y: number,
  seaLevel: number,
  width: number,
  sampler: (x: number, z: number) => HeightSample,
  seed: number,
): Mesh | null {
  const n = makeNoise(seed + 31);
  const half = size / 2;
  const seg = 56;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const active: boolean[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const z = -half * 0.48 + t * size * 0.96;
    const x = riverCurveX(z, size, n);
    const d = clamp(riverCurveDerivative(z, size, n), -1.35, 1.35);
    const inv = 1 / Math.hypot(1, d);
    const nx = inv;
    const nz = -d * inv;
    for (const side of [-1, 1] as const) {
      const px = x + side * nx * width * 0.5;
      const pz = z + side * nz * width * 0.5;
      const h = Math.min(sampler(px, pz).height + 0.025, y);
      positions.push(vec3(px, h, pz));
      normals.push(vec3(0, 1, 0));
      uvs.push(makeVec2(side < 0 ? 0 : 1, t));
    }
    const bankA = sampler(x + nx * width * 0.72, z + nz * width * 0.72);
    const bankB = sampler(x - nx * width * 0.72, z - nz * width * 0.72);
    active.push(Math.max(bankA.height, bankB.height) > seaLevel + 0.05);
  }
  for (let i = 0; i < seg; i++) {
    if (!active[i] || !active[i + 1]) continue;
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  if (indices.length === 0) return null;
  return compactAndRecompute(positions, normals, uvs, indices);
}

function makeCliffMarkers(
  size: number,
  sampler: (x: number, z: number) => HeightSample,
  strength: number,
  seed: number,
): Mesh[] {
  const out: Mesh[] = [];
  const rng = makeRng(seed + 211);
  const count = Math.max(0, Math.round(20 * clamp01(strength)));
  const half = size / 2;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(size * 0.23, size * 0.43);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = sampler(x, z);
    if (s.height < 0.05) continue;
    const h = rng.range(0.4, 0.95) * Math.max(0.5, strength);
    const w = rng.range(0.18, 0.45);
    const slab = transform(box(w, h, 0.08), {
      rotate: vec3(rng.range(-0.18, 0.18), a, rng.range(-0.1, 0.1)),
      translate: vec3(x, Math.max(0.05, s.height - h * 0.28), z),
    });
    if (Math.abs(x) <= half && Math.abs(z) <= half) out.push(slab);
  }
  return out;
}

function makeRocks(
  size: number,
  sampler: (x: number, z: number) => HeightSample,
  countIn: number,
  seaLevel: number,
  rng: ReturnType<typeof makeRng>,
): Mesh[] {
  const out: Mesh[] = [];
  const count = Math.max(0, Math.min(180, Math.round(countIn)));
  const half = size / 2;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * size * 0.42;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    const s = sampler(x, z);
    if (s.height < seaLevel - 0.02 || s.river > 0.55) continue;
    const rad = rng.range(0.07, 0.28) * (1 + s.cliff * 1.4);
    out.push(transform(sphere(rad, 9, 7), {
      scale: vec3(rng.range(0.75, 1.55), rng.range(0.45, 0.9), rng.range(0.75, 1.35)),
      rotate: vec3(rng.range(-0.35, 0.35), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25)),
      translate: vec3(x, s.height + rad * 0.25, z),
    }));
  }
  return out;
}

function makeTreeProxies(
  size: number,
  sampler: (x: number, z: number) => HeightSample,
  countIn: number,
  seaLevel: number,
  rng: ReturnType<typeof makeRng>,
): { trunks: Mesh[]; canopies: Mesh[] } {
  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  const count = Math.max(0, Math.min(240, Math.round(countIn)));
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * size * 0.36;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = sampler(x, z);
    if (s.height < seaLevel + 0.18 || s.cliff > 0.56 || s.river > 0.25) continue;
    const h = rng.range(0.38, 0.82);
    const tr = rng.range(0.025, 0.055);
    trunks.push(transform(cylinder(tr, h, 7, true), { translate: vec3(x, s.height + h / 2, z) }));
    const canopy = rng.next() < 0.62
      ? transform(sphere(h * 0.34, 9, 7), {
          scale: vec3(rng.range(0.9, 1.25), rng.range(0.8, 1.15), rng.range(0.9, 1.25)),
          translate: vec3(x, s.height + h + h * 0.18, z),
        })
      : transform(cone(h * 0.32, h * 0.75, 8, true), {
          translate: vec3(x, s.height + h + h * 0.24, z),
        });
    canopies.push(canopy);
  }
  return { trunks, canopies };
}

function riverCurveX(z: number, size: number, n: { noise2(x: number, y: number): number }): number {
  const u = z / size;
  return (
    Math.sin(u * Math.PI * 2.15 + 0.35) * size * 0.08 +
    Math.sin(u * Math.PI * 4.4 - 1.1) * size * 0.035 +
    n.noise2(u * 3.0, 4.7) * size * 0.035
  );
}

function riverCurveDerivative(z: number, size: number, n: { noise2(x: number, y: number): number }): number {
  const eps = size * 0.004;
  return (riverCurveX(z + eps, size, n) - riverCurveX(z - eps, size, n)) / (2 * eps);
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t);
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function compactAndRecompute(
  positions: Vec3[],
  normals: Vec3[],
  uvs: Vec2[],
  indices: number[],
): Mesh {
  const remap = new Map<number, number>();
  const outPositions: Vec3[] = [];
  const outNormals: Vec3[] = [];
  const outUvs: Vec2[] = [];
  const outIndices: number[] = [];
  for (const idx of indices) {
    let next = remap.get(idx);
    if (next === undefined) {
      next = outPositions.length;
      remap.set(idx, next);
      outPositions.push(positions[idx]!);
      outNormals.push(normals[idx]!);
      outUvs.push(uvs[idx]!);
    }
    outIndices.push(next);
  }
  return recomputeNormals(makeMesh({
    positions: outPositions,
    normals: outNormals,
    uvs: outUvs,
    indices: outIndices,
  }));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
