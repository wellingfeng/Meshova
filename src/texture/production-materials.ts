import { clamp } from "../math/scalar.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import {
  URBAN_MATERIAL_DEFINITIONS,
  bakeUrbanMaterial,
  type UrbanMaterialName,
  type UrbanMaterialParams,
} from "./bilibili-urban-materials.js";
import { heightToNormal, type Material } from "./pbr.js";
import { createMaterialAnchors, withMaterialAnchor, type MaterialAnchors } from "./surface-production.js";
import {
  analyzeTextureQuality,
  weatheringTransport,
  type TextureQualityReport,
  type WeatheringOptions,
} from "./shading-mechanics.js";

export type ProductionScalarField = (u: number, v: number) => number;

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function repeat(value: number, period: number): number {
  const safePeriod = Math.max(Number.EPSILON, Math.abs(period));
  return ((value % safePeriod) + safePeriod) % safePeriod;
}

export interface PeriodicFieldOptions {
  periodU?: number;
  periodV?: number;
}

export function periodicField(
  field: ProductionScalarField,
  options: PeriodicFieldOptions = {},
): ProductionScalarField {
  const periodU = options.periodU ?? 1;
  const periodV = options.periodV ?? 1;
  return (u, v) => field(repeat(u, periodU) / periodU, repeat(v, periodV) / periodV);
}

export interface AntiAliasFieldOptions extends PeriodicFieldOptions {
  samples?: number;
  footprint?: number;
  periodic?: boolean;
}

export function antiAliasField(
  field: ProductionScalarField,
  options: AntiAliasFieldOptions = {},
): ProductionScalarField {
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(options.samples ?? 4)));
  const footprint = Math.max(0, options.footprint ?? 1 / 512);
  const source = options.periodic === false ? field : periodicField(field, options);
  return (u, v) => {
    let total = 0;
    for (let sampleY = 0; sampleY < gridSize; sampleY++) {
      for (let sampleX = 0; sampleX < gridSize; sampleX++) {
        const offsetU = ((sampleX + 0.5) / gridSize - 0.5) * footprint;
        const offsetV = ((sampleY + 0.5) / gridSize - 0.5) * footprint;
        total += source(u + offsetU, v + offsetV);
      }
    }
    return total / (gridSize * gridSize);
  };
}

export interface MipChainOptions {
  levels?: number;
  normalMap?: boolean;
}

function normalizedNormal(red: number, green: number, blue: number): [number, number, number] {
  const x = red * 2 - 1;
  const y = green * 2 - 1;
  const z = blue * 2 - 1;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length * 0.5 + 0.5, y / length * 0.5 + 0.5, z / length * 0.5 + 0.5];
}

export function downsampleTexture(
  texture: TextureBuffer,
  options: Pick<MipChainOptions, "normalMap"> = {},
): TextureBuffer {
  const width = Math.max(1, Math.ceil(texture.width / 2));
  const height = Math.max(1, Math.ceil(texture.height / 2));
  const output = makeTexture(width, height, texture.channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const destination = (y * width + x) * texture.channels;
      for (let channel = 0; channel < texture.channels; channel++) {
        output.data[destination + channel] = (
          sample(texture, x * 2, y * 2, channel)
          + sample(texture, x * 2 + 1, y * 2, channel)
          + sample(texture, x * 2, y * 2 + 1, channel)
          + sample(texture, x * 2 + 1, y * 2 + 1, channel)
        ) * 0.25;
      }
      if (options.normalMap && texture.channels >= 3) {
        const normal = normalizedNormal(
          output.data[destination]!,
          output.data[destination + 1]!,
          output.data[destination + 2]!,
        );
        output.data[destination] = normal[0];
        output.data[destination + 1] = normal[1];
        output.data[destination + 2] = normal[2];
      }
    }
  }
  return output;
}

export function generateMipChain(
  texture: TextureBuffer,
  options: MipChainOptions = {},
): TextureBuffer[] {
  const maximumLevels = Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1;
  const levelCount = clamp(Math.floor(options.levels ?? maximumLevels), 1, maximumLevels);
  const levels = [texture];
  while (levels.length < levelCount) {
    levels.push(downsampleTexture(levels[levels.length - 1]!, options));
  }
  return levels;
}

export type MaterialMipChains = { [Channel in keyof Material]: TextureBuffer[] };

