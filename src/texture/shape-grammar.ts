import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";

export type ScalarField2D = (u: number, v: number) => number;
export type ScalarFieldSource = number | ScalarField2D;

function resolveField(source: ScalarFieldSource, u: number, v: number): number {
  return typeof source === "number" ? source : source(u, v);
}

export type HeightLayerMode = "raise" | "groove" | "cutout" | "overlay";

export interface HeightLayer {
  readonly name: string;
  readonly mask: ScalarFieldSource;
  /** Amount for raise/groove; absolute target for cutout/overlay. */
  readonly height: ScalarFieldSource;
  readonly mode?: HeightLayerMode;
  readonly opacity?: number;
  readonly priority?: number;
}

export interface HeightLayerSample {
  readonly height: number;
  readonly masks: Readonly<Record<string, number>>;
  readonly topLayer: string | null;
}

export interface HeightLayerStack {
  readonly layers: readonly HeightLayer[];
  readonly height: ScalarField2D;
  readonly sample: (u: number, v: number) => HeightLayerSample;
  readonly mask: (name: string) => ScalarField2D;
}

export interface HeightLayerStackOptions {
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

/** Compose named height operations in ascending priority, preserving every effective mask. */
export function heightLayerStack(
  baseHeight: ScalarFieldSource,
  layers: readonly HeightLayer[],
  options: HeightLayerStackOptions = {},
): HeightLayerStack {
  const names = new Set<string>();
  for (const layer of layers) {
    if (!layer.name.trim()) throw new Error("height layer name must not be empty");
    if (names.has(layer.name)) throw new Error(`duplicate height layer name: ${layer.name}`);
    names.add(layer.name);
  }
  const ordered = layers
    .map((layer, declarationOrder) => ({ layer, declarationOrder }))
    .sort((left, right) =>
      (left.layer.priority ?? 0) - (right.layer.priority ?? 0)
      || left.declarationOrder - right.declarationOrder)
    .map(({ layer }) => layer);
  const minimum = options.minHeight ?? 0;
  const maximum = options.maxHeight ?? 1;
  if (maximum < minimum) throw new Error("height stack maxHeight must be >= minHeight");

  const sample = (u: number, v: number): HeightLayerSample => {
    let height = clamp(resolveField(baseHeight, u, v), minimum, maximum);
    let topLayer: string | null = null;
    const masks: Record<string, number> = {};
    for (const layer of ordered) {
      const weight = clamp(resolveField(layer.mask, u, v) * (layer.opacity ?? 1), 0, 1);
      masks[layer.name] = weight;
      if (weight <= 0) continue;
      const value = resolveField(layer.height, u, v);
      const before = height;
      switch (layer.mode ?? "overlay") {
        case "raise":
          height += value * weight;
          break;
        case "groove":
          height -= value * weight;
          break;
        case "cutout":
          height += (Math.min(height, value) - height) * weight;
          break;
        case "overlay":
          height += (value - height) * weight;
          break;
      }
      height = clamp(height, minimum, maximum);
      if (Math.abs(height - before) > 1e-12) topLayer = layer.name;
    }
    return { height, masks, topLayer };
  };

  return {
    layers: ordered,
    height: (u, v) => sample(u, v).height,
    sample,
    mask: (name) => {
      if (!names.has(name)) throw new Error(`unknown height layer: ${name}`);
      return (u, v) => sample(u, v).masks[name]!;
    },
  };
}

export const SEMANTIC_MASK_NAMES = [
  "panels",
  "seams",
  "edges",
  "cavities",
  "fasteners",
  "pipes",
  "emission",
  "damage",
  "materialId",
  "occupancy",
] as const;

export type SemanticMaskName = typeof SEMANTIC_MASK_NAMES[number];
export type SemanticMaskSources = Partial<Record<SemanticMaskName, ScalarFieldSource>>
  & Readonly<Record<string, ScalarFieldSource | undefined>>;

export interface SemanticMaskPack {
  readonly names: readonly string[];
  readonly fields: Readonly<Record<string, ScalarField2D>>;
  readonly sample: (u: number, v: number) => Readonly<Record<string, number>>;
  readonly bake: (width: number, height: number) => Readonly<Record<string, TextureBuffer>>;
}

/** Normalize standard and custom semantic masks into one stable protocol. */
export function semanticMaskPack(sources: SemanticMaskSources): SemanticMaskPack {
  const customNames = Object.keys(sources)
    .filter((name) => !SEMANTIC_MASK_NAMES.includes(name as SemanticMaskName))
    .sort();
  const names = [...SEMANTIC_MASK_NAMES, ...customNames];
  const fields = Object.fromEntries(names.map((name) => {
    const source = sources[name] ?? 0;
    return [name, (u: number, v: number) => clamp(resolveField(source, u, v), 0, 1)];
  })) as Record<string, ScalarField2D>;
  const sample = (u: number, v: number): Readonly<Record<string, number>> =>
    Object.fromEntries(names.map((name) => [name, fields[name]!(u, v)]));
  const bake = (width: number, height: number): Readonly<Record<string, TextureBuffer>> => {
    const textureWidth = Math.max(1, Math.floor(width));
    const textureHeight = Math.max(1, Math.floor(height));
    const textures = Object.fromEntries(names.map((name) => [
      name,
      makeTexture(textureWidth, textureHeight, 1),
    ])) as Record<string, TextureBuffer>;
    for (let y = 0; y < textureHeight; y++) {
      const v = 1 - (y + 0.5) / textureHeight;
      for (let x = 0; x < textureWidth; x++) {
        const u = (x + 0.5) / textureWidth;
        const pixel = y * textureWidth + x;
        for (const name of names) textures[name]!.data[pixel] = fields[name]!(u, v);
      }
    }
    return textures;
  };
  return { names, fields, sample, bake };
}

export interface RadialArrayElementContext {
  readonly index: number;
  readonly count: number;
  readonly segmentId: number;
}

export type RadialArrayElement = (
  localX: number,
  localY: number,
  context: RadialArrayElementContext,
) => number;

export interface RadialArrayOptions {
  readonly count: number;
  readonly center?: readonly [number, number];
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly rotation?: number;
  readonly sweep?: number;
  readonly gap?: number;
  readonly alternate?: boolean;
  readonly element?: RadialArrayElement;
}

export interface RadialArraySample {
  readonly mask: number;
  readonly index: number;
  readonly segmentId: number;
  readonly localX: number;
  readonly localY: number;
  readonly radius: number;
}

export interface RadialArray {
  readonly mask: ScalarField2D;
  readonly segmentId: ScalarField2D;
  readonly sample: (u: number, v: number) => RadialArraySample;
}

function wrapAngle(angle: number): number {
  return angle - Math.floor(angle / TAU) * TAU;
}

/** Replicate one local shape across deterministic angular sectors. */
export function radialArray(options: RadialArrayOptions): RadialArray {
  const count = Math.max(1, Math.floor(options.count));
  const center = options.center ?? [0.5, 0.5];
  const innerRadius = Math.max(0, options.innerRadius ?? 0.18);
  const outerRadius = Math.max(innerRadius + 1e-6, options.outerRadius ?? 0.46);
  const rotation = options.rotation ?? 0;
  const sweep = clamp(options.sweep ?? TAU, 1e-6, TAU);
  const gap = clamp(options.gap ?? 0.12, 0, 0.95);
  const segmentAngle = sweep / count;
  const element = options.element ?? ((localX, localY) =>
    Math.abs(localX) <= 1 && Math.abs(localY) <= 1 ? 1 : 0);

  const sample = (u: number, v: number): RadialArraySample => {
    const dx = u - center[0];
    const dy = v - center[1];
    const radius = Math.hypot(dx, dy);
    const relativeAngle = wrapAngle(Math.atan2(dy, dx) - rotation);
    if (relativeAngle >= sweep || radius < innerRadius || radius > outerRadius) {
      return { mask: 0, index: -1, segmentId: 0, localX: 0, localY: 0, radius };
    }
    const index = Math.min(count - 1, Math.floor(relativeAngle / segmentAngle));
    const segmentCenter = (index + 0.5) * segmentAngle;
    let localX = (relativeAngle - segmentCenter) / (segmentAngle * 0.5 * (1 - gap));
    if (options.alternate && index % 2 === 1) localX = -localX;
    const localY = (radius - (innerRadius + outerRadius) * 0.5)
      / ((outerRadius - innerRadius) * 0.5);
    const segmentId = (index + 0.5) / count;
    const mask = clamp(element(localX, localY, { index, count, segmentId }), 0, 1);
    return { mask, index, segmentId, localX, localY, radius };
  };
  return {
    mask: (u, v) => sample(u, v).mask,
    segmentId: (u, v) => {
      const result = sample(u, v);
      return result.mask > 0 ? result.segmentId : 0;
    },
    sample,
  };
}

export type PathStrokePoint = readonly [number, number] | {
  readonly u: number;
  readonly v: number;
  /** Stroke radius at this point. */
  readonly width?: number;
};

export interface PathStrokePath {
  readonly points: readonly PathStrokePoint[];
  readonly closed?: boolean;
}

export type PathStrokeCap = "round" | "butt";
export type PathStrokeProfile = "flat" | "round" | "ridge";

export interface PathStrokeOptions {
  /** Stroke radius in UV units. */
  readonly width?: number;
  readonly feather?: number;
  readonly height?: number;
  readonly cap?: PathStrokeCap;
  readonly profile?: PathStrokeProfile;
  readonly closed?: boolean;
  readonly branches?: readonly PathStrokePath[];
  readonly tileable?: boolean;
}

export interface PathStrokeSample {
  readonly mask: number;
  readonly height: number;
  readonly distance: number;
  readonly pathIndex: number;
  readonly pathId: number;
  readonly progress: number;
}

export interface PathStroke {
  readonly mask: ScalarField2D;
  readonly height: ScalarField2D;
  readonly distance: ScalarField2D;
  readonly pathId: ScalarField2D;
  readonly progress: ScalarField2D;
  readonly sample: (u: number, v: number) => PathStrokeSample;
}

interface NormalizedPathPoint {
  readonly u: number;
  readonly v: number;
  readonly width: number;
}

interface NormalizedPath {
  readonly points: readonly NormalizedPathPoint[];
  readonly closed: boolean;
  readonly lengths: readonly number[];
  readonly totalLength: number;
}

function normalizePathPoint(point: PathStrokePoint, width: number): NormalizedPathPoint {
  if ("u" in point) {
    return { u: point.u, v: point.v, width: Math.max(1e-6, point.width ?? width) };
  }
  return { u: point[0], v: point[1], width };
}

function normalizePath(path: PathStrokePath, defaultWidth: number): NormalizedPath {
  if (path.points.length < 2) throw new Error("path stroke requires at least two points per path");
  const points = path.points.map((point) => normalizePathPoint(point, defaultWidth));
  const segmentCount = path.closed ? points.length : points.length - 1;
  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < segmentCount; index++) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    lengths.push(totalLength);
    totalLength += Math.hypot(end.u - start.u, end.v - start.v);
  }
  return { points, closed: path.closed ?? false, lengths, totalLength };
}

