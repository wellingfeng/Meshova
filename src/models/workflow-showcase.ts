import { vec3, type Vec3 } from "../math/vec3.js";
import {
  applyMaskField,
  applyScatterTable,
  box,
  cone,
  controlCurve,
  cylinder,
  icosphere,
  makePointCloud,
  merge,
  plane,
  polyline,
  resampleCurve,
  sweep,
  transform,
  type Curve,
  type NamedPart,
  type PartSurfaceRef,
  type ScatterTable,
} from "../geometry/index.js";
import type { WorkflowPreset } from "../recipes/workflow.js";

type RGB = [number, number, number];

export interface DrawableWorkflowBinding {
  readonly kind: "curve" | "region" | "surface";
  readonly points: ReadonlyArray<readonly [number, number, number]>;
  readonly closed?: boolean;
  readonly curveType?: "polyline" | "catmull-rom" | "bezier" | "b-spline";
  readonly subdivisions?: number;
  readonly tension?: number;
  readonly degree?: number;
}

export interface WorkflowModelContext {
  readonly bindings?: Readonly<Record<string, DrawableWorkflowBinding>>;
}

export interface DrawableFenceParams {
  readonly postSpacing: number;
  readonly postHeight: number;
  readonly railRadius: number;
}

export interface RegionGroveParams {
  readonly density: number;
  readonly spacing: number;
  readonly treeScale: number;
  readonly seed: number;
}

export interface PathLightsParams {
  readonly pathWidth: number;
  readonly propSpacing: number;
  readonly propOffset: number;
  readonly seed: number;
}

const FENCE_DEFAULT: DrawableWorkflowBinding = {
  kind: "curve",
  points: [[-4, 0, -1.4], [-1.6, 0, 0.2], [1.2, 0, -0.5], [4, 0, 1.2]],
  curveType: "catmull-rom",
  subdivisions: 8,
};

const GROVE_DEFAULT: DrawableWorkflowBinding = {
  kind: "region",
  closed: true,
  points: [[-4, 0, -2.8], [3.5, 0, -2.4], [4.2, 0, 2.3], [0.4, 0, 3.2], [-3.8, 0, 1.8]],
  curveType: "catmull-rom",
  subdivisions: 8,
};

const LIGHTS_DEFAULT: DrawableWorkflowBinding = {
  kind: "curve",
  points: [[-4.5, 0, -1.8], [-2, 0, 0.8], [0.8, 0, -0.4], [4.5, 0, 1.6]],
  curveType: "catmull-rom",
  subdivisions: 8,
};

export const DRAWABLE_FENCE_WORKFLOW: WorkflowPreset = workflowPreset(
  "drawable-path-fence",
  "可绘制路径围栏",
  ["Drawable", "曲线", "围栏", "非破坏"],
  "path",
  "围栏路径",
  "curve",
  FENCE_DEFAULT,
  [
    { key: "postSpacing", label: "立柱间距", kind: "number", default: 0.75, min: 0.3, max: 2, step: 0.05 },
    { key: "postHeight", label: "围栏高度", kind: "number", default: 1.25, min: 0.5, max: 2.5, step: 0.05 },
    { key: "railRadius", label: "横杆粗细", kind: "number", default: 0.055, min: 0.02, max: 0.16, step: 0.005 },
  ],
);

export const REGION_GROVE_WORKFLOW: WorkflowPreset = workflowPreset(
  "masked-region-grove",
  "可绘制区域林地",
  ["Drawable", "区域", "MaskField", "ScatterTable", "植被"],
  "region",
  "林地区域",
  "region",
  GROVE_DEFAULT,
  [
    { key: "density", label: "分布密度", kind: "number", default: 0.62, min: 0.1, max: 1, step: 0.02 },
    { key: "spacing", label: "采样间距", kind: "number", default: 0.72, min: 0.4, max: 1.5, step: 0.04 },
    { key: "treeScale", label: "植被尺度", kind: "number", default: 1, min: 0.45, max: 1.8, step: 0.05 },
    { key: "seed", label: "随机种子", kind: "number", default: 17, min: 0, max: 999, step: 1 },
  ],
);

