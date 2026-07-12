import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";

export interface DamagedPlasterSystemOptions {
  readonly seed?: number;
  readonly plasterColor?: readonly [number, number, number];
  readonly brickColor?: readonly [number, number, number];
  readonly damage?: number;
  readonly cracks?: number;
  readonly edgeBreakup?: number;
  readonly dirt?: number;
  readonly brickColumns?: number;
  readonly brickRows?: number;
  readonly normalStrength?: number;
}

export interface DamagedPlasterMasks {
  readonly plaster: TextureBuffer;
  readonly exposedBrick: TextureBuffer;
  readonly crack: TextureBuffer;
  readonly chippedEdge: TextureBuffer;
  readonly brick: TextureBuffer;
  readonly mortar: TextureBuffer;
  readonly dirt: TextureBuffer;
}

export interface DamagedPlasterSystemResult {
  readonly material: Material;
  readonly masks: DamagedPlasterMasks;
}

interface ChipSeed {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotation: number;
}

interface CrackSegment {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly width: number;
}

export function damagedPlasterSystem(
  size: number,
  options: DamagedPlasterSystemOptions = {},
): DamagedPlasterSystemResult {
  const resolution = Math.floor(size);
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error("damaged plaster system size must be an integer >= 16");
  }
  const seed = options.seed ?? 149;
  const damageAmount = clamp(options.damage ?? 0.58, 0, 1);
  const crackAmount = clamp(options.cracks ?? 0.68, 0, 1);
  const edgeBreakup = clamp(options.edgeBreakup ?? 0.62, 0, 1);
  const dirtAmount = clamp(options.dirt ?? 0.38, 0, 1);
  const brickColumns = Math.max(2, Math.floor(options.brickColumns ?? 7));
  const brickRows = Math.max(2, Math.floor(options.brickRows ?? 14));
  const plasterColor = options.plasterColor ?? [0.66, 0.61, 0.51];
  const brickColor = options.brickColor ?? [0.48, 0.16, 0.065];
  const noise = makeNoise(seed);
  const chipSeeds = createChipSeeds(seed, 6);
  const crackSegments = createCrackSegments(seed + 271, chipSeeds, 5, crackAmount);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks: DamagedPlasterMasks = {
    plaster: makeTexture(resolution, resolution, 1),
    exposedBrick: makeTexture(resolution, resolution, 1),
    crack: makeTexture(resolution, resolution, 1),
    chippedEdge: makeTexture(resolution, resolution, 1),
    brick: makeTexture(resolution, resolution, 1),
    mortar: makeTexture(resolution, resolution, 1),
    dirt: makeTexture(resolution, resolution, 1),
  };

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const broadNoise = fbm2(noise, u * 5.2 + 13, v * 5.2 - 9, { octaves: 4 }) * 0.5 + 0.5;
      const edgeNoise = fbm2(noise, u * 22 - 17, v * 22 + 21, { octaves: 3 }) * 0.5 + 0.5;
      const grain = fbm2(noise, u * 58 + 31, v * 58 - 25, { octaves: 2 }) * 0.5 + 0.5;
      const damageField = chipField(u, v, chipSeeds) + (edgeNoise - 0.5) * edgeBreakup * 0.34;
      const exposureThreshold = 0.28 + damageAmount * 0.48;
      const rawExposure = smoothstep(exposureThreshold + 0.055, exposureThreshold - 0.035, damageField);
      const exposed = damageAmount > 0 ? rawExposure : 0;
      const chipped = smoothstep(exposureThreshold + 0.14, exposureThreshold + 0.025, damageField)
        * (1 - rawExposure)
        * damageAmount;
      const crackDistance = minimumCrackDistance(u, v, crackSegments);
      const crackWidth = (0.0018 + edgeNoise * 0.0024) * (0.38 + crackAmount * 0.92);
      const crack = (1 - smoothstep(crackWidth * 0.35, crackWidth * 1.85, crackDistance))
        * crackAmount
        * (1 - exposed * 0.92);
      const brickPattern = sampleBrick(u, v, brickColumns, brickRows, edgeNoise);
      const mortar = brickPattern.mortar * exposed;
      const brick = (1 - brickPattern.mortar) * exposed;
      const dirt = clamp(
        (crack * 0.72 + chipped * 0.42 + mortar * 0.54 + (1 - v) * 0.08 + broadNoise * 0.08)
          * dirtAmount,
        0,
        1,
      );
      const plasterMask = clamp(1 - exposed, 0, 1);
      const plasterHeight = 0.62 + (broadNoise - 0.5) * 0.035 + (grain - 0.5) * 0.012;
      const brickHeight = 0.405 + brickPattern.relief * 0.045;
      const substrateHeight = mix(brickHeight, 0.365, brickPattern.mortar);
      const chippedHeight = mix(plasterHeight, substrateHeight, chipped * 0.48);
      height.data[pixel] = clamp(
        mix(chippedHeight, substrateHeight, exposed) - crack * 0.075 + dirt * 0.008,
        0,
        1,
      );
      for (let channel = 0; channel < 3; channel++) {
        const plasterVariation = 0.86 + broadNoise * 0.22 + grain * 0.04;
        const brickVariation = 0.76 + brickPattern.random * 0.34 + grain * 0.05;
        const plasterValue = plasterColor[channel]! * plasterVariation;
        const brickValue = brickColor[channel]! * brickVariation;
        const mortarValue = channel === 0 ? 0.29 : channel === 1 ? 0.265 : 0.225;
        const substrateValue = mix(brickValue, mortarValue, brickPattern.mortar);
        const chippedValue = mix(plasterValue, substrateValue * 0.72, chipped * 0.78);
        const damagedValue = mix(chippedValue, substrateValue, exposed);
        baseColor.data[pixel * 3 + channel] = clamp(
          mix(damagedValue, channel === 0 ? 0.105 : channel === 1 ? 0.075 : 0.042, dirt * 0.88),
          0,
          1,
        );
      }
      metallic.data[pixel] = 0;
      roughness.data[pixel] = clamp(0.73 + plasterMask * 0.05 + mortar * 0.11 + dirt * 0.14 - chipped * 0.04, 0.04, 1);
      ao.data[pixel] = clamp(1 - crack * 0.58 - chipped * 0.2 - mortar * 0.22 - dirt * 0.08, 0, 1);
      masks.plaster.data[pixel] = plasterMask;
      masks.exposedBrick.data[pixel] = exposed;
      masks.crack.data[pixel] = crack;
      masks.chippedEdge.data[pixel] = chipped;
      masks.brick.data[pixel] = brick;
      masks.mortar.data[pixel] = mortar;
      masks.dirt.data[pixel] = dirt;
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

