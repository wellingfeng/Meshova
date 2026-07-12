import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";
import {
  applyWeatherStack,
  type WeatherStackMasks,
  type WeatherStackOptions,
} from "./weather-stack.js";

export type TrimProfile = "flat" | "bevel" | "ribbed" | "fastener" | "seam";
export type TrimColor = readonly [number, number, number];

export interface TrimSheetRegion {
  readonly name: string;
  readonly label: string;
  readonly profile: TrimProfile;
  readonly color: TrimColor;
  readonly weight?: number;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly underlayerColor?: TrimColor;
  readonly underlayerMetallic?: number;
}

export interface TrimSheetRegionBand {
  readonly name: string;
  readonly label: string;
  readonly profile: TrimProfile;
  readonly v0: number;
  readonly v1: number;
}

export interface TrimSheetPipelineOptions {
  readonly seed?: number;
  readonly gutter?: number;
  readonly wear?: number;
  readonly dirt?: number;
  readonly detailScale?: number;
  readonly fastenerCount?: number;
  readonly normalStrength?: number;
  readonly weather?: WeatherStackOptions;
}

export interface TrimSheetPipelineMasks {
  readonly regionId: TextureBuffer;
  readonly edgeWear: TextureBuffer;
  readonly cavityDirt: TextureBuffer;
  readonly seam: TextureBuffer;
  readonly fastener: TextureBuffer;
}

export interface TrimSheetPipelineResult {
  readonly material: Material;
  readonly bands: readonly TrimSheetRegionBand[];
  readonly masks: TrimSheetPipelineMasks;
  readonly regionMasks: Readonly<Record<string, TextureBuffer>>;
  readonly weatherMasks: WeatherStackMasks;
}

export interface ArchitecturalTrimRegionOptions {
  readonly paintColor?: TrimColor;
  readonly accentColor?: TrimColor;
}

interface ResolvedRegion {
  readonly definition: TrimSheetRegion;
  readonly band: TrimSheetRegionBand;
  readonly index: number;
}

interface RegionSample {
  readonly region: ResolvedRegion;
  readonly localV: number;
  readonly gutter: boolean;
}

interface TrimDetails {
  readonly height: number;
  readonly edge: number;
  readonly cavity: number;
  readonly seam: number;
  readonly fastener: number;
  readonly noise: number;
}

/** Default semantic bands for frames, borders, rails, bolts and joints. */
export function architecturalTrimRegions(
  options: ArchitecturalTrimRegionOptions = {},
): readonly TrimSheetRegion[] {
  const paintColor = options.paintColor ?? [0.14, 0.28, 0.4];
  const accentColor = options.accentColor ?? [0.52, 0.16, 0.055];
  const steel: TrimColor = [0.4, 0.42, 0.43];
  return [
    {
      name: "painted-frame",
      label: "涂装框架",
      profile: "flat",
      color: paintColor,
      weight: 1.7,
      metallic: 0,
      roughness: 0.34,
      underlayerColor: steel,
      underlayerMetallic: 1,
    },
    {
      name: "beveled-border",
      label: "倒角边框",
      profile: "bevel",
      color: accentColor,
      weight: 1.35,
      metallic: 0,
      roughness: 0.38,
      underlayerColor: steel,
      underlayerMetallic: 1,
    },
    {
      name: "ribbed-rail",
      label: "压纹金属条",
      profile: "ribbed",
      color: [0.34, 0.36, 0.37],
      weight: 1.15,
      metallic: 1,
      roughness: 0.27,
    },
    {
      name: "fastener-rail",
      label: "螺栓固定条",
      profile: "fastener",
      color: [0.18, 0.2, 0.21],
      weight: 1.15,
      metallic: 1,
      roughness: 0.31,
    },
    {
      name: "recessed-seam",
      label: "凹陷接缝",
      profile: "seam",
      color: [0.085, 0.09, 0.095],
      weight: 0.72,
      metallic: 0,
      roughness: 0.78,
    },
  ];
}

/**
 * Pack semantic trim regions into one atlas, add profile detail and smart wear,
 * then apply one coherent weather state across every band.
 */
