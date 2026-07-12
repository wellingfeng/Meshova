import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { generate, makeTexture, type TextureBuffer } from "./buffer.js";
import { exportLayeredPBR, type PBRExport } from "./export.js";
import { makeDirectionField } from "./material-mechanics.js";
import { analyzeTextureQuality, type LayeredMaterial } from "./shading-mechanics.js";

type RGB = [number, number, number];

const clamp01 = (value: number) => clamp(value, 0, 1);

export type MicrofacetDistribution = "ggx" | "beckmann" | "charlie";

export interface MicrofacetSample {
  distribution: number;
  visibility: number;
  fresnel: number;
  energyCompensation: number;
  response: number;
}

/** Isotropic NDF evaluation. Inputs are cosines in tangent space. */
export function evaluateMicrofacet(
  distribution: MicrofacetDistribution,
  normalHalfCosine: number,
  normalViewCosine: number,
  normalLightCosine: number,
  roughness: number,
  f0 = 0.04,
): MicrofacetSample {
  const nh = clamp(normalHalfCosine, 1e-4, 1);
  const nv = clamp(normalViewCosine, 1e-4, 1);
  const nl = clamp(normalLightCosine, 1e-4, 1);
  const alpha = Math.max(0.0025, roughness * roughness);
  const alpha2 = alpha * alpha;
  const cos2 = nh * nh;
  const sin2 = Math.max(0, 1 - cos2);
  let ndf: number;
  if (distribution === "beckmann") {
    const tan2 = sin2 / cos2;
    ndf = Math.exp(-tan2 / alpha2) / (Math.PI * alpha2 * cos2 * cos2);
  } else if (distribution === "charlie") {
    const inverseAlpha = 1 / Math.max(alpha, 0.025);
    ndf = (2 + inverseAlpha) * Math.pow(Math.sqrt(sin2), inverseAlpha) / (2 * Math.PI);
  } else {
    const denominator = cos2 * (alpha2 - 1) + 1;
    ndf = alpha2 / (Math.PI * denominator * denominator);
  }
  const lambda = (cosine: number) => {
    const tangent2 = Math.max(0, 1 - cosine * cosine) / (cosine * cosine);
    return (Math.sqrt(1 + alpha2 * tangent2) - 1) * 0.5;
  };
  const visibility = 1 / (1 + lambda(nv) + lambda(nl));
  const fresnel = clamp01(f0 + (1 - f0) * Math.pow(1 - nh, 5));
  const energyCompensation = 1 + fresnel * (0.25 + roughness * 0.75);
  return {
    distribution: ndf,
    visibility,
    fresnel,
    energyCompensation,
    response: ndf * visibility * fresnel * energyCompensation / Math.max(4 * nv * nl, 1e-4),
  };
}

export interface DualAnisotropyOptions {
  seed?: number;
  angle?: number;
  crossAngle?: number;
  turbulence?: number;
  scale?: number;
  primaryStrength?: number;
  secondaryStrength?: number;
  weaveFrequency?: number;
}

export interface DualAnisotropyField {
  primaryDirection: TextureBuffer;
  secondaryDirection: TextureBuffer;
  primaryStrength: TextureBuffer;
  secondaryStrength: TextureBuffer;
  crossing: TextureBuffer;
}

/** Two fiber lobes encoded independently for woven clearcoat/base layers. */
export function makeDualAnisotropyField(
  size: number,
  options: DualAnisotropyOptions = {},
): DualAnisotropyField {
  const angle = options.angle ?? 0;
  const crossAngle = options.crossAngle ?? Math.PI * 0.5;
  const turbulence = options.turbulence ?? 0.18;
  const scale = options.scale ?? 5;
  const primaryDirection = makeDirectionField(size, {
    seed: options.seed ?? 0,
    angle,
    turbulence,
    scale,
  });
  const secondaryDirection = makeDirectionField(size, {
    seed: (options.seed ?? 0) + 1,
    angle: angle + crossAngle,
    turbulence,
    scale,
  });
  const frequency = options.weaveFrequency ?? 12;
  const primaryAmount = clamp01(options.primaryStrength ?? 0.85);
  const secondaryAmount = clamp01(options.secondaryStrength ?? 0.65);
  const crossing = generate(size, size, 1, (u, v) => (
    Math.sin((u + v * 0.25) * frequency * TAU) * 0.5 + 0.5
  ));
  const primaryStrength = generate(size, size, 1, (_u, _v, x, y) => {
    const value = crossing.data[y * size + x]!;
    return primaryAmount * (0.55 + value * 0.45);
  });
  const secondaryStrength = generate(size, size, 1, (_u, _v, x, y) => {
    const value = crossing.data[y * size + x]!;
    return secondaryAmount * (1 - value * 0.45);
  });
  return { primaryDirection, secondaryDirection, primaryStrength, secondaryStrength, crossing };
}

