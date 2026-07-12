import { makeNoise, fbm2 } from "../random/noise.js";
import { clamp, smoothstep } from "../math/scalar.js";
import { generate, sample, type TextureBuffer } from "./buffer.js";
import { aoFromHeight, curvature, histogramScan, invert, mapAll } from "./filters.js";

export interface LayeredWearOptions {
  seed?: number;
  edgeAmount?: number;
  cavityAmount?: number;
  chipAmount?: number;
  scratchAmount?: number;
  dustAmount?: number;
  wetnessAmount?: number;
  breakupScale?: number;
  scratchScale?: number;
}

export interface LayeredWearMasks {
  edgeWear: TextureBuffer;
  cavityDirt: TextureBuffer;
  chippedPaint: TextureBuffer;
  scratches: TextureBuffer;
  dust: TextureBuffer;
  wetness: TextureBuffer;
}

function multiplyMasks(a: TextureBuffer, b: TextureBuffer, amount: number): TextureBuffer {
  return mapAll(a, (value, _channel, x, y) => (
    clamp(value * sample(b, x, y) * amount, 0, 1)
  ));
}

export function buildLayeredWearMasks(
  height: TextureBuffer,
  options: LayeredWearOptions = {},
): LayeredWearMasks {
  const seed = options.seed ?? 0;
  const edgeAmount = clamp(options.edgeAmount ?? 0.65, 0, 1);
  const cavityAmount = clamp(options.cavityAmount ?? 0.7, 0, 1);
  const chipAmount = clamp(options.chipAmount ?? 0.5, 0, 1);
  const scratchAmount = clamp(options.scratchAmount ?? 0.35, 0, 1);
  const dustAmount = clamp(options.dustAmount ?? 0.4, 0, 1);
  const wetnessAmount = clamp(options.wetnessAmount ?? 0.45, 0, 1);
  const breakupScale = Math.max(1, options.breakupScale ?? 7);
  const scratchScale = Math.max(1, options.scratchScale ?? 38);
  const noise = makeNoise(seed);

  const breakup = generate(height.width, height.height, 1, (u, v) => (
    clamp(fbm2(noise, u * breakupScale, v * breakupScale, { octaves: 4 }) * 0.5 + 0.5, 0, 1)
  ));
  const convex = histogramScan(curvature(height, { intensity: 7 }), {
    position: 0.58,
    contrast: 0.78,
  });
  const cavities = histogramScan(invert(aoFromHeight(height, {
    radius: Math.max(1, Math.round(Math.min(height.width, height.height) / 48)),
    intensity: 5,
  })), { position: 0.12, contrast: 0.68 });
  const edgeWear = multiplyMasks(convex, breakup, edgeAmount);
  const cavityDirt = multiplyMasks(cavities, invert(breakup), cavityAmount);

  const chipNoise = histogramScan(breakup, {
    position: 0.68 + (1 - chipAmount) * 0.2,
    contrast: 0.82,
  });
  const chippedPaint = mapAll(edgeWear, (value, _channel, x, y) => (
    clamp(Math.max(value, sample(chipNoise, x, y) * chipAmount * 0.72), 0, 1)
  ));

  const scratches = generate(height.width, height.height, 1, (u, v) => {
    const bend = fbm2(noise, u * 3.1 + 17, v * 3.1 - 9, { octaves: 3 }) * 0.035;
    const line = Math.abs((v * scratchScale + bend + seed * 0.173) % 1 - 0.5);
    const gate = fbm2(noise, u * 11 - 4, v * 2 + 12, { octaves: 2 }) * 0.5 + 0.5;
    return smoothstep(0.035, 0.004, line) * smoothstep(0.46, 0.72, gate) * scratchAmount;
  });

  const dust = mapAll(breakup, (value, _channel, x, y) => (
    clamp((value * 0.62 + sample(cavities, x, y) * 0.38) * dustAmount, 0, 1)
  ));
  const wetness = mapAll(cavities, (value, _channel, x, y) => (
    clamp((value * 0.76 + (1 - sample(breakup, x, y)) * 0.24) * wetnessAmount, 0, 1)
  ));

  return { edgeWear, cavityDirt, chippedPaint, scratches, dust, wetness };
}
