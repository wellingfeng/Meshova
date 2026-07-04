import {
  combineField2D,
  makeField2D,
  type Field2D,
  type Field2DCombineMode,
} from "../field/index.js";
import { clamp } from "../math/scalar.js";
import { type Mesh } from "../geometry/index.js";
import {
  deriveTerrainMasks,
  erodeTerrainHeightfield,
  heightfieldToTerrainMesh,
  makeTerrainPrimitiveField,
  terrainVertexColors,
  type TerrainErosionOptions,
  type TerrainMaskOptions,
  type TerrainPrimitiveOptions,
} from "./heightfield.js";
import {
  makeTerrainFieldSet,
  terrainMasksFromFieldSet,
  type TerrainFieldSet,
  type TerrainMaskFieldName,
  type TerrainMaskMap,
} from "./field-set.js";

export type TerrainRecipeMaskSource =
  | TerrainMaskFieldName
  | Field2D
  | ((context: TerrainRecipeContext) => Field2D);

export interface TerrainRecipeLayer extends TerrainPrimitiveOptions {
  /** Combine mode applied over current height. Default add. */
  mode?: Field2DCombineMode;
  /** Foreground opacity. */
  opacity?: number;
  /** Optional data-map mask. */
  mask?: TerrainRecipeMaskSource;
  /** Clamp combined height to [0,1]. Default false. */
  clampOutput?: boolean;
}

export interface TerrainRecipeErosionStep extends Omit<TerrainErosionOptions, "rain"> {
  /** Scalar rain, field, or data-map source for selective erosion. */
  rain?: number | TerrainRecipeMaskSource;
}

export interface TerrainRecipeMeshOptions {
  size?: number;
  heightScale?: number;
  baseY?: number;
}

export interface TerrainRecipe {
  name?: string;
  seed?: number;
  primitive?: TerrainPrimitiveOptions;
  layers?: TerrainRecipeLayer[];
  erosion?: TerrainRecipeErosionStep | TerrainRecipeErosionStep[];
  masks?: TerrainMaskOptions;
  mesh?: TerrainRecipeMeshOptions;
}

export interface TerrainRecipeContext {
  readonly height: Field2D;
  readonly fieldSet: TerrainFieldSet;
}

export interface TerrainRecipeResult {
  readonly recipe: TerrainRecipe;
  readonly fieldSet: TerrainFieldSet;
  readonly mesh: Mesh;
  /** Per-vertex RGB triples matching mesh.positions. */
  readonly colors: number[];
}

export function runTerrainRecipe(recipe: TerrainRecipe = {}): TerrainRecipeResult {
  const seed = Math.round(recipe.seed ?? recipe.primitive?.seed ?? 1) >>> 0;
  const primitiveOptions: TerrainPrimitiveOptions = {
    ...recipe.primitive,
    seed: recipe.primitive?.seed ?? seed,
  };
  let height = makeTerrainPrimitiveField(primitiveOptions);
  let erosionWear = makeField2D(height.width, height.height);
  let erosionDeposition = makeField2D(height.width, height.height);
  let erosionFlow = makeField2D(height.width, height.height);

  for (const [index, layer] of (recipe.layers ?? []).entries()) {
    const context = terrainRecipeContext(height, recipe.masks);
    const layerField = makeTerrainPrimitiveField({
      ...layer,
      resolution: layer.resolution ?? height.width - 1,
      seed: layer.seed ?? seed + 1009 * (index + 1),
    });
    const combineOptions = {
      mode: layer.mode ?? "add",
      opacity: layer.opacity ?? 1,
      clampOutput: layer.clampOutput ?? false,
    };
    const mask = resolveTerrainRecipeMask(layer.mask, context);
    height = combineField2D(layerField, height, mask ? { ...combineOptions, mask } : combineOptions);
  }

  for (const step of terrainErosionSteps(recipe.erosion)) {
    const context = terrainRecipeContext(height, recipe.masks);
    const eroded = erodeTerrainHeightfield(height, {
      ...step,
      rain: resolveTerrainRecipeRain(step.rain, context),
    });
    height = eroded.height;
    erosionWear = maxField(erosionWear, eroded.wear);
    erosionDeposition = maxField(erosionDeposition, eroded.deposition);
    erosionFlow = maxField(erosionFlow, eroded.flow);
  }

  const masks = deriveTerrainMasks(height, recipe.masks);
  const fieldSet = makeTerrainFieldSet(height, mergeErosionMaps(masks, {
    flow: erosionFlow,
    wear: erosionWear,
    deposition: erosionDeposition,
  }));
  const mesh = heightfieldToTerrainMesh(height, recipe.mesh);
  const colors = terrainVertexColors(height, terrainMasksFromFieldSet(fieldSet));
  return { recipe, fieldSet, mesh, colors };
}

