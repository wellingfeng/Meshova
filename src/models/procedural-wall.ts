import { clamp } from "../math/scalar.js";
import {
  add,
  cross,
  length,
  normalize,
  scale,
  sub,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import {
  bezier,
  box,
  cone,
  cylinder,
  icosphere,
  merge,
  polyline,
  resampleCurve,
  transform,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type ProceduralWallStyle = "palisade" | "stone";

export interface ProceduralWallParams {
  style: ProceduralWallStyle;
  length: number;
  bend: number;
  height: number;
  thickness: number;
  segmentLength: number;
  enclosure: boolean;
  gateWidth: number;
  terrain: number;
  detail: number;
  banners: number;
  seed: number;
}

export interface ProceduralWallFrame {
  readonly center: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly yaw: number;
}

export interface ProceduralWallSpan {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly center: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly length: number;
  readonly yaw: number;
  readonly gate: boolean;
}

export interface ProceduralWallLayout {
  readonly params: ProceduralWallParams;
  readonly guide: Curve;
  readonly totalLength: number;
  readonly gateCenter: number;
  readonly frames: readonly ProceduralWallFrame[];
  readonly spans: readonly ProceduralWallSpan[];
}

export const PROCEDURAL_WALL_DEFAULTS: ProceduralWallParams = {
  style: "palisade",
  length: 30,
  bend: 4.5,
  height: 3.2,
  thickness: 0.48,
  segmentLength: 0.48,
  enclosure: true,
  gateWidth: 3.2,
  terrain: 0.35,
  detail: 5,
  banners: 6,
  seed: 27,
};

const UP = vec3(0, 1, 0);
const WOOD: RGB = [0.29, 0.18, 0.09];
const WOOD_DARK: RGB = [0.17, 0.095, 0.04];
const BANNER_RED: RGB = [0.58, 0.045, 0.025];
const BANNER_GOLD: RGB = [0.95, 0.66, 0.08];
const STONE_DARK: RGB = [0.24, 0.25, 0.24];
const STONE_MID: RGB = [0.39, 0.40, 0.37];
const STONE_LIGHT: RGB = [0.56, 0.55, 0.50];
const MORTAR: RGB = [0.11, 0.115, 0.105];

function resolveParams(params: Partial<ProceduralWallParams>): ProceduralWallParams {
  const base = { ...PROCEDURAL_WALL_DEFAULTS, ...params };
  return {
    style: base.style === "stone" ? "stone" : "palisade",
    length: Math.max(4, base.length),
    bend: clamp(base.bend, -base.length * 0.45, base.length * 0.45),
    height: Math.max(0.8, base.height),
    thickness: Math.max(0.16, base.thickness),
    segmentLength: Math.max(0.18, base.segmentLength),
    enclosure: Boolean(base.enclosure),
    gateWidth: Math.max(0, Math.min(base.gateWidth, base.length * 0.3)),
    terrain: Math.max(0, base.terrain),
    detail: Math.max(2, Math.min(9, Math.round(base.detail))),
    banners: Math.max(0, Math.min(16, Math.round(base.banners))),
    seed: Math.round(base.seed) >>> 0,
  };
}

function makeGuide(params: ProceduralWallParams): Curve {
  if (params.enclosure) {
    const ratio = 0.68;
    const unitCircumference = Math.PI * (3 * (1 + ratio) - Math.sqrt((3 + ratio) * (1 + 3 * ratio)));
    const radiusX = params.length / unitCircumference;
    const radiusZ = radiusX * ratio;
    const count = Math.max(48, Math.round(params.length / params.segmentLength) * 2);
    const points: Vec3[] = [];
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + index / count * Math.PI * 2;
      const asymmetry = Math.sin(angle * 2) * params.bend * 0.08;
      points.push(vec3(
        Math.cos(angle) * radiusX + asymmetry,
        Math.sin(angle * 2.3 + 0.4) * params.terrain,
        Math.sin(angle) * radiusZ + Math.sin(angle * 3) * params.bend * 0.035,
      ));
    }
    return polyline(points, true);
  }

  const half = params.length * 0.5;
  return bezier(
    vec3(-half, 0, 0),
    vec3(-half * 0.35, params.terrain * 0.8, params.bend),
    vec3(half * 0.25, -params.terrain * 0.45, -params.bend * 0.45),
    vec3(half, params.terrain * 0.2, params.bend * 0.18),
    Math.max(48, Math.round(params.length / params.segmentLength) * 3),
  );
}

function flatTangent(start: Vec3, end: Vec3): Vec3 {
  const delta = sub(end, start);
  const flat = vec3(delta.x, 0, delta.z);
  return length(flat) > 1e-8 ? normalize(flat) : vec3(1, 0, 0);
}

function wallNormal(tangent: Vec3): Vec3 {
  const normal = cross(tangent, UP);
  return length(normal) > 1e-8 ? normalize(normal) : vec3(0, 0, 1);
}

function yawFor(tangent: Vec3): number {
  return -Math.atan2(tangent.z, tangent.x);
}

function gateDistance(distance: number, total: number, center: number, closed: boolean): number {
  const direct = Math.abs(distance - center);
  return closed ? Math.min(direct, total - direct) : direct;
}

export function buildProceduralWallLayout(
  params: Partial<ProceduralWallParams> = {},
): ProceduralWallLayout {
  const resolved = resolveParams(params);
  const guide = resampleCurve(makeGuide(resolved), { segmentLength: resolved.segmentLength });
  const points = guide.points;
  const segmentCount = guide.closed ? points.length : Math.max(0, points.length - 1);
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < segmentCount; index++) {
    const spanLength = length(sub(points[(index + 1) % points.length]!, points[index]!));
    segmentLengths.push(spanLength);
    totalLength += spanLength;
  }
  const gateCenter = guide.closed ? 0 : totalLength * 0.5;
  const spans: ProceduralWallSpan[] = [];
  const frames: ProceduralWallFrame[] = [];
  let distance = 0;

  for (let index = 0; index < segmentCount; index++) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const spanLength = segmentLengths[index]!;
    const tangent = flatTangent(start, end);
    const normal = wallNormal(tangent);
    const center = scale(add(start, end), 0.5);
    const yaw = yawFor(tangent);
    const midpointDistance = distance + spanLength * 0.5;
    spans.push({
      start,
      end,
      center,
      tangent,
      normal,
      distance: midpointDistance,
      length: spanLength,
      yaw,
      gate: resolved.gateWidth > 0
        && gateDistance(midpointDistance, totalLength, gateCenter, guide.closed) < resolved.gateWidth * 0.5,
    });
    frames.push({ center: start, tangent, normal, distance, yaw });
    distance += spanLength;
  }

  if (!guide.closed && points.length > 1) {
    const last = points[points.length - 1]!;
    const previous = points[points.length - 2]!;
    const tangent = flatTangent(previous, last);
    frames.push({
      center: last,
      tangent,
      normal: wallNormal(tangent),
      distance: totalLength,
      yaw: yawFor(tangent),
    });
  }

  return { params: resolved, guide, totalLength, gateCenter, frames, spans };
}

