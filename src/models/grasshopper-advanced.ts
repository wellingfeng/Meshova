/** Advanced clean-room kernels and models inspired by Grasshopper workflows. */
import {
  displaceMeshByField,
  grayScottFieldMesh,
  normalizeMeshField,
} from "../field/index.js";
import { DEG2RAD, clamp } from "../math/scalar.js";
import { vec3 } from "../math/vec3.js";
import type { Recipe } from "../recipes/index.js";
import {
  cylinder,
  dihedralAngle,
  icosphere,
  merge,
  meshHinges,
  plane,
  solveCreases,
  superformulaSurface,
  transform,
  type DihedralConstraint,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface MeshReactionShellParams {
  readonly radius: number;
  readonly subdivisions: number;
  readonly iterations: number;
  readonly amplitude: number;
  readonly feed: number;
  readonly kill: number;
  readonly spots: number;
  readonly seed: number;
}

export interface SuperformulaTowerParams {
  readonly height: number;
  readonly radius: number;
  readonly taper: number;
  readonly m: number;
  readonly n1: number;
  readonly n2: number;
  readonly n3: number;
  readonly twist: number;
  readonly bulge: number;
  readonly segments: number;
}

export interface OrigamiPavilionParams {
  readonly width: number;
  readonly depth: number;
  readonly resolution: number;
  readonly foldAngle: number;
  readonly stiffness: number;
  readonly iterations: number;
}

export const MESH_REACTION_SHELL_DEFAULTS: MeshReactionShellParams = {
  radius: 1.25,
  subdivisions: 4,
  iterations: 220,
  amplitude: 0.12,
  feed: 0.035,
  kill: 0.061,
  spots: 14,
  seed: 211,
};

export const SUPERFORMULA_TOWER_DEFAULTS: SuperformulaTowerParams = {
  height: 4.2,
  radius: 1.15,
  taper: 0.58,
  m: 7,
  n1: 0.34,
  n2: 1.15,
  n3: 1.15,
  twist: 1.05,
  bulge: 0.12,
  segments: 72,
};

export const ORIGAMI_PAVILION_DEFAULTS: OrigamiPavilionParams = {
  width: 3.8,
  depth: 3,
  resolution: 12,
  foldAngle: 78,
  stiffness: 0.94,
  iterations: 22,
};

const BLUE: RGB = [0.12, 0.38, 0.72];
const CYAN: RGB = [0.18, 0.82, 0.88];
const BRASS: RGB = [0.66, 0.38, 0.12];
const GOLD: RGB = [0.92, 0.67, 0.22];
const PAPER: RGB = [0.86, 0.88, 0.82];
const PAPER_ACCENT: RGB = [0.74, 0.28, 0.18];
const DARK: RGB = [0.08, 0.09, 0.11];

export function buildMeshReactionShellParts(
  params: Partial<MeshReactionShellParams> = {},
): NamedPart[] {
  const p = resolveMeshReaction(params);
  const base = icosphere(p.radius, p.subdivisions);
  const field = normalizeMeshField(grayScottFieldMesh(base, {
    iterations: p.iterations,
    feed: p.feed,
    kill: p.kill,
    spots: p.spots,
    spotHops: 0,
    seed: p.seed,
  }));
  const shell = transform(displaceMeshByField(base, field, p.amplitude), {
    translate: vec3(0, p.radius + 0.18, 0),
  });
  const shellPart = surfacePart(
    "mesh_reaction_shell",
    "曲面反应扩散壳",
    shell,
    BLUE,
    "ceramic",
    { roughness: 0.46, seed: p.seed },
  );
  shellPart.colors = field.values.flatMap((value) => mixColor(BLUE, CYAN, value));
  shellPart.metadata = {
    ...shellPart.metadata,
    technique: "mesh-graph-gray-scott",
    fieldRange: fieldRange(field.values),
  };
  const pedestal = transform(cylinder(p.radius * 0.48, 0.18, 32, true), {
    translate: vec3(0, 0.09, 0),
  });
  return [
    surfacePart("reaction_pedestal", "反应扩散壳底座", pedestal, DARK, "metal", { roughness: 0.3 }),
    shellPart,
  ];
}

export function buildSuperformulaTowerParts(
  params: Partial<SuperformulaTowerParams> = {},
): NamedPart[] {
  const p = resolveSuperformula(params);
  const body = transform(superformulaSurface({
    height: p.height,
    radiusBottom: p.radius,
    radiusTop: p.radius * p.taper,
    m: p.m,
    n1: p.n1,
    n2: p.n2,
    n3: p.n3,
    twist: p.twist,
    bulge: p.bulge,
    angularSegments: p.segments,
    heightSegments: Math.max(8, Math.round(p.segments * 0.45)),
    caps: true,
  }), { translate: vec3(0, p.height * 0.5 + 0.21, 0) });
  const base = transform(cylinder(p.radius * 1.12, 0.18, p.segments, true), {
    translate: vec3(0, 0.09, 0),
  });
  const crown = transform(cylinder(p.radius * p.taper * 0.34, 0.13, p.segments, true), {
    translate: vec3(0, p.height + 0.305, 0),
  });
  return [
    surfacePart("superformula_plinth", "超公式塔基座", base, DARK, "stone", { roughness: 0.72 }),
    surfacePart("superformula_tower", "超公式扭转塔身", body, BRASS, "metal", {
      roughness: 0.32,
      metalness: 0.78,
    }),
    surfacePart("superformula_crown", "超公式塔顶冠", crown, GOLD, "metal", { roughness: 0.26 }),
  ];
}

export function buildOrigamiPavilionParts(
  params: Partial<OrigamiPavilionParams> = {},
): NamedPart[] {
  const p = resolveOrigami(params);
  const rows = Math.max(2, Math.round(p.resolution * p.depth / p.width));
  const rest = transform(plane(p.width, p.depth, p.resolution, rows), {
    translate: vec3(0, 1.85, 0),
  });
  const creaseHinges = meshHinges(rest).filter((hinge) =>
    Math.abs(rest.positions[hinge.edgeA]!.x) < 1e-7 &&
    Math.abs(rest.positions[hinge.edgeB]!.x) < 1e-7,
  );
  const constraints: DihedralConstraint[] = creaseHinges.map((hinge) => ({
    ...hinge,
    targetAngle: p.foldAngle * DEG2RAD,
    stiffness: p.stiffness,
  }));
  const folded = solveCreases(rest, constraints, {
    iterations: p.iterations,
    passes: 3,
    distanceStiffness: 0.97,
    fixed: (position) => Math.abs(position.x) < 1e-7,
  });
  const sheet = surfacePart("origami_folded_roof", "目标二面角折纸屋面", folded, PAPER, "fabric", {
    roughness: 0.76,
  });
  sheet.doubleSided = true;
  sheet.colors = folded.positions.flatMap((position) =>
    position.x < 0 ? PAPER : mixColor(PAPER, PAPER_ACCENT, 0.34));
  sheet.metadata = {
    ...sheet.metadata,
    technique: "xpbd-target-dihedral",
    creaseCount: constraints.length,
    meanAngleError: meanAngleError(folded, constraints),
  };
  const ridge = transform(cylinder(0.045, p.depth + 0.12, 12, true), {
    rotate: vec3(Math.PI * 0.5, 0, 0),
    translate: vec3(0, 1.85, 0),
  });
  const supports = merge(
    transform(cylinder(0.055, 1.85, 12, true), { translate: vec3(0, 0.925, -p.depth * 0.5) }),
    transform(cylinder(0.055, 1.85, 12, true), { translate: vec3(0, 0.925, p.depth * 0.5) }),
  );
  return [
    sheet,
    surfacePart("origami_ridge", "折纸主折痕梁", ridge, PAPER_ACCENT, "metal", { roughness: 0.34 }),
    surfacePart("origami_supports", "折纸展亭支柱", supports, DARK, "metal", { roughness: 0.38 }),
  ];
}

export const MESH_REACTION_SHELL_RECIPE: Recipe<MeshReactionShellParams> = {
  id: "grasshopper-mesh-reaction-shell",
  label: "Grasshopper 曲面反应扩散壳",
  description: "任意三角网格图拉普拉斯上的 Gray-Scott 纹样与法线位移。",
  defaults: MESH_REACTION_SHELL_DEFAULTS,
  params: [
    { key: "radius", label: "壳体半径", min: 0.5, max: 2.5, step: 0.05, default: MESH_REACTION_SHELL_DEFAULTS.radius },
    { key: "subdivisions", label: "网格细分", min: 1, max: 4, step: 1, default: MESH_REACTION_SHELL_DEFAULTS.subdivisions },
    { key: "iterations", label: "扩散迭代", min: 4, max: 360, step: 1, default: MESH_REACTION_SHELL_DEFAULTS.iterations },
    { key: "amplitude", label: "位移强度", min: 0, max: 0.6, step: 0.01, default: MESH_REACTION_SHELL_DEFAULTS.amplitude },
    { key: "feed", label: "Feed", min: 0.01, max: 0.08, step: 0.001, default: MESH_REACTION_SHELL_DEFAULTS.feed },
    { key: "kill", label: "Kill", min: 0.03, max: 0.08, step: 0.001, default: MESH_REACTION_SHELL_DEFAULTS.kill },
    { key: "spots", label: "初始斑点", min: 1, max: 32, step: 1, default: MESH_REACTION_SHELL_DEFAULTS.spots },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: MESH_REACTION_SHELL_DEFAULTS.seed },
  ],
  build: buildMeshReactionShellParts,
};