/** Build a width-aware polyline field; extra paths form deterministic branches. */
export function pathStroke(
  points: readonly PathStrokePoint[],
  options: PathStrokeOptions = {},
): PathStroke {
  const width = Math.max(1e-6, options.width ?? 0.025);
  const feather = Math.max(1e-6, options.feather ?? width * 0.2);
  const strokeHeight = options.height ?? 1;
  const cap = options.cap ?? "round";
  const profile = options.profile ?? "round";
  const mainPath: PathStrokePath = options.closed === undefined
    ? { points }
    : { points, closed: options.closed };
  const paths = [
    normalizePath(mainPath, width),
    ...(options.branches ?? []).map((branch) => normalizePath(branch, width)),
  ];
  const shifts = options.tileable ? [-1, 0, 1] : [0];

  const sample = (u: number, v: number): PathStrokeSample => {
    let nearestDistance = Infinity;
    let nearestWidth = width;
    let nearestPath = -1;
    let nearestProgress = 0;
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      const path = paths[pathIndex]!;
      const segmentCount = path.closed ? path.points.length : path.points.length - 1;
      for (const shiftY of shifts) {
        for (const shiftX of shifts) {
          for (let segment = 0; segment < segmentCount; segment++) {
            const start = path.points[segment]!;
            const end = path.points[(segment + 1) % path.points.length]!;
            const ax = start.u + shiftX;
            const ay = start.v + shiftY;
            const bx = end.u + shiftX;
            const by = end.v + shiftY;
            const dx = bx - ax;
            const dy = by - ay;
            const lengthSquared = dx * dx + dy * dy;
            const rawT = lengthSquared > 1e-12
              ? ((u - ax) * dx + (v - ay) * dy) / lengthSquared
              : 0;
            const firstEndpoint = !path.closed && segment === 0;
            const lastEndpoint = !path.closed && segment === segmentCount - 1;
            if (cap === "butt" && ((firstEndpoint && rawT < 0) || (lastEndpoint && rawT > 1))) {
              continue;
            }
            const t = clamp(rawT, 0, 1);
            const nearestX = ax + dx * t;
            const nearestY = ay + dy * t;
            const distance = Math.hypot(u - nearestX, v - nearestY);
            if (distance >= nearestDistance) continue;
            nearestDistance = distance;
            nearestWidth = start.width + (end.width - start.width) * t;
            nearestPath = pathIndex;
            const segmentLength = Math.sqrt(lengthSquared);
            nearestProgress = path.totalLength > 1e-12
              ? (path.lengths[segment]! + segmentLength * t) / path.totalLength
              : 0;
          }
        }
      }
    }
    if (nearestPath < 0) {
      return { mask: 0, height: 0, distance: Infinity, pathIndex: -1, pathId: 0, progress: 0 };
    }
    const mask = 1 - smoothstep(nearestWidth - feather, nearestWidth + feather, nearestDistance);
    const normalizedDistance = clamp(nearestDistance / nearestWidth, 0, 1);
    let profileWeight = mask;
    if (profile === "round") profileWeight = Math.sqrt(Math.max(0, 1 - normalizedDistance ** 2)) * mask;
    if (profile === "ridge") profileWeight = (1 - normalizedDistance) * mask;
    return {
      mask,
      height: strokeHeight * profileWeight,
      distance: nearestDistance,
      pathIndex: nearestPath,
      pathId: (nearestPath + 0.5) / paths.length,
      progress: nearestProgress,
    };
  };
  return {
    mask: (u, v) => sample(u, v).mask,
    height: (u, v) => sample(u, v).height,
    distance: (u, v) => sample(u, v).distance,
    pathId: (u, v) => {
      const result = sample(u, v);
      return result.mask > 0 ? result.pathId : 0;
    },
    progress: (u, v) => {
      const result = sample(u, v);
      return result.mask > 0 ? result.progress : 0;
    },
    sample,
  };
}