export function buildTrimSheetPipeline(
  size: number,
  regions: readonly TrimSheetRegion[],
  options: TrimSheetPipelineOptions = {},
): TrimSheetPipelineResult {
  const resolution = Math.floor(size);
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error("trim sheet pipeline size must be an integer >= 16");
  }
  const resolved = resolveRegions(regions, options.gutter ?? 0.04);
  const width = resolution;
  const height = resolution;
  const baseColor = makeTexture(width, height, 3);
  const metallic = makeTexture(width, height, 1);
  const roughness = makeTexture(width, height, 1);
  const ao = makeTexture(width, height, 1);
  const resultHeight = makeTexture(width, height, 1);
  const emission = makeTexture(width, height, 3);
  const masks: TrimSheetPipelineMasks = {
    regionId: makeTexture(width, height, 1),
    edgeWear: makeTexture(width, height, 1),
    cavityDirt: makeTexture(width, height, 1),
    seam: makeTexture(width, height, 1),
    fastener: makeTexture(width, height, 1),
  };
  const regionMasks: Record<string, TextureBuffer> = {};
  for (const region of resolved) regionMasks[region.definition.name] = makeTexture(width, height, 1);

  const seed = options.seed ?? 109;
  const wearAmount = clamp(options.wear ?? 0.52, 0, 1);
  const dirtAmount = clamp(options.dirt ?? 0.34, 0, 1);
  const detailScale = Math.max(0.5, options.detailScale ?? 9);
  const fastenerCount = Math.max(1, Math.floor(options.fastenerCount ?? 9));
  const noises = resolved.map((region) => makeNoise(seed + region.index * 97));

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const pixel = y * width + x;
      const sample = sampleRegion(resolved, v);
      const definition = sample.region.definition;
      const details = evaluateTrimDetails(
        definition.profile,
        u,
        sample.localV,
        detailScale,
        fastenerCount,
        noises[sample.region.index]!,
      );
      const wear = sample.gutter
        ? 0
        : clamp(details.edge * (0.58 + details.noise * 0.42) * wearAmount, 0, 1);
      const dirt = sample.gutter
        ? 0
        : clamp(details.cavity * (0.64 + (1 - details.noise) * 0.36) * dirtAmount, 0, 1);
      const underlayer = definition.underlayerColor ?? definition.color;
      const baseMetallic = clamp(definition.metallic ?? 0, 0, 1);
      const underlayerMetallic = clamp(definition.underlayerMetallic ?? baseMetallic, 0, 1);

      for (let channel = 0; channel < 3; channel++) {
        const varied = definition.color[channel]! * (0.91 + details.noise * 0.12);
        const worn = mix(varied, underlayer[channel]!, wear * 0.92);
        baseColor.data[pixel * 3 + channel] = clamp(
          mix(worn, channel === 0 ? 0.085 : channel === 1 ? 0.064 : 0.04, dirt * 0.78),
          0,
          1,
        );
      }
      metallic.data[pixel] = clamp(
        mix(baseMetallic, underlayerMetallic, wear) * (1 - dirt * 0.46),
        0,
        1,
      );
      roughness.data[pixel] = clamp(
        (definition.roughness ?? 0.56) + dirt * 0.24 - wear * (underlayerMetallic > 0.5 ? 0.08 : 0.02),
        0.04,
        1,
      );
      ao.data[pixel] = clamp(1 - details.cavity * 0.42 - dirt * 0.18, 0, 1);
      resultHeight.data[pixel] = clamp(details.height + details.noise * 0.012 + dirt * 0.008, 0, 1);
      masks.regionId.data[pixel] = resolved.length === 1
        ? 0
        : sample.region.index / (resolved.length - 1);
      masks.edgeWear.data[pixel] = wear;
      masks.cavityDirt.data[pixel] = dirt;
      masks.seam.data[pixel] = sample.gutter ? 0 : details.seam;
      masks.fastener.data[pixel] = sample.gutter ? 0 : details.fastener;
      if (!sample.gutter) regionMasks[definition.name]!.data[pixel] = 1;
    }
  }

  const baseMaterial: Material = {
    baseColor,
    metallic,
    roughness,
    normal: heightToNormal(resultHeight, options.normalStrength ?? 7),
    ao,
    height: resultHeight,
    emission,
  };
  const weathered = applyWeatherStack(baseMaterial, options.weather ?? {});
  return {
    material: weathered.material,
    bands: resolved.map((region) => region.band),
    masks,
    regionMasks,
    weatherMasks: weathered.masks,
  };
}

/** Stable UV band lookup for geometry-side `mapUVToTrimBand`. */
export function trimSheetPipelineBand(
  result: Pick<TrimSheetPipelineResult, "bands">,
  name: string,
): { v0: number; v1: number } | null {
  const band = result.bands.find((candidate) => candidate.name === name);
  return band ? { v0: band.v0, v1: band.v1 } : null;
}