export const SUPERFORMULA_TOWER_RECIPE: Recipe<SuperformulaTowerParams> = {
  id: "grasshopper-superformula-tower",
  label: "Grasshopper 超公式塔",
  description: "Superformula 截面族经锥化、扭转和纵向采样生成塔体。",
  defaults: SUPERFORMULA_TOWER_DEFAULTS,
  params: [
    { key: "height", label: "塔高", min: 1, max: 8, step: 0.1, default: SUPERFORMULA_TOWER_DEFAULTS.height },
    { key: "radius", label: "底部半径", min: 0.3, max: 2.5, step: 0.05, default: SUPERFORMULA_TOWER_DEFAULTS.radius },
    { key: "taper", label: "顶部锥化", min: 0.1, max: 1.5, step: 0.01, default: SUPERFORMULA_TOWER_DEFAULTS.taper },
    { key: "m", label: "截面瓣数", min: 2, max: 16, step: 1, default: SUPERFORMULA_TOWER_DEFAULTS.m },
    { key: "n1", label: "形状指数 N1", min: 0.1, max: 4, step: 0.02, default: SUPERFORMULA_TOWER_DEFAULTS.n1 },
    { key: "n2", label: "形状指数 N2", min: 0.1, max: 4, step: 0.02, default: SUPERFORMULA_TOWER_DEFAULTS.n2 },
    { key: "n3", label: "形状指数 N3", min: 0.1, max: 4, step: 0.02, default: SUPERFORMULA_TOWER_DEFAULTS.n3 },
    { key: "twist", label: "总扭转", min: -3.14, max: 3.14, step: 0.02, default: SUPERFORMULA_TOWER_DEFAULTS.twist },
    { key: "bulge", label: "中段鼓度", min: -0.6, max: 0.8, step: 0.01, default: SUPERFORMULA_TOWER_DEFAULTS.bulge },
    { key: "segments", label: "环向分段", min: 12, max: 128, step: 4, default: SUPERFORMULA_TOWER_DEFAULTS.segments },
  ],
  build: buildSuperformulaTowerParts,
};

