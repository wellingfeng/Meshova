import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import {
  heightLayerStack,
  pathStroke,
  radialArray,
  semanticMaskPack,
  type HeightLayerMode,
  type ScalarField2D,
} from "./shape-grammar.js";
import { heightToNormal, type Material, type MaterialFields } from "./pbr.js";

export type SciFiHullPartKind =
  | "base-panel"
  | "cover-plate"
  | "circular-hatch"
  | "turbine"
  | "segmented-ring"
  | "rectangular-vent"
  | "circular-vent"
  | "pipe"
  | "circuit-trace"
  | "connector"
  | "control"
  | "fastener"
  | "boss"
  | "cutout";

export type SciFiHullBounds = readonly [number, number, number, number];

export interface SciFiHullPartModule {
  readonly id: string;
  readonly kind: SciFiHullPartKind;
  readonly bounds: SciFiHullBounds;
  readonly priority: number;
  readonly mode: HeightLayerMode;
  readonly mask: ScalarField2D;
  readonly height: ScalarField2D;
  readonly normal: (u: number, v: number) => readonly [number, number, number];
  readonly masks: Readonly<Record<string, ScalarField2D>>;
}

export interface SciFiHullHeightSystemParams {
  seed?: number;
  panelColumns?: number;
  panelRows?: number;
  seamWidth?: number;
  seamDepth?: number;
  panelVariation?: number;
  coverPlateHeight?: number;
  hatchRadius?: number;
  turbineBlades?: number;
  ventSlats?: number;
  pipeWidth?: number;
  detailDensity?: number;
  emission?: number;
  normalStrength?: number;
  hullColor?: [number, number, number];
  accentColor?: [number, number, number];
  emissionColor?: [number, number, number];
}

export const SCI_FI_HULL_MASK_NAMES = [
  "panels",
  "seams",
  "edges",
  "cavities",
  "coverPlates",
  "hatches",
  "turbines",
  "segmentedRings",
  "rectangularVents",
  "circularVents",
  "fasteners",
  "pipes",
  "circuits",
  "connectors",
  "controls",
  "bosses",
  "cutouts",
  "emission",
  "materialId",
  "componentId",
  "occupancy",
] as const;

export type SciFiHullMaskName = typeof SCI_FI_HULL_MASK_NAMES[number];
export type SciFiHullMasks = Readonly<Record<SciFiHullMaskName, ScalarField2D>>;