export function spectralIor(
  iorAt589Nm: number,
  abbeNumber: number,
  wavelengthNm: number,
): number {
  const wavelength = clamp(wavelengthNm, 380, 780);
  const dispersion = (iorAt589Nm - 1) / Math.max(1, abbeNumber);
  return iorAt589Nm + dispersion * (589 / wavelength - 1) * 3.2;
}

export function wavelengthToRgb(wavelengthNm: number): RGB {
  const wavelength = clamp(wavelengthNm, 380, 780);
  let color: RGB;
  if (wavelength < 440) color = [-(wavelength - 440) / 60, 0, 1];
  else if (wavelength < 490) color = [0, (wavelength - 440) / 50, 1];
  else if (wavelength < 510) color = [0, 1, -(wavelength - 510) / 20];
  else if (wavelength < 580) color = [(wavelength - 510) / 70, 1, 0];
  else if (wavelength < 645) color = [1, -(wavelength - 645) / 65, 0];
  else color = [1, 0, 0];
  const edge = wavelength < 420 ? 0.3 + (wavelength - 380) / 40 * 0.7
    : wavelength > 700 ? 0.3 + (780 - wavelength) / 80 * 0.7
      : 1;
  return color.map((channel) => clamp01(Math.pow(channel * edge, 0.8))) as RGB;
}

export function diffractionColor(
  phase: number,
  viewCosine = 0.7,
  grooveDensity = 0.65,
): RGB {
  const wavelength = 380 + 400 * (phase * grooveDensity / Math.max(0.08, viewCosine) % 1 + 1) % 400;
  return wavelengthToRgb(wavelength);
}

/** Approximate steel oxide color from process temperature. */
export function temperatureOxideColor(temperatureC: number): RGB {
  const stops: Array<[number, RGB]> = [
    [150, [0.58, 0.58, 0.55]],
    [220, [0.72, 0.42, 0.12]],
    [270, [0.38, 0.18, 0.62]],
    [320, [0.12, 0.3, 0.72]],
    [400, [0.55, 0.66, 0.72]],
    [650, [0.24, 0.2, 0.18]],
  ];
  const value = clamp(temperatureC, stops[0]![0], stops.at(-1)![0]);
  for (let index = 1; index < stops.length; index++) {
    const left = stops[index - 1]!;
    const right = stops[index]!;
    if (value <= right[0]) {
      const amount = (value - left[0]) / (right[0] - left[0]);
      return left[1].map((channel, channelIndex) => (
        channel + (right[1][channelIndex]! - channel) * amount
      )) as RGB;
    }
  }
  return stops.at(-1)![1];
}

export interface GrainGrowthOptions {
  seed?: number;
  grains?: number;
  iterations?: number;
  boundaryWidth?: number;
}

export interface GrainGrowthResult {
  grainId: TextureBuffer;
  boundary: TextureBuffer;
  orientation: TextureBuffer;
}

