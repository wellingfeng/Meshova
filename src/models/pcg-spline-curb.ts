import {
  merge,
  polyline,
  resampleCurve,
  roadRibbon,
  roundedBox,
  smoothCurve,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
  type PartInstanceTransform,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

type RGB = [number, number, number];

export interface PcgSplineCurbParams {
  length: number;
  bend: number;
  roadWidth: number;
  sidewalkWidth: number;
  curbWidth: number;
  curbHeight: number;
  curbCourses: number;
  curbBlockLength: number;
  sidewalkTileLength: number;
  sidewalkTileWidth: number;
  sidewalkHeight: number;
  gap: number;
  jitter: number;
  bothSides: boolean;
  seed: number;
  controlPoints?: ReadonlyArray<Vec3>;
}

export interface PcgSplineCurbResult {
  readonly parts: NamedPart[];
  readonly curve: Curve;
  readonly controlPoints: ReadonlyArray<Vec3>;
  readonly curbBlockCount: number;
  readonly sidewalkPaverCount: number;
}

export const PCG_SPLINE_CURB_DEFAULTS: PcgSplineCurbParams = {
  length: 34,
  bend: 7,
  roadWidth: 7,
  sidewalkWidth: 2.4,
  curbWidth: 0.38,
  curbHeight: 0.5,
  curbCourses: 2,
  curbBlockLength: 0.82,
  sidewalkTileLength: 0.9,
  sidewalkTileWidth: 0.62,
  sidewalkHeight: 0.12,
  gap: 0.055,
  jitter: 0.035,
  bothSides: false,
  seed: 170,
};

const SOURCE_URL = "https://www.bilibili.com/video/BV1FCyeYUEB7/";
const ROAD_COLOR: RGB = [0.075, 0.08, 0.09];
const BED_COLOR: RGB = [0.2, 0.19, 0.18];
const CURB_COLOR: RGB = [0.52, 0.22, 0.14];
const PAVER_COLOR: RGB = [0.48, 0.31, 0.22];

interface FrameSample {
  point: Vec3;
  tangent: Vec3;
  right: Vec3;
  yaw: number;
}

interface InstanceGroup {
  label: string;
  source: Mesh;
  color: RGB;
  surface: NonNullable<NamedPart["surface"]>;
  transforms: PartInstanceTransform[];
  metadata: Record<string, unknown>;
}

class InstanceBag {
  private readonly groups = new Map<string, InstanceGroup>();

  add(
    name: string,
    label: string,
    source: Mesh,
    color: RGB,
    surface: NonNullable<NamedPart["surface"]>,
    instance: PartInstanceTransform,
    metadata: Record<string, unknown>,
  ): void {
    const existing = this.groups.get(name);
    if (existing) {
      existing.transforms.push(instance);
      return;
    }
    this.groups.set(name, {
      label,
      source,
      color,
      surface,
      transforms: [instance],
      metadata,
    });
  }

  toParts(): NamedPart[] {
    return [...this.groups.entries()].map(([name, group]) => {
      const realized = group.transforms.map((instance) => transform(group.source, {
        translate: vec3(...instance.position),
        rotate: vec3(...(instance.rotation ?? [0, 0, 0])),
        scale: vec3(...(instance.scale ?? [1, 1, 1])),
      }));
      return {
        name,
        label: group.label,
        mesh: merge(...realized),
        color: group.color,
        surface: group.surface,
        renderInstances: { mesh: group.source, transforms: group.transforms },
        metadata: group.metadata,
      };
    });
  }
}

export function buildPcgSplineCurb(
  params: Partial<PcgSplineCurbParams> = {},
): PcgSplineCurbResult {
  const resolved = resolveParams(params);
  const controlPoints = resolved.controlPoints?.map((point) => ({ ...point }))
    ?? defaultControlPoints(resolved.length, resolved.bend);
  const curve = smoothCurve(polyline(controlPoints), 12);
  const sides = resolved.bothSides ? [-1, 1] as const : [1] as const;
  const bag = new InstanceBag();
  const curbSource = roundedBox({
    width: resolved.curbWidth,
    height: resolved.curbHeight / resolved.curbCourses,
    depth: resolved.curbBlockLength,
    radius: Math.min(resolved.gap * 0.8, resolved.curbHeight * 0.1),
    steps: 1,
  });
  const capLength = resolved.curbBlockLength * 0.46;
  const capHeight = resolved.curbHeight * 0.22;
  const capSource = roundedBox({
    width: resolved.curbWidth * 1.42,
    height: capHeight,
    depth: capLength,
    radius: Math.min(resolved.gap * 0.75, capHeight * 0.28),
    steps: 1,
  });
  const rowCount = Math.max(1, Math.round(resolved.sidewalkWidth / resolved.sidewalkTileWidth));
  const rowPitch = resolved.sidewalkWidth / rowCount;
  const paverWidth = Math.max(0.05, rowPitch - resolved.gap);
  const paverSource = roundedBox({
    width: paverWidth,
    height: resolved.sidewalkHeight,
    depth: resolved.sidewalkTileLength,
    radius: Math.min(resolved.gap * 0.62, resolved.sidewalkHeight * 0.22),
    steps: 1,
  });
  const roadHalfWidth = resolved.roadWidth * 0.5;
  const courseHeight = resolved.curbHeight / resolved.curbCourses;
  const coursePitch = courseHeight * 0.88;
  const wallTop = courseHeight + coursePitch * (resolved.curbCourses - 1);
  const baseSpacing = resolved.curbBlockLength + resolved.gap;
  const capSpacing = capLength + resolved.gap * 0.55;
  const paverSpacing = resolved.sidewalkTileLength + resolved.gap;
  const curbRng = makeRng(resolved.seed ^ 0x8a31f40d);
  const capRng = makeRng(resolved.seed ^ 0x2f6e2b1d);
  const paverRng = makeRng(resolved.seed ^ 0x51c7a4e9);
  let curbBlockCount = 0;
  let sidewalkPaverCount = 0;

  for (const side of sides) {
    const curbLateral = side * (roadHalfWidth + resolved.curbWidth * 0.5);
    for (let course = 0; course < resolved.curbCourses; course++) {
      const phase = course % 2 === 0 ? 0 : baseSpacing * 0.5;
      for (const sample of sampleCurve(curve, baseSpacing, phase)) {
        const alongJitter = curbRng.range(-resolved.jitter, resolved.jitter);
        const lateralJitter = curbRng.range(-resolved.jitter * 0.35, resolved.jitter * 0.35);
        const scaleVariation = curbRng.range(0.965, 1.035);
        const position = offsetSample(sample, curbLateral + lateralJitter, alongJitter);
        bag.add(
          "curb_courses",
          "分层错缝路缘砖",
          curbSource,
          CURB_COLOR,
          { type: "brick", params: { color: CURB_COLOR, roughness: 0.86, seed: resolved.seed } },
          {
            position: [position.x, position.y + courseHeight * 0.5 + course * coursePitch, position.z],
            rotation: [0, sample.yaw + curbRng.range(-resolved.jitter * 0.35, resolved.jitter * 0.35), 0],
            scale: [curbRng.range(0.98, 1.02), curbRng.range(0.96, 1.04), scaleVariation],
          },
          sourceMetadata("28 单位主砖等距采样，逐层半砖错缝"),
        );
        curbBlockCount++;
      }
    }

    for (const sample of sampleCurve(curve, capSpacing, 0)) {
      const position = offsetSample(
        sample,
        curbLateral + capRng.range(-resolved.jitter * 0.2, resolved.jitter * 0.2),
        capRng.range(-resolved.jitter * 0.4, resolved.jitter * 0.4),
      );
      bag.add(
        "curb_caps",
        "横向压顶路缘砖",
        capSource,
        CURB_COLOR,
        { type: "brick", params: { color: CURB_COLOR, roughness: 0.82, seed: resolved.seed + 1 } },
        {
          position: [position.x, position.y + wallTop + capHeight * 0.5, position.z],
          rotation: [0, sample.yaw + capRng.range(-resolved.jitter * 0.2, resolved.jitter * 0.2), 0],
          scale: [capRng.range(0.97, 1.03), capRng.range(0.97, 1.03), capRng.range(0.97, 1.03)],
        },
        sourceMetadata("14 单位加密采样，窄砖横向压顶"),
      );
      curbBlockCount++;
    }

    const sidewalkInner = roadHalfWidth + resolved.curbWidth + resolved.gap;
    for (let row = 0; row < rowCount; row++) {
      const lateral = side * (sidewalkInner + rowPitch * (row + 0.5));
      const phase = row % 2 === 0 ? 0 : paverSpacing * 0.5;
      for (const sample of sampleCurve(curve, paverSpacing, phase)) {
        const position = offsetSample(
          sample,
          lateral + paverRng.range(-resolved.jitter * 0.28, resolved.jitter * 0.28),
          paverRng.range(-resolved.jitter, resolved.jitter),
        );
        bag.add(
          "sidewalk_pavers",
          "错缝人行道铺砖",
          paverSource,
          PAVER_COLOR,
          { type: "stone", params: { color: PAVER_COLOR, roughness: 0.9, seed: resolved.seed + 2 } },
          {
            position: [position.x, position.y + resolved.sidewalkHeight * 0.5, position.z],
            rotation: [0, sample.yaw + paverRng.range(-resolved.jitter * 0.22, resolved.jitter * 0.22), 0],
            scale: [paverRng.range(0.975, 1.025), paverRng.range(0.97, 1.03), paverRng.range(0.975, 1.025)],
          },
          sourceMetadata("沿样条等距采样，多行半砖错缝铺装"),
        );
        sidewalkPaverCount++;
      }
    }
  }

  const parts: NamedPart[] = [
    {
      name: "road_surface",
      label: "车行道路面",
      mesh: roadRibbon(curve, {
        halfWidth: roadHalfWidth,
        sampleDistance: 0.35,
        widthSubdivisions: 4,
        verticalOffset: 0,
        uvLengthScale: 5,
      }),
      color: ROAD_COLOR,
      surface: { type: "asphalt", params: { color: ROAD_COLOR, roughness: 0.94, seed: resolved.seed } },
      metadata: sourceMetadata("连续道路带作为样条参照面"),
    },
  ];

  const sidewalkBeds = sides.map((side) => {
    const bedLateral = side * (
      roadHalfWidth + resolved.curbWidth + resolved.gap + resolved.sidewalkWidth * 0.5
    );
    return roadRibbon(offsetCurve(curve, bedLateral), {
      halfWidth: resolved.sidewalkWidth * 0.5,
      sampleDistance: 0.35,
      widthSubdivisions: Math.max(2, rowCount),
      verticalOffset: resolved.sidewalkHeight * 0.18,
      uvLengthScale: 4,
    });
  });
  parts.push({
    name: "sidewalk_bed",
    label: "人行道基层",
    mesh: merge(...sidewalkBeds),
    color: BED_COLOR,
    surface: { type: "concrete", params: { color: BED_COLOR, roughness: 0.96 } },
    metadata: sourceMetadata("铺砖下方连续样条基层"),
  });
  parts.push(...bag.toParts());

  return {
    parts,
    curve,
    controlPoints,
    curbBlockCount,
    sidewalkPaverCount,
  };
}

export function buildPcgSplineCurbParts(
  params: Partial<PcgSplineCurbParams> = {},
): NamedPart[] {
  return buildPcgSplineCurb(params).parts;
}

function sampleCurve(curve: Curve, spacing: number, phase: number): FrameSample[] {
  const dense = resampleCurve(curve, { segmentLength: Math.min(0.22, spacing * 0.25) });
  const cumulative = cumulativeLengths(dense.points);
  const total = cumulative[cumulative.length - 1] ?? 0;
  const samples: FrameSample[] = [];
  for (let distance = spacing * 0.5 + phase; distance <= total - spacing * 0.25; distance += spacing) {
    const point = pointAtDistance(dense.points, cumulative, distance);
    const before = pointAtDistance(dense.points, cumulative, Math.max(0, distance - spacing * 0.2));
    const after = pointAtDistance(dense.points, cumulative, Math.min(total, distance + spacing * 0.2));
    const deltaX = after.x - before.x;
    const deltaZ = after.z - before.z;
    const magnitude = Math.hypot(deltaX, deltaZ) || 1;
    const tangent = vec3(deltaX / magnitude, 0, deltaZ / magnitude);
    const right = vec3(-tangent.z, 0, tangent.x);
    samples.push({ point, tangent, right, yaw: Math.atan2(tangent.x, tangent.z) });
  }
  return samples;
}

function offsetSample(sample: FrameSample, lateral: number, along: number): Vec3 {
  return vec3(
    sample.point.x + sample.right.x * lateral + sample.tangent.x * along,
    sample.point.y,
    sample.point.z + sample.right.z * lateral + sample.tangent.z * along,
  );
}

function offsetCurve(curve: Curve, lateral: number): Curve {
  const points = curve.points.map((point, index) => {
    const previous = curve.points[Math.max(0, index - 1)]!;
    const next = curve.points[Math.min(curve.points.length - 1, index + 1)]!;
    const deltaX = next.x - previous.x;
    const deltaZ = next.z - previous.z;
    const magnitude = Math.hypot(deltaX, deltaZ) || 1;
    return vec3(
      point.x - (deltaZ / magnitude) * lateral,
      point.y,
      point.z + (deltaX / magnitude) * lateral,
    );
  });
  return polyline(points, curve.closed);
}

function cumulativeLengths(points: ReadonlyArray<Vec3>): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    cumulative.push(cumulative[index - 1]! + Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    ));
  }
  return cumulative;
}

