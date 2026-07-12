import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";

export interface WeatherStackOptions {
  seed?: number;
  wetness?: number;
  dirt?: number;
  rust?: number;
  moss?: number;
  snow?: number;
  scale?: number;
  normalStrength?: number;
  dirtColor?: readonly [number, number, number];
  rustColor?: readonly [number, number, number];
  mossColor?: readonly [number, number, number];
  snowColor?: readonly [number, number, number];
}

export interface WeatherStackMasks {
  wetness: TextureBuffer;
  dirt: TextureBuffer;
  rust: TextureBuffer;
  moss: TextureBuffer;
  snow: TextureBuffer;
}

export interface WeatherStackResult {
  material: Material;
  masks: WeatherStackMasks;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function textureRange(texture: TextureBuffer): { minimum: number; span: number } {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of texture.data) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return { minimum, span: Math.max(1e-6, maximum - minimum) };
}

function assertMaterialDimensions(material: Material): void {
  const { width, height } = material.height;
  const channels: Array<[TextureBuffer, number, string]> = [
    [material.baseColor, 3, "baseColor"],
    [material.metallic, 1, "metallic"],
    [material.roughness, 1, "roughness"],
    [material.normal, 3, "normal"],
    [material.ao, 1, "ao"],
    [material.height, 1, "height"],
    [material.emission, 3, "emission"],
  ];
  for (const [texture, expectedChannels, name] of channels) {
    if (texture.width !== width || texture.height !== height || texture.channels !== expectedChannels) {
      throw new Error(`weather stack ${name} dimensions mismatch`);
    }
  }
}

/** Build deterministic wetness, dirt, rust, moss and snow masks from one material. */
export function buildWeatherStackMasks(
  material: Material,
  options: WeatherStackOptions = {},
): WeatherStackMasks {
  assertMaterialDimensions(material);
  const { width, height } = material.height;
  const wetnessAmount = clamp(options.wetness ?? 0, 0, 1);
  const dirtAmount = clamp(options.dirt ?? 0, 0, 1);
  const rustAmount = clamp(options.rust ?? 0, 0, 1);
  const mossAmount = clamp(options.moss ?? 0, 0, 1);
  const snowAmount = clamp(options.snow ?? 0, 0, 1);
  const scale = Math.max(0.5, options.scale ?? 7);
  const noise = makeNoise(options.seed ?? 0);
  const range = textureRange(material.height);
  const pixelScale = Math.min(width, height);
  const wetness = makeTexture(width, height, 1);
  const dirt = makeTexture(width, height, 1);
  const rust = makeTexture(width, height, 1);
  const moss = makeTexture(width, height, 1);
  const snow = makeTexture(width, height, 1);
  const normalizedHeight = (x: number, y: number) => (
    (sample(material.height, x, y) - range.minimum) / range.span
  );

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const pixel = y * width + x;
      const center = normalizedHeight(x, y);
      const left = normalizedHeight(x - 1, y);
      const right = normalizedHeight(x + 1, y);
      const down = normalizedHeight(x, y + 1);
      const up = normalizedHeight(x, y - 1);
      const slope = clamp(Math.hypot(right - left, up - down) * pixelScale * 0.18, 0, 1);
      const localCavity = clamp(((left + right + down + up) * 0.25 - center) * pixelScale * 0.35, 0, 1);
      const bakedCavity = clamp((1 - sample(material.ao, x, y)) * 2.5, 0, 1);
      const cavity = Math.max(localCavity, bakedCavity);
      const flatness = 1 - smoothstep(0.08, 0.52, slope);
      const low = 1 - smoothstep(0.24, 0.68, center);
      const high = smoothstep(0.38, 0.82, center);
      const broadNoise = fbm2(noise, u * scale, v * scale, { octaves: 4 }) * 0.5 + 0.5;
      const fineNoise = fbm2(noise, u * scale * 3.7 + 17, v * scale * 3.7 - 11, { octaves: 3 }) * 0.5 + 0.5;
      const metallic = sample(material.metallic, x, y);
      const rawWetness = clamp(
        (low * 0.42 + cavity * 0.34 + (1 - broadNoise) * 0.24) * (0.48 + flatness * 0.52),
        0,
        1,
      ) * wetnessAmount;
      const rawDirt = clamp(
        (cavity * 0.5 + low * 0.25 + broadNoise * 0.25) * (0.58 + flatness * 0.42),
        0,
        1,
      ) * dirtAmount;
      const rawRust = clamp(
        (cavity * 0.3 + low * 0.2 + broadNoise * 0.32 + fineNoise * 0.18) * metallic,
        0,
        1,
      ) * rustAmount;
      const rawMoss = clamp(
        cavity * 0.34 + low * 0.2 + broadNoise * 0.28 + flatness * 0.18,
        0,
        1,
      ) * mossAmount;
      const snowMask = clamp(
        (high * 0.38 + flatness * 0.46 + broadNoise * 0.16) * snowAmount,
        0,
        1,
      );
      const mossMask = clamp(rawMoss * (1 - snowMask * 0.9), 0, 1);
      const rustMask = clamp(rawRust * (1 - snowMask * 0.95) * (1 - mossMask * 0.55), 0, 1);
      const dirtMask = clamp(rawDirt * (1 - snowMask) * (1 - mossMask * 0.65), 0, 1);

      wetness.data[pixel] = clamp(rawWetness * (1 - snowMask * 0.82), 0, 1);
      dirt.data[pixel] = dirtMask;
      rust.data[pixel] = rustMask;
      moss.data[pixel] = mossMask;
      snow.data[pixel] = snowMask;
    }
  }
  return { wetness, dirt, rust, moss, snow };
}