/** Deterministic Voronoi grain growth with relaxed boundaries. */
export function growGrains(size: number, options: GrainGrowthOptions = {}): GrainGrowthResult {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const rng = makeRng(options.seed ?? 0);
  const grainCount = Math.max(2, Math.round(options.grains ?? Math.max(6, size * 0.6)));
  const seeds = Array.from({ length: grainCount }, () => ({
    x: rng.range(0, size),
    y: rng.range(0, size),
    orientation: rng.range(0, 1),
    bias: rng.range(0.88, 1.12),
  }));
  let labels = new Int32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nearest = 0;
      let nearestDistance = Infinity;
      for (let index = 0; index < seeds.length; index++) {
        const seed = seeds[index]!;
        const dx = Math.min(Math.abs(x - seed.x), size - Math.abs(x - seed.x));
        const dy = Math.min(Math.abs(y - seed.y), size - Math.abs(y - seed.y));
        const distance = (dx * dx + dy * dy) * seed.bias;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      }
      labels[y * size + x] = nearest;
    }
  }
  const iterations = Math.max(0, Math.round(options.iterations ?? 2));
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = labels.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const counts = new Map<number, number>();
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const nx = (x + offsetX + size) % size;
            const ny = (y + offsetY + size) % size;
            const label = labels[ny * size + nx]!;
            counts.set(label, (counts.get(label) ?? 0) + 1);
          }
        }
        let winner = labels[y * size + x]!;
        let count = counts.get(winner) ?? 0;
        for (const [label, candidateCount] of counts) {
          if (candidateCount > count || candidateCount === count && label < winner) {
            winner = label;
            count = candidateCount;
          }
        }
        next[y * size + x] = winner;
      }
    }
    labels = next;
  }
  const grainId = makeTexture(size, size, 1);
  const boundary = makeTexture(size, size, 1);
  const orientation = makeTexture(size, size, 1);
  const width = Math.max(0.1, options.boundaryWidth ?? 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = y * size + x;
      const label = labels[pixel]!;
      let differences = 0;
      for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = (x + offsetX + size) % size;
        const ny = (y + offsetY + size) % size;
        if (labels[ny * size + nx] !== label) differences++;
      }
      grainId.data[pixel] = label / Math.max(1, grainCount - 1);
      boundary.data[pixel] = clamp01(differences * 0.25 * width);
      orientation.data[pixel] = seeds[label]!.orientation;
    }
  }
  return { grainId, boundary, orientation };
}

export interface CurveDepositionOptions {
  seed?: number;
  curves?: number;
  width?: number;
  frequency?: number;
  waviness?: number;
  beadFrequency?: number;
  vertical?: boolean;
}

export interface CurveDepositionResult {
  deposit: TextureBuffer;
  centerline: TextureBuffer;
  direction: TextureBuffer;
}

/** Deposits weld beads, glue lines or glaze runs along analytic curves. */
export function depositCurves(size: number, options: CurveDepositionOptions = {}): CurveDepositionResult {
  const rng = makeRng(options.seed ?? 0);
  const curves = Math.max(1, Math.round(options.curves ?? 2));
  const width = Math.max(0.001, options.width ?? 0.035);
  const frequency = options.frequency ?? 1.5;
  const waviness = options.waviness ?? 0.04;
  const beadFrequency = options.beadFrequency ?? 28;
  const offsets = Array.from({ length: curves }, (_, index) => (
    (index + 1) / (curves + 1) + rng.range(-0.08, 0.08)
  ));
  const deposit = makeTexture(size, size, 1);
  const centerline = makeTexture(size, size, 1);
  const direction = makeTexture(size, size, 2);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const along = options.vertical ? v : u;
      const across = options.vertical ? u : v;
      let best = 0;
      let bestDirection = 0;
      for (let curve = 0; curve < curves; curve++) {
        const phase = curve * 1.91 + (options.seed ?? 0) * 0.013;
        const wave = Math.sin((along * frequency + phase) * TAU) * waviness;
        const target = offsets[curve]! + wave;
        const distance = Math.abs(across - target);
        const profile = 1 - smoothstep(width * 0.25, width, distance);
        const beads = 0.68 + 0.32 * (Math.sin((along * beadFrequency + phase) * TAU) * 0.5 + 0.5);
        const value = profile * beads;
        if (value > best) {
          best = value;
          bestDirection = Math.atan(Math.cos((along * frequency + phase) * TAU) * TAU * frequency * waviness);
        }
      }
      const pixel = y * size + x;
      deposit.data[pixel] = clamp01(best);
      centerline.data[pixel] = best > 0.78 ? 1 : 0;
      const angle = (options.vertical ? Math.PI * 0.5 : 0) + bestDirection;
      direction.data[pixel * 2] = Math.cos(angle) * 0.5 + 0.5;
      direction.data[pixel * 2 + 1] = Math.sin(angle) * 0.5 + 0.5;
    }
  }
  return { deposit, centerline, direction };
}