export interface SciFiHullPixel {
  readonly baseColor: [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly ao: number;
  readonly height: number;
  readonly emission: [number, number, number];
  readonly masks: Readonly<Record<SciFiHullMaskName, number>>;
}

export interface SciFiHullHeightRecipe {
  readonly fields: MaterialFields;
  readonly masks: SciFiHullMasks;
  readonly parts: readonly SciFiHullPartModule[];
  readonly sample: (u: number, v: number) => SciFiHullPixel;
}

export interface SciFiHullHeightBake {
  readonly material: Material;
  readonly masks: Readonly<Record<SciFiHullMaskName, TextureBuffer>>;
  readonly parts: readonly SciFiHullPartModule[];
}

interface PanelSample {
  readonly height: number;
  readonly id: number;
  readonly seam: number;
  readonly edge: number;
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

function hash01(x: number, y: number, seed: number, salt = 0): number {
  let value = Math.imul(x ^ salt, 0x45d9f3b) ^ Math.imul(y + seed, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function buildPartition(count: number, seed: number, salt: number): readonly number[] {
  const weights = Array.from({ length: count }, (_, index) => 0.68 + hash01(index, salt, seed) * 0.64);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const boundaries = [0];
  let cursor = 0;
  for (const weight of weights) {
    cursor += weight / total;
    boundaries.push(cursor);
  }
  boundaries[boundaries.length - 1] = 1;
  return boundaries;
}

function findPartition(value: number, boundaries: readonly number[]): number {
  for (let index = 0; index < boundaries.length - 1; index++) {
    if (value < boundaries[index + 1]!) return index;
  }
  return boundaries.length - 2;
}

function boxMask(
  bounds: SciFiHullBounds,
  feather = 0.006,
): ScalarField2D {
  const centerX = (bounds[0] + bounds[2]) * 0.5;
  const centerY = (bounds[1] + bounds[3]) * 0.5;
  const halfWidth = (bounds[2] - bounds[0]) * 0.5;
  const halfHeight = (bounds[3] - bounds[1]) * 0.5;
  return (u, v) => {
    const x = Math.abs(u - centerX) - halfWidth;
    const y = Math.abs(v - centerY) - halfHeight;
    const outside = Math.hypot(Math.max(x, 0), Math.max(y, 0));
    const inside = Math.min(Math.max(x, y), 0);
    return 1 - smoothstep(-feather, feather, outside + inside);
  };
}

function circleMask(
  center: readonly [number, number],
  radius: number,
  feather = 0.006,
): ScalarField2D {
  return (u, v) => 1 - smoothstep(radius - feather, radius + feather, Math.hypot(u - center[0], v - center[1]));
}

function ringMask(
  center: readonly [number, number],
  radius: number,
  width: number,
  feather = 0.004,
): ScalarField2D {
  return (u, v) => 1 - smoothstep(width - feather, width + feather, Math.abs(Math.hypot(u - center[0], v - center[1]) - radius));
}

function maxFields(...fields: readonly ScalarField2D[]): ScalarField2D {
  return (u, v) => fields.reduce((value, field) => Math.max(value, field(u, v)), 0);
}

function subtractField(field: ScalarField2D, blocker: ScalarField2D): ScalarField2D {
  return (u, v) => field(u, v) * (1 - blocker(u, v));
}

function constantField(value: number): ScalarField2D {
  return () => value;
}

function deriveFieldNormal(
  mask: ScalarField2D,
  height: ScalarField2D,
  strength = 5,
): (u: number, v: number) => readonly [number, number, number] {
  const step = 1 / 1024;
  const sample = (u: number, v: number) => mask(wrap01(u), wrap01(v)) * height(wrap01(u), wrap01(v));
  return (u, v) => {
    const dx = (sample(u - step, v) - sample(u + step, v)) * strength;
    const dy = (sample(u, v - step) - sample(u, v + step)) * strength;
    const length = Math.hypot(dx, dy, 1) || 1;
    return [dx / length, dy / length, 1 / length];
  };
}

function createPart(
  id: string,
  kind: SciFiHullPartKind,
  bounds: SciFiHullBounds,
  priority: number,
  mode: HeightLayerMode,
  mask: ScalarField2D,
  height: ScalarField2D,
  masks: Readonly<Record<string, ScalarField2D>>,
): SciFiHullPartModule {
  return {
    id,
    kind,
    bounds,
    priority,
    mode,
    mask,
    height,
    normal: deriveFieldNormal(mask, height),
    masks,
  };
}

function mixColor(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  const weight = clamp(amount, 0, 1);
  return [
    left[0] + (right[0] - left[0]) * weight,
    left[1] + (right[1] - left[1]) * weight,
    left[2] + (right[2] - left[2]) * weight,
  ];
}

/** P3-P4 reconstruction: modular hull layout, mechanical parts, priority, and occupancy. */
export function createSciFiHullHeightSystem(
  params: SciFiHullHeightSystemParams = {},
): SciFiHullHeightRecipe {
  const seed = Math.floor(params.seed ?? 733);
  const columns = Math.max(2, Math.floor(params.panelColumns ?? 5));
  const rows = Math.max(2, Math.floor(params.panelRows ?? 4));
  const seamWidth = clamp(params.seamWidth ?? 0.012, 0.003, 0.04);
  const seamDepth = clamp(params.seamDepth ?? 0.18, 0, 0.4);
  const panelVariation = clamp(params.panelVariation ?? 0.52, 0, 1);
  const coverPlateHeight = clamp(params.coverPlateHeight ?? 0.1, 0.02, 0.24);
  const hatchRadius = clamp(params.hatchRadius ?? 0.13, 0.08, 0.18);
  const turbineBlades = Math.max(4, Math.floor(params.turbineBlades ?? 12));
  const ventSlats = Math.max(3, Math.floor(params.ventSlats ?? 7));
  const pipeWidth = clamp(params.pipeWidth ?? 0.014, 0.006, 0.035);
  const detailDensity = clamp(params.detailDensity ?? 0.72, 0, 1);
  const emissionAmount = clamp(params.emission ?? 0.85, 0, 1);
  const normalStrength = Math.max(0, params.normalStrength ?? 7);
  const hullColor = params.hullColor ?? [0.055, 0.075, 0.095];
  const accentColor = params.accentColor ?? [0.12, 0.28, 0.36];
  const emissionColor = params.emissionColor ?? [0.02, 0.72, 0.92];
  const xPartitions = Array.from({ length: rows }, (_, row) => buildPartition(columns, seed + row * 19, 101));
  const yPartitions = buildPartition(rows, seed, 211);

  const panelSample = (uCoord: number, vCoord: number): PanelSample => {
    const u = wrap01(uCoord);
    const v = wrap01(vCoord);
    const row = findPartition(v, yPartitions);
    const rowStart = yPartitions[row]!;
    const rowEnd = yPartitions[row + 1]!;
    const offset = (hash01(row, seed, seed, 313) - 0.5) * 0.08;
    const shiftedU = wrap01(u + offset);
    const partitions = xPartitions[row]!;
    const column = findPartition(shiftedU, partitions);
    const columnStart = partitions[column]!;
    const columnEnd = partitions[column + 1]!;
    const edgeDistance = Math.min(
      shiftedU - columnStart,
      columnEnd - shiftedU,
      v - rowStart,
      rowEnd - v,
    );
    const seam = 1 - smoothstep(seamWidth * 0.55, seamWidth, edgeDistance);
    const edge = (1 - smoothstep(seamWidth, seamWidth * 2.4, edgeDistance)) * (1 - seam);
    const id = hash01(column, row, seed, 419);
    const height = 0.31 + (id - 0.5) * panelVariation * 0.055;
    return { height, id, seam, edge };
  };

  const panelMask: ScalarField2D = (u, v) => 1 - panelSample(u, v).seam;
  const seamMask: ScalarField2D = (u, v) => panelSample(u, v).seam;
  const panelEdgeMask: ScalarField2D = (u, v) => panelSample(u, v).edge;
  const panelHeight: ScalarField2D = (u, v) => panelSample(u, v).height;
  const panelId: ScalarField2D = (u, v) => panelSample(u, v).id;

  const leftCoverBounds: SciFiHullBounds = [0.06, 0.5, 0.46, 0.9];
  const rightCoverBounds: SciFiHullBounds = [0.55, 0.48, 0.93, 0.9];
  const lowerCoverBounds: SciFiHullBounds = [0.42, 0.08, 0.92, 0.42];
  const leftCover = boxMask(leftCoverBounds, 0.01);
  const rightCover = boxMask(rightCoverBounds, 0.01);
  const lowerCover = boxMask(lowerCoverBounds, 0.01);
  const coverMask = maxFields(leftCover, rightCover, lowerCover);

  const hatchCenter = [0.26, 0.7] as const;
  const hatchOuter = ringMask(hatchCenter, hatchRadius, 0.024);
  const hatchCavity = circleMask(hatchCenter, hatchRadius - 0.03);
  const hatchInnerRing = ringMask(hatchCenter, hatchRadius - 0.052, 0.012);
  const hatchMask = maxFields(hatchOuter, hatchInnerRing);
  const hatchSegments = radialArray({
    center: hatchCenter,
    count: 10,
    innerRadius: hatchRadius + 0.012,
    outerRadius: hatchRadius + 0.034,
    gap: 0.42,
  });

  const turbineCenter = [0.73, 0.69] as const;
  const turbineCavity = circleMask(turbineCenter, 0.132);
  const turbineRing = ringMask(turbineCenter, 0.13, 0.018);
  const turbine = radialArray({
    center: turbineCenter,
    count: turbineBlades,
    innerRadius: 0.036,
    outerRadius: 0.112,
    gap: 0.24,
    rotation: Math.PI / turbineBlades,
    alternate: true,
    element: (x, y) => Math.hypot(x * 0.62 + y * 0.22, y) <= 1 ? 1 : 0,
  });
  const turbineHub = circleMask(turbineCenter, 0.035);
  const turbineMask = maxFields(turbine.mask, turbineHub, turbineRing);

  const emissionRing = radialArray({
    center: turbineCenter,
    count: 16,
    innerRadius: 0.145,
    outerRadius: 0.163,
    gap: 0.34,
    rotation: Math.PI / 16,
  });

  const rectangularVentBounds: SciFiHullBounds = [0.63, 0.18, 0.86, 0.36];
  const rectangularVentFrame = boxMask(rectangularVentBounds, 0.008);
  const rectangularVentInner = boxMask([0.65, 0.2, 0.84, 0.34], 0.006);
  const rectangularVentSlots: ScalarField2D = (u, v) => {
    const inside = rectangularVentInner(u, v);
    const phase = Math.abs(((v - 0.2) / 0.14 * ventSlats) % 1 - 0.5);
    return inside * (1 - smoothstep(0.16, 0.3, phase));
  };
  const rectangularVentRim: ScalarField2D = (u, v) => rectangularVentFrame(u, v) * (1 - rectangularVentInner(u, v));

  const circularVentCenter = [0.49, 0.26] as const;
  const circularVentCavity = circleMask(circularVentCenter, 0.082);
  const circularVentRing = ringMask(circularVentCenter, 0.082, 0.012);
  const circularVentBars = radialArray({
    center: circularVentCenter,
    count: 8,
    innerRadius: 0.014,
    outerRadius: 0.072,
    gap: 0.72,
  });
  const circularVentMask = maxFields(circularVentRing, circularVentBars.mask);

  const protectedOccupancy = maxFields(
    circleMask(hatchCenter, hatchRadius + 0.045),
    circleMask(turbineCenter, 0.17),
    boxMask([0.61, 0.16, 0.88, 0.38]),
    circleMask(circularVentCenter, 0.1),
  );
  const pipes = pathStroke([
    [0.06, 0.15],
    [0.26, 0.15],
    [0.34, 0.23],
    [0.34, 0.43],
  ], {
    width: pipeWidth,
    feather: pipeWidth * 0.22,
    height: 0.13,
    branches: detailDensity > 0.35 ? [{ points: [[0.18, 0.15], [0.18, 0.37], [0.29, 0.46]] }] : [],
  });
  const pipeMask = subtractField(pipes.mask, protectedOccupancy);

  const circuits = pathStroke([
    [0.07, 0.95],
    [0.48, 0.95],
    [0.52, 0.91],
    [0.52, 0.79],
  ], {
    width: 0.004 + detailDensity * 0.003,
    feather: 0.002,
    height: 0.035,
    cap: "butt",
    branches: detailDensity > 0.55 ? [
      { points: [[0.3, 0.95], [0.3, 0.86], [0.43, 0.86]] },
      { points: [[0.4, 0.95], [0.4, 0.9], [0.47, 0.9]] },
    ] : [],
  });
  const circuitMask = subtractField(circuits.mask, protectedOccupancy);

  const connectorBounds: SciFiHullBounds = [0.43, 0.52, 0.57, 0.62];
  const connectorShell = boxMask(connectorBounds, 0.007);
  const connectorInner = boxMask([0.45, 0.535, 0.55, 0.605], 0.005);
  const connectorPins: ScalarField2D = (u, v) => {
    let mask = 0;
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 4; column++) {
        const center: readonly [number, number] = [0.462 + column * 0.025, 0.553 + row * 0.033];
        mask = Math.max(mask, circleMask(center, 0.006, 0.002)(u, v));
      }
    }
    return mask * connectorInner(u, v);
  };

  const controlCenters = [[0.91, 0.63], [0.91, 0.7], [0.91, 0.77]] as const;
  const controlMask: ScalarField2D = (u, v) => controlCenters.reduce(
    (mask, center) => Math.max(mask, circleMask(center, 0.022, 0.004)(u, v)),
    0,
  );

  const bossMask = maxFields(
    circleMask([0.11, 0.3], 0.05),
    circleMask([0.27, 0.31], 0.035),
  );
  const bossCavity = maxFields(
    circleMask([0.11, 0.3], 0.018),
    circleMask([0.27, 0.31], 0.012),
  );
  const cutoutMask = maxFields(hatchCavity, turbineCavity, rectangularVentSlots, circularVentCavity, bossCavity);

  const fastenerPoints = [
    [0.08, 0.52], [0.44, 0.52], [0.08, 0.88], [0.44, 0.88],
    [0.57, 0.5], [0.91, 0.5], [0.57, 0.88], [0.91, 0.88],
    [0.44, 0.1], [0.9, 0.1], [0.44, 0.4], [0.9, 0.4],
  ] as const;
  const fastenerRaw: ScalarField2D = (u, v) => fastenerPoints.reduce((mask, point, index) => {
    if (hash01(index, seed, seed, 811) > detailDensity + 0.2) return mask;
    return Math.max(mask, circleMask(point, 0.009, 0.003)(u, v));
  }, 0);
  const fastenerMask = subtractField(fastenerRaw, maxFields(cutoutMask, pipeMask, emissionRing.mask));

  const parts: SciFiHullPartModule[] = [
    createPart("panel-layout", "base-panel", [0, 0, 1, 1], 0, "overlay", panelMask, panelHeight, { panels: panelMask, seams: seamMask, edges: panelEdgeMask }),
    createPart("cover-plates", "cover-plate", [0.06, 0.08, 0.93, 0.9], 20, "raise", coverMask, constantField(coverPlateHeight), { coverPlates: coverMask }),
    createPart("primary-hatch", "circular-hatch", [0.08, 0.52, 0.44, 0.88], 40, "raise", hatchMask, constantField(0.12), { hatches: hatchMask }),
    createPart("turbine", "turbine", [0.55, 0.51, 0.91, 0.87], 45, "raise", turbineMask, constantField(0.105), { turbines: turbineMask }),
    createPart("status-ring", "segmented-ring", [0.55, 0.51, 0.91, 0.87], 55, "raise", emissionRing.mask, constantField(0.045), { segmentedRings: emissionRing.mask, emission: emissionRing.mask }),
    createPart("rectangular-vent", "rectangular-vent", rectangularVentBounds, 42, "raise", rectangularVentRim, constantField(0.055), { rectangularVents: rectangularVentRim, cavities: rectangularVentSlots }),
    createPart("circular-vent", "circular-vent", [0.39, 0.16, 0.59, 0.36], 43, "raise", circularVentMask, constantField(0.07), { circularVents: circularVentMask, cavities: circularVentCavity }),
    createPart("pipe-network", "pipe", [0.04, 0.12, 0.36, 0.48], 60, "raise", pipeMask, constantField(0.13), { pipes: pipeMask }),
    createPart("circuit-network", "circuit-trace", [0.05, 0.78, 0.54, 0.97], 58, "raise", circuitMask, constantField(0.035), { circuits: circuitMask }),
    createPart("pin-connector", "connector", connectorBounds, 46, "raise", maxFields(connectorShell, connectorPins), constantField(0.085), { connectors: connectorShell, fasteners: connectorPins }),
    createPart("control-buttons", "control", [0.87, 0.59, 0.95, 0.81], 48, "raise", controlMask, constantField(0.09), { controls: controlMask }),
    createPart("fastener-set", "fastener", [0.06, 0.08, 0.93, 0.9], 70, "raise", fastenerMask, constantField(0.075), { fasteners: fastenerMask }),
    createPart("mechanical-bosses", "boss", [0.06, 0.24, 0.31, 0.35], 38, "raise", bossMask, constantField(0.09), { bosses: bossMask }),
    createPart("mechanical-cutouts", "cutout", [0.06, 0.16, 0.88, 0.87], 30, "cutout", cutoutMask, constantField(0.12), { cutouts: cutoutMask, cavities: cutoutMask }),
  ];

  const stack = heightLayerStack(0.27, [
    { name: "panels", mask: 1, height: panelHeight, mode: "overlay", priority: 0 },
    { name: "seams", mask: seamMask, height: seamDepth, mode: "groove", priority: 10 },
    ...parts.slice(1).map((part) => ({
      name: part.id,
      mask: part.mask,
      height: part.height,
      mode: part.mode,
      priority: part.priority,
    })),
  ]);

  const raisedMechanical = maxFields(hatchMask, turbineMask, circularVentMask, rectangularVentRim, connectorShell, controlMask, bossMask);
  const occupancy = maxFields(coverMask, raisedMechanical, pipeMask, circuitMask, fastenerMask, emissionRing.mask);
  const componentId: ScalarField2D = (u, v) => {
    const turbineId = turbine.segmentId(u, v);
    if (turbineId > 0) return 0.55 + turbineId * 0.2;
    const ringId = emissionRing.segmentId(u, v);
    if (ringId > 0) return 0.8 + ringId * 0.18;
    if (pipeMask(u, v) > 0) return 0.42 + pipes.pathId(u, v) * 0.08;
    return panelId(u, v) * 0.4;
  };
  const materialId: ScalarField2D = (u, v) => {
    if (emissionRing.mask(u, v) > 0) return 1;
    if (pipeMask(u, v) > 0 || connectorShell(u, v) > 0 || controlMask(u, v) > 0) return 0.78;
    if (raisedMechanical(u, v) > 0) return 0.56;
    if (coverMask(u, v) > 0) return 0.34;
    return 0.12;
  };

  const maskPack = semanticMaskPack({
    panels: panelMask,
    seams: seamMask,
    edges: panelEdgeMask,
    cavities: cutoutMask,
    coverPlates: coverMask,
    hatches: hatchMask,
    turbines: turbineMask,
    segmentedRings: emissionRing.mask,
    rectangularVents: maxFields(rectangularVentRim, rectangularVentSlots),
    circularVents: maxFields(circularVentMask, circularVentCavity),
    fasteners: maxFields(fastenerMask, connectorPins),
    pipes: pipeMask,
    circuits: circuitMask,
    connectors: maxFields(connectorShell, connectorPins),
    controls: controlMask,
    bosses: bossMask,
    cutouts: cutoutMask,
    emission: (u, v) => emissionRing.mask(u, v) * emissionAmount,
    materialId,
    componentId,
    occupancy,
  });
  const masks = Object.fromEntries(SCI_FI_HULL_MASK_NAMES.map((name) => [name, maskPack.fields[name]!])) as Record<SciFiHullMaskName, ScalarField2D>;

  const evaluate = (u: number, v: number): SciFiHullPixel => {
    const sampledMasks = Object.fromEntries(SCI_FI_HULL_MASK_NAMES.map((name) => [name, masks[name](u, v)])) as Record<SciFiHullMaskName, number>;
    const panelTint = (panelId(u, v) - 0.5) * panelVariation;
    let color = mixColor(hullColor, accentColor, sampledMasks.coverPlates * 0.48 + sampledMasks.controls * 0.55);
    color = mixColor(color, [0.24, 0.27, 0.29], sampledMasks.pipes * 0.7 + sampledMasks.fasteners * 0.5);
    color = mixColor(color, emissionColor, sampledMasks.emission * 0.42);
    color = color.map((channel) => clamp(channel * (0.88 + panelTint * 0.18), 0, 1)) as [number, number, number];
    return {
      baseColor: color,
      metallic: clamp(0.92 - sampledMasks.emission * 0.82, 0, 1),
      roughness: clamp(0.3 + sampledMasks.seams * 0.18 + sampledMasks.cavities * 0.22 + sampledMasks.pipes * 0.08, 0.04, 1),
      ao: clamp(1 - sampledMasks.seams * 0.28 - sampledMasks.cavities * 0.52, 0, 1),
      height: stack.height(u, v),
      emission: [
        emissionColor[0] * sampledMasks.emission,
        emissionColor[1] * sampledMasks.emission,
        emissionColor[2] * sampledMasks.emission,
      ],
      masks: sampledMasks,
    };
  };

  return {
    sample: evaluate,
    fields: {
      baseColor: (u, v) => {
        const covers = coverMask(u, v);
        const controls = controlMask(u, v);
        const pipes = pipeMask(u, v);
        const fasteners = fastenerMask(u, v);
        const emission = emissionRing.mask(u, v) * emissionAmount;
        const panelTint = (panelId(u, v) - 0.5) * panelVariation;
        let color = mixColor(hullColor, accentColor, covers * 0.48 + controls * 0.55);
        color = mixColor(color, [0.24, 0.27, 0.29], pipes * 0.7 + fasteners * 0.5);
        color = mixColor(color, emissionColor, emission * 0.42);
        return color.map((channel) => clamp(channel * (0.88 + panelTint * 0.18), 0, 1)) as [number, number, number];
      },
      metallic: (u, v) => clamp(0.92 - emissionRing.mask(u, v) * emissionAmount * 0.82, 0, 1),
      roughness: (u, v) => clamp(
        0.3 + seamMask(u, v) * 0.18 + cutoutMask(u, v) * 0.22 + pipeMask(u, v) * 0.08,
        0.04,
        1,
      ),
      ao: (u, v) => clamp(1 - seamMask(u, v) * 0.28 - cutoutMask(u, v) * 0.52, 0, 1),
      height: stack.height,
      emission: (u, v) => {
        const amount = emissionRing.mask(u, v) * emissionAmount;
        return [emissionColor[0] * amount, emissionColor[1] * amount, emissionColor[2] * amount];
      },
      normalStrength,
      tileable: true,
    },
    masks,
    parts,
  };
}

/** Standard field-preset entry used by PRESETS and browser live baking. */
export function sciFiHullHeightSystem(params: SciFiHullHeightSystemParams = {}): MaterialFields {
  return createSciFiHullHeightSystem(params).fields;
}

/** Bake hull PBR plus named semantic masks in one deterministic pass. */
export function bakeSciFiHullHeightSystem(
  size: number,
  params: SciFiHullHeightSystemParams = {},
): SciFiHullHeightBake {
  const resolution = Math.max(16, Math.floor(size));
  const recipe = createSciFiHullHeightSystem(params);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks = Object.fromEntries(SCI_FI_HULL_MASK_NAMES.map((name) => [
    name,
    makeTexture(resolution, resolution, 1),
  ])) as Record<SciFiHullMaskName, TextureBuffer>;

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const result = recipe.sample(u, v);
      baseColor.data[pixel * 3] = result.baseColor[0];
      baseColor.data[pixel * 3 + 1] = result.baseColor[1];
      baseColor.data[pixel * 3 + 2] = result.baseColor[2];
      metallic.data[pixel] = result.metallic;
      roughness.data[pixel] = result.roughness;
      ao.data[pixel] = result.ao;
      height.data[pixel] = result.height;
      emission.data[pixel * 3] = result.emission[0];
      emission.data[pixel * 3 + 1] = result.emission[1];
      emission.data[pixel * 3 + 2] = result.emission[2];
      for (const name of SCI_FI_HULL_MASK_NAMES) masks[name].data[pixel] = result.masks[name];
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      ao,
      height,
      emission,
      normal: heightToNormal(height, params.normalStrength ?? 7, true),
    },
    masks,
    parts: recipe.parts,
  };
}
