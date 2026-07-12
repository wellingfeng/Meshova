import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";

export type MaterialScalarField = (u: number, v: number) => number;

interface LineSegment {
  startU: number;
  startV: number;
  endU: number;
  endV: number;
  width: number;
}

function distanceToSegment(
  uCoord: number,
  vCoord: number,
  segment: LineSegment,
): number {
  const deltaU = segment.endU - segment.startU;
  const deltaV = segment.endV - segment.startV;
  const lengthSquared = deltaU * deltaU + deltaV * deltaV;
  const amount = lengthSquared === 0
    ? 0
    : clamp(
      ((uCoord - segment.startU) * deltaU + (vCoord - segment.startV) * deltaV) / lengthSquared,
      0,
      1,
    );
  const nearestU = segment.startU + deltaU * amount;
  const nearestV = segment.startV + deltaV * amount;
  return Math.hypot(uCoord - nearestU, vCoord - nearestV);
}

function lineMask(distance: number, width: number): number {
  return 1 - smoothstep(width * 0.55, width * 1.45, distance);
}

export interface CrackGeneratorOptions {
  seed?: number;
  count?: number;
  steps?: number;
  branches?: number;
  width?: number;
  branchWidth?: number;
  jitter?: number;
  edgeDamage?: number;
  regionMask?: MaterialScalarField;
}

export interface CrackSample {
  main: number;
  branches: number;
  crack: number;
  edgeDamage: number;
}

/** Seeded main cracks with branches, edge breakup, and optional region limiting. */
export function crackGenerator(
  opts: CrackGeneratorOptions = {},
): (u: number, v: number) => CrackSample {
  const seed = opts.seed ?? 0;
  const count = Math.max(1, Math.floor(opts.count ?? 3));
  const steps = Math.max(2, Math.floor(opts.steps ?? 7));
  const branchCount = Math.max(0, Math.floor(opts.branches ?? count * 2));
  const width = Math.max(0.0005, opts.width ?? 0.009);
  const branchWidth = Math.max(0.0005, opts.branchWidth ?? width * 0.62);
  const jitter = clamp(opts.jitter ?? 0.24, 0, 0.75);
  const damageAmount = clamp(opts.edgeDamage ?? 0.45, 0, 1);
  const rng = makeRng(seed);
  const mainSegments: LineSegment[] = [];
  const branchSegments: LineSegment[] = [];

  for (let crackIndex = 0; crackIndex < count; crackIndex++) {
    const vertical = crackIndex % 2 === 0;
    let startU = vertical ? rng.range(0.08, 0.92) : -0.04;
    let startV = vertical ? -0.04 : rng.range(0.08, 0.92);
    for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
      const drift = rng.range(-jitter, jitter) / steps;
      const endU = vertical
        ? clamp(startU + drift, -0.08, 1.08)
        : (stepIndex + 1) / steps + 0.04;
      const endV = vertical
        ? (stepIndex + 1) / steps + 0.04
        : clamp(startV + drift, -0.08, 1.08);
      mainSegments.push({ startU, startV, endU, endV, width: width * rng.range(0.78, 1.22) });
      startU = endU;
      startV = endV;
    }
  }

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
    const source = mainSegments[rng.int(0, mainSegments.length - 1)]!;
    const sourceAmount = rng.range(0.18, 0.88);
    const startU = source.startU + (source.endU - source.startU) * sourceAmount;
    const startV = source.startV + (source.endV - source.startV) * sourceAmount;
    const angle = rng.next() < 0.5
      ? rng.range(-Math.PI * 0.85, -Math.PI * 0.15)
      : rng.range(Math.PI * 0.15, Math.PI * 0.85);
    const length = rng.range(0.07, 0.24);
    branchSegments.push({
      startU,
      startV,
      endU: startU + Math.cos(angle) * length,
      endV: startV + Math.sin(angle) * length,
      width: branchWidth * rng.range(0.72, 1.1),
    });
  }

  const breakupNoise = makeNoise(seed + 107);
  return (uCoord, vCoord) => {
    const region = clamp(opts.regionMask?.(uCoord, vCoord) ?? 1, 0, 1);
    let main = 0;
    let branches = 0;
    let nearestMain = Infinity;
    for (const segment of mainSegments) {
      const distance = distanceToSegment(uCoord, vCoord, segment);
      nearestMain = Math.min(nearestMain, distance);
      main = Math.max(main, lineMask(distance, segment.width));
    }
    for (const segment of branchSegments) {
      branches = Math.max(branches, lineMask(distanceToSegment(uCoord, vCoord, segment), segment.width));
    }
    const crack = Math.max(main, branches) * region;
    const breakup = fbm2(breakupNoise, uCoord * 38, vCoord * 38, { octaves: 3 }) * 0.5 + 0.5;
    const edgeDamage = clamp(
      crack * (0.35 + breakup * 0.65) * damageAmount
      + (1 - smoothstep(width * 1.4, width * 4.5, nearestMain)) * breakup * damageAmount * 0.35,
      0,
      1,
    ) * region;
    return { main: main * region, branches: branches * region, crack, edgeDamage };
  };
}