export interface DropletSimulationOptions {
  seed?: number;
  count?: number;
  radius?: number;
  growth?: number;
  mergeIterations?: number;
  evaporation?: number;
}

export interface DropletSimulationResult {
  height: TextureBuffer;
  wetness: TextureBuffer;
  residue: TextureBuffer;
}

export function simulateDroplets(
  size: number,
  options: DropletSimulationOptions = {},
): DropletSimulationResult {
  const rng = makeRng(options.seed ?? 0);
  const count = Math.max(1, Math.round(options.count ?? Math.max(8, size * 0.8)));
  const radius = options.radius ?? 0.035;
  const growth = options.growth ?? 0.25;
  const droplets = Array.from({ length: count }, () => ({
    x: rng.range(0, 1),
    y: rng.range(0, 1),
    radius: radius * rng.range(0.55, 1.45) * (1 + growth),
    alive: true,
  }));
  for (let iteration = 0; iteration < Math.max(0, Math.round(options.mergeIterations ?? 2)); iteration++) {
    for (let left = 0; left < droplets.length; left++) {
      const a = droplets[left]!;
      if (!a.alive) continue;
      for (let right = left + 1; right < droplets.length; right++) {
        const b = droplets[right]!;
        if (!b.alive) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        if (Math.hypot(dx, dy) > (a.radius + b.radius) * 0.72) continue;
        const areaA = a.radius * a.radius;
        const areaB = b.radius * b.radius;
        const total = areaA + areaB;
        a.x = (a.x + dx * areaB / total + 1) % 1;
        a.y = (a.y + dy * areaB / total + 1) % 1;
        a.radius = Math.sqrt(total);
        b.alive = false;
      }
    }
  }
  const evaporation = clamp01(options.evaporation ?? 0.18);
  const height = makeTexture(size, size, 1);
  const wetness = makeTexture(size, size, 1);
  const residue = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let dome = 0;
      let rim = 0;
      for (const droplet of droplets) {
        if (!droplet.alive) continue;
        let dx = Math.abs(u - droplet.x);
        let dy = Math.abs(v - droplet.y);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const normalized = Math.hypot(dx, dy) / Math.max(1e-4, droplet.radius);
        dome = Math.max(dome, normalized < 1 ? Math.sqrt(Math.max(0, 1 - normalized * normalized)) : 0);
        rim = Math.max(rim, 1 - smoothstep(0.72, 1.08, Math.abs(normalized - 0.9) + 0.72));
      }
      const pixel = y * size + x;
      height.data[pixel] = clamp01(dome * (1 - evaporation));
      wetness.data[pixel] = clamp01(dome * (1 - evaporation * 0.65));
      residue.data[pixel] = clamp01(rim * evaporation);
    }
  }
  return { height, wetness, residue };
}

export type ManufacturingMode = "cutting" | "forging" | "coating" | "sintering";

export interface ManufacturingOptions {
  seed?: number;
  scale?: number;
  intensity?: number;
  direction?: number;
  temperature?: number;
  particles?: number;
}

export interface ManufacturingSurface {
  height: TextureBuffer;
  roughness: TextureBuffer;
  heat: TextureBuffer;
  deposit: TextureBuffer;
  direction: TextureBuffer;
}