function frameAt(layout: ProceduralWallLayout, requestedDistance: number): ProceduralWallFrame {
  const total = layout.totalLength;
  const distance = layout.guide.closed
    ? ((requestedDistance % total) + total) % total
    : clamp(requestedDistance, 0, total);
  let startDistance = 0;
  for (const span of layout.spans) {
    const endDistance = startDistance + span.length;
    if (distance <= endDistance || span === layout.spans[layout.spans.length - 1]) {
      const t = span.length > 1e-8 ? clamp((distance - startDistance) / span.length, 0, 1) : 0;
      return {
        center: add(span.start, scale(sub(span.end, span.start), t)),
        tangent: span.tangent,
        normal: span.normal,
        distance,
        yaw: span.yaw,
      };
    }
    startDistance = endDistance;
  }
  return layout.frames[0]!;
}

function isInsideGate(layout: ProceduralWallLayout, distance: number): boolean {
  const params = layout.params;
  return params.gateWidth > 0
    && gateDistance(distance, layout.totalLength, layout.gateCenter, layout.guide.closed) < params.gateWidth * 0.5;
}

function mergeAll(meshes: readonly Mesh[]): Mesh {
  return merge(...meshes);
}

function buildGate(layout: ProceduralWallLayout): { wood: Mesh[]; cloth: Mesh[]; trim: Mesh[] } {
  const params = layout.params;
  if (params.gateWidth <= 0) return { wood: [], cloth: [], trim: [] };
  const wood: Mesh[] = [];
  const cloth: Mesh[] = [];
  const trim: Mesh[] = [];
  const postRadius = params.thickness * 0.42;
  const postHeight = params.height * 1.18;
  const left = frameAt(layout, layout.gateCenter - params.gateWidth * 0.5);
  const right = frameAt(layout, layout.gateCenter + params.gateWidth * 0.5);
  const center = frameAt(layout, layout.gateCenter);

  for (const frame of [left, right]) {
    wood.push(transform(cylinder(postRadius, postHeight, 10), {
      translate: add(frame.center, vec3(0, postHeight * 0.5, 0)),
    }));
    wood.push(transform(cone(postRadius * 1.12, postRadius * 2.2, 10), {
      translate: add(frame.center, vec3(0, postHeight + postRadius * 1.1, 0)),
    }));
  }

  wood.push(transform(box(params.gateWidth + postRadius * 2.2, postRadius * 0.9, postRadius * 0.9), {
    rotate: vec3(0, center.yaw, 0),
    translate: add(center.center, vec3(0, params.height * 1.03, 0)),
  }));

  const doorHeight = params.height * 0.72;
  const slatCount = Math.max(6, Math.round(params.gateWidth / (postRadius * 1.35)));
  for (let index = 0; index < slatCount; index++) {
    const offset = -params.gateWidth * 0.5 + (index + 0.5) / slatCount * params.gateWidth;
    const position = add(center.center, scale(center.tangent, offset));
    wood.push(transform(box(params.gateWidth / slatCount * 0.82, doorHeight, postRadius * 0.45), {
      rotate: vec3(0, center.yaw, 0),
      translate: add(position, add(scale(center.normal, postRadius * 0.12), vec3(0, doorHeight * 0.5, 0))),
    }));
  }

  const bannerCenter = add(center.center, vec3(0, params.height * 1.28, 0));
  cloth.push(transform(box(params.gateWidth * 0.34, params.height * 0.42, 0.035), {
    rotate: vec3(0, center.yaw, 0),
    translate: add(bannerCenter, scale(center.normal, params.thickness * 0.7)),
  }));
  trim.push(transform(box(params.gateWidth * 0.07, params.height * 0.42, 0.045), {
    rotate: vec3(0, center.yaw, 0),
    translate: add(bannerCenter, scale(center.normal, params.thickness * 0.74)),
  }));
  return { wood, cloth, trim };
}

