import {
  box,
  buildInstanceBuffers,
  cone,
  cylinder,
  icosphere,
  merge,
  scaleMesh,
  torus,
  transform,
  translateMesh,
  type InstanceBufferGroup,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import { buildPcgForestParts, type PcgForestParams } from "./pcg-forest.js";

type RGB = [number, number, number];

const SOURCE_VIDEO = "https://www.bilibili.com/video/BV1459jBxEzE/";

export type EcosystemFeature =
  | "brush-editor"
  | "biome-blend"
  | "bake-contract"
  | "association-rules"
  | "lod-streaming"
  | "terrain-feedback"
  | "succession";

export interface EcosystemInstance {
  readonly id: string;
  readonly layerId: string;
  readonly assetId: string;
  readonly position: Vec3;
  readonly scale?: number;
  readonly collision?: boolean;
}

export interface EcosystemBrushStroke {
  readonly mode: "add" | "erase" | "density" | "replace";
  readonly center: Vec3;
  readonly radius: number;
  readonly strength: number;
  readonly targetLayer?: string;
  readonly replacementAssetId?: string;
}

export interface BiomeDefinition {
  readonly id: string;
  readonly height: readonly [number, number];
  readonly slope: readonly [number, number];
  readonly moisture: readonly [number, number];
  readonly flow: readonly [number, number];
}

export interface EcosystemEnvironmentSample {
  readonly position: Vec3;
  readonly height: number;
  readonly slope: number;
  readonly moisture: number;
  readonly flow: number;
  readonly erosion?: number;
  readonly sediment?: number;
}

export interface BiomeBlendSample extends EcosystemEnvironmentSample {
  readonly weights: Readonly<Record<string, number>>;
  readonly dominantBiome: string;
}

export interface EcosystemChunkManifest {
  readonly id: string;
  readonly center: Vec3;
  readonly instanceCount: number;
  readonly collisionCount: number;
  readonly layerCounts: Readonly<Record<string, number>>;
}

export interface EcosystemBakeResult {
  readonly schema: "meshova-ecosystem-bake@1";
  readonly previewCount: number;
  readonly instanceBuffers: ReadonlyArray<InstanceBufferGroup>;
  readonly chunks: ReadonlyArray<EcosystemChunkManifest>;
  readonly collisionInstanceIds: ReadonlyArray<string>;
  readonly lodDistances: readonly [number, number, number];
  readonly exportStages: readonly ["preview", "instances", "collision", "lod", "chunks", "export"];
}

export interface EcologicalAssociationRule {
  readonly sourceLayer: string;
  readonly targetLayer: string;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly effect: "prefer" | "exclude";
  readonly strength: number;
}

export interface StreamingTier {
  readonly id: "mesh" | "simplified" | "impostor" | "culled";
  readonly maxDistance: number;
}

export interface EcosystemStreamingDecision {
  readonly chunkId: string;
  readonly distance: number;
  readonly tier: StreamingTier["id"];
  readonly loaded: boolean;
}

export interface TerrainFeedbackSample extends EcosystemEnvironmentSample {
  readonly normalizedHeight: number;
  readonly wetness: number;
  readonly fertility: number;
}

export interface SuccessionState {
  readonly years: number;
  readonly fireSeverity?: number;
  readonly harvestSeverity?: number;
  readonly recoveryYears?: number;
}

export interface SuccessionInstance extends EcosystemInstance {
  readonly visible: boolean;
  readonly growth: number;
  readonly phase: "bare" | "pioneer" | "shrub" | "young-forest" | "mature-forest" | "disturbed";
}

export interface EcosystemFeatureParams {
  density: number;
  season: number;
  seed: number;
}

export const ECOSYSTEM_FEATURE_DEFAULTS: EcosystemFeatureParams = {
  density: 0.72,
  season: 0.2,
  seed: 31,
};

export function applyEcosystemBrushStrokes(
  instances: ReadonlyArray<EcosystemInstance>,
  candidates: ReadonlyArray<EcosystemInstance>,
  strokes: ReadonlyArray<EcosystemBrushStroke>,
  seed = 0,
): EcosystemInstance[] {
  const edited = new Map(instances.map((instance) => [instance.id, instance]));
  strokes.forEach((stroke, strokeIndex) => {
    if (!Number.isFinite(stroke.radius) || stroke.radius <= 0) throw new Error("ecosystem brush radius must be > 0");
    const strength = clamp(stroke.strength, 0, 1);
    if (stroke.mode === "add") {
      for (const candidate of candidates) {
        if (!matchesStroke(candidate, stroke) || edited.has(candidate.id)) continue;
        if (hash01(candidate.id, seed + strokeIndex * 101) <= strength) edited.set(candidate.id, candidate);
      }
      return;
    }
    for (const [id, instance] of [...edited]) {
      if (!matchesStroke(instance, stroke)) continue;
      const random = hash01(id, seed + strokeIndex * 101);
      if (stroke.mode === "erase" && random <= strength) edited.delete(id);
      if (stroke.mode === "density" && random > strength) edited.delete(id);
      if (stroke.mode === "replace" && random <= strength) {
        if (!stroke.replacementAssetId) throw new Error("replace brush needs replacementAssetId");
        edited.set(id, { ...instance, assetId: stroke.replacementAssetId });
      }
    }
  });
  return [...edited.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function blendBiomes(
  samples: ReadonlyArray<EcosystemEnvironmentSample>,
  biomes: ReadonlyArray<BiomeDefinition>,
): BiomeBlendSample[] {
  if (biomes.length === 0) throw new Error("biome blend needs definitions");
  return samples.map((sample) => {
    const raw = biomes.map((biome) =>
      rangeWeight(sample.height, biome.height)
      * rangeWeight(sample.slope, biome.slope)
      * rangeWeight(sample.moisture, biome.moisture)
      * rangeWeight(sample.flow, biome.flow));
    const sum = raw.reduce((total, value) => total + value, 0);
    const normalized = sum > 1e-9 ? raw.map((value) => value / sum) : raw.map((_, index) => index === 0 ? 1 : 0);
    const weights = Object.fromEntries(biomes.map((biome, index) => [biome.id, normalized[index]!]));
    let dominantIndex = 0;
    for (let index = 1; index < normalized.length; index++) {
      if (normalized[index]! > normalized[dominantIndex]!) dominantIndex = index;
    }
    return { ...sample, weights, dominantBiome: biomes[dominantIndex]!.id };
  });
}

export function bakeEcosystem(
  instances: ReadonlyArray<EcosystemInstance>,
  chunkSize: number,
  lodDistances: readonly [number, number, number] = [35, 80, 160],
): EcosystemBakeResult {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) throw new Error("ecosystem bake chunkSize must be > 0");
  const buckets = new Map<string, EcosystemInstance[]>();
  for (const instance of instances) {
    const id = chunkId(instance.position, chunkSize);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(instance);
    else buckets.set(id, [instance]);
  }
  const chunks = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, bucket]) => {
    const layerCounts: Record<string, number> = {};
    let x = 0;
    let y = 0;
    let z = 0;
    let collisionCount = 0;
    for (const instance of bucket) {
      x += instance.position.x;
      y += instance.position.y;
      z += instance.position.z;
      layerCounts[instance.layerId] = (layerCounts[instance.layerId] ?? 0) + 1;
      if (instance.collision) collisionCount += 1;
    }
    return {
      id,
      center: vec3(x / bucket.length, y / bucket.length, z / bucket.length),
      instanceCount: bucket.length,
      collisionCount,
      layerCounts,
    };
  });
  const records = instances.map((instance) => ({
    meshId: instance.assetId,
    materialId: instance.layerId,
    partition: chunkId(instance.position, chunkSize),
    position: instance.position,
    scale: instance.scale ?? 1,
    customData: [instance.collision ? 1 : 0],
    sourceNode: instance.layerId,
  }));
  return {
    schema: "meshova-ecosystem-bake@1",
    previewCount: instances.length,
    instanceBuffers: buildInstanceBuffers(records, { customStride: 1 }),
    chunks,
    collisionInstanceIds: instances.filter((instance) => instance.collision).map((instance) => instance.id),
    lodDistances,
    exportStages: ["preview", "instances", "collision", "lod", "chunks", "export"],
  };
}