export const ORIGAMI_PAVILION_RECIPE: Recipe<OrigamiPavilionParams> = {
  id: "grasshopper-origami-pavilion",
  label: "Grasshopper XPBD 折纸展亭",
  description: "显式目标二面角约束与边长约束求解折纸屋面。",
  defaults: ORIGAMI_PAVILION_DEFAULTS,
  params: [
    { key: "width", label: "屋面宽度", min: 1.5, max: 6, step: 0.1, default: ORIGAMI_PAVILION_DEFAULTS.width },
    { key: "depth", label: "屋面进深", min: 1.5, max: 6, step: 0.1, default: ORIGAMI_PAVILION_DEFAULTS.depth },
    { key: "resolution", label: "折纸网格", min: 4, max: 24, step: 2, default: ORIGAMI_PAVILION_DEFAULTS.resolution },
    { key: "foldAngle", label: "目标折角", min: -130, max: 130, step: 1, default: ORIGAMI_PAVILION_DEFAULTS.foldAngle },
    { key: "stiffness", label: "折痕刚度", min: 0.1, max: 1, step: 0.01, default: ORIGAMI_PAVILION_DEFAULTS.stiffness },
    { key: "iterations", label: "求解迭代", min: 2, max: 60, step: 1, default: ORIGAMI_PAVILION_DEFAULTS.iterations },
  ],
  build: buildOrigamiPavilionParts,
};