/** Apply a coherent weather state across base color, roughness, metalness, AO and height. */
export function applyWeatherStack(
  material: Material,
  options: WeatherStackOptions = {},
): WeatherStackResult {
  const masks = buildWeatherStackMasks(material, options);
  const { width, height } = material.height;
  const baseColor = makeTexture(width, height, 3);
  const metallic = makeTexture(width, height, 1);
  const roughness = makeTexture(width, height, 1);
  const ao = makeTexture(width, height, 1);
  const resultHeight = makeTexture(width, height, 1);
  const dirtColor = options.dirtColor ?? [0.12, 0.082, 0.042];
  const rustColor = options.rustColor ?? [0.52, 0.17, 0.035];
  const mossColor = options.mossColor ?? [0.12, 0.27, 0.065];
  const snowColor = options.snowColor ?? [0.88, 0.94, 0.98];
  let changesRelief = false;

  for (let pixel = 0; pixel < width * height; pixel++) {
    const wet = masks.wetness.data[pixel]!;
    const dirty = masks.dirt.data[pixel]!;
    const rusty = masks.rust.data[pixel]!;
    const mossy = masks.moss.data[pixel]!;
    const snowy = masks.snow.data[pixel]!;
    changesRelief ||= dirty > 0 || rusty > 0 || mossy > 0 || snowy > 0;
    for (let channel = 0; channel < 3; channel++) {
      let value = material.baseColor.data[pixel * 3 + channel]!;
      value = mix(value, dirtColor[channel]!, dirty * 0.78);
      value = mix(value, rustColor[channel]!, rusty * 0.92);
      value = mix(value, mossColor[channel]!, mossy * 0.9);
      value = mix(value, snowColor[channel]!, snowy * 0.96);
      baseColor.data[pixel * 3 + channel] = clamp(value * (1 - wet * 0.28), 0, 1);
    }
    metallic.data[pixel] = clamp(
      material.metallic.data[pixel]!
        * (1 - dirty * 0.7)
        * (1 - rusty)
        * (1 - mossy)
        * (1 - snowy),
      0,
      1,
    );
    let rough = material.roughness.data[pixel]! + dirty * 0.2;
    rough = mix(rough, 0.9, rusty * 0.92);
    rough = mix(rough, 0.94, mossy * 0.88);
    rough = mix(rough, 0.78, snowy * 0.82);
    roughness.data[pixel] = clamp(mix(rough, 0.06, wet * 0.9), 0.04, 1);
    ao.data[pixel] = clamp(
      material.ao.data[pixel]! - dirty * 0.12 - rusty * 0.07 - mossy * 0.05 + snowy * 0.06,
      0,
      1,
    );
    resultHeight.data[pixel] = clamp(
      material.height.data[pixel]! + dirty * 0.012 + rusty * 0.018 + mossy * 0.035 + snowy * 0.16,
      0,
      1,
    );
  }

  return {
    material: {
      ...material,
      baseColor,
      metallic,
      roughness,
      ao,
      height: resultHeight,
      normal: changesRelief
        ? heightToNormal(resultHeight, options.normalStrength ?? 4)
        : material.normal,
    },
    masks,
  };
}
