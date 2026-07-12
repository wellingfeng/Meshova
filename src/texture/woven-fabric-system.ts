import { clamp, DEG2RAD, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";
import {
  sampleWovenTextile,
  type TextilePattern,
} from "./textile.js";

export interface WovenFabricSystemOptions {
  readonly seed?: number;
  readonly pattern?: TextilePattern;
  readonly warpColor?: readonly [number, number, number];
  readonly weftColor?: readonly [number, number, number];
  readonly weaveScale?: number;
  readonly yarnWidth?: number;
  readonly direction?: number;
  readonly distortion?: number;
  readonly fiberStrength?: number;
  readonly fuzz?: number;
  readonly compression?: number;
  readonly compressionCenter?: readonly [number, number];
  readonly compressionRadius?: number;
  readonly wear?: number;
  readonly normalStrength?: number;
}

export interface WovenFabricMasks {
  readonly warpYarns: TextureBuffer;
  readonly weftYarns: TextureBuffer;
  readonly warpOver: TextureBuffer;
  readonly crossings: TextureBuffer;
  readonly fiberDirection: TextureBuffer;
  readonly fuzz: TextureBuffer;
  readonly compression: TextureBuffer;
  readonly wear: TextureBuffer;
}

export interface WovenFabricSystemResult {
  readonly material: Material;
  readonly masks: WovenFabricMasks;
}

export function wovenFabricSystem(
  size: number,
  options: WovenFabricSystemOptions = {},
): WovenFabricSystemResult {
  const resolution = Math.floor(size);
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error("woven fabric system size must be an integer >= 16");
  }

  const seed = options.seed ?? 223;
  const pattern = options.pattern ?? "herringbone";
  const warpColor = tuple(options.warpColor ?? [0.11, 0.22, 0.31]);
  const weftColor = tuple(options.weftColor ?? [0.49, 0.58, 0.62]);
  const weaveScale = Math.max(4, options.weaveScale ?? 40);
  const yarnWidth = clamp(options.yarnWidth ?? 0.84, 0.35, 0.98);
  const direction = (options.direction ?? 0) * DEG2RAD;
  const distortion = clamp(options.distortion ?? 0.12, 0, 0.45);
  const fiberStrength = clamp(options.fiberStrength ?? 0.58, 0, 1);
  const fuzzAmount = clamp(options.fuzz ?? 0.62, 0, 1);
  const compressionAmount = clamp(options.compression ?? 0.64, 0, 1);
  const compressionCenter = options.compressionCenter ?? [0.56, 0.44];
  const compressionRadius = clamp(options.compressionRadius ?? 0.24, 0.04, 0.8);
  const wearAmount = clamp(options.wear ?? 0.2, 0, 1);
  const cosine = Math.cos(direction);
  const sine = Math.sin(direction);
  const fuzzNoise = makeNoise(seed + 101);
  const wearNoise = makeNoise(seed + 211);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks: WovenFabricMasks = {
    warpYarns: makeTexture(resolution, resolution, 1),
    weftYarns: makeTexture(resolution, resolution, 1),
    warpOver: makeTexture(resolution, resolution, 1),
    crossings: makeTexture(resolution, resolution, 1),
    fiberDirection: makeTexture(resolution, resolution, 1),
    fuzz: makeTexture(resolution, resolution, 1),
    compression: makeTexture(resolution, resolution, 1),
    wear: makeTexture(resolution, resolution, 1),
  };

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const centeredU = u - 0.5;
      const centeredV = v - 0.5;
      const sourceU = centeredU * cosine + centeredV * sine + 0.5;
      const sourceV = -centeredU * sine + centeredV * cosine + 0.5;
      const sample = sampleWovenTextile(sourceU, sourceV, {
        pattern,
        seed,
        color: warpColor,
        secondaryColor: weftColor,
        scale: weaveScale,
        yarnWidth,
        distortion,
        fiberStrength,
        wear: wearAmount * 0.35,
      });
      const compression = compressionMask(
        u,
        v,
        compressionCenter,
        compressionRadius,
      ) * compressionAmount;
      const broadWear = fbm2(wearNoise, u * 4.5 + 13, v * 5.5 - 19, { octaves: 4 }) * 0.5 + 0.5;
      const wear = wearAmount
        * smoothstep(0.66 - wearAmount * 0.28, 0.9 - wearAmount * 0.16, broadWear);
      const fineFuzz = fbm2(
        fuzzNoise,
        sourceU * weaveScale * 6.5 + 31,
        sourceV * weaveScale * 6.5 - 37,
        { octaves: 3 },
      ) * 0.5 + 0.5;
      const fuzz = smoothstep(0.52, 0.82, fineFuzz)
        * sample.coverage
        * fuzzAmount
        * (1 - compression * 0.92)
        * (1 - wear * 0.78);
      const warpTop = sample.warpVisible && (!sample.weftVisible || sample.warpOver);
      const directionValue = wrap01(
        (direction + (warpTop ? Math.PI * 0.5 : 0)) / Math.PI,
      );
      const flattenedHeight = sample.height * (1 - compression * 0.68 - wear * 0.09);
      const pixel = y * resolution + x;

      for (let channel = 0; channel < 3; channel++) {
        const color = sample.color[channel]!;
        baseColor.data[pixel * 3 + channel] = clamp(
          color * (1 - compression * 0.18 + wear * 0.08) + fuzz * 0.04,
          0,
          1,
        );
      }
      metallic.data[pixel] = 0;
      roughness.data[pixel] = clamp(
        sample.roughness + fuzz * 0.14 - compression * 0.18 + wear * 0.08,
        0.04,
        1,
      );
      ao.data[pixel] = clamp(sample.ao - compression * 0.28 - sample.crossing * 0.04, 0, 1);
      height.data[pixel] = clamp(flattenedHeight + fuzz * 0.032 - compression * 0.08, 0, 1);
      masks.warpYarns.data[pixel] = sample.warpProfile;
      masks.weftYarns.data[pixel] = sample.weftProfile;
      masks.warpOver.data[pixel] = sample.warpOver ? sample.crossing : 0;
      masks.crossings.data[pixel] = sample.crossing;
      masks.fiberDirection.data[pixel] = directionValue;
      masks.fuzz.data[pixel] = fuzz;
      masks.compression.data[pixel] = compression;
      masks.wear.data[pixel] = wear;
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(height, options.normalStrength ?? 6),
      ao,
      height,
      emission,
    },
    masks,
  };
}

function compressionMask(
  u: number,
  v: number,
  center: readonly [number, number],
  radius: number,
): number {
  const horizontal = (u - center[0]) / radius;
  const vertical = (v - center[1]) / (radius * 0.72);
  const distance = Math.hypot(horizontal, vertical);
  const bowl = 1 - smoothstep(0.12, 1, distance);
  const rim = smoothstep(0.5, 0.86, distance) * (1 - smoothstep(0.86, 1.08, distance));
  return clamp(bowl * 0.88 + rim * 0.12, 0, 1);
}

function tuple(color: readonly [number, number, number]): [number, number, number] {
  return [color[0], color[1], color[2]];
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}