function pointAtDistance(
  points: ReadonlyArray<Vec3>,
  cumulative: ReadonlyArray<number>,
  distance: number,
): Vec3 {
  if (points.length === 0) return vec3(0, 0, 0);
  if (points.length === 1 || distance <= 0) return { ...points[0]! };
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (distance >= total) return { ...points[points.length - 1]! };
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle]! <= distance) low = middle;
    else high = middle;
  }
  const span = cumulative[high]! - cumulative[low]!;
  const alpha = span > 1e-9 ? (distance - cumulative[low]!) / span : 0;
  const start = points[low]!;
  const end = points[high]!;
  return vec3(
    start.x + (end.x - start.x) * alpha,
    start.y + (end.y - start.y) * alpha,
    start.z + (end.z - start.z) * alpha,
  );
}

function defaultControlPoints(length: number, bend: number): Vec3[] {
  return [
    vec3(-length * 0.5, 0, -bend * 0.35),
    vec3(-length * 0.28, 0, -bend * 0.35),
    vec3(-length * 0.08, 0, -bend * 0.22),
    vec3(length * 0.08, 0, bend * 0.18),
    vec3(length * 0.3, 0, bend * 0.48),
    vec3(length * 0.5, 0, bend * 0.48),
  ];
}

function sourceMetadata(method: string): Record<string, unknown> {
  return {
    sourceUrl: SOURCE_URL,
    sourceTitle: "UE5 使用样条线和 PCG 创建程序化路缘和人行道",
    method,
    pipeline: ["样条数据", "按弧长采样", "局部坐标变换", "网格实例化"],
  };
}