export const PATH_LIGHTS_WORKFLOW: WorkflowPreset = workflowPreset(
  "scatter-path-lights",
  "可绘制路径灯带",
  ["Drawable", "曲线", "MaskField", "ScatterTable", "场景布置"],
  "path",
  "步道路由",
  "curve",
  LIGHTS_DEFAULT,
  [
    { key: "pathWidth", label: "步道宽度", kind: "number", default: 0.9, min: 0.4, max: 2.2, step: 0.05 },
    { key: "propSpacing", label: "设施间距", kind: "number", default: 1.35, min: 0.7, max: 3, step: 0.05 },
    { key: "propOffset", label: "设施外偏", kind: "number", default: 0.8, min: 0.35, max: 1.8, step: 0.05 },
    { key: "seed", label: "随机种子", kind: "number", default: 29, min: 0, max: 999, step: 1 },
  ],
);

export function buildDrawableFenceParts(
  params: DrawableFenceParams,
  context: WorkflowModelContext = {},
): NamedPart[] {
  const curve = bindingCurve(context, "path", FENCE_DEFAULT, false, params.postSpacing);
  const postHeight = Math.max(0.2, params.postHeight);
  const postRadius = Math.max(0.025, params.railRadius * 1.35);
  const posts = curve.points.map((point) => transform(cylinder(postRadius, postHeight, 10), {
    translate: vec3(point.x, point.y + postHeight * 0.5, point.z),
  }));
  const lower = offsetCurveY(curve, postHeight * 0.36);
  const upper = offsetCurveY(curve, postHeight * 0.76);
  return [
    named("fence_posts", "围栏立柱", merge(...posts), [0.34, 0.19, 0.09], surface("wood", [0.34, 0.19, 0.09], 0.72)),
    named("fence_rails", "围栏横杆", merge(
      sweep(lower, { radius: params.railRadius, sides: 8 }),
      sweep(upper, { radius: params.railRadius, sides: 8 }),
    ), [0.46, 0.27, 0.12], surface("wood", [0.46, 0.27, 0.12], 0.66)),
  ];
}

export function buildRegionGroveParts(
  params: RegionGroveParams,
  context: WorkflowModelContext = {},
): NamedPart[] {
  const region = sampledBindingPoints(context, "region", GROVE_DEFAULT, true);
  const bounds = boundsXZ(region);
  const spacing = Math.max(0.25, params.spacing);
  const candidates: Vec3[] = [];
  for (let z = bounds.minZ; z <= bounds.maxZ + 1e-6; z += spacing) {
    for (let x = bounds.minX; x <= bounds.maxX + 1e-6; x += spacing) candidates.push(vec3(x, 0, z));
  }
  const masked = applyMaskField(makePointCloud({ points: candidates }), {
    type: "combine",
    op: "multiply",
    fields: [
      { type: "polygon", points: region, feather: spacing * 0.3 },
      { type: "noise", seed: Math.round(params.seed), frequency: 0.42, floor: 0.1 },
    ],
  });
  const table: ScatterTable = {
    schema: "meshova-scatter-table@1",
    seed: Math.round(params.seed),
    density: clamp01(params.density),
    rows: [
      { id: "tree", label: "乔木", variant: 0, weight: 0.5, scale: [0.8, 1.25] },
      { id: "shrub", label: "灌木", variant: 1, weight: 0.32, scale: [0.55, 1.1] },
      { id: "rock", label: "岩石", variant: 2, weight: 0.18, scale: [0.45, 1.05] },
    ],
  };
  const scattered = applyScatterTable(masked, table, { prune: true });
  const trunks = [];
  const crowns = [];
  const shrubs = [];
  const rocks = [];
  for (let index = 0; index < scattered.points.length; index++) {
    const point = scattered.points[index]!;
    const variant = scattered.attributes.variant?.[index] ?? 0;
    const itemScale = (scattered.attributes.scale?.[index] ?? 1) * params.treeScale;
    const yaw = scattered.attributes.yaw?.[index] ?? 0;
    if (variant === 0) {
      const height = 1.45 * itemScale;
      trunks.push(transform(cylinder(0.09 * itemScale, height, 8), { translate: vec3(point.x, height * 0.5, point.z) }));
      crowns.push(transform(cone(0.62 * itemScale, 1.55 * itemScale, 10), {
        rotate: vec3(0, yaw, 0),
        translate: vec3(point.x, height + 0.55 * itemScale, point.z),
      }));
    } else if (variant === 1) {
      shrubs.push(transform(icosphere(0.48, 1), {
        scale: vec3(itemScale, itemScale * 0.72, itemScale),
        translate: vec3(point.x, 0.36 * itemScale, point.z),
      }));
    } else {
      rocks.push(transform(icosphere(0.42, 1), {
        rotate: vec3(0, yaw, 0),
        scale: vec3(itemScale, itemScale * 0.55, itemScale * 0.8),
        translate: vec3(point.x, 0.22 * itemScale, point.z),
      }));
    }
  }
  const width = Math.max(0.1, bounds.maxX - bounds.minX);
  const depth = Math.max(0.1, bounds.maxZ - bounds.minZ);
  const center = vec3((bounds.minX + bounds.maxX) * 0.5, -0.015, (bounds.minZ + bounds.maxZ) * 0.5);
  const parts: NamedPart[] = [
    named("grove_ground", "林地地表", transform(plane(width, depth, 1, 1), { translate: center }), [0.18, 0.25, 0.11], surface("soil", [0.18, 0.25, 0.11], 0.96)),
    named("grove_boundary", "林地边界", sweep(offsetCurveY(polyline(region, true), 0.025), { radius: 0.025, sides: 6 }), [0.72, 0.57, 0.22], surface("wood", [0.72, 0.57, 0.22], 0.8)),
  ];
  pushMerged(parts, "tree_trunks", "乔木树干", trunks, [0.3, 0.18, 0.08], surface("wood", [0.3, 0.18, 0.08], 0.82));
  pushMerged(parts, "tree_crowns", "乔木树冠", crowns, [0.17, 0.39, 0.12], surface("foliage", [0.17, 0.39, 0.12], 0.88));
  pushMerged(parts, "shrubs", "灌木组", shrubs, [0.26, 0.48, 0.16], surface("foliage", [0.26, 0.48, 0.16], 0.9));
  pushMerged(parts, "rocks", "景观岩石", rocks, [0.38, 0.37, 0.33], surface("stone", [0.38, 0.37, 0.33], 0.92));
  return parts;
}