export function generateMaterialMipChains(material: Material, levels?: number): MaterialMipChains {
  const scalarOptions = levels === undefined ? {} : { levels };
  const normalOptions = levels === undefined ? { normalMap: true } : { levels, normalMap: true };
  return {
    baseColor: generateMipChain(material.baseColor, scalarOptions),
    metallic: generateMipChain(material.metallic, scalarOptions),
    roughness: generateMipChain(material.roughness, scalarOptions),
    normal: generateMipChain(material.normal, normalOptions),
    ao: generateMipChain(material.ao, scalarOptions),
    height: generateMipChain(material.height, scalarOptions),
    emission: generateMipChain(material.emission, scalarOptions),
  };
}

export interface MaterialWeatheringOptions extends WeatheringOptions {
  amount?: number;
  normalStrength?: number;
}

export function applyMaterialWeathering(
  material: Material,
  options: MaterialWeatheringOptions = {},
): Material {
  const amount = clamp01(options.amount ?? 1);
  if (amount === 0) return material;
  const transport = weatheringTransport(material.height, options);
  const baseColor = makeTexture(material.baseColor.width, material.baseColor.height, 3);
  const metallic = makeTexture(material.metallic.width, material.metallic.height, 1);
  const roughness = makeTexture(material.roughness.width, material.roughness.height, 1);
  const ao = makeTexture(material.ao.width, material.ao.height, 1);
  const height = makeTexture(material.height.width, material.height.height, 1);
  for (let pixel = 0; pixel < material.height.width * material.height.height; pixel++) {
    const moisture = transport.moisture.data[pixel]! * amount;
    const salt = transport.salt.data[pixel]! * amount;
    const mold = transport.mold.data[pixel]! * amount;
    const peel = transport.peel.data[pixel]! * amount;
    for (let channel = 0; channel < 3; channel++) {
      const source = material.baseColor.data[pixel * 3 + channel]!;
      const saltColor = channel === 2 ? 0.78 : 0.82;
      const moldColor = channel === 1 ? 0.18 : channel === 0 ? 0.07 : 0.05;
      const dampened = source * (1 - moisture * 0.38);
      const salted = dampened + (saltColor - dampened) * salt * 0.42;
      baseColor.data[pixel * 3 + channel] = clamp01(salted + (moldColor - salted) * mold * 0.55);
    }
    metallic.data[pixel] = clamp01(material.metallic.data[pixel]! * (1 - mold * 0.5 - salt * 0.18));
    roughness.data[pixel] = clamp(
      material.roughness.data[pixel]! - moisture * 0.34 + salt * 0.28 + mold * 0.22,
      0.04,
      1,
    );
    ao.data[pixel] = clamp01(material.ao.data[pixel]! * (1 - mold * 0.26 - peel * 0.16));
    height.data[pixel] = clamp01(material.height.data[pixel]! - peel * 0.055 + salt * 0.012);
  }
  return {
    ...material,
    baseColor,
    metallic,
    roughness,
    ao,
    height,
    normal: heightToNormal(height, options.normalStrength ?? 4),
  };
}

const SEMANTIC_KEYWORDS = {
  urbanGroundKit: ["城市", "地面", "街道", "鹅卵石", "人行道", "路缘石", "urban", "ground", "cobble", "curb", "sidewalk"],
  damagedPlasterBrick: ["砖", "砖墙", "灰泥", "墙面", "plaster", "brick", "masonry"],
  sciFiIndustrialPanel: ["科幻", "工业", "面板", "电缆", "机械", "sci-fi", "industrial", "panel", "cable"],
  brushedMetalGrille: ["拉丝", "格栅", "冲孔", "金属网", "brushed", "grille", "perforated"],
  wetDrainConcrete: ["混凝土", "水泥", "沟渠", "排水", "湿地", "concrete", "drain", "channel"],
} as const satisfies Record<UrbanMaterialName, readonly string[]>;