export function simulateManufacturing(
  size: number,
  mode: ManufacturingMode,
  options: ManufacturingOptions = {},
): ManufacturingSurface {
  const seed = options.seed ?? 0;
  const scale = options.scale ?? 10;
  const intensity = clamp01(options.intensity ?? 0.75);
  const angle = options.direction ?? 0;
  const temperature = clamp01(options.temperature ?? 0.65);
  const particles = options.particles ?? 32;
  const noise = makeNoise(seed);
  const detailNoise = makeNoise(seed + 97);
  const direction = makeDirectionField(size, { seed, angle, turbulence: 0.1, scale: 4 });
  const height = makeTexture(size, size, 1);
  const roughness = makeTexture(size, size, 1);
  const heat = makeTexture(size, size, 1);
  const deposit = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const along = u * Math.cos(angle) + v * Math.sin(angle);
      const broad = fbm2(noise, u * scale * 0.35, v * scale * 0.35, { octaves: 4 }) * 0.5 + 0.5;
      const fine = detailNoise.noise2(u * scale * 4, v * scale * 4) * 0.5 + 0.5;
      let h = broad;
      let r = 0.5;
      let processHeat = 0;
      let processDeposit = 0;
      if (mode === "cutting") {
        const grooves = Math.pow(Math.abs(Math.sin(along * scale * TAU)), 10);
        h = 0.48 + (1 - grooves) * 0.1 * intensity + fine * 0.02;
        r = 0.16 + grooves * 0.24 + fine * 0.08;
      } else if (mode === "forging") {
        const layers = Math.sin((along * scale + broad * 2.2) * TAU) * 0.5 + 0.5;
        h = 0.3 + layers * 0.28 * intensity + fine * 0.05;
        r = 0.28 + (1 - layers) * 0.36;
        processHeat = temperature * (0.45 + broad * 0.55);
      } else if (mode === "coating") {
        const orangePeel = Math.pow(fine, 2.2);
        const edgeBuild = smoothstep(0.28, 0.5, Math.abs(broad - 0.5));
        h = 0.42 + orangePeel * 0.16 * intensity + edgeBuild * 0.04;
        r = 0.2 + orangePeel * 0.24;
        processDeposit = clamp01((orangePeel * 0.75 + edgeBuild * 0.25) * intensity);
      } else {
        const pores = smoothstep(0.62, 0.88, fine + (particles / 128) * 0.1);
        h = 0.54 - pores * 0.22 * intensity + broad * 0.04;
        r = 0.58 + pores * 0.34;
        processHeat = temperature * (0.7 + broad * 0.3);
        processDeposit = 1 - pores;
      }
      const pixel = y * size + x;
      height.data[pixel] = clamp01(h);
      roughness.data[pixel] = clamp(r, 0.04, 1);
      heat.data[pixel] = clamp01(processHeat);
      deposit.data[pixel] = clamp01(processDeposit);
    }
  }
  return { height, roughness, heat, deposit, direction };
}

/** Symmetric edge blend. Returns new buffer; input stays untouched. */
export function makeTextureSeamless(texture: TextureBuffer, blendWidth = 0.08): TextureBuffer {
  const output = makeTexture(texture.width, texture.height, texture.channels);
  const width = Math.max(1, Math.round(Math.min(texture.width, texture.height) * clamp(blendWidth, 0.01, 0.49)));
  output.data.set(texture.data);
  for (let y = 0; y < texture.height; y++) {
    for (let offset = 0; offset < width; offset++) {
      const amount = 1 - offset / width;
      const left = (y * texture.width + offset) * texture.channels;
      const right = (y * texture.width + texture.width - 1 - offset) * texture.channels;
      for (let channel = 0; channel < texture.channels; channel++) {
        const average = (texture.data[left + channel]! + texture.data[right + channel]!) * 0.5;
        output.data[left + channel] = texture.data[left + channel]! * (1 - amount) + average * amount;
        output.data[right + channel] = texture.data[right + channel]! * (1 - amount) + average * amount;
      }
    }
  }
  const horizontal = output.data.slice();
  for (let x = 0; x < texture.width; x++) {
    for (let offset = 0; offset < width; offset++) {
      const amount = 1 - offset / width;
      const top = (offset * texture.width + x) * texture.channels;
      const bottom = ((texture.height - 1 - offset) * texture.width + x) * texture.channels;
      for (let channel = 0; channel < texture.channels; channel++) {
        const average = (horizontal[top + channel]! + horizontal[bottom + channel]!) * 0.5;
        output.data[top + channel] = horizontal[top + channel]! * (1 - amount) + average * amount;
        output.data[bottom + channel] = horizontal[bottom + channel]! * (1 - amount) + average * amount;
      }
    }
  }
  return output;
}

export interface ManufacturingQualityReport {
  horizontalSeam: number;
  verticalSeam: number;
  mipStability: number;
  lowFrequencyEnergy: number;
  highFrequencyEnergy: number;
  normalEnergy: number;
}