export function makeTerrainRecipe(name: string, recipe: Omit<TerrainRecipe, "name">): TerrainRecipe {
  return { ...recipe, name };
}

export function alpineTerrainRecipe(seed = 1): TerrainRecipe {
  return makeTerrainRecipe("alpine", {
    seed,
    primitive: {
      resolution: 128,
      height: 2.4,
      noiseScale: 0.95,
      ridgeScale: 2.9,
      ridgeStrength: 0.72,
      islandFalloff: 0.35,
      terraceStrength: 0.08,
    },
    erosion: [
      { iterations: 20, hydraulicStrength: 0.016, thermalStrength: 0.05, talus: 0.045 },
      { iterations: 8, hydraulicStrength: 0.009, thermalStrength: 0.08, talus: 0.03 },
    ],
    masks: { size: 12, waterLevel: 0.22, shoreWidth: 0.05 },
    mesh: { size: 12 },
  });
}

export function islandTerrainRecipe(seed = 1): TerrainRecipe {
  return makeTerrainRecipe("island", {
    seed,
    primitive: {
      resolution: 128,
      height: 1.6,
      noiseScale: 1.25,
      ridgeScale: 2.15,
      ridgeStrength: 0.38,
      islandFalloff: 1.85,
      terraceStrength: 0.03,
    },
    layers: [
      {
        height: 0.18,
        noiseScale: 4.8,
        ridgeScale: 7.2,
        ridgeStrength: 0.2,
        islandFalloff: 2.2,
        opacity: 0.45,
        mode: "add",
      },
    ],
    erosion: { iterations: 18, hydraulicStrength: 0.018, thermalStrength: 0.045, talus: 0.035 },
    masks: { size: 10, waterLevel: 0.1, shoreWidth: 0.08 },
    mesh: { size: 10 },
  });
}

function terrainRecipeContext(height: Field2D, options?: TerrainMaskOptions): TerrainRecipeContext {
  const masks = deriveTerrainMasks(height, options);
  return { height, fieldSet: makeTerrainFieldSet(height, masks) };
}

function resolveTerrainRecipeMask(
  source: TerrainRecipeMaskSource | undefined,
  context: TerrainRecipeContext,
): Field2D | undefined {
  if (!source) return undefined;
  if (typeof source === "string") return context.fieldSet.fields[source];
  if (typeof source === "function") return source(context);
  return source;
}

function resolveTerrainRecipeRain(
  source: TerrainRecipeErosionStep["rain"],
  context: TerrainRecipeContext,
): number | Field2D {
  if (source === undefined) return 1;
  if (typeof source === "number") return Math.max(0, source);
  return resolveTerrainRecipeMask(source, context) ?? 1;
}

function terrainErosionSteps(
  erosion: TerrainRecipe["erosion"],
): TerrainRecipeErosionStep[] {
  if (!erosion) return [];
  return Array.isArray(erosion) ? erosion : [erosion];
}

function mergeErosionMaps(
  masks: TerrainMaskMap,
  erosion: Pick<TerrainMaskMap, "flow" | "wear" | "deposition">,
): TerrainMaskMap {
  return {
    ...masks,
    flow: maxField(masks.flow, erosion.flow),
    wear: maxField(masks.wear, erosion.wear),
    deposition: maxField(masks.deposition, erosion.deposition),
  };
}

function maxField(a: Field2D, b: Field2D): Field2D {
  const out = makeField2D(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.max(a.data[i]!, b.data[i]!);
  }
  return out;
}

export function invertTerrainMask(mask: Field2D): Field2D {
  const out = makeField2D(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) out.data[i] = 1 - clamp(mask.data[i]!, 0, 1);
  return out;
}