function resolveRegions(
  regions: readonly TrimSheetRegion[],
  gutterOption: number,
): readonly ResolvedRegion[] {
  if (regions.length === 0) throw new Error("trim sheet pipeline requires at least one region");
  const names = new Set<string>();
  let totalWeight = 0;
  for (const region of regions) {
    if (region.name.trim().length === 0) throw new Error("trim sheet region name must not be empty");
    if (names.has(region.name)) throw new Error(`duplicate trim sheet region: ${region.name}`);
    names.add(region.name);
    const weight = region.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new Error("trim sheet region weight must be positive");
    totalWeight += weight;
  }
  const gutter = clamp(gutterOption, 0, 0.35);
  const gapCount = Math.max(0, regions.length - 1);
  const gap = gapCount > 0 ? gutter / gapCount : 0;
  const usable = 1 - gutter;
  const resolved: ResolvedRegion[] = [];
  let cursor = 0;
  for (let index = 0; index < regions.length; index++) {
    const definition = regions[index]!;
    const v0 = cursor;
    const v1 = v0 + usable * ((definition.weight ?? 1) / totalWeight);
    resolved.push({
      definition,
      index,
      band: {
        name: definition.name,
        label: definition.label,
        profile: definition.profile,
        v0,
        v1,
      },
    });
    cursor = v1 + (index < regions.length - 1 ? gap : 0);
  }
  return resolved;
}

function sampleRegion(regions: readonly ResolvedRegion[], v: number): RegionSample {
  for (const region of regions) {
    if (v >= region.band.v0 && v <= region.band.v1) {
      return {
        region,
        localV: (v - region.band.v0) / Math.max(1e-9, region.band.v1 - region.band.v0),
        gutter: false,
      };
    }
  }
  let nearest = regions[0]!;
  let distance = Infinity;
  let localV = 0;
  for (const region of regions) {
    const toBottom = Math.abs(v - region.band.v0);
    const toTop = Math.abs(v - region.band.v1);
    if (toBottom < distance) {
      nearest = region;
      distance = toBottom;
      localV = 0;
    }
    if (toTop < distance) {
      nearest = region;
      distance = toTop;
      localV = 1;
    }
  }
  return { region: nearest, localV, gutter: true };
}

function evaluateTrimDetails(
  profile: TrimProfile,
  u: number,
  v: number,
  scale: number,
  fastenerCount: number,
  noise: ReturnType<typeof makeNoise>,
): TrimDetails {
  const broadNoise = fbm2(noise, u * scale, v * scale + 17, { octaves: 4 }) * 0.5 + 0.5;
  const borderDistance = Math.min(v, 1 - v);
  const border = 1 - smoothstep(0.035, 0.2, borderDistance);
  let height = 0.5;
  let edge = border * 0.3;
  let cavity = border * 0.32;
  let seam = 0;
  let fastener = 0;

  if (profile === "bevel") {
    const crown = smoothstep(0.03, 0.46, borderDistance);
    height = 0.4 + crown * 0.2;
    edge = clamp(border + (1 - smoothstep(0.08, 0.2, Math.abs(borderDistance - 0.22))) * 0.55, 0, 1);
    cavity = border * 0.5;
  } else if (profile === "ribbed") {
    const rib = Math.cos(v * TAU * 4) * 0.5 + 0.5;
    height = 0.43 + rib * 0.16;
    edge = clamp(border * 0.35 + smoothstep(0.7, 0.96, rib) * 0.72, 0, 1);
    cavity = clamp((1 - rib) * 0.76 + border * 0.28, 0, 1);
  } else if (profile === "fastener") {
    const cell = u * fastenerCount - Math.floor(u * fastenerCount) - 0.5;
    const distance = Math.hypot(cell, (v - 0.5) * 0.62);
    fastener = 1 - smoothstep(0.17, 0.27, distance);
    const socket = 1 - smoothstep(0.025, 0.085, distance);
    height = 0.46 + fastener * 0.18 - socket * 0.09;
    edge = clamp(border * 0.26 + fastener * (1 - socket) * 0.9, 0, 1);
    cavity = clamp(border * 0.34 + socket * 0.92 + fastener * 0.18, 0, 1);
  } else if (profile === "seam") {
    seam = 1 - smoothstep(0.025, 0.12, Math.abs(v - 0.5));
    height = 0.51 - seam * 0.16;
    edge = clamp(border * 0.2 + (1 - smoothstep(0.08, 0.18, Math.abs(Math.abs(v - 0.5) - 0.13))) * 0.48, 0, 1);
    cavity = clamp(seam + border * 0.24, 0, 1);
  }
  return { height, edge, cavity, seam, fastener, noise: broadNoise };
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