export interface PanelGeneratorOptions {
  seed?: number;
  columns?: number;
  rows?: number;
  seamWidth?: number;
  insetWidth?: number;
  boltRadius?: number;
  ventChance?: number;
  ventCount?: number;
}

export interface PanelSample {
  panelId: number;
  seam: number;
  inset: number;
  cutline: number;
  bolts: number;
  vents: number;
}

function hashCell(column: number, row: number, seed: number, salt = 0): number {
  const hash = ((column * 73856093) ^ (row * 19349663) ^ (seed * 83492791) ^ salt) >>> 0;
  return makeRng(hash).next();
}

/** Panel subdivision field with inset bands, cutlines, bolts, and vents. */
export function panelGenerator(
  opts: PanelGeneratorOptions = {},
): (u: number, v: number) => PanelSample {
  const seed = opts.seed ?? 0;
  const columns = Math.max(1, Math.floor(opts.columns ?? 4));
  const rows = Math.max(1, Math.floor(opts.rows ?? 4));
  const seamWidth = clamp(opts.seamWidth ?? 0.045, 0.001, 0.24);
  const insetWidth = clamp(opts.insetWidth ?? 0.16, seamWidth, 0.48);
  const boltRadius = clamp(opts.boltRadius ?? 0.055, 0.005, 0.2);
  const ventChance = clamp(opts.ventChance ?? 0.32, 0, 1);
  const ventCount = Math.max(2, Math.floor(opts.ventCount ?? 6));

  return (uCoord, vCoord) => {
    const scaledU = uCoord * columns;
    const scaledV = vCoord * rows;
    const column = Math.floor(scaledU);
    const row = Math.floor(scaledV);
    const localU = scaledU - column;
    const localV = scaledV - row;
    const edge = Math.min(localU, 1 - localU, localV, 1 - localV);
    const seam = 1 - smoothstep(seamWidth, seamWidth * 1.8, edge);
    const inset = smoothstep(seamWidth * 1.4, insetWidth, edge)
      * (1 - smoothstep(0.42, 0.49, edge));
    const diagonal = Math.abs(localU - localV);
    const cutlineEnabled = hashCell(column, row, seed, 0x7f4a7c15) > 0.72;
    const cutline = cutlineEnabled
      ? (1 - smoothstep(seamWidth * 0.5, seamWidth * 1.2, diagonal)) * (1 - seam)
      : 0;
    const cornerDistance = Math.min(
      Math.hypot(localU - 0.12, localV - 0.12),
      Math.hypot(localU - 0.88, localV - 0.12),
      Math.hypot(localU - 0.12, localV - 0.88),
      Math.hypot(localU - 0.88, localV - 0.88),
    );
    const bolts = 1 - smoothstep(boltRadius * 0.72, boltRadius, cornerDistance);
    const ventEnabled = hashCell(column, row, seed, 0x85ebca6b) < ventChance;
    const ventPhase = Math.abs((localV * ventCount) % 1 - 0.5);
    const ventWindow = smoothstep(0.16, 0.24, localU)
      * (1 - smoothstep(0.76, 0.84, localU))
      * smoothstep(0.14, 0.22, localV)
      * (1 - smoothstep(0.78, 0.86, localV));
    const vents = ventEnabled
      ? (1 - smoothstep(0.2, 0.35, ventPhase)) * ventWindow
      : 0;
    return {
      panelId: hashCell(column, row, seed),
      seam,
      inset,
      cutline,
      bolts,
      vents,
    };
  };
}