function includesAny(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

export interface SemanticMaterialIntent {
  name: UrbanMaterialName;
  params: UrbanMaterialParams;
  confidence: number;
  matchedTerms: string[];
}

export function compileSemanticMaterial(prompt: string): SemanticMaterialIntent {
  const normalized = prompt.trim().toLowerCase();
  let selected: UrbanMaterialName = "urbanGroundKit";
  let selectedTerms: string[] = [];
  for (const name of Object.keys(SEMANTIC_KEYWORDS) as UrbanMaterialName[]) {
    const terms = includesAny(normalized, SEMANTIC_KEYWORDS[name]);
    if (terms.length > selectedTerms.length) {
      selected = name;
      selectedTerms = terms;
    }
  }
  const params: UrbanMaterialParams = {};
  const wetTerms = includesAny(normalized, ["潮湿", "湿润", "积水", "雨淋", "wet", "damp", "rain"]);
  const dryTerms = includesAny(normalized, ["干燥", "干净", "dry"]);
  const wornTerms = includesAny(normalized, ["破旧", "破损", "老化", "风化", "废弃", "worn", "damaged", "aged", "weathered"]);
  const newTerms = includesAny(normalized, ["崭新", "全新", "洁净", "new", "clean"]);
  const detailedTerms = includesAny(normalized, ["精细", "高细节", "复杂", "detailed", "intricate"]);
  if (wetTerms.length > 0) params.wetness = 0.86;
  if (dryTerms.length > 0) params.wetness = 0.08;
  if (wornTerms.length > 0) params.wear = 0.82;
  if (newTerms.length > 0) params.wear = 0.08;
  if (detailedTerms.length > 0) params.detail = 7;
  const modifiers = [...wetTerms, ...dryTerms, ...wornTerms, ...newTerms, ...detailedTerms];
  const matchedTerms = [...selectedTerms, ...modifiers];
  return {
    name: selected,
    params,
    confidence: clamp01(selectedTerms.length * 0.34 + modifiers.length * 0.08),
    matchedTerms,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export class MaterialBakeCache {
  readonly #entries = new Map<string, Material>();
  #hits = 0;
  #misses = 0;

  get size(): number {
    return this.#entries.size;
  }

  get stats(): Readonly<{ hits: number; misses: number }> {
    return { hits: this.#hits, misses: this.#misses };
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  getOrCreate(key: string, factory: () => Material): Material {
    const cached = this.#entries.get(key);
    if (cached) {
      this.#hits++;
      return cached;
    }
    const material = factory();
    this.#entries.set(key, material);
    this.#misses++;
    return material;
  }

  clear(): void {
    this.#entries.clear();
    this.#hits = 0;
    this.#misses = 0;
  }
}

export const productionMaterialCache = new MaterialBakeCache();

export interface ProductionBakeOptions {
  params?: UrbanMaterialParams;
  weathering?: MaterialWeatheringOptions | false;
  mipLevels?: number;
  cache?: MaterialBakeCache | false;
}

export interface ProductionMaterialBake {
  name: UrbanMaterialName;
  label: string;
  material: Material;
  mipmaps: MaterialMipChains;
  quality: { [Channel in keyof Material]: TextureQualityReport };
  anchors: MaterialAnchors;
  semantic?: SemanticMaterialIntent;
  cacheHit: boolean;
}

export function bakeProductionMaterial(
  request: UrbanMaterialName | string,
  size: number,
  options: ProductionBakeOptions = {},
): ProductionMaterialBake {
  const knownName = request in URBAN_MATERIAL_DEFINITIONS;
  const semantic = knownName ? undefined : compileSemanticMaterial(request);
  const name = knownName ? request as UrbanMaterialName : semantic!.name;
  const params = { ...semantic?.params, ...options.params };
  const key = JSON.stringify(stableValue({ name, size, params, weathering: options.weathering ?? false }));
  const cache = options.cache === false ? undefined : options.cache ?? productionMaterialCache;
  const cacheHit = cache?.has(key) ?? false;
  const factory = () => {
    const material = bakeUrbanMaterial(name, size, params);
    return options.weathering === false || options.weathering === undefined
      ? material
      : applyMaterialWeathering(material, options.weathering);
  };
  const material = cache ? cache.getOrCreate(key, factory) : factory();
  const mipmaps = generateMaterialMipChains(material, options.mipLevels);
  const heightAnchors = withMaterialAnchor(createMaterialAnchors(), "height", material.height);
  const aoAnchors = withMaterialAnchor(heightAnchors, "ao", material.ao);
  const roughnessAnchors = withMaterialAnchor(aoAnchors, "roughness", material.roughness);
  const anchors = withMaterialAnchor(roughnessAnchors, "metallic", material.metallic);
  return {
    name,
    label: URBAN_MATERIAL_DEFINITIONS[name].label,
    material,
    mipmaps,
    anchors,
    quality: {
      baseColor: analyzeTextureQuality(material.baseColor),
      metallic: analyzeTextureQuality(material.metallic),
      roughness: analyzeTextureQuality(material.roughness),
      normal: analyzeTextureQuality(material.normal),
      ao: analyzeTextureQuality(material.ao),
      height: analyzeTextureQuality(material.height),
      emission: analyzeTextureQuality(material.emission),
    },
    ...(semantic ? { semantic } : {}),
    cacheHit,
  };
}
