import { clamp, DEG2RAD, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";

export interface WoodMaterialSystemOptions {
  readonly seed?: number;
  readonly woodColor?: readonly [number, number, number];
  readonly latewoodColor?: readonly [number, number, number];
  readonly ringScale?: number;
  readonly grainScale?: number;
  readonly cutDirection?: number;
  readonly endGrain?: number;
  readonly varnish?: number;
  readonly wear?: number;
  readonly poreDepth?: number;
  readonly normalStrength?: number;
}

export interface WoodMaterialMasks {
  readonly longitudinalGrain: TextureBuffer;
  readonly annualRings: TextureBuffer;
  readonly endGrain: TextureBuffer;
  readonly pores: TextureBuffer;
  readonly knots: TextureBuffer;
  readonly varnish: TextureBuffer;
  readonly wornVarnish: TextureBuffer;
}

export interface WoodMaterialSystemResult {
  readonly material: Material;
  readonly masks: WoodMaterialMasks;
}

interface Knot {
  readonly along: number;
  readonly across: number;
  readonly radiusAlong: number;
  readonly radiusAcross: number;
}

export function woodMaterialSystem(
  size: number,
  options: WoodMaterialSystemOptions = {},
): WoodMaterialSystemResult {
  const resolution = Math.floor(size);
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error("wood material system size must be an integer >= 16");
  }
  const seed = options.seed ?? 173;
  const woodColor = options.woodColor ?? [0.52, 0.28, 0.095];
  const latewoodColor = options.latewoodColor ?? [0.24, 0.09, 0.025];
  const ringScale = Math.max(2, options.ringScale ?? 13);
  const grainScale = Math.max(4, options.grainScale ?? 48);
  const cutDirection = (options.cutDirection ?? 0) * DEG2RAD;
  const endGrainAmount = clamp(options.endGrain ?? 0.18, 0, 1);
  const varnishAmount = clamp(options.varnish ?? 0.72, 0, 1);
  const wearAmount = clamp(options.wear ?? 0.34, 0, 1);
  const poreDepth = clamp(options.poreDepth ?? 0.52, 0, 1);
  const cosine = Math.cos(cutDirection);
  const sine = Math.sin(cutDirection);
  const shapeNoise = makeNoise(seed);
  const grainNoise = makeNoise(seed + 1);
  const poreNoise = makeNoise(seed + 2);
  const wearNoise = makeNoise(seed + 3);
  const knots = createKnots(seed + 4, 3);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks: WoodMaterialMasks = {
    longitudinalGrain: makeTexture(resolution, resolution, 1),
    annualRings: makeTexture(resolution, resolution, 1),
    endGrain: makeTexture(resolution, resolution, 1),
    pores: makeTexture(resolution, resolution, 1),
    knots: makeTexture(resolution, resolution, 1),
    varnish: makeTexture(resolution, resolution, 1),
    wornVarnish: makeTexture(resolution, resolution, 1),
  };

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const centeredU = u - 0.5;
      const centeredV = v - 0.5;
      const along = centeredU * cosine + centeredV * sine;
      const across = -centeredU * sine + centeredV * cosine;
      const broadWarp = fbm2(shapeNoise, along * 3.2 + 19, across * 7.5 - 11, { octaves: 4 });
      const fineWarp = fbm2(grainNoise, along * 7.5 - 23, across * 22 + 17, { octaves: 3 });
      const knot = sampleKnot(along, across, knots);
      const sidePhase = Math.abs(
        across
          + broadWarp * 0.055
          + Math.sin(along * TAU * 1.25) * 0.018
          + knot.distortion * 0.06,
      ) * ringScale * 2;
      const sideAnnual = latewoodBand(sidePhase);
      const grainPhase = (
        across * grainScale
          + broadWarp * 2.4
          + fineWarp * 0.9
          + knot.distortion * 3.2
      ) * TAU;
      const sideGrain = Math.pow(0.5 + Math.sin(grainPhase) * 0.5, 5);
      const radialWarpX = centeredU + broadWarp * 0.035;
      const radialWarpY = centeredV + fineWarp * 0.026;
      const radialDistance = Math.hypot(radialWarpX * 0.92, radialWarpY * 1.08);
      const endPhase = radialDistance * ringScale * 2.15 + broadWarp * 0.42;
      const endAnnual = latewoodBand(endPhase);
      const annual = mix(sideAnnual, endAnnual, endGrainAmount);
      const longitudinal = sideGrain * (1 - endGrainAmount);
      const poreField = fbm2(poreNoise, along * 23 + 7, across * 86 - 29, { octaves: 2 }) * 0.5 + 0.5;
      const radialPores = fbm2(poreNoise, centeredU * 74 - 31, centeredV * 74 + 37, { octaves: 2 }) * 0.5 + 0.5;
      const poreSignal = mix(poreField, radialPores, endGrainAmount);
      const pores = smoothstep(0.72, 0.91, poreSignal) * (0.3 + annual * 0.7) * poreDepth;
      const wearField = fbm2(wearNoise, along * 4.4 - 13, across * 9.5 + 41, { octaves: 4 }) * 0.5 + 0.5;
      const scratchDistance = Math.abs(Math.sin((across * 37 + fineWarp * 0.12) * TAU));
      const scratches = (1 - smoothstep(0.015, 0.12, scratchDistance))
        * smoothstep(0.48, 0.78, wearField);
      const wornVarnish = clamp(
        smoothstep(0.68 - wearAmount * 0.34, 0.88 - wearAmount * 0.18, wearField + scratches * 0.24)
          * wearAmount
          * varnishAmount,
        0,
        1,
      );
      const varnish = clamp(varnishAmount - wornVarnish, 0, 1);
      const colorSignal = clamp(annual * 0.68 + longitudinal * 0.16 + knot.mask * 0.48, 0, 1);
      const pixel = y * resolution + x;

      for (let channel = 0; channel < 3; channel++) {
        const woodValue = mix(woodColor[channel]!, latewoodColor[channel]!, colorSignal);
        const porousValue = woodValue * (1 - pores * 0.28);
        const varnishedValue = porousValue * (1 - varnish * 0.075) + varnish * 0.018;
        const wornValue = mix(varnishedValue, porousValue * 1.035, wornVarnish);
        baseColor.data[pixel * 3 + channel] = clamp(wornValue, 0, 1);
      }
      metallic.data[pixel] = 0;
      roughness.data[pixel] = clamp(
        0.62 + pores * 0.19 + knot.mask * 0.08 - varnish * 0.4 + wornVarnish * 0.24,
        0.04,
        1,
      );
      ao.data[pixel] = clamp(1 - pores * 0.2 - knot.mask * 0.12, 0, 1);
      height.data[pixel] = clamp(
        0.5 + annual * 0.045 + longitudinal * 0.016 - pores * 0.045 - knot.mask * 0.012,
        0,
        1,
      );
      masks.longitudinalGrain.data[pixel] = longitudinal;
      masks.annualRings.data[pixel] = annual;
      masks.endGrain.data[pixel] = endGrainAmount;
      masks.pores.data[pixel] = pores;
      masks.knots.data[pixel] = knot.mask;
      masks.varnish.data[pixel] = varnish;
      masks.wornVarnish.data[pixel] = wornVarnish;
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(height, options.normalStrength ?? 7),
      ao,
      height,
      emission,
    },
    masks,
  };
}