export function analyzeManufacturingQuality(
  texture: TextureBuffer,
  normal?: TextureBuffer,
): ManufacturingQualityReport {
  const base = analyzeTextureQuality(texture);
  let lowFrequencyEnergy = 0;
  let highFrequencyEnergy = 0;
  let samples = 0;
  for (let y = 1; y < texture.height - 1; y++) {
    for (let x = 1; x < texture.width - 1; x++) {
      const index = (y * texture.width + x) * texture.channels;
      const center = texture.data[index]!;
      const left = texture.data[index - texture.channels]!;
      const right = texture.data[index + texture.channels]!;
      const up = texture.data[index - texture.width * texture.channels]!;
      const down = texture.data[index + texture.width * texture.channels]!;
      lowFrequencyEnergy += Math.abs(center - (left + right + up + down) * 0.25);
      highFrequencyEnergy += Math.abs(right - left) + Math.abs(down - up);
      samples++;
    }
  }
  let normalEnergy = 0;
  if (normal?.channels === 3) {
    for (let pixel = 0; pixel < normal.width * normal.height; pixel++) {
      const x = normal.data[pixel * 3]! * 2 - 1;
      const y = normal.data[pixel * 3 + 1]! * 2 - 1;
      normalEnergy += Math.hypot(x, y);
    }
    normalEnergy /= normal.width * normal.height;
  }
  return {
    ...base,
    lowFrequencyEnergy: lowFrequencyEnergy / Math.max(1, samples),
    highFrequencyEnergy: highFrequencyEnergy / Math.max(1, samples * 2),
    normalEnergy,
  };
}

export interface PerceptualTextureFeatures {
  mean: number;
  variance: number;
  edgeEnergy: number;
  coverage: number;
}

export function extractPerceptualFeatures(texture: TextureBuffer): PerceptualTextureFeatures {
  let sum = 0;
  let sumSquared = 0;
  let coverage = 0;
  const pixels = texture.width * texture.height;
  for (let pixel = 0; pixel < pixels; pixel++) {
    let value = 0;
    for (let channel = 0; channel < texture.channels; channel++) {
      value += texture.data[pixel * texture.channels + channel]!;
    }
    value /= texture.channels;
    sum += value;
    sumSquared += value * value;
    if (value > 0.5) coverage++;
  }
  const mean = sum / pixels;
  let edgeEnergy = 0;
  let edges = 0;
  for (let y = 0; y < texture.height; y++) {
    for (let x = 0; x < texture.width - 1; x++) {
      const left = (y * texture.width + x) * texture.channels;
      const right = left + texture.channels;
      edgeEnergy += Math.abs(texture.data[left]! - texture.data[right]!);
      edges++;
    }
  }
  return {
    mean,
    variance: Math.max(0, sumSquared / pixels - mean * mean),
    edgeEnergy: edgeEnergy / Math.max(1, edges),
    coverage: coverage / pixels,
  };
}

export interface ParameterFitResult<T> {
  params: T;
  score: number;
  features: PerceptualTextureFeatures;
}

/** Deterministic finite-candidate inverse fit. Renderer remains caller-owned. */
export function fitMaterialParameters<T>(
  target: TextureBuffer,
  candidates: readonly T[],
  render: (params: T) => TextureBuffer,
): ParameterFitResult<T> {
  if (candidates.length === 0) throw new Error("at least one candidate is required");
  const targetFeatures = extractPerceptualFeatures(target);
  let best: ParameterFitResult<T> | undefined;
  for (const params of candidates) {
    const features = extractPerceptualFeatures(render(params));
    const score = Math.abs(features.mean - targetFeatures.mean) * 1.5
      + Math.abs(features.variance - targetFeatures.variance) * 2
      + Math.abs(features.edgeEnergy - targetFeatures.edgeEnergy)
      + Math.abs(features.coverage - targetFeatures.coverage) * 0.5;
    if (!best || score < best.score) best = { params, score, features };
  }
  return best!;
}

export interface OpenPBRTextureBinding {
  file: string;
  colorSpace: "linear" | "srgb";
  channel?: "r" | "rgb";
}

export interface OpenPBRDocument {
  schema: "OpenPBR";
  version: "1.0";
  name: string;
  parameters: Record<string, number | RGB | OpenPBRTextureBinding>;
}