function createChipSeeds(seed: number, count: number): readonly ChipSeed[] {
  const random = makeRng(seed);
  const seeds: ChipSeed[] = [];
  for (let index = 0; index < count; index++) {
    seeds.push({
      x: random.range(0.08, 0.92),
      y: random.range(0.08, 0.92),
      radiusX: random.range(0.07, 0.2),
      radiusY: random.range(0.055, 0.18),
      rotation: random.range(-Math.PI, Math.PI),
    });
  }
  return seeds;
}

function chipField(u: number, v: number, seeds: readonly ChipSeed[]): number {
  let field = 1;
  for (const seed of seeds) {
    const cosine = Math.cos(seed.rotation);
    const sine = Math.sin(seed.rotation);
    const deltaX = u - seed.x;
    const deltaY = v - seed.y;
    const localX = (deltaX * cosine + deltaY * sine) / seed.radiusX;
    const localY = (-deltaX * sine + deltaY * cosine) / seed.radiusY;
    field = Math.min(field, Math.hypot(localX, localY));
  }
  return field;
}

function createCrackSegments(
  seed: number,
  chips: readonly ChipSeed[],
  roots: number,
  crackAmount: number,
): readonly CrackSegment[] {
  const random = makeRng(seed);
  const segments: CrackSegment[] = [];
  for (let root = 0; root < roots; root++) {
    const chip = chips[root % chips.length]!;
    let angle = random.range(-Math.PI, Math.PI);
    let startX = chip.x + Math.cos(angle) * chip.radiusX * 0.72;
    let startY = chip.y + Math.sin(angle) * chip.radiusY * 0.72;
    const segmentCount = 3 + Math.round(crackAmount * 4);
    for (let index = 0; index < segmentCount; index++) {
      const length = random.range(0.035, 0.095) * (1 - index * 0.055);
      angle += random.range(-0.72, 0.72);
      const endX = startX + Math.cos(angle) * length;
      const endY = startY + Math.sin(angle) * length;
      segments.push({ startX, startY, endX, endY, width: 1 - index / (segmentCount + 1) });
      if (index > 0 && index % 2 === 0) {
        const branchAngle = angle + random.range(-1.15, 1.15);
        const branchLength = length * random.range(0.42, 0.7);
        segments.push({
          startX,
          startY,
          endX: startX + Math.cos(branchAngle) * branchLength,
          endY: startY + Math.sin(branchAngle) * branchLength,
          width: 0.52,
        });
      }
      startX = endX;
      startY = endY;
    }
  }
  return segments;
}

function minimumCrackDistance(u: number, v: number, segments: readonly CrackSegment[]): number {
  let minimum = Infinity;
  for (const segment of segments) {
    const edgeX = segment.endX - segment.startX;
    const edgeY = segment.endY - segment.startY;
    const lengthSquared = edgeX * edgeX + edgeY * edgeY;
    const amount = clamp(((u - segment.startX) * edgeX + (v - segment.startY) * edgeY) / Math.max(1e-9, lengthSquared), 0, 1);
    const distance = Math.hypot(u - segment.startX - edgeX * amount, v - segment.startY - edgeY * amount);
    minimum = Math.min(minimum, distance / Math.max(0.25, segment.width));
  }
  return minimum;
}

function sampleBrick(
  u: number,
  v: number,
  columns: number,
  rows: number,
  variation: number,
): { mortar: number; relief: number; random: number } {
  const rowCoordinate = v * rows;
  const row = Math.floor(rowCoordinate);
  const offsetU = u * columns + (row % 2 === 0 ? 0 : 0.5);
  const localU = offsetU - Math.floor(offsetU);
  const localV = rowCoordinate - row;
  const edgeDistance = Math.min(localU, 1 - localU, localV, 1 - localV);
  const mortarWidth = 0.065 + variation * 0.018;
  const mortar = 1 - smoothstep(mortarWidth, mortarWidth + 0.025, edgeDistance);
  const relief = smoothstep(mortarWidth, 0.22, edgeDistance);
  const brickIndex = Math.floor(offsetU) + row * columns;
  const random = hash(brickIndex * 31 + row * 131);
  return { mortar, relief, random };
}

function hash(value: number): number {
  const sine = Math.sin(value * 12.9898) * 43758.5453;
  return sine - Math.floor(sine);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