function buildPalisade(layout: ProceduralWallLayout): NamedPart[] {
  const params = layout.params;
  const rng = makeRng(params.seed);
  const stakes: Mesh[] = [];
  const rails: Mesh[] = [];
  const poles: Mesh[] = [];
  const bannerCloth: Mesh[] = [];
  const bannerTrim: Mesh[] = [];
  const stakeRadius = params.thickness * 0.25;

  for (const frame of layout.frames) {
    if (isInsideGate(layout, frame.distance)) continue;
    const height = params.height * rng.range(0.90, 1.06);
    const offset = add(
      scale(frame.tangent, rng.range(-0.06, 0.06) * params.segmentLength),
      scale(frame.normal, rng.range(-0.06, 0.06) * params.thickness),
    );
    const center = add(frame.center, offset);
    stakes.push(transform(cylinder(stakeRadius * rng.range(0.88, 1.12), height, 8), {
      rotate: vec3(rng.range(-0.025, 0.025), 0, rng.range(-0.025, 0.025)),
      translate: add(center, vec3(0, height * 0.5, 0)),
    }));
    stakes.push(transform(cone(stakeRadius * 1.06, stakeRadius * 2.4, 8), {
      translate: add(center, vec3(0, height + stakeRadius * 1.2, 0)),
    }));
  }

  for (const span of layout.spans) {
    if (span.gate) continue;
    const baseY = (span.start.y + span.end.y) * 0.5;
    for (const ratio of [0.34, 0.67]) {
      rails.push(transform(box(span.length + stakeRadius * 0.9, stakeRadius * 0.72, params.thickness * 0.38), {
        rotate: vec3(0, span.yaw, 0),
        translate: vec3(span.center.x, baseY + params.height * ratio, span.center.z),
      }));
    }
  }

  for (let index = 0; index < params.banners; index++) {
    const distance = layout.totalLength * (index + 0.5) / params.banners;
    if (isInsideGate(layout, distance)) continue;
    const frame = frameAt(layout, distance);
    const poleHeight = params.height * 1.42;
    const outside = scale(frame.normal, params.thickness * 0.72);
    const poleCenter = add(frame.center, outside);
    poles.push(transform(cylinder(stakeRadius * 0.38, poleHeight, 8), {
      translate: add(poleCenter, vec3(0, poleHeight * 0.5, 0)),
    }));
    const clothCenter = add(poleCenter, add(scale(frame.tangent, params.height * 0.16), vec3(0, params.height * 1.08, 0)));
    bannerCloth.push(transform(box(params.height * 0.34, params.height * 0.52, 0.03), {
      rotate: vec3(0, frame.yaw, 0),
      translate: clothCenter,
    }));
    bannerTrim.push(transform(box(params.height * 0.055, params.height * 0.52, 0.04), {
      rotate: vec3(0, frame.yaw, 0),
      translate: add(clothCenter, scale(frame.tangent, params.height * 0.02)),
    }));
  }

  const gate = buildGate(layout);
  const parts: NamedPart[] = [
    {
      name: "palisade_stakes",
      label: "尖顶木桩",
      mesh: mergeAll(stakes),
      color: WOOD,
      surface: { type: "wood", params: { color: WOOD, roughness: 0.88, seed: params.seed } },
    },
    {
      name: "palisade_rails",
      label: "背部横梁",
      mesh: mergeAll(rails),
      color: WOOD_DARK,
      surface: { type: "wood", params: { color: WOOD_DARK, roughness: 0.92, seed: params.seed + 7 } },
    },
  ];

  if (gate.wood.length > 0) {
    parts.push({
      name: "fortified_gate",
      label: "可编辑城门",
      mesh: mergeAll(gate.wood),
      color: WOOD_DARK,
      surface: { type: "wood", params: { color: WOOD_DARK, roughness: 0.9, seed: params.seed + 17 } },
    });
  }
  if (poles.length > 0) {
    parts.push({
      name: "banner_poles",
      label: "旗杆",
      mesh: mergeAll(poles),
      color: WOOD_DARK,
      surface: { type: "wood", params: { color: WOOD_DARK, roughness: 0.86 } },
    });
  }
  const redMeshes = [...bannerCloth, ...gate.cloth];
  const goldMeshes = [...bannerTrim, ...gate.trim];
  if (redMeshes.length > 0) {
    parts.push({
      name: "banner_cloth",
      label: "红色战旗",
      mesh: mergeAll(redMeshes),
      color: BANNER_RED,
      surface: { type: "fabric", params: { color: BANNER_RED, roughness: 0.82 } },
    });
    parts.push({
      name: "banner_trim",
      label: "金色旗纹",
      mesh: mergeAll(goldMeshes),
      color: BANNER_GOLD,
      surface: { type: "fabric", params: { color: BANNER_GOLD, roughness: 0.76 } },
    });
  }
  return parts.map((part) => ({
    ...part,
    metadata: {
      ...(part.metadata ?? {}),
      sourceTechnique: "UE5 PCG spline sampling and tangent-oriented mesh placement",
      pathLength: layout.totalLength,
      closed: layout.guide.closed,
    },
  }));
}