export function mapLayeredMaterialToOpenPBR(
  material: LayeredMaterial,
  baseName = "material",
): OpenPBRDocument {
  const texture = (suffix: string, colorSpace: "linear" | "srgb", channel?: "r" | "rgb") => ({
    file: `${baseName}_${suffix}.png`,
    colorSpace,
    ...(channel ? { channel } : {}),
  });
  return {
    schema: "OpenPBR",
    version: "1.0",
    name: baseName,
    parameters: {
      base_weight: 1,
      base_color: texture("baseColor", "srgb", "rgb"),
      base_metalness: texture("metallic", "linear", "r"),
      specular_roughness: texture("roughness", "linear", "r"),
      specular_ior: material.physical.ior,
      coat_weight: texture("clearcoat", "linear", "r"),
      coat_roughness: texture("clearcoatRoughness", "linear", "r"),
      fuzz_weight: texture("sheen", "linear", "r"),
      fuzz_color: texture("sheenColor", "srgb", "rgb"),
      transmission_weight: texture("transmission", "linear", "r"),
      transmission_depth: material.physical.thickness,
      transmission_color: material.physical.attenuationColor,
      transmission_dispersion_scale: material.physical.dispersion ?? 0,
      thin_film_weight: texture("iridescence", "linear", "r"),
      thin_film_thickness: texture("iridescenceThickness", "linear", "r"),
      geometry_opacity: texture("opacity", "linear", "r"),
      geometry_normal: texture("normal", "linear", "rgb"),
      geometry_displacement: texture("height", "linear", "r"),
    },
  };
}

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("\"", "&quot;");
}

/** MaterialX Standard Surface document preserving portable OpenPBR maps. */
export function serializeMaterialX(
  material: LayeredMaterial,
  baseName = "material",
): string {
  const name = xmlEscape(baseName);
  const image = (node: string, file: string, type = "float", colorspace?: string) => (
    `  <image name="${node}" type="${type}" file="${xmlEscape(file)}"${colorspace ? ` colorspace="${colorspace}"` : ""}/>`
  );
  return [
    "<?xml version=\"1.0\"?>",
    "<materialx version=\"1.39\">",
    image(`${name}_base_color`, `${baseName}_baseColor.png`, "color3", "srgb_texture"),
    image(`${name}_metalness`, `${baseName}_metallic.png`),
    image(`${name}_roughness`, `${baseName}_roughness.png`),
    image(`${name}_normal`, `${baseName}_normal.png`, "vector3"),
    image(`${name}_coat`, `${baseName}_clearcoat.png`),
    image(`${name}_coat_roughness`, `${baseName}_clearcoatRoughness.png`),
    image(`${name}_transmission`, `${baseName}_transmission.png`),
    `  <standard_surface name="${name}_surface" type="surfaceshader">`,
    `    <input name="base_color" type="color3" nodename="${name}_base_color"/>`,
    `    <input name="metalness" type="float" nodename="${name}_metalness"/>`,
    `    <input name="specular_roughness" type="float" nodename="${name}_roughness"/>`,
    `    <input name="specular_IOR" type="float" value="${material.physical.ior}"/>`,
    `    <input name="coat" type="float" nodename="${name}_coat"/>`,
    `    <input name="coat_roughness" type="float" nodename="${name}_coat_roughness"/>`,
    `    <input name="transmission" type="float" nodename="${name}_transmission"/>`,
    `    <input name="normal" type="vector3" nodename="${name}_normal"/>`,
    "  </standard_surface>",
    `  <surfacematerial name="${name}"><input name="surfaceshader" type="surfaceshader" nodename="${name}_surface"/></surfacematerial>`,
    "</materialx>",
  ].join("\n");
}

export interface OpenPBRExport extends PBRExport {
  openPbr: OpenPBRDocument;
  materialX: string;
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 0x3f);
    else if (code < 0x10000) bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
    else bytes.push(0xf0 | code >> 18, 0x80 | code >> 12 & 0x3f, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return Uint8Array.from(bytes);
}

export function exportOpenPBRMaterial(
  material: LayeredMaterial,
  baseName = "material",
): OpenPBRExport {
  const pbr = exportLayeredPBR(material, baseName);
  const openPbr = mapLayeredMaterialToOpenPBR(material, baseName);
  const materialX = serializeMaterialX(material, baseName);
  return {
    ...pbr,
    files: {
      ...pbr.files,
      [`${baseName}.openpbr.json`]: encodeUtf8(JSON.stringify(openPbr, null, 2)),
      [`${baseName}.mtlx`]: encodeUtf8(materialX),
    },
    openPbr,
    materialX,
  };
}