export function buildPathLightsParts(
  params: PathLightsParams,
  context: WorkflowModelContext = {},
): NamedPart[] {
  const curve = bindingCurve(context, "path", LIGHTS_DEFAULT, false, Math.max(0.4, params.propSpacing));
  const path = sweep(offsetCurveY(curve, 0.08), { radius: Math.max(0.18, params.pathWidth * 0.5), sides: 12 });
  const points: Vec3[] = [];
  for (let index = 0; index < curve.points.length; index++) {
    const current = curve.points[index]!;
    const previous = curve.points[Math.max(0, index - 1)]!;
    const next = curve.points[Math.min(curve.points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = index % 2 === 0 ? 1 : -1;
    points.push(vec3(current.x - dz / length * params.propOffset * side, 0, current.z + dx / length * params.propOffset * side));
  }
  const masked = applyMaskField(makePointCloud({ points }), {
    type: "curve-distance",
    curve,
    max: Math.max(params.propOffset + 0.25, params.pathWidth),
    feather: 0.2,
  });
  const table: ScatterTable = {
    schema: "meshova-scatter-table@1",
    seed: Math.round(params.seed),
    rows: [
      { id: "lamp", label: "路灯", variant: 0, weight: 0.52, scale: [0.9, 1.12] },
      { id: "bench", label: "长椅", variant: 1, weight: 0.28, scale: [0.85, 1.08], yaw: [-0.2, 0.2] },
      { id: "bollard", label: "矮桩", variant: 2, weight: 0.2, scale: [0.85, 1.15] },
    ],
  };
  const scattered = applyScatterTable(masked, table, { prune: true });
  const metal = [];
  const lights = [];
  const benches = [];
  for (let index = 0; index < scattered.points.length; index++) {
    const point = scattered.points[index]!;
    const variant = scattered.attributes.variant?.[index] ?? 0;
    const itemScale = scattered.attributes.scale?.[index] ?? 1;
    const yaw = scattered.attributes.yaw?.[index] ?? 0;
    if (variant === 0) {
      const height = 1.65 * itemScale;
      metal.push(transform(cylinder(0.045 * itemScale, height, 10), { translate: vec3(point.x, height * 0.5, point.z) }));
      lights.push(transform(icosphere(0.15 * itemScale, 1), { translate: vec3(point.x, height, point.z) }));
    } else if (variant === 1) {
      benches.push(transform(merge(
        transform(box(0.95, 0.12, 0.34), { translate: vec3(0, 0.45, 0) }),
        transform(box(0.95, 0.42, 0.1), { translate: vec3(0, 0.68, 0.14) }),
        transform(box(0.1, 0.42, 0.1), { translate: vec3(-0.34, 0.2, 0) }),
        transform(box(0.1, 0.42, 0.1), { translate: vec3(0.34, 0.2, 0) }),
      ), { rotate: vec3(0, yaw, 0), scale: itemScale, translate: point }));
    } else {
      metal.push(transform(cylinder(0.09 * itemScale, 0.65 * itemScale, 10), {
        translate: vec3(point.x, 0.325 * itemScale, point.z),
      }));
    }
  }
  const parts: NamedPart[] = [
    named("walkway", "曲线路面", path, [0.34, 0.33, 0.31], surface("stone", [0.34, 0.33, 0.31], 0.86)),
  ];
  pushMerged(parts, "path_fixtures", "路径设施", metal, [0.12, 0.14, 0.16], surface("metal", [0.12, 0.14, 0.16], 0.42));
  pushMerged(parts, "path_lights", "灯具发光体", lights, [1, 0.72, 0.26], surface("glass", [1, 0.72, 0.26], 0.08));
  pushMerged(parts, "path_benches", "路径长椅", benches, [0.42, 0.24, 0.1], surface("wood", [0.42, 0.24, 0.1], 0.7));
  return parts;
}

function workflowPreset(
  id: string,
  label: string,
  tags: string[],
  bindingKey: string,
  bindingLabel: string,
  bindingKind: "curve" | "region",
  defaultBinding: DrawableWorkflowBinding,
  exposedParams: NonNullable<WorkflowPreset["exposedParams"]>,
): WorkflowPreset {
  return {
    schema: "meshova-workflow@1",
    id,
    version: 1,
    metadata: { label, tags, scope: "scene" },
    graph: {
      schema: "meshova-opplan@1",
      name: id,
      nodes: [{ id: "output", op: id, args: [{ $binding: bindingKey }, ...exposedParams.map((param) => ({ $param: param.key }))] }],
    },
    exposedParams,
    bindings: [{
      key: bindingKey,
      label: bindingLabel,
      kind: bindingKind,
      required: false,
      default: defaultBinding,
      editor: {
        curveType: defaultBinding.curveType ?? "catmull-rom",
        curveTypes: ["catmull-rom", "bezier", "b-spline", "polyline"],
        subdivisions: defaultBinding.subdivisions ?? 8,
        tension: defaultBinding.tension ?? 0.5,
        degree: defaultBinding.degree ?? 3,
      },
    }],
    execution: { debounceMs: 100 },
  };
}

function bindingPoints(
  context: WorkflowModelContext,
  key: string,
  fallback: DrawableWorkflowBinding,
): Vec3[] {
  const binding = context.bindings?.[key] ?? fallback;
  const points = binding.points.map((point) => vec3(Number(point[0]), Number(point[1]), Number(point[2])));
  return points.length >= (binding.kind === "curve" ? 2 : 3)
    ? points
    : fallback.points.map((point) => vec3(point[0], point[1], point[2]));
}

function sampledBindingPoints(
  context: WorkflowModelContext,
  key: string,
  fallback: DrawableWorkflowBinding,
  closed: boolean,
): Vec3[] {
  const binding = context.bindings?.[key] ?? fallback;
  return controlCurve(bindingPoints(context, key, fallback), {
    type: binding.curveType ?? fallback.curveType ?? "catmull-rom",
    closed,
    subdivisions: binding.subdivisions ?? fallback.subdivisions ?? 8,
    tension: binding.tension ?? fallback.tension ?? 0.5,
    degree: binding.degree ?? fallback.degree ?? 3,
  }).points;
}

function bindingCurve(
  context: WorkflowModelContext,
  key: string,
  fallback: DrawableWorkflowBinding,
  closed: boolean,
  spacing: number,
): Curve {
  const sampled = sampledBindingPoints(context, key, fallback, closed);
  return resampleCurve(polyline(sampled, closed), { segmentLength: Math.max(0.1, spacing) });
}

function offsetCurveY(curve: Curve, y: number): Curve {
  return polyline(curve.points.map((point) => vec3(point.x, point.y + y, point.z)), curve.closed);
}

function boundsXZ(points: ReadonlyArray<Vec3>): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function surface(type: string, color: RGB, roughness: number): PartSurfaceRef {
  return { type, params: { color, roughness } };
}

function named(name: string, label: string, mesh: NamedPart["mesh"], color: RGB, partSurface: PartSurfaceRef): NamedPart {
  return { name, label, mesh, color, surface: partSurface };
}

function pushMerged(
  parts: NamedPart[],
  name: string,
  label: string,
  meshes: NamedPart["mesh"][],
  color: RGB,
  partSurface: PartSurfaceRef,
): void {
  if (meshes.length > 0) parts.push(named(name, label, merge(...meshes), color, partSurface));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
