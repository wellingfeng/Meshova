import { field2DStats } from "../field/index.js";
import { makeRng } from "../random/index.js";
import {
  runTerrainRecipe,
  type TerrainRecipe,
  type TerrainRecipeErosionStep,
  type TerrainRecipeResult,
} from "./recipe.js";

export interface TerrainMutationOptions {
  /** Number of candidates to build. */
  count?: number;
  /** Deterministic mutation seed. */
  seed?: number;
  /** Multiplicative jitter amount. 0.2 means +/-20%. */
  amount?: number;
  /** Vary terrain seeds per candidate. Default true. */
  mutateSeed?: boolean;
}

export interface TerrainMutationMetrics {
  elevationRange: number;
  meanSlope: number;
  maxFlow: number;
  waterCoverage: number;
  meanWear: number;
  meanDeposition: number;
}

export interface TerrainMutationCandidate {
  readonly index: number;
  readonly seed: number;
  readonly recipe: TerrainRecipe;
  readonly result: TerrainRecipeResult;
  readonly metrics: TerrainMutationMetrics;
}

export function mutateTerrain(
  recipe: TerrainRecipe,
  options: TerrainMutationOptions = {},
): TerrainMutationCandidate[] {
  const count = Math.max(1, Math.round(options.count ?? 4));
  const amount = Math.max(0, options.amount ?? 0.18);
  const mutateSeed = options.mutateSeed ?? true;
  const baseSeed = Math.round(recipe.seed ?? recipe.primitive?.seed ?? options.seed ?? 1) >>> 0;
  const rng = makeRng(Math.round(options.seed ?? baseSeed) >>> 0);
  const out: TerrainMutationCandidate[] = [];

  for (let index = 0; index < count; index++) {
    const candidateSeed = mutateSeed ? rng.int(1, 0x7fffffff) : baseSeed;
    const candidate = cloneTerrainRecipe(recipe);
    candidate.seed = candidateSeed;
    candidate.primitive = {
      ...candidate.primitive,
      seed: candidateSeed,
      height: jitter(rng, candidate.primitive?.height ?? 1, amount, 0.01, 20),
      noiseScale: jitter(rng, candidate.primitive?.noiseScale ?? 1.15, amount, 0.01, 64),
      ridgeScale: jitter(rng, candidate.primitive?.ridgeScale ?? 2.35, amount, 0.01, 96),
      ridgeStrength: jitter(rng, candidate.primitive?.ridgeStrength ?? 0.45, amount, 0, 2),
      islandFalloff: jitter(rng, candidate.primitive?.islandFalloff ?? 1.5, amount, 0, 8),
      terraceStrength: jitter(rng, candidate.primitive?.terraceStrength ?? 0, amount, 0, 1),
    };
    if (candidate.layers) {
      candidate.layers = candidate.layers.map((layer, layerIndex) => ({
        ...layer,
        seed: candidateSeed + 1009 * (layerIndex + 1),
        height: jitter(rng, layer.height ?? 1, amount, 0.01, 20),
        noiseScale: jitter(rng, layer.noiseScale ?? 1.15, amount, 0.01, 64),
        ridgeScale: jitter(rng, layer.ridgeScale ?? 2.35, amount, 0.01, 96),
        ridgeStrength: jitter(rng, layer.ridgeStrength ?? 0.45, amount, 0, 2),
        opacity: jitter(rng, layer.opacity ?? 1, amount, 0, 1),
      }));
    }
    const erosion = mutateErosion(candidate.erosion, rng, amount);
    if (erosion) candidate.erosion = erosion;

    const result = runTerrainRecipe(candidate);
    out.push({
      index,
      seed: candidateSeed,
      recipe: candidate,
      result,
      metrics: terrainMutationMetrics(result),
    });
  }

  return out;
}

function mutateErosion(
  erosion: TerrainRecipe["erosion"],
  rng: ReturnType<typeof makeRng>,
  amount: number,
): TerrainRecipe["erosion"] {
  if (!erosion) return undefined;
  if (Array.isArray(erosion)) return erosion.map((step) => mutateErosionStep(step, rng, amount));
  return mutateErosionStep(erosion, rng, amount);
}

function mutateErosionStep(
  step: TerrainRecipeErosionStep,
  rng: ReturnType<typeof makeRng>,
  amount: number,
): TerrainRecipeErosionStep {
  return {
    ...step,
    iterations: Math.max(0, Math.round(jitter(rng, step.iterations ?? 24, amount, 0, 512))),
    hydraulicStrength: jitter(rng, step.hydraulicStrength ?? 0.018, amount, 0, 1),
    thermalStrength: jitter(rng, step.thermalStrength ?? 0.055, amount, 0, 1),
    talus: jitter(rng, step.talus ?? 0.045, amount, 0, 4),
    depositionRate: jitter(rng, step.depositionRate ?? 0.58, amount, 0, 1),
  };
}

function cloneTerrainRecipe(recipe: TerrainRecipe): TerrainRecipe {
  const out: TerrainRecipe = {};
  if (recipe.name !== undefined) out.name = recipe.name;
  if (recipe.seed !== undefined) out.seed = recipe.seed;
  if (recipe.primitive) out.primitive = { ...recipe.primitive };
  if (recipe.layers) out.layers = recipe.layers.map((layer) => ({ ...layer }));
  if (Array.isArray(recipe.erosion)) {
    out.erosion = recipe.erosion.map((step) => ({ ...step }));
  } else if (recipe.erosion) {
    out.erosion = { ...recipe.erosion };
  }
  if (recipe.masks) out.masks = { ...recipe.masks };
  if (recipe.mesh) out.mesh = { ...recipe.mesh };
  return out;
}

function jitter(
  rng: ReturnType<typeof makeRng>,
  value: number,
  amount: number,
  min: number,
  max: number,
): number {
  if (amount <= 0) return Math.min(max, Math.max(min, value));
  const next = value * (1 + rng.range(-amount, amount));
  return Math.min(max, Math.max(min, next));
}

function terrainMutationMetrics(result: TerrainRecipeResult): TerrainMutationMetrics {
  const height = field2DStats(result.fieldSet.fields.height);
  const slope = field2DStats(result.fieldSet.fields.slope);
  const flow = field2DStats(result.fieldSet.fields.flow);
  const water = field2DStats(result.fieldSet.fields.water);
  const wear = field2DStats(result.fieldSet.fields.wear);
  const deposition = field2DStats(result.fieldSet.fields.deposition);
  return {
    elevationRange: height.max - height.min,
    meanSlope: slope.mean,
    maxFlow: flow.max,
    waterCoverage: water.mean,
    meanWear: wear.mean,
    meanDeposition: deposition.mean,
  };
}