export function applyEcologicalAssociations(
  instances: ReadonlyArray<EcosystemInstance>,
  rules: ReadonlyArray<EcologicalAssociationRule>,
  seed = 0,
): EcosystemInstance[] {
  let result = instances.slice();
  rules.forEach((rule, ruleIndex) => {
    const sources = result.filter((instance) => instance.layerId === rule.sourceLayer);
    const strength = clamp(rule.strength, 0, 1);
    result = result.filter((instance) => {
      if (instance.layerId !== rule.targetLayer) return true;
      const associated = sources.some((source) => {
        const distance = distanceXZ(instance.position, source.position);
        return distance >= rule.minDistance && distance <= rule.maxDistance;
      });
      const random = hash01(instance.id, seed + ruleIndex * 211);
      if (rule.effect === "prefer") return associated || random > strength;
      return !associated || random > strength;
    });
  });
  return result;
}

export function planEcosystemStreaming(
  chunks: ReadonlyArray<EcosystemChunkManifest>,
  camera: Vec3,
  tiers: ReadonlyArray<StreamingTier> = [
    { id: "mesh", maxDistance: 35 },
    { id: "simplified", maxDistance: 80 },
    { id: "impostor", maxDistance: 160 },
    { id: "culled", maxDistance: Infinity },
  ],
): EcosystemStreamingDecision[] {
  return chunks.map((chunk) => {
    const distance = distanceXZ(chunk.center, camera);
    const tier = tiers.find((candidate) => distance <= candidate.maxDistance)?.id ?? "culled";
    return { chunkId: chunk.id, distance, tier, loaded: tier !== "culled" };
  });
}