export const GRASSHOPPER_ADVANCED_RECIPES = [
  MESH_REACTION_SHELL_RECIPE,
  SUPERFORMULA_TOWER_RECIPE,
  ORIGAMI_PAVILION_RECIPE,
] as const;

function resolveMeshReaction(params: Partial<MeshReactionShellParams>): MeshReactionShellParams {
  const p = { ...MESH_REACTION_SHELL_DEFAULTS, ...params };
  return {
    radius: Math.max(0.2, p.radius),
    subdivisions: clamp(Math.round(p.subdivisions), 0, 5),
    iterations: Math.max(1, Math.round(p.iterations)),
    amplitude: Math.max(0, p.amplitude),
    feed: clamp(p.feed, 0.001, 0.1),
    kill: clamp(p.kill, 0.001, 0.12),
    spots: Math.max(1, Math.round(p.spots)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveSuperformula(params: Partial<SuperformulaTowerParams>): SuperformulaTowerParams {
  const p = { ...SUPERFORMULA_TOWER_DEFAULTS, ...params };
  return {
    height: Math.max(0.2, p.height),
    radius: Math.max(0.05, p.radius),
    taper: Math.max(0, p.taper),
    m: Math.max(0, p.m),
    n1: Math.max(0.02, p.n1),
    n2: Math.max(0.02, p.n2),
    n3: Math.max(0.02, p.n3),
    twist: p.twist,
    bulge: clamp(p.bulge, -0.9, 2),
    segments: Math.max(8, Math.round(p.segments)),
  };
}

function resolveOrigami(params: Partial<OrigamiPavilionParams>): OrigamiPavilionParams {
  const p = { ...ORIGAMI_PAVILION_DEFAULTS, ...params };
  let resolution = Math.max(4, Math.round(p.resolution));
  if (resolution % 2 !== 0) resolution++;
  return {
    width: Math.max(0.5, p.width),
    depth: Math.max(0.5, p.depth),
    resolution,
    foldAngle: clamp(p.foldAngle, -170, 170),
    stiffness: clamp(p.stiffness, 0, 1),
    iterations: Math.max(1, Math.round(p.iterations)),
  };
}

function surfacePart(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  const surface: PartSurfaceRef = { type, params: { color, ...params } };
  return {
    name,
    label,
    mesh,
    color,
    surface,
    metadata: { source: "GrasshopperHowtos clean-room Meshova kernels" },
  };
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const x = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x, a[2] + (b[2] - a[2]) * x];
}

function fieldRange(values: ReadonlyArray<number>): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function meanAngleError(mesh: Mesh, constraints: ReadonlyArray<DihedralConstraint>): number {
  if (constraints.length === 0) return 0;
  let sum = 0;
  for (const constraint of constraints) {
    let delta = dihedralAngle(mesh.positions, constraint) - constraint.targetAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    sum += Math.abs(delta);
  }
  return sum / constraints.length;
}