function stoneShade(value: number): 0 | 1 | 2 {
  if (value < 0.28) return 0;
  if (value > 0.78) return 2;
  return 1;
}

function buildStoneWall(layout: ProceduralWallLayout): NamedPart[] {
  const params = layout.params;
  const rng = makeRng(params.seed);
  const cores: Mesh[] = [];
  const shades: [Mesh[], Mesh[], Mesh[]] = [[], [], []];
  const caps: Mesh[] = [];
  const courses = params.detail;
  const courseHeight = params.height / courses;
  const blockPitch = Math.max(params.segmentLength * 0.78, courseHeight * 1.22);
  const stone = icosphere(0.5, 0);

  for (const span of layout.spans) {
    if (span.gate) continue;
    cores.push(transform(box(span.length + 0.06, params.height * 0.94, params.thickness * 0.72), {
      rotate: vec3(0, span.yaw, 0),
      translate: vec3(span.center.x, span.center.y + params.height * 0.47, span.center.z),
    }));
  }

  for (let course = 0; course < courses; course++) {
    const offset = course % 2 === 0 ? 0 : blockPitch * 0.5;
    for (let distance = offset; distance < layout.totalLength; distance += blockPitch) {
      if (isInsideGate(layout, distance)) continue;
      const frame = frameAt(layout, distance);
      const width = blockPitch * rng.range(0.82, 1.08);
      const stoneHeight = courseHeight * rng.range(0.78, 0.98);
      const y = frame.center.y + courseHeight * (course + 0.5) + rng.range(-0.08, 0.08) * courseHeight;
      for (const side of [-1, 1]) {
        const position = add(
          vec3(frame.center.x, y, frame.center.z),
          scale(frame.normal, side * params.thickness * rng.range(0.40, 0.49)),
        );
        const mesh = transform(stone, {
          scale: vec3(width, stoneHeight, params.thickness * rng.range(0.60, 0.82)),
          rotate: vec3(rng.range(-0.08, 0.08), frame.yaw + rng.range(-0.11, 0.11), rng.range(-0.05, 0.05)),
          translate: position,
        });
        shades[stoneShade(rng.next())].push(mesh);
      }
    }
  }

  for (let distance = 0; distance < layout.totalLength; distance += blockPitch * 1.08) {
    if (isInsideGate(layout, distance)) continue;
    const frame = frameAt(layout, distance);
    caps.push(transform(stone, {
      scale: vec3(blockPitch * rng.range(0.86, 1.12), courseHeight * 0.58, params.thickness * 1.16),
      rotate: vec3(rng.range(-0.04, 0.04), frame.yaw + rng.range(-0.1, 0.1), rng.range(-0.04, 0.04)),
      translate: add(frame.center, vec3(0, params.height + courseHeight * 0.16, 0)),
    }));
  }

  const colors: RGB[] = [STONE_DARK, STONE_MID, STONE_LIGHT];
  const labels = ["深色砌石", "主体砌石", "浅色砌石"];
  const parts: NamedPart[] = [
    {
      name: "stone_mortar_core",
      label: "砂浆墙芯",
      mesh: mergeAll(cores),
      color: MORTAR,
      surface: { type: "concrete", params: { color: MORTAR, roughness: 0.98, seed: params.seed } },
    },
  ];
  for (let index = 0; index < shades.length; index++) {
    if (shades[index]!.length === 0) continue;
    const color = colors[index]!;
    parts.push({
      name: `stone_face_${index}`,
      label: labels[index]!,
      mesh: mergeAll(shades[index]!),
      color,
      surface: { type: "stone", params: { color, roughness: 0.94, seed: params.seed + index * 13 } },
    });
  }
  parts.push({
    name: "stone_coping",
    label: "顶部压顶石",
    mesh: mergeAll(caps),
    color: STONE_LIGHT,
    surface: { type: "stone", params: { color: STONE_LIGHT, roughness: 0.9, seed: params.seed + 47 } },
  });
  return parts.map((part) => ({
    ...part,
    metadata: {
      ...(part.metadata ?? {}),
      sourceTechnique: "UE4 construction-script spline mesh segmentation",
      pathLength: layout.totalLength,
      closed: layout.guide.closed,
      courses,
    },
  }));
}

export function buildProceduralWallParts(
  params: Partial<ProceduralWallParams> = {},
): NamedPart[] {
  const layout = buildProceduralWallLayout(params);
  return layout.params.style === "stone" ? buildStoneWall(layout) : buildPalisade(layout);
}

export function buildPcgPalisadeWallParts(
  params: Partial<Omit<ProceduralWallParams, "style">> = {},
): NamedPart[] {
  return buildProceduralWallParts({ ...params, style: "palisade" });
}

export function buildSplineStoneWallParts(
  params: Partial<Omit<ProceduralWallParams, "style">> = {},
): NamedPart[] {
  return buildProceduralWallParts({
    length: 18,
    bend: 3.2,
    height: 2.4,
    thickness: 0.72,
    segmentLength: 0.72,
    enclosure: false,
    gateWidth: 0,
    terrain: 0.8,
    detail: 5,
    banners: 0,
    seed: 41,
    ...params,
    style: "stone",
  });
}