function createKnots(seed: number, count: number): readonly Knot[] {
  const random = makeRng(seed);
  const knots: Knot[] = [];
  for (let index = 0; index < count; index++) {
    knots.push({
      along: random.range(-0.4, 0.4),
      across: random.range(-0.34, 0.34),
      radiusAlong: random.range(0.045, 0.085),
      radiusAcross: random.range(0.018, 0.04),
    });
  }
  return knots;
}

function sampleKnot(
  along: number,
  across: number,
  knots: readonly Knot[],
): { mask: number; distortion: number } {
  let mask = 0;
  let distortion = 0;
  for (const knot of knots) {
    const localAlong = (along - knot.along) / knot.radiusAlong;
    const localAcross = (across - knot.across) / knot.radiusAcross;
    const distance = Math.hypot(localAlong, localAcross);
    const influence = 1 - smoothstep(0.55, 1.25, distance);
    const ring = 0.5 + Math.sin(distance * TAU * 1.4) * 0.5;
    mask = Math.max(mask, influence * (0.45 + ring * 0.55));
    distortion += influence * Math.atan2(localAcross, localAlong) / Math.PI;
  }
  return { mask: clamp(mask, 0, 1), distortion: clamp(distortion, -1, 1) };
}

function latewoodBand(phase: number): number {
  return smoothstep(0.58, 0.92, phase - Math.floor(phase));
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
