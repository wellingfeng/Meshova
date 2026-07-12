import { makeRng } from "../random/prng.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";

export interface FitParameter {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

export interface TextureFitMetricOptions {
  colorWeight?: number;
  edgeWeight?: number;
}

export interface TextureReferenceFitOptions extends TextureFitMetricOptions {
  seed?: number;
  candidates?: number;
  refinementPasses?: number;
  initial?: Readonly<Record<string, number>>;
}

export interface TextureReferenceFitResult {
  readonly params: Readonly<Record<string, number>>;
  readonly score: number;
  readonly evaluations: number;
  readonly texture: TextureBuffer;
}

export function textureReferenceDistance(
  reference: TextureBuffer,
  candidate: TextureBuffer,
  options: TextureFitMetricOptions = {},
): number {
  assertCompatible(reference, candidate);
  const colorWeight = Math.max(0, options.colorWeight ?? 0.72);
  const edgeWeight = Math.max(0, options.edgeWeight ?? 0.28);
  const totalWeight = Math.max(Number.EPSILON, colorWeight + edgeWeight);
  let colorError = 0;
  let edgeError = 0;
  const values = reference.width * reference.height * reference.channels;
  for (let index = 0; index < values; index++) {
    colorError += Math.abs(reference.data[index]! - candidate.data[index]!);
  }
  for (let y = 0; y < reference.height; y++) {
    for (let x = 0; x < reference.width; x++) {
      for (let channel = 0; channel < reference.channels; channel++) {
        const referenceDx = sample(reference, x + 1, y, channel) - sample(reference, x - 1, y, channel);
        const referenceDy = sample(reference, x, y + 1, channel) - sample(reference, x, y - 1, channel);
        const candidateDx = sample(candidate, x + 1, y, channel) - sample(candidate, x - 1, y, channel);
        const candidateDy = sample(candidate, x, y + 1, channel) - sample(candidate, x, y - 1, channel);
        edgeError += Math.abs(referenceDx - candidateDx) + Math.abs(referenceDy - candidateDy);
      }
    }
  }
  const colorMean = colorError / values;
  const edgeMean = edgeError / (values * 2);
  return (colorMean * colorWeight + edgeMean * edgeWeight) / totalWeight;
}

export function fitTextureReference(
  reference: TextureBuffer,
  parameters: readonly FitParameter[],
  render: (params: Readonly<Record<string, number>>) => TextureBuffer,
  options: TextureReferenceFitOptions = {},
): TextureReferenceFitResult {
  if (parameters.length === 0) throw new Error("reference fitting requires parameters");
  const names = new Set<string>();
  for (const parameter of parameters) {
    if (!parameter.name.trim()) throw new Error("fit parameter name must not be empty");
    if (names.has(parameter.name)) throw new Error(`duplicate fit parameter: ${parameter.name}`);
    if (!(parameter.max > parameter.min)) throw new Error(`invalid fit range: ${parameter.name}`);
    names.add(parameter.name);
  }
  const rng = makeRng(options.seed ?? 0);
  const cache = new Map<string, { score: number; texture: TextureBuffer; params: Readonly<Record<string, number>> }>();
  const evaluate = (raw: Readonly<Record<string, number>>) => {
    const params = quantizeParams(raw, parameters);
    const key = parameters.map((parameter) => params[parameter.name]!.toPrecision(12)).join("|");
    const cached = cache.get(key);
    if (cached) return cached;
    const texture = render(params);
    assertCompatible(reference, texture);
    const value = {
      params,
      texture,
      score: textureReferenceDistance(reference, texture, options),
    };
    cache.set(key, value);
    return value;
  };
  const midpoint = Object.fromEntries(parameters.map((parameter) => [
    parameter.name,
    options.initial?.[parameter.name] ?? (parameter.min + parameter.max) * 0.5,
  ]));
  let best = evaluate(midpoint);
  const candidates = Math.max(0, Math.floor(options.candidates ?? 48));
  for (let candidate = 0; candidate < candidates; candidate++) {
    const params = Object.fromEntries(parameters.map((parameter) => [
      parameter.name,
      rng.range(parameter.min, parameter.max),
    ]));
    const result = evaluate(params);
    if (result.score < best.score) best = result;
  }
  const refinementPasses = Math.max(0, Math.floor(options.refinementPasses ?? 4));
  for (let pass = 0; pass < refinementPasses; pass++) {
    const fraction = 0.25 * Math.pow(0.5, pass);
    for (const parameter of parameters) {
      const radius = (parameter.max - parameter.min) * fraction;
      for (const direction of [-1, 1]) {
        const params = { ...best.params, [parameter.name]: best.params[parameter.name]! + radius * direction };
        const result = evaluate(params);
        if (result.score < best.score) best = result;
      }
    }
  }
  return {
    params: best.params,
    score: best.score,
    evaluations: cache.size,
    texture: best.texture,
  };
}

function quantizeParams(
  values: Readonly<Record<string, number>>,
  parameters: readonly FitParameter[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(parameters.map((parameter) => {
    const clamped = Math.max(parameter.min, Math.min(parameter.max, values[parameter.name] ?? parameter.min));
    const step = Math.max(0, parameter.step ?? 0);
    const value = step > 0
      ? parameter.min + Math.round((clamped - parameter.min) / step) * step
      : clamped;
    return [parameter.name, Math.max(parameter.min, Math.min(parameter.max, value))];
  }));
}

function assertCompatible(reference: TextureBuffer, candidate: TextureBuffer): void {
  if (
    reference.width !== candidate.width
    || reference.height !== candidate.height
    || reference.channels !== candidate.channels
  ) {
    throw new Error("reference and candidate textures must share dimensions and channels");
  }
}

export interface TextureReferenceTarget {
  readonly name: string;
  readonly texture: TextureBuffer;
  readonly weight?: number;
}

export interface MultiTextureReferenceFitResult {
  readonly params: Readonly<Record<string, number>>;
  readonly score: number;
  readonly evaluations: number;
  readonly textures: Readonly<Record<string, TextureBuffer>>;
  readonly perReferenceScore: Readonly<Record<string, number>>;
}

/** Fit shared procedural parameters against multiple views or PBR channels. */
export function fitTextureReferences(
  references: readonly TextureReferenceTarget[],
  parameters: readonly FitParameter[],
  render: (params: Readonly<Record<string, number>>) => Readonly<Record<string, TextureBuffer>>,
  options: TextureReferenceFitOptions = {},
): MultiTextureReferenceFitResult {
  if (references.length === 0) throw new Error("multi-reference fitting requires references");
  if (parameters.length === 0) throw new Error("reference fitting requires parameters");
  const referenceNames = new Set<string>();
  for (const reference of references) {
    if (!reference.name.trim() || referenceNames.has(reference.name)) throw new Error(`invalid or duplicate reference name: ${reference.name}`);
    if ((reference.weight ?? 1) < 0) throw new Error(`reference weight must be non-negative: ${reference.name}`);
    referenceNames.add(reference.name);
  }
  const parameterNames = new Set<string>();
  for (const parameter of parameters) {
    if (!parameter.name.trim() || parameterNames.has(parameter.name)) throw new Error(`invalid or duplicate fit parameter: ${parameter.name}`);
    if (!(parameter.max > parameter.min)) throw new Error(`invalid fit range: ${parameter.name}`);
    parameterNames.add(parameter.name);
  }
  const rng = makeRng(options.seed ?? 0);
  const cache = new Map<string, MultiTextureReferenceFitResult>();
  const evaluate = (raw: Readonly<Record<string, number>>): MultiTextureReferenceFitResult => {
    const params = quantizeParams(raw, parameters);
    const key = parameters.map((parameter) => params[parameter.name]!.toPrecision(12)).join("|");
    const cached = cache.get(key);
    if (cached) return cached;
    const textures = render(params);
    let weightedScore = 0;
    let totalWeight = 0;
    const perReferenceScore: Record<string, number> = {};
    for (const reference of references) {
      const texture = textures[reference.name];
      if (!texture) throw new Error(`renderer did not return reference texture: ${reference.name}`);
      assertCompatible(reference.texture, texture);
      const score = textureReferenceDistance(reference.texture, texture, options);
      const weight = reference.weight ?? 1;
      perReferenceScore[reference.name] = score;
      weightedScore += score * weight;
      totalWeight += weight;
    }
    const result = {
      params,
      score: weightedScore / Math.max(Number.EPSILON, totalWeight),
      evaluations: 0,
      textures,
      perReferenceScore,
    };
    cache.set(key, result);
    return result;
  };
  const initial = Object.fromEntries(parameters.map((parameter) => [
    parameter.name,
    options.initial?.[parameter.name] ?? (parameter.min + parameter.max) * 0.5,
  ]));
  let best = evaluate(initial);
  for (let candidate = 0; candidate < Math.max(0, Math.floor(options.candidates ?? 48)); candidate++) {
    const params = Object.fromEntries(parameters.map((parameter) => [parameter.name, rng.range(parameter.min, parameter.max)]));
    const result = evaluate(params);
    if (result.score < best.score) best = result;
  }
  for (let pass = 0; pass < Math.max(0, Math.floor(options.refinementPasses ?? 4)); pass++) {
    const fraction = 0.25 * Math.pow(0.5, pass);
    for (const parameter of parameters) {
      const radius = (parameter.max - parameter.min) * fraction;
      for (const direction of [-1, 1]) {
        const result = evaluate({ ...best.params, [parameter.name]: best.params[parameter.name]! + radius * direction });
        if (result.score < best.score) best = result;
      }
    }
  }
  return { ...best, evaluations: cache.size };
}

/** Remove low-frequency exposure gradients before fitting photographed color. */
export function removeReferenceLighting(texture: TextureBuffer, radius = 8): TextureBuffer {
  const blurRadius = Math.max(1, Math.floor(radius));
  const output = makeTexture(texture.width, texture.height, texture.channels);
  const channelMeans = new Array<number>(texture.channels).fill(0);
  for (let index = 0; index < texture.data.length; index++) {
    const channel = index % texture.channels;
    channelMeans[channel] = channelMeans[channel]! + texture.data[index]!;
  }
  for (let channel = 0; channel < texture.channels; channel++) {
    channelMeans[channel] = channelMeans[channel]! / (texture.width * texture.height);
  }
  for (let y = 0; y < texture.height; y++) {
    for (let x = 0; x < texture.width; x++) {
      for (let channel = 0; channel < texture.channels; channel++) {
        let illumination = 0;
        let count = 0;
        for (let offsetY = -blurRadius; offsetY <= blurRadius; offsetY++) {
          for (let offsetX = -blurRadius; offsetX <= blurRadius; offsetX++) {
            illumination += sample(texture, x + offsetX, y + offsetY, channel);
            count++;
          }
        }
        const source = sample(texture, x, y, channel);
        output.data[(y * texture.width + x) * texture.channels + channel] = Math.max(
          0,
          Math.min(1, source / Math.max(1e-4, illumination / count) * channelMeans[channel]!),
        );
      }
    }
  }
  return output;
}