export function deriveTerrainFeedback(
  samples: ReadonlyArray<EcosystemEnvironmentSample>,
): TerrainFeedbackSample[] {
  if (samples.length === 0) return [];
  const heights = samples.map((sample) => sample.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const span = Math.max(1e-6, maxHeight - minHeight);
  return samples.map((sample) => {
    const normalizedHeight = (sample.height - minHeight) / span;
    const wetness = clamp(
      sample.moisture * 0.42 + sample.flow * 0.38 + (sample.sediment ?? 0) * 0.2 - normalizedHeight * 0.18,
      0,
      1,
    );
    const fertility = clamp(
      wetness * 0.48 + (sample.sediment ?? 0) * 0.34 - sample.slope * 0.22 - (sample.erosion ?? 0) * 0.2 + 0.18,
      0,
      1,
    );
    return { ...sample, normalizedHeight, wetness, fertility };
  });
}

export function simulateEcosystemSuccession(
  instances: ReadonlyArray<EcosystemInstance>,
  state: SuccessionState,
): SuccessionInstance[] {
  const disturbance = clamp(Math.max(state.fireSeverity ?? 0, state.harvestSeverity ?? 0), 0, 1);
  const effectiveYears = Math.max(0, state.years - disturbance * 55 + (state.recoveryYears ?? 0));
  const phase = successionPhase(effectiveYears, disturbance);
  const allowed = phaseLayers(phase);
  return instances.map((instance) => {
    const visible = allowed.includes(instance.layerId);
    const maturity = layerMaturity(instance.layerId);
    return {
      ...instance,
      visible,
      growth: visible ? clamp((effectiveYears - maturity) / Math.max(4, maturity * 0.7), 0.2, 1) : 0,
      phase,
    };
  });
}

export function buildEcosystemFeatureParts(
  feature: EcosystemFeature,
  params: Partial<EcosystemFeatureParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  switch (feature) {
    case "brush-editor": return buildBrushShowcase(p);
    case "biome-blend": return buildBiomeShowcase(p);
    case "bake-contract": return buildBakeShowcase(p);
    case "association-rules": return buildAssociationShowcase(p);
    case "lod-streaming": return buildLodShowcase(p);
    case "terrain-feedback": return buildFeedbackShowcase(p);
    case "succession": return buildSuccessionShowcase(p);
  }
}

function buildBrushShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const candidates = gridInstances(17, 17, 1.35, p.seed, (x, z, index) => ({
    id: `brush_${index}`,
    layerId: index % 4 === 0 ? "canopy" : "ground-cover",
    assetId: index % 4 === 0 ? "broadleaf" : "grass",
    position: vec3(x, 0.35, z),
    scale: 0.7 + hash01(`scale_${index}`, p.seed) * 0.45,
    collision: index % 4 === 0,
  }));
  const initial = candidates.filter((_, index) => index % 3 !== 0);
  const strokes: EcosystemBrushStroke[] = [
    { mode: "erase", center: vec3(0, 0, 0), radius: 3.2, strength: 1 },
    { mode: "add", center: vec3(-6, 0, -5), radius: 3.4, strength: p.density, targetLayer: "ground-cover" },
    { mode: "replace", center: vec3(6, 0, 5), radius: 4.2, strength: 1, targetLayer: "canopy", replacementAssetId: "conifer" },
    { mode: "density", center: vec3(-1, 0, 7), radius: 3.6, strength: 0.26, targetLayer: "ground-cover" },
  ];
  const edited = applyEcosystemBrushStrokes(initial, candidates, strokes, p.seed);
  const forest = referenceForestParts("brush", "brush-editor", p, {
    size: 38,
    resolution: 56,
    relief: 3.8,
    candidates: Math.round(760 * p.density),
    spacing: 2.15,
    clumping: 0.48,
    shrubs: 0.95,
    rocks: 0.55,
    deadwood: 0.22,
    pathWidth: 2.5,
  }, { strokes, before: initial.length, after: edited.length });
  return [
    ...forest,
    previewRing("brush_erase_preview", "擦除笔刷范围", 3.2, vec3(0, 3.6, 0), [0.95, 0.22, 0.12]),
    previewRing("brush_add_preview", "补种笔刷范围", 3.4, vec3(-7, 3.2, -5), [0.18, 0.82, 0.3]),
    previewRing("brush_replace_preview", "物种替换范围", 4.2, vec3(7, 3.8, 5), [0.16, 0.52, 0.92]),
  ];
}

function buildBiomeShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const biomes: BiomeDefinition[] = [
    { id: "forest", height: [0.25, 1], slope: [0, 0.8], moisture: [0.25, 0.75], flow: [0, 0.65] },
    { id: "grassland", height: [0.1, 0.8], slope: [0, 0.65], moisture: [0.08, 0.52], flow: [0, 0.45] },
    { id: "wetland", height: [0, 0.45], slope: [0, 0.35], moisture: [0.55, 1], flow: [0.35, 1] },
  ];
  const samples: EcosystemEnvironmentSample[] = [];
  for (let z = -10; z <= 10; z += 1.35) {
    for (let x = -12; x <= 12; x += 1.35) {
      const moisture = clamp((x + 12) / 24 + Math.sin(z * 0.35) * 0.12, 0, 1);
      samples.push({ position: vec3(x, 0.35, z), height: clamp(0.58 - moisture * 0.36 + Math.sin(x * 0.2) * 0.1, 0, 1), slope: Math.abs(Math.sin(z * 0.16)) * 0.45, moisture, flow: moisture * moisture });
    }
  }
  const blended = blendBiomes(samples, biomes);
  const common = { size: 22, resolution: 42, relief: 2.5, pathWidth: 1.5 } as const;
  const grassland = transformParts(recolorCanopy(referenceForestParts("biome_grass", "biome-blend", p, {
    ...common,
    candidates: Math.round(150 * p.density),
    spacing: 3.6,
    clumping: 0.22,
    shrubs: 0.28,
    rocks: 0.32,
    deadwood: 0.04,
    canopy: 0.7,
  }), [0.22, 0.38, 0.075]), vec3(-9, 0, 0), vec3(0.92, 0.92, 0.92));
  const forest = referenceForestParts("biome_forest", "biome-blend", p, {
    ...common,
    candidates: Math.round(560 * p.density),
    spacing: 2.05,
    clumping: 0.5,
    shrubs: 0.95,
    rocks: 0.5,
    deadwood: 0.2,
    canopy: 1.08,
  }, { biomes: biomes.map((biome) => biome.id), blendSamples: blended.length });
  const wetland = transformParts(recolorCanopy(referenceForestParts("biome_wet", "biome-blend", p, {
    ...common,
    relief: 1.2,
    candidates: Math.round(230 * p.density),
    spacing: 2.8,
    clumping: 0.58,
    shrubs: 1,
    rocks: 0.18,
    deadwood: 0.35,
    canopy: 0.86,
  }), [0.055, 0.25, 0.16]).map((part) => part.name.endsWith("forest_path") ? {
    ...part,
    label: "湿地水道",
    color: [0.055, 0.24, 0.24] as RGB,
    surface: { type: "glass", params: { color: [0.055, 0.24, 0.24], roughness: 0.28 } },
  } : part), vec3(9, 0, 0), vec3(0.92, 0.92, 0.92));
  return [
    ...grassland,
    ...forest,
    ...wetland,
  ];
}

function buildBakeShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const instances = gridInstances(12, 12, 2, p.seed, (x, z, index) => ({
    id: `bake_${index}`,
    layerId: index % 4 === 0 ? "canopy" : "ground-cover",
    assetId: index % 4 === 0 ? "tree" : "grass",
    position: vec3(x, 0.35, z),
    scale: 0.75 + hash01(`bake_scale_${index}`, p.seed) * 0.35,
    collision: index % 4 === 0,
  })).filter((_, index) => hash01(`bake_keep_${index}`, p.seed) <= p.density);
  const baked = bakeEcosystem(instances, 6, [22, 48, 92]);
  const forest = referenceForestParts("bake", "bake-contract", p, {
    size: 38,
    resolution: 56,
    relief: 4.2,
    candidates: Math.round(720 * p.density),
    spacing: 2.2,
    clumping: 0.46,
    shrubs: 0.9,
    rocks: 0.52,
    deadwood: 0.22,
    pathWidth: 2.3,
  }, { schema: baked.schema, stages: baked.exportStages, chunks: baked.chunks.length, groups: baked.instanceBuffers.length });
  const guides: Mesh[] = [];
  for (let value = -12; value <= 12; value += 6) {
    guides.push(translateMesh(box(0.055, 0.055, 30), vec3(value, 4.8, 0)));
    guides.push(translateMesh(box(30, 0.055, 0.055), vec3(0, 4.8, value)));
  }
  return [
    ...forest,
    { name: "bake_chunk_guides", label: "分块烘焙边界", mesh: merge(...guides), color: [0.15, 0.65, 0.82], surface: { type: "glass", params: { color: [0.15, 0.65, 0.82], roughness: 0.3 } } },
  ];
}

function buildAssociationShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const rocks: EcosystemInstance[] = [-7, 0, 7].map((x, index) => ({ id: `rock_${index}`, layerId: "rocks", assetId: "rock", position: vec3(x, 0.65, index % 2 ? 3 : -2), scale: 1.2, collision: true }));
  const candidates = gridInstances(18, 12, 1.25, p.seed, (x, z, index) => ({ id: `fern_${index}`, layerId: "fern", assetId: "fern", position: vec3(x, 0.35, z), scale: 0.65 + hash01(`fern_scale_${index}`, p.seed) * 0.5 }));
  const road = gridInstances(16, 1, 1.35, p.seed, (x, _z, index) => ({ id: `road_${index}`, layerId: "road", assetId: "road", position: vec3(x, 0, 0) }));
  const associated = applyEcologicalAssociations([...rocks, ...candidates, ...road], [
    { sourceLayer: "rocks", targetLayer: "fern", minDistance: 0.4, maxDistance: 4.2, effect: "prefer", strength: 0.96 },
    { sourceLayer: "road", targetLayer: "fern", minDistance: 0, maxDistance: 1.8, effect: "exclude", strength: 1 },
  ], p.seed).filter((instance) => instance.layerId !== "road");
  return referenceForestParts("association", "association-rules", p, {
    size: 38,
    resolution: 56,
    relief: 4.5,
    candidates: Math.round(650 * p.density),
    spacing: 2.3,
    clumping: 0.58,
    shrubs: 1,
    rocks: 0.95,
    deadwood: 0.38,
    pathWidth: 2.8,
  }, { sourceRocks: rocks.length, candidates: candidates.length, accepted: associated.length - rocks.length });
}

function buildLodShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const instances: EcosystemInstance[] = [];
  for (let band = 0; band < 4; band++) {
    for (let x = -9; x <= 9; x += 3) {
      instances.push({ id: `lod_${band}_${x}`, layerId: "canopy", assetId: "tree", position: vec3(x, 0.35, -8 + band * 6), scale: 0.85 + hash01(`lod_scale_${band}_${x}`, p.seed) * 0.25, collision: band === 0 });
    }
  }
  const baked = bakeEcosystem(instances, 6, [8, 15, 23]);
  const decisions = planEcosystemStreaming(baked.chunks, vec3(0, 0, -13), [
    { id: "mesh", maxDistance: 8 },
    { id: "simplified", maxDistance: 15 },
    { id: "impostor", maxDistance: 23 },
    { id: "culled", maxDistance: Infinity },
  ]);
  const detailed = instances.filter((instance) => instance.position.z < -4);
  const simplified = instances.filter((instance) => instance.position.z >= -4 && instance.position.z < 4);
  const impostors = instances.filter((instance) => instance.position.z >= 4 && instance.position.z < 10);
  const nearForest = transformParts(referenceForestParts("lod_near", "lod-streaming", p, {
    size: 24,
    resolution: 42,
    relief: 2.8,
    candidates: Math.round(420 * p.density),
    spacing: 1.9,
    clumping: 0.42,
    shrubs: 0.82,
    rocks: 0.4,
    deadwood: 0.18,
    pathWidth: 1.5,
  }, { decisions }), vec3(0, 0, -9), vec3(0.92, 0.92, 0.72));
  return [
    basePart("lod_ground", "LOD 流送地形", 30, 40, [0.13, 0.22, 0.09], { feature: "lod-streaming", decisions }),
    ...nearForest,
    { name: "lod_simplified", label: "中景简化冠层", mesh: merge(...simplified.map((instance) => simpleTree(vec3(instance.position.x, 0.35, instance.position.z + 9), instance.scale ?? 1))), color: [0.1, 0.3, 0.08], surface: { type: "foliage", params: { color: [0.1, 0.3, 0.08], translucency: 0.2 } } },
    { name: "lod_impostors", label: "远景交叉 Impostor", mesh: merge(...impostors.map((instance) => impostorTree(vec3(instance.position.x, 0.35, instance.position.z + 15), instance.scale ?? 1))), color: [0.08, 0.24, 0.07], surface: { type: "foliage", params: { color: [0.08, 0.24, 0.07], translucency: 0.18 } }, doubleSided: true },
    { name: "lod_camera", label: "流送观察点", mesh: translateMesh(cone(0.8, 1.8, 8, true), vec3(0, 1.25, -20)), color: [0.12, 0.65, 1], surface: { type: "glass", params: { color: [0.12, 0.65, 1], roughness: 0.2 } } },
  ];
}

function buildFeedbackShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const samples: EcosystemEnvironmentSample[] = [];
  for (let z = -10; z <= 10; z += 1.25) {
    for (let x = -12; x <= 12; x += 1.25) {
      const riverDistance = Math.abs(x - Math.sin(z * 0.35) * 2.4);
      const flow = clamp(1 - riverDistance / 6, 0, 1);
      samples.push({ position: vec3(x, 0.35 + Math.abs(x) * 0.035, z), height: Math.abs(x) / 12, slope: Math.abs(x) / 18, moisture: flow, flow, erosion: flow * 0.65, sediment: flow * clamp(1 - Math.abs(z) / 14, 0, 1) });
    }
  }
  const feedback = deriveTerrainFeedback(samples);
  return referenceForestParts("feedback", "terrain-feedback", p, {
    size: 40,
    resolution: 64,
    relief: 5.8,
    candidates: Math.round(690 * p.density),
    spacing: 2.25,
    clumping: 0.52,
    shrubs: 1,
    rocks: 0.5,
    deadwood: 0.3,
    pathWidth: 3.1,
  }, { sampleCount: feedback.length, wetCells: feedback.filter((sample) => sample.wetness > 0.58).length }).map((part) => part.name.endsWith("forest_path") ? {
    ...part,
    label: "侵蚀水道与沉积带",
    color: [0.035, 0.28, 0.38] as RGB,
    surface: {
      type: "water",
      params: {
        body: "river",
        tint: [0.08, 0.38, 0.44],
        deepColor: [0.018, 0.1, 0.14],
        roughness: 0.13,
        waveAmplitude: 0.018,
        flowSpeed: 0.72,
        foamStrength: 0.24,
        seed: p.seed + 41,
      },
    },
  } : part);
}

function buildSuccessionShowcase(p: EcosystemFeatureParams): NamedPart[] {
  const years = [0, 4, 14, 36, 90];
  const plotPositions = [
    vec3(-10, 0, -5),
    vec3(0, 0, -5),
    vec3(10, 0, -5),
    vec3(-5, 0, 5),
    vec3(5, 0, 5),
  ];
  const states: SuccessionState[] = years.map((value, index) => index === 3
    ? { years: value, fireSeverity: 0.62, recoveryYears: 8 }
    : { years: value });
  const summaries: Array<{ years: number; phase: string; count: number }> = [];
  const stages: NamedPart[] = [];
  states.forEach((state, plot) => {
    const centerX = -20 + plot * 10;
    const pool: EcosystemInstance[] = [];
    for (let index = 0; index < 28; index++) {
      const layerId = index % 5 === 0 ? "canopy" : index % 3 === 0 ? "understory" : "ground-cover";
      pool.push({ id: `succession_${plot}_${index}`, layerId, assetId: layerId, position: vec3(centerX + (hash01(`sx_${plot}_${index}`, p.seed) - 0.5) * 4.6, 0.4, (hash01(`sz_${plot}_${index}`, p.seed) - 0.5) * 14), scale: 0.55 + hash01(`ss_${plot}_${index}`, p.seed) * 0.6, collision: layerId === "canopy" });
    }
    const simulated = simulateEcosystemSuccession(pool, state);
    const accepted = simulated.filter((instance) => instance.visible && hash01(`keep_${instance.id}`, p.seed) <= p.density).map((instance) => ({ ...instance, scale: (instance.scale ?? 1) * instance.growth }));
    summaries.push({ years: state.years, phase: simulated[0]?.phase ?? "bare", count: accepted.length });
    const treeCandidates = [0, 10, 42, 22, 280][plot]!;
    const shrubs = [0, 0.08, 0.42, 0.18, 1][plot]!;
    const deadwood = [0, 0, 0.08, 0.9, 0.28][plot]!;
    const patch = referenceForestParts(`succession_${plot}`, "succession", p, {
      size: 20,
      resolution: 32,
      relief: 1.8,
      candidates: Math.round(treeCandidates * p.density),
      spacing: plot < 2 ? 3.8 : 2.1,
      clumping: 0.42,
      shrubs,
      rocks: plot === 0 ? 0.05 : 0.25,
      deadwood,
      pathWidth: 0.8,
      canopy: 0.72 + plot * 0.09,
    }, { years: state.years, phase: simulated[0]?.phase ?? "bare" });
    stages.push(...transformParts(patch, plotPositions[plot]!, vec3(0.46, 0.46, 0.46)));
  });
  const summaryPart = stages.find((part) => part.name === "succession_0_forest_terrain");
  if (summaryPart) summaryPart.metadata = { ...summaryPart.metadata, summaries };
  return [
    ...stages,
    previewRing("succession_fire", "火烧恢复区", 1.8, vec3(-5, 1.6, 5), [0.9, 0.24, 0.05]),
  ];
}

