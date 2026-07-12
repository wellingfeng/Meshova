/**
 * BlenderHowtos-inspired cookbook models.
 *
 * Clean-room Meshova rewrites of the useful Geometry Nodes patterns from
 * jhorikawa/BlenderHowtos: spiral instancing, double helix, gradient-driven
 * boxes, and seeded garden scatter with rain.
 */
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import {
  add,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import {
  box,
  cone,
  cylinder,
  copyToPoints,
  makePointCloud,
  merge,
  plane,
  pointAttribute,
  polyline,
  recomputeNormals,
  sphere,
  sweep,
  torus,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type BlenderHowtosCategory =
  | "spiralScales"
  | "dnaHelix"
  | "gradientBox"
  | "rainingGarden";

export interface SpiralScalesParams {
  readonly count: number;
  readonly radius: number;
  readonly height: number;
  readonly turns: number;
  readonly scaleWidth: number;
  readonly scaleHeight: number;
  readonly scaleThickness: number;
  readonly phase: number;
  readonly stemRadius: number;
}

export interface DnaHelixParams {
  readonly pairs: number;
  readonly radius: number;
  readonly height: number;
  readonly turns: number;
  readonly strandRadius: number;
  readonly rungRadius: number;
  readonly beadRadius: number;
  readonly phase: number;
}

export interface GradientBoxParams {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly rampBias: number;
  readonly ripple: number;
}

export interface RainingGardenParams {
  readonly radius: number;
  readonly grassCount: number;
  readonly flowerCount: number;
  readonly rainCount: number;
  readonly rainHeight: number;
  readonly rainSlant: number;
  readonly seed: number;
}

export interface BlenderHowtosShowcaseParams {
  readonly seed: number;
  readonly scale: number;
}

export interface BlenderHowtosSummary {
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly categories: Record<BlenderHowtosCategory, number>;
}

export const SPIRAL_SCALES_DEFAULTS: SpiralScalesParams = {
  count: 84,
  radius: 0.78,
  height: 3.1,
  turns: 5.2,
  scaleWidth: 0.18,
  scaleHeight: 0.34,
  scaleThickness: 0.035,
  phase: 0,
  stemRadius: 0.035,
};

export const DNA_HELIX_DEFAULTS: DnaHelixParams = {
  pairs: 34,
  radius: 0.62,
  height: 3.2,
  turns: 3.2,
  strandRadius: 0.035,
  rungRadius: 0.018,
  beadRadius: 0.07,
  phase: 0,
};

export const GRADIENT_BOX_DEFAULTS: GradientBoxParams = {
  cols: 10,
  rows: 8,
  spacing: 0.36,
  minHeight: 0.12,
  maxHeight: 1.35,
  rampBias: 1.15,
  ripple: 0.16,
};

export const RAINING_GARDEN_DEFAULTS: RainingGardenParams = {
  radius: 2.15,
  grassCount: 180,
  flowerCount: 36,
  rainCount: 90,
  rainHeight: 2.7,
  rainSlant: 0.32,
  seed: 19,
};

export const BLENDER_HOWTOS_SHOWCASE_DEFAULTS: BlenderHowtosShowcaseParams = {
  seed: 80,
  scale: 1,
};

const SCALE_GREEN: RGB = [0.25, 0.55, 0.36];
const SCALE_EDGE: RGB = [0.84, 0.67, 0.34];
const STEM_GREEN: RGB = [0.11, 0.28, 0.18];
const DNA_BLUE: RGB = [0.1, 0.42, 0.88];
const DNA_ORANGE: RGB = [0.95, 0.42, 0.14];
const DNA_RUNG: RGB = [0.84, 0.78, 0.58];
const GRASS: RGB = [0.22, 0.5, 0.2];
const FLOWER: RGB = [0.93, 0.22, 0.48];
const SOIL: RGB = [0.26, 0.18, 0.11];
const RAIN: RGB = [0.55, 0.78, 1.0];

function resolveSpiralScales(params: Partial<SpiralScalesParams>): SpiralScalesParams {
  const p = { ...SPIRAL_SCALES_DEFAULTS, ...params };
  return {
    count: Math.max(1, Math.round(p.count)),
    radius: Math.max(0.1, p.radius),
    height: Math.max(0.2, p.height),
    turns: Math.max(0.25, p.turns),
    scaleWidth: Math.max(0.02, p.scaleWidth),
    scaleHeight: Math.max(0.02, p.scaleHeight),
    scaleThickness: Math.max(0.005, p.scaleThickness),
    phase: p.phase,
    stemRadius: Math.max(0.004, p.stemRadius),
  };
}

function resolveDnaHelix(params: Partial<DnaHelixParams>): DnaHelixParams {
  const p = { ...DNA_HELIX_DEFAULTS, ...params };
  return {
    pairs: Math.max(2, Math.round(p.pairs)),
    radius: Math.max(0.1, p.radius),
    height: Math.max(0.3, p.height),
    turns: Math.max(0.25, p.turns),
    strandRadius: Math.max(0.004, p.strandRadius),
    rungRadius: Math.max(0.003, p.rungRadius),
    beadRadius: Math.max(0.01, p.beadRadius),
    phase: p.phase,
  };
}

function resolveGradientBox(params: Partial<GradientBoxParams>): GradientBoxParams {
  const p = { ...GRADIENT_BOX_DEFAULTS, ...params };
  return {
    cols: Math.max(1, Math.round(p.cols)),
    rows: Math.max(1, Math.round(p.rows)),
    spacing: Math.max(0.08, p.spacing),
    minHeight: Math.max(0.01, p.minHeight),
    maxHeight: Math.max(0.02, p.maxHeight),
    rampBias: Math.max(0.15, p.rampBias),
    ripple: Math.max(0, p.ripple),
  };
}

function resolveRainingGarden(params: Partial<RainingGardenParams>): RainingGardenParams {
  const p = { ...RAINING_GARDEN_DEFAULTS, ...params };
  return {
    radius: Math.max(0.5, p.radius),
    grassCount: Math.max(0, Math.round(p.grassCount)),
    flowerCount: Math.max(0, Math.round(p.flowerCount)),
    rainCount: Math.max(0, Math.round(p.rainCount)),
    rainHeight: Math.max(0.3, p.rainHeight),
    rainSlant: p.rainSlant,
    seed: Math.round(p.seed) >>> 0,
  };
}

function surf(
  category: BlenderHowtosCategory,
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
    mesh: recomputeNormals(mesh),
    color,
    surface,
    metadata: {
      source: "BlenderHowtos-inspired Meshova rewrite",
      category,
    },
  };
}

export function buildSpiralScalesParts(
  params: Partial<SpiralScalesParams> = {},
): NamedPart[] {
  const p = resolveSpiralScales(params);
  const scaleBase = sphere(1, 14, 8);
  const scaleMeshes: Mesh[] = [];
  const scaleRoots: Mesh[] = [];
  for (let i = 0; i < p.count; i++) {
    const t = (i + 0.5) / p.count;
    const a = t * p.turns * TAU + p.phase;
    const taper = 0.45 + 0.55 * smoothstep(0.02, 0.22, t) * (1 - smoothstep(0.8, 0.98, t));
    const flutter = 1 + Math.sin(t * p.turns * TAU * 0.5) * 0.12;
    const center = vec3(
      Math.cos(a) * (p.radius + p.scaleThickness * 1.8),
      (t - 0.5) * p.height,
      Math.sin(a) * (p.radius + p.scaleThickness * 1.8),
    );
    scaleMeshes.push(transform(scaleBase, {
      scale: vec3(p.scaleWidth * taper * flutter, p.scaleHeight * taper, p.scaleThickness),
      rotate: vec3(0.12 * Math.sin(a * 0.7), Math.PI / 2 - a, 0),
      translate: center,
    }));
    const root = vec3(Math.cos(a) * p.radius * 0.86, center.y, Math.sin(a) * p.radius * 0.86);
    scaleRoots.push(sweep(polyline([root, center]), {
      radius: Math.max(p.stemRadius * 0.42, p.scaleThickness * 0.35),
      sides: 6,
      caps: true,
    }));
  }

  const spine = sweep(helixCurve(p.radius * 0.86, p.height, p.turns, p.phase, p.count + 8), {
    radius: p.stemRadius,
    sides: 8,
    caps: true,
  });

  return [
    surf("spiralScales", "spiral_scale_tiles", "螺旋鳞片实例", merge(...scaleMeshes), SCALE_GREEN, "stylizedFoliage", {
      roughness: 0.78,
      count: p.count,
    }),
    surf("spiralScales", "spiral_center_stem", "螺旋中心茎", merge(spine, ...scaleRoots), STEM_GREEN, "bark", {
      roughness: 0.84,
    }),
  ];
}

export function buildDnaHelixParts(
  params: Partial<DnaHelixParams> = {},
): NamedPart[] {
  const p = resolveDnaHelix(params);
  const samples = Math.max(32, p.pairs * 4);
  const c0 = helixCurve(p.radius, p.height, p.turns, p.phase, samples);
  const c1 = helixCurve(p.radius, p.height, p.turns, p.phase + Math.PI, samples);
  const strandA = sweep(c0, { radius: p.strandRadius, sides: 10, caps: true });
  const strandB = sweep(c1, { radius: p.strandRadius, sides: 10, caps: true });

  const beadsA: Mesh[] = [];
  const beadsB: Mesh[] = [];
  const rungs: Mesh[] = [];
  for (let i = 0; i < p.pairs; i++) {
    const t = p.pairs === 1 ? 0.5 : i / (p.pairs - 1);
    const a = helixPoint(p.radius, p.height, p.turns, t, p.phase);
    const b = helixPoint(p.radius, p.height, p.turns, t, p.phase + Math.PI);
    beadsA.push(transform(sphere(p.beadRadius, 12, 8), { translate: a }));
    beadsB.push(transform(sphere(p.beadRadius, 12, 8), { translate: b }));
    rungs.push(sweep(polyline([a, b]), { radius: p.rungRadius, sides: 8, caps: true }));
  }

  return [
    surf("dnaHelix", "dna_strand_a", "DNA 蓝色螺旋链", merge(strandA, ...beadsA), DNA_BLUE, "plastic", {
      roughness: 0.42,
      pairs: p.pairs,
    }),
    surf("dnaHelix", "dna_strand_b", "DNA 橙色螺旋链", merge(strandB, ...beadsB), DNA_ORANGE, "plastic", {
      roughness: 0.42,
      pairs: p.pairs,
    }),
    surf("dnaHelix", "dna_cross_rungs", "DNA 横档", merge(...rungs), DNA_RUNG, "ceramic", {
      roughness: 0.58,
    }),
  ];
}

export function buildGradientBoxParts(
  params: Partial<GradientBoxParams> = {},
): NamedPart[] {
  const p = resolveGradientBox(params);
  const meshes: Array<{ mesh: Mesh; color: RGB }> = [];
  const width = p.spacing * 0.74;
  const depth = p.spacing * 0.74;
  for (let z = 0; z < p.rows; z++) {
    for (let x = 0; x < p.cols; x++) {
      const u = p.cols === 1 ? 0.5 : x / (p.cols - 1);
      const v = p.rows === 1 ? 0.5 : z / (p.rows - 1);
      const gradient = Math.pow(clamp(u * 0.68 + v * 0.32, 0, 1), p.rampBias);
      const wave = (Math.sin((u * 2.2 + v * 1.7) * TAU) * 0.5 + 0.5) * p.ripple;
      const t = clamp(gradient * (1 - p.ripple) + wave, 0, 1);
      const h = p.minHeight + (p.maxHeight - p.minHeight) * smoothstep(0, 1, t);
      const px = (x - (p.cols - 1) / 2) * p.spacing;
      const pz = (z - (p.rows - 1) / 2) * p.spacing;
      meshes.push({
        mesh: transform(box(width, h, depth), { translate: vec3(px, h * 0.5, pz) }),
        color: gradientColor(t),
      });
    }
  }
  const merged = mergeWithVertexColors(meshes);
  const part = surf("gradientBox", "gradient_box_field", "渐变盒阵列", merged.mesh, [0.8, 0.72, 0.48], "ceramic", {
    roughness: 0.62,
    cols: p.cols,
    rows: p.rows,
  });
  part.colors = merged.colors;
  return [part];
}

export function buildRainingGardenParts(
  params: Partial<RainingGardenParams> = {},
): NamedPart[] {
  const p = resolveRainingGarden(params);
  const rng = makeRng(p.seed);
  const ground = plane(p.radius * 2.1, p.radius * 2.1, 8, 8);
  const boundary = torus(p.radius, 0.035, 72, 8);

  const grassPc = randomDiskPointCloud(p.grassCount, p.radius * 0.92, rng, 0, 0.35);
  const flowerPc = randomDiskPointCloud(p.flowerCount, p.radius * 0.78, rng, 0, 0.55);
  const grassBlade = transform(cone(0.035, 0.46, 5, true), { translate: vec3(0, 0.23, 0) });
  const flower = transform(buildFlowerMesh(0.42, 0.055), { translate: vec3(0, 0.01, 0) });
  const grass = copyToPoints(grassPc, grassBlade, {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: true,
  });
  const flowers = copyToPoints(flowerPc, flower, {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: true,
  });

  const rainMeshes: Mesh[] = [];
  for (let i = 0; i < p.rainCount; i++) {
    const d = Math.sqrt(rng.next()) * p.radius * 1.08;
    const a = rng.next() * TAU;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const top = vec3(x + p.rainSlant * 0.18, p.rainHeight + rng.range(0, 0.55), z);
    const bottom = vec3(x - p.rainSlant * 0.18, p.rainHeight - rng.range(0.38, 0.78), z);
    rainMeshes.push(sweep(polyline([top, bottom]), { radius: 0.006, sides: 5, caps: true }));
  }

  return [
    surf("rainingGarden", "garden_soil", "花园土壤", ground, SOIL, "dirtRoad", {
      roughness: 0.95,
      seed: p.seed,
    }),
    surf("rainingGarden", "garden_boundary", "圆形花园边界", boundary, [0.46, 0.31, 0.16], "wood", {
      roughness: 0.86,
      seed: p.seed + 1,
    }),
    surf("rainingGarden", "garden_grass", "草叶散布", grass, GRASS, "leaf", {
      roughness: 0.82,
      count: p.grassCount,
    }),
    surf("rainingGarden", "garden_flowers", "花朵散布", flowers, FLOWER, "leaf", {
      roughness: 0.7,
      count: p.flowerCount,
    }),
    surf("rainingGarden", "rain_streaks", "雨线实例", merge(...rainMeshes), RAIN, "liquid", {
      roughness: 0.08,
      transmission: 0.5,
      count: p.rainCount,
    }),
  ];
}

export function buildBlenderHowtosShowcaseParts(
  params: Partial<BlenderHowtosShowcaseParams> = {},
): NamedPart[] {
  const p = { ...BLENDER_HOWTOS_SHOWCASE_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const s = Math.max(0.1, p.scale);
  const groups: Array<{ prefix: string; offset: Vec3; parts: NamedPart[] }> = [
    {
      prefix: "spiral",
      offset: vec3(-5.4 * s, 1.55 * s, 0),
      parts: buildSpiralScalesParts({ count: 62, phase: seed * 0.01 }),
    },
    {
      prefix: "dna",
      offset: vec3(-1.9 * s, 1.6 * s, 0),
      parts: buildDnaHelixParts({ pairs: 28, phase: seed * 0.007 }),
    },
    {
      prefix: "gradient",
      offset: vec3(1.7 * s, 0, 0),
      parts: buildGradientBoxParts({ cols: 8, rows: 7, ripple: 0.12 }),
    },
    {
      prefix: "garden",
      offset: vec3(5.4 * s, 0, 0),
      parts: buildRainingGardenParts({ seed: seed + 31, grassCount: 95, flowerCount: 18, rainCount: 42, radius: 1.45 }),
    },
  ];

  const out: NamedPart[] = [];
  for (const group of groups) {
    for (const part of group.parts) {
      out.push({
        ...part,
        name: `${group.prefix}_${part.name}`,
        mesh: transform(part.mesh, { scale: s, translate: group.offset }),
      });
    }
  }
  return out;
}

export function summarizeBlenderHowtos(parts: readonly NamedPart[]): BlenderHowtosSummary {
  const categories: Record<BlenderHowtosCategory, number> = {
    spiralScales: 0,
    dnaHelix: 0,
    gradientBox: 0,
    rainingGarden: 0,
  };
  let vertexCount = 0;
  let triangleCount = 0;
  for (const part of parts) {
    vertexCount += part.mesh.positions.length;
    triangleCount += part.mesh.indices.length / 3;
    const category = part.metadata?.category;
    if (isBlenderHowtosCategory(category)) categories[category]++;
  }
  return { partCount: parts.length, vertexCount, triangleCount, categories };
}

function helixCurve(radius: number, height: number, turns: number, phase: number, samples: number) {
  const pts: Vec3[] = [];
  const n = Math.max(2, Math.round(samples));
  for (let i = 0; i <= n; i++) pts.push(helixPoint(radius, height, turns, i / n, phase));
  return polyline(pts);
}

function helixPoint(radius: number, height: number, turns: number, t: number, phase: number): Vec3 {
  const a = t * turns * TAU + phase;
  return vec3(Math.cos(a) * radius, (t - 0.5) * height, Math.sin(a) * radius);
}

function gradientColor(t: number): RGB {
  const k = clamp(t, 0, 1);
  if (k < 0.5) {
    return mixColor([0.12, 0.32, 0.7], [0.9, 0.72, 0.24], k * 2);
  }
  return mixColor([0.9, 0.72, 0.24], [0.85, 0.18, 0.42], (k - 0.5) * 2);
}

function mergeWithVertexColors(items: ReadonlyArray<{ mesh: Mesh; color: RGB }>): { mesh: Mesh; colors: number[] } {
  const mesh = merge(...items.map((i) => i.mesh));
  const colors: number[] = [];
  for (const item of items) {
    for (let i = 0; i < item.mesh.positions.length; i++) colors.push(...item.color);
  }
  return { mesh, colors };
}

function randomDiskPointCloud(
  count: number,
  radius: number,
  rng: ReturnType<typeof makeRng>,
  y: number,
  jitterScale: number,
) {
  const points: Vec3[] = [];
  const scaleAttr: number[] = [];
  const yaw: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = Math.sqrt(rng.next()) * radius;
    const a = rng.next() * TAU;
    points.push(vec3(Math.cos(a) * d, y, Math.sin(a) * d));
    scaleAttr.push(1 - jitterScale * 0.5 + rng.next() * jitterScale);
    yaw.push(rng.next() * TAU);
  }
  return makePointCloud({
    points,
    normals: points.map(() => vec3(0, 1, 0)),
    attributes: { scale: scaleAttr, yaw },
  });
}

function buildFlowerMesh(height: number, radius: number): Mesh {
  const stem = transform(cylinder(radius * 0.22, height, 8, true), {
    translate: vec3(0, height * 0.5, 0),
  });
  const headCenter = vec3(0, height + radius * 1.4, 0);
  const center = transform(sphere(radius * 0.65, 10, 6), { translate: headCenter });
  const petals: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const pos = add(headCenter, vec3(Math.cos(a) * radius * 1.15, 0, Math.sin(a) * radius * 1.15));
    petals.push(transform(sphere(1, 10, 6), {
      scale: vec3(radius * 0.72, radius * 0.22, radius * 0.42),
      rotate: vec3(0, Math.PI / 2 - a, 0),
      translate: pos,
    }));
  }
  return merge(stem, center, ...petals);
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function isBlenderHowtosCategory(value: unknown): value is BlenderHowtosCategory {
  return value === "spiralScales" ||
    value === "dnaHelix" ||
    value === "gradientBox" ||
    value === "rainingGarden";
}