function resolveParams(params: Partial<PcgSplineCurbParams>): PcgSplineCurbParams {
  const merged = { ...PCG_SPLINE_CURB_DEFAULTS, ...params };
  const controlPoints = merged.controlPoints && merged.controlPoints.length >= 2
    ? merged.controlPoints.map((point) => ({ ...point }))
    : undefined;
  return {
    length: clamp(merged.length, 8, 120),
    bend: clamp(merged.bend, 0, 28),
    roadWidth: clamp(merged.roadWidth, 2.5, 18),
    sidewalkWidth: clamp(merged.sidewalkWidth, 0.8, 8),
    curbWidth: clamp(merged.curbWidth, 0.16, 1.2),
    curbHeight: clamp(merged.curbHeight, 0.16, 1.6),
    curbCourses: Math.round(clamp(merged.curbCourses, 1, 5)),
    curbBlockLength: clamp(merged.curbBlockLength, 0.3, 2.4),
    sidewalkTileLength: clamp(merged.sidewalkTileLength, 0.3, 2.4),
    sidewalkTileWidth: clamp(merged.sidewalkTileWidth, 0.25, 1.8),
    sidewalkHeight: clamp(merged.sidewalkHeight, 0.04, 0.5),
    gap: clamp(merged.gap, 0.01, 0.2),
    jitter: clamp(merged.jitter, 0, 0.16),
    bothSides: Boolean(merged.bothSides),
    seed: Math.round(merged.seed) >>> 0,
    ...(controlPoints ? { controlPoints } : {}),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