function referenceForestParts(
  prefix: string,
  feature: EcosystemFeature,
  p: EcosystemFeatureParams,
  overrides: Partial<PcgForestParams>,
  metadata: Record<string, unknown> = {},
): NamedPart[] {
  const canopyColor = seasonalColor(p.season);
  return buildPcgForestParts({ seed: p.seed, ...overrides }).map((part) => {
    const isTerrain = part.name === "forest_terrain";
    const isCanopy = part.name.startsWith("canopy_");
    const color = isCanopy
      ? shadeColor(canopyColor, part.name.endsWith("2") || part.name.endsWith("4") ? 0.72 : 0.92)
      : part.color;
    const surface = isCanopy && part.surface
      ? { ...part.surface, params: { ...part.surface.params, color, season: p.season } }
      : part.surface;
    const result: NamedPart = {
      ...part,
      name: `${prefix}_${part.name}`,
      ...(color ? { color } : {}),
      ...(surface ? { surface } : {}),
    };
    if (isTerrain) {
      result.metadata = {
        ...part.metadata,
        ...metadata,
        feature,
        sourceVideo: SOURCE_VIDEO,
        visualReference: "terrain-following clustered forest with layered understory",
      };
    }
    return result;
  });
}

function transformParts(parts: ReadonlyArray<NamedPart>, translate: Vec3, scale: Vec3): NamedPart[] {
  return parts.map((part) => ({
    ...part,
    mesh: transform(part.mesh, { translate, scale }),
  }));
}

function recolorCanopy(parts: ReadonlyArray<NamedPart>, color: RGB): NamedPart[] {
  return parts.map((part) => {
    if (!part.name.includes("_canopy_")) return part;
    return {
      ...part,
      color,
      surface: part.surface
        ? { ...part.surface, params: { ...part.surface.params, color } }
        : { type: "foliage", params: { color, translucency: 0.28 } },
    };
  });
}

function previewRing(name: string, label: string, radius: number, position: Vec3, color: RGB): NamedPart {
  return {
    name,
    label,
    mesh: translateMesh(torus(radius, 0.055, 48, 6), position),
    color,
    surface: { type: "glass", params: { color, roughness: 0.22 } },
  };
}

function shadeColor(color: RGB, amount: number): RGB {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function renderInstances(instances: ReadonlyArray<EcosystemInstance>, season: number): NamedPart[] {
  const canopy = instances.filter((instance) => instance.layerId === "canopy");
  const shrubs = instances.filter((instance) => instance.layerId === "understory" || instance.layerId === "fern");
  const ground = instances.filter((instance) => instance.layerId === "ground-cover" || instance.layerId === "wetland");
  const rocks = instances.filter((instance) => instance.layerId === "rocks");
  const parts: NamedPart[] = [];
  if (canopy.length > 0) {
    parts.push({ name: "canopy_wood", label: "乔木骨架", mesh: merge(...canopy.map((instance) => treeWood(instance.position, instance.scale ?? 1))), color: [0.26, 0.13, 0.055], metadata: { instanceCount: canopy.length } });
    parts.push({ name: "canopy_foliage", label: "乔木冠层", mesh: merge(...canopy.map((instance) => treeFoliage(instance.position, instance.scale ?? 1, instance.assetId === "conifer"))), color: seasonalColor(season), metadata: { instanceCount: canopy.length } });
  }
  if (shrubs.length > 0) parts.push({ name: "understory", label: "林下灌草", mesh: merge(...shrubs.map((instance) => shrubMesh(instance.position, instance.scale ?? 1))), color: [0.16, 0.42, 0.1], metadata: { instanceCount: shrubs.length } });
  if (ground.length > 0) parts.push({ name: "ground_cover", label: "草本与湿地层", mesh: merge(...ground.map((instance) => grassMesh(instance.position, instance.scale ?? 1, instance.layerId === "wetland"))), color: [0.29, 0.53, 0.11], metadata: { instanceCount: ground.length } });
  if (rocks.length > 0) parts.push({ name: "ecosystem_rocks", label: "关联岩石", mesh: merge(...rocks.map((instance) => rockMesh(instance.position, instance.scale ?? 1))), color: [0.34, 0.36, 0.31], metadata: { instanceCount: rocks.length } });
  return parts;
}

function treeWood(position: Vec3, scale: number): Mesh {
  return transform(cylinder(0.18, 3.6, 7, true), { translate: vec3(position.x, position.y + 1.8 * scale, position.z), scale: vec3(scale, scale, scale) });
}

function treeFoliage(position: Vec3, scale: number, conifer: boolean): Mesh {
  if (conifer) return transform(cone(1.35, 4.1, 9, true), { translate: vec3(position.x, position.y + 3.7 * scale, position.z), scale: vec3(scale, scale, scale) });
  const crown = merge(
    translateMesh(scaleMesh(icosphere(1.25, 1), vec3(1.15, 0.86, 1)), vec3(-0.35, 0, 0)),
    translateMesh(scaleMesh(icosphere(1.1, 1), vec3(1, 1, 1.05)), vec3(0.55, 0.25, 0.1)),
  );
  return transform(crown, { translate: vec3(position.x, position.y + 3.8 * scale, position.z), scale: vec3(scale, scale, scale) });
}

function simpleTree(position: Vec3, scale: number): Mesh {
  return transform(cone(1.2, 4.4, 7, true), { translate: vec3(position.x, position.y + 2.2 * scale, position.z), scale: vec3(scale, scale, scale) });
}

function impostorTree(position: Vec3, scale: number): Mesh {
  const card = box(2.5, 4.8, 0.05);
  return merge(
    transform(card, { translate: vec3(position.x, position.y + 2.4 * scale, position.z), scale: vec3(scale, scale, scale) }),
    transform(card, { rotate: vec3(0, Math.PI * 0.5, 0), translate: vec3(position.x, position.y + 2.4 * scale, position.z), scale: vec3(scale, scale, scale) }),
  );
}

function shrubMesh(position: Vec3, scale: number): Mesh {
  return transform(scaleMesh(icosphere(0.58, 1), vec3(1.2, 0.7, 1)), { translate: vec3(position.x, position.y + 0.42 * scale, position.z), scale: vec3(scale, scale, scale) });
}

function grassMesh(position: Vec3, scale: number, reed: boolean): Mesh {
  const mesh = reed ? cylinder(0.045, 1.5, 5, true) : cone(0.16, 0.72, 4, true);
  return transform(mesh, { translate: vec3(position.x, position.y + (reed ? 0.75 : 0.36) * scale, position.z), scale: vec3(scale, scale, scale) });
}

function rockMesh(position: Vec3, scale: number): Mesh {
  return transform(scaleMesh(icosphere(0.8, 1), vec3(1.25, 0.72, 1)), { translate: position, scale: vec3(scale, scale, scale) });
}

function basePart(name: string, label: string, width: number, depth: number, color: RGB, metadata: Record<string, unknown>): NamedPart {
  return { name, label, mesh: translateMesh(box(width, 0.3, depth), vec3(0, -0.15, 0)), color, metadata };
}

function gridInstances(
  columns: number,
  rows: number,
  spacing: number,
  seed: number,
  factory: (x: number, z: number, index: number) => EcosystemInstance,
): EcosystemInstance[] {
  const rng = makeRng(seed);
  const instances: EcosystemInstance[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = (column - (columns - 1) * 0.5) * spacing + rng.range(-spacing * 0.28, spacing * 0.28);
      const z = (row - (rows - 1) * 0.5) * spacing + rng.range(-spacing * 0.28, spacing * 0.28);
      instances.push(factory(x, z, index));
    }
  }
  return instances;
}