export type CableOrientation = "vertical" | "horizontal" | "crossed";

export interface CableGeneratorOptions {
  seed?: number;
  count?: number;
  width?: number;
  amplitude?: number;
  frequency?: number;
  shadowOffset?: number;
  orientation?: CableOrientation;
}

export interface CableSample {
  cable: number;
  shadow: number;
  crossing: number;
  height: number;
  cableId: number;
}

interface CablePath {
  id: number;
  orientation: Exclude<CableOrientation, "crossed">;
  center: number;
  width: number;
  amplitude: number;
  frequency: number;
  phase: number;
  height: number;
}

/** Multiple curved cables with overlap height and directional contact shadows. */
export function cableGenerator(
  opts: CableGeneratorOptions = {},
): (u: number, v: number) => CableSample {
  const seed = opts.seed ?? 0;
  const count = Math.max(1, Math.floor(opts.count ?? 3));
  const width = Math.max(0.001, opts.width ?? 0.022);
  const amplitude = clamp(opts.amplitude ?? 0.08, 0, 0.35);
  const frequency = Math.max(0.1, opts.frequency ?? 1.7);
  const shadowOffset = Math.max(0, opts.shadowOffset ?? width * 1.5);
  const orientation = opts.orientation ?? "crossed";
  const rng = makeRng(seed);
  const paths: CablePath[] = [];
  for (let cableIndex = 0; cableIndex < count; cableIndex++) {
    const pathOrientation = orientation === "crossed"
      ? (cableIndex % 2 === 0 ? "vertical" : "horizontal")
      : orientation;
    paths.push({
      id: cableIndex + 1,
      orientation: pathOrientation,
      center: (cableIndex + 1) / (count + 1) + rng.range(-0.08, 0.08),
      width: width * rng.range(0.82, 1.18),
      amplitude: amplitude * rng.range(0.7, 1.25),
      frequency: frequency * rng.range(0.72, 1.3),
      phase: rng.range(0, TAU),
      height: 0.55 + cableIndex / Math.max(1, count - 1) * 0.4,
    });
  }

  return (uCoord, vCoord) => {
    let cable = 0;
    let shadow = 0;
    let crossingCoverage = 0;
    let height = 0;
    let cableId = 0;
    for (const path of paths) {
      const along = path.orientation === "vertical" ? vCoord : uCoord;
      const across = path.orientation === "vertical" ? uCoord : vCoord;
      const center = path.center + Math.sin(along * path.frequency * TAU + path.phase) * path.amplitude;
      const distance = Math.abs(across - center);
      const pathMask = lineMask(distance, path.width);
      const shadowDistance = Math.abs(across - center - shadowOffset);
      const pathShadow = lineMask(shadowDistance, path.width * 1.35) * (1 - pathMask);
      crossingCoverage += pathMask;
      if (pathMask * path.height > height) {
        height = pathMask * path.height;
        cableId = path.id;
      }
      cable = Math.max(cable, pathMask);
      shadow = Math.max(shadow, pathShadow);
    }
    const crossing = clamp((crossingCoverage - cable) * 1.5, 0, 1);
    return { cable, shadow, crossing, height: clamp(height + crossing * 0.08, 0, 1), cableId };
  };
}