function matchesStroke(instance: EcosystemInstance, stroke: EcosystemBrushStroke): boolean {
  return (!stroke.targetLayer || instance.layerId === stroke.targetLayer)
    && distanceXZ(instance.position, stroke.center) <= stroke.radius;
}

function rangeWeight(value: number, range: readonly [number, number]): number {
  const min = Math.min(range[0], range[1]);
  const max = Math.max(range[0], range[1]);
  const feather = Math.max(0.05, (max - min) * 0.35);
  if (value < min) return clamp(1 - (min - value) / feather, 0, 1);
  if (value > max) return clamp(1 - (value - max) / feather, 0, 1);
  const edgeDistance = Math.min(value - min, max - value);
  return clamp(0.55 + edgeDistance / feather, 0.55, 1);
}

function successionPhase(years: number, disturbance: number): SuccessionInstance["phase"] {
  if (disturbance > 0.45 && years < 12) return "disturbed";
  if (years < 2) return "bare";
  if (years < 8) return "pioneer";
  if (years < 22) return "shrub";
  if (years < 60) return "young-forest";
  return "mature-forest";
}

function phaseLayers(phase: SuccessionInstance["phase"]): string[] {
  if (phase === "bare" || phase === "disturbed") return [];
  if (phase === "pioneer") return ["ground-cover"];
  if (phase === "shrub") return ["ground-cover", "understory"];
  return ["ground-cover", "understory", "canopy"];
}

function layerMaturity(layerId: string): number {
  if (layerId === "canopy") return 18;
  if (layerId === "understory") return 6;
  return 1;
}

function chunkId(position: Vec3, chunkSize: number): string {
  return `chunk_${Math.floor(position.x / chunkSize)}_${Math.floor(position.z / chunkSize)}`;
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function hash01(id: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function seasonalColor(season: number): RGB {
  const t = clamp((season - 0.35) / 0.65, 0, 1);
  return [0.12 + 0.52 * t, 0.38 - 0.08 * t, 0.09 - 0.03 * t];
}

function resolveParams(params: Partial<EcosystemFeatureParams>): EcosystemFeatureParams {
  const p = { ...ECOSYSTEM_FEATURE_DEFAULTS, ...params };
  return { density: clamp(p.density, 0.1, 1), season: clamp(p.season, 0, 1), seed: Math.round(p.seed) >>> 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
