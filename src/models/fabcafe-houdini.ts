/**
 * Fabcafe Houdini Lectures clean-room reproductions.
 *
 * Source repo teaches two compact procedural recipes:
 * - wavy-surface: grid -> noise attrs -> delete -> copy boxes -> scale/color
 * - twist-tower: controller -> resample/twist -> VDB particles -> feedback union
 *
 * This file reimplements those structures in Meshova TS. No .hipnc data or
 * binary assets are copied.
 */
import { vec2 } from "../math/vec2.js";
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { add, scale, vec3, type Vec3 } from "../math/vec3.js";
import { fbm2, makeNoise, makeRng, type Noise } from "../random/index.js";
import {
  box,
  bounds,
  copyToPoints,
  cylinder,
  filterPoints,
  makeMesh,
  makePointCloud,
  merge,
  metaballs,
  partitionByAttribute,
  pointAttribute,
  polyline,
  recomputeNormals,
  repeat,
  resampleCurve,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  triangleCount,
  vertexCount,
  withAttributes,
  bakeVertexColors,
  type Mesh,
  type Metaball,
  type NamedPart,
  type PointCloud,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface FabcafeWavySurfaceParams {
  readonly cols: number;
  readonly rows: number;
  readonly size: number;
  readonly waveScale: number;
  readonly surfaceAmp: number;
  readonly threshold: number;
  readonly blockHeight: number;
  readonly fill: number;
  readonly seed: number;
}

export interface FabcafeTwistTowerParams {
  readonly height: number;
  readonly radius: number;
  readonly turns: number;
  readonly twist: number;
  readonly samples: number;
  readonly copies: number;
  readonly tubeRadius: number;
  readonly floors: number;
  readonly resolution: number;
  readonly seed: number;
}

export interface FabcafeHoudiniShowcaseParams {
  readonly seed: number;
  readonly scale: number;
}

export interface FabcafeHoudiniSummary {
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly sources: Record<"wavySurface" | "twistTower", number>;
}

export const FABCAFE_WAVY_SURFACE_DEFAULTS: FabcafeWavySurfaceParams = {
  cols: 28,
  rows: 28,
  size: 7,
  waveScale: 2.1,
  surfaceAmp: 0.32,
  threshold: 0.34,
  blockHeight: 0.42,
  fill: 0.72,
  seed: 17,
};

export const FABCAFE_TWIST_TOWER_DEFAULTS: FabcafeTwistTowerParams = {
  height: 7.5,
  radius: 1.15,
  turns: 2.35,
  twist: 1.2,
  samples: 44,
  copies: 6,
  tubeRadius: 0.18,
  floors: 9,
  resolution: 34,
  seed: 29,
};

export const FABCAFE_HOUDINI_SHOWCASE_DEFAULTS: FabcafeHoudiniShowcaseParams = {
  seed: 40,
  scale: 1,
};

const SOURCE = "Fabcafe-Houdini-Lectures clean-room Meshova rewrite";
const WAVE_COLORS: RGB[] = [
  [0.13, 0.28, 0.56],
  [0.1, 0.54, 0.68],
  [0.9, 0.6, 0.18],
  [0.94, 0.25, 0.16],
];
const WAVE_BASE: RGB = [0.065, 0.08, 0.1];
const TOWER_SKIN: RGB = [0.62, 0.68, 0.72];
const TOWER_RINGS: RGB = [0.95, 0.73, 0.3];
const TOWER_AXIS: RGB = [0.13, 0.16, 0.18];
const TOWER_PARTICLES: RGB = [0.2, 0.42, 0.72];

function resolveWavySurface(params: Partial<FabcafeWavySurfaceParams>): FabcafeWavySurfaceParams {
  const p = { ...FABCAFE_WAVY_SURFACE_DEFAULTS, ...params };
  return {
    cols: Math.max(3, Math.round(p.cols)),
    rows: Math.max(3, Math.round(p.rows)),
    size: Math.max(0.5, p.size),
    waveScale: Math.max(0.1, p.waveScale),
    surfaceAmp: Math.max(0, p.surfaceAmp),
    threshold: clamp(p.threshold, 0, 0.95),
    blockHeight: Math.max(0.04, p.blockHeight),
    fill: clamp(p.fill, 0.2, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveTwistTower(params: Partial<FabcafeTwistTowerParams>): FabcafeTwistTowerParams {
  const p = { ...FABCAFE_TWIST_TOWER_DEFAULTS, ...params };
  return {
    height: Math.max(1, p.height),
    radius: Math.max(0.15, p.radius),
    turns: Math.max(0.1, p.turns),
    twist: p.twist,
    samples: Math.max(8, Math.round(p.samples)),
    copies: Math.max(1, Math.round(p.copies)),
    tubeRadius: Math.max(0.025, p.tubeRadius),
    floors: Math.max(0, Math.round(p.floors)),
    resolution: Math.max(12, Math.round(p.resolution)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function surf(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  sourceModel: "wavySurface" | "twistTower",
  surfaceType: string,
  params: Record<string, unknown> = {},
): NamedPart {
  return {
    name,
    label,
    mesh: recomputeNormals(mesh),
    color,
    surface: { type: surfaceType, params: { color, ...params } },
    metadata: { source: SOURCE, sourceModel },
  };
}

export function buildFabcafeWavySurfaceParts(
  params: Partial<FabcafeWavySurfaceParams> = {},
): NamedPart[] {
  const p = resolveWavySurface(params);
  const noise = makeNoise(p.seed);
  const terrain = buildWavyTerrainMesh(p, noise);
  const terrainColors = bakeVertexColors(withAttributes(terrain), (ctx) => {
    const t = clamp(ctx.position.y / Math.max(1e-6, p.surfaceAmp), 0, 1);
    return vec3(
      WAVE_BASE[0] + 0.24 * t,
      WAVE_BASE[1] + 0.18 * t,
      WAVE_BASE[2] + 0.08 * t,
    );
  });

  const pc = buildWavyPointCloud(p, noise);
  const bands = partitionByAttribute(pc, "band", WAVE_COLORS.length);
  const cell = p.size / Math.max(p.cols - 1, p.rows - 1);
  const library = buildHeightBoxLibrary(cell * p.fill, p.blockHeight);
  const parts: NamedPart[] = [
    {
      ...surf("wavy_surface", "噪声驱动波面", terrain, WAVE_BASE, "wavySurface", "ceramic", {
        roughness: 0.82,
        seed: p.seed,
      }),
      colors: terrainColors,
      metadata: {
        source: SOURCE,
        sourceModel: "wavySurface",
        recipe: "grid -> noise attr -> vertex color",
      },
    },
  ];

  for (let band = 0; band < bands.length; band++) {
    const sub = bands[band]!;
    if (sub.points.length === 0) continue;
    const color = WAVE_COLORS[band]!;
    parts.push({
      ...surf(
        `wave_instances_band_${band}`,
        `实例方柱色带 ${band + 1}`,
        copyToPoints(sub, library, {
          variant: pointAttribute("variant"),
          scale: pointAttribute("scale", 1),
          yaw: pointAttribute("yaw"),
          alignToNormal: false,
        }),
        color,
        "wavySurface",
        "ceramic",
        { roughness: 0.68, seed: p.seed + band },
      ),
      metadata: {
        source: SOURCE,
        sourceModel: "wavySurface",
        recipe: "grid -> noise attrs -> delete -> copy boxes -> scale/color",
        instances: sub.points.length,
        band,
      },
    });
  }
  return parts;
}

export function buildFabcafeTwistTowerParts(
  params: Partial<FabcafeTwistTowerParams> = {},
): NamedPart[] {
  const p = resolveTwistTower(params);
  const sourceBalls = buildTwistedParticleBalls(p, 0);
  const allBalls = repeat<Metaball[]>([], p.copies, (acc, ctx) => {
    const yaw = (ctx.index / ctx.count) * TAU;
    const mirrored = (ctx.index & 1) === 1;
    const phase = mirrored ? Math.PI / Math.max(1, p.copies) : 0;
    const copy = sourceBalls.map((ball) => rotateBall(mirrorBall(ball, mirrored), yaw + phase));
    return [...acc, ...copy];
  });
  const skin = metaballs(allBalls, {
    resolution: p.resolution,
    iso: 0.58,
    padding: p.tubeRadius * 2.2,
  });

  const rings = buildTwistTowerRings(p);
  const axis = transform(cylinder(p.tubeRadius * 0.32, p.height, 16, true), {
    translate: vec3(0, p.height * 0.5, 0),
  });
  const guide = buildTwistGuideMesh(p);
  const particles = buildParticleMarkerMesh(sourceBalls, p);

  return [
    {
      ...surf("twist_tower_skin", "体素融合扭转塔身", skin, TOWER_SKIN, "twistTower", "metal", {
        metallic: 0.6,
        roughness: 0.42,
        seed: p.seed,
      }),
      metadata: {
        source: SOURCE,
        sourceModel: "twistTower",
        recipe: "controller -> twisted points -> VDB/metaball union -> convert mesh",
        particles: allBalls.length,
      },
    },
    surf("twist_tower_floor_rings", "反馈复制楼层环", rings, TOWER_RINGS, "twistTower", "metal", {
      metallic: 0.85,
      roughness: 0.32,
      seed: p.seed + 1,
    }),
    surf("twist_tower_axis", "控制器中心轴", merge(axis, guide), TOWER_AXIS, "twistTower", "metal", {
      metallic: 0.7,
      roughness: 0.48,
      seed: p.seed + 2,
    }),
    surf("twist_tower_particle_trace", "粒子轨迹标记", particles, TOWER_PARTICLES, "twistTower", "ceramic", {
      roughness: 0.52,
      seed: p.seed + 3,
    }),
  ];
}

export function buildFabcafeHoudiniShowcaseParts(
  params: Partial<FabcafeHoudiniShowcaseParams> = {},
): NamedPart[] {
  const p = { ...FABCAFE_HOUDINI_SHOWCASE_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const s = Math.max(0.1, p.scale);
  return [
    ...offsetParts(buildFabcafeWavySurfaceParts({ seed: seed + 1 }), vec3(-4.8 * s, 0, 0), s),
    ...offsetParts(buildFabcafeTwistTowerParts({ seed: seed + 20 }), vec3(4.2 * s, 0, 0), s),
  ];
}

export function summarizeFabcafeHoudini(parts: readonly NamedPart[]): FabcafeHoudiniSummary {
  const sources: FabcafeHoudiniSummary["sources"] = { wavySurface: 0, twistTower: 0 };
  let verts = 0;
  let tris = 0;
  for (const part of parts) {
    verts += vertexCount(part.mesh);
    tris += triangleCount(part.mesh);
    const sourceModel = part.metadata?.sourceModel;
    if (sourceModel === "wavySurface" || sourceModel === "twistTower") sources[sourceModel]++;
  }
  return { partCount: parts.length, vertexCount: verts, triangleCount: tris, sources };
}

function buildWavyPointCloud(p: FabcafeWavySurfaceParams, noise: Noise): PointCloud {
  const points: Vec3[] = [];
  const wave: number[] = [];
  const scaleAttr: number[] = [];
  const yaw: number[] = [];
  const variant: number[] = [];
  const band: number[] = [];
  const normals: Vec3[] = [];
  const rng = makeRng(p.seed ^ 0x6d2b79f5);
  const variants = 6;
  for (let z = 0; z < p.rows; z++) {
    const v = z / (p.rows - 1);
    for (let x = 0; x < p.cols; x++) {
      const u = x / (p.cols - 1);
      const w = sampleWavyField(noise, p, u, v);
      const px = (u - 0.5) * p.size;
      const pz = (v - 0.5) * p.size;
      points.push(vec3(px, w * p.surfaceAmp, pz));
      normals.push(vec3(0, 1, 0));
      wave.push(w);
      scaleAttr.push(0.78 + w * 0.42 + rng.range(-0.05, 0.05));
      yaw.push((noise.noise2(px * 0.41 + 11, pz * 0.41 - 7) + rng.range(-0.25, 0.25)) * 0.34);
      variant.push(clamp(Math.floor(w * variants), 0, variants - 1));
      band.push(clamp(Math.floor(w * WAVE_COLORS.length), 0, WAVE_COLORS.length - 1));
    }
  }
  return filterPoints(
    makePointCloud({
      points,
      normals,
      attributes: { wave, scale: scaleAttr, yaw, variant, band },
    }),
    pointAttribute("wave"),
    p.threshold,
  );
}

function buildWavyTerrainMesh(p: FabcafeWavySurfaceParams, noise: Noise): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  for (let z = 0; z <= p.rows; z++) {
    const v = z / p.rows;
    for (let x = 0; x <= p.cols; x++) {
      const u = x / p.cols;
      const w = sampleWavyField(noise, p, u, v);
      positions.push(vec3((u - 0.5) * p.size, w * p.surfaceAmp, (v - 0.5) * p.size));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(u, v));
    }
  }
  const stride = p.cols + 1;
  for (let z = 0; z < p.rows; z++) {
    for (let x = 0; x < p.cols; x++) {
      const a = z * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function sampleWavyField(noise: Noise, p: FabcafeWavySurfaceParams, u: number, v: number): number {
  const n = (fbm2(noise, u * p.waveScale + p.seed * 0.013, v * p.waveScale - p.seed * 0.017, {
    octaves: 4,
    lacunarity: 2.1,
    gain: 0.52,
  }) + 1) * 0.5;
  const ridge = 0.5 + 0.5 * Math.sin((u * 1.85 + v * 0.8) * TAU + p.seed * 0.08);
  const dx = (u - 0.5) * 2;
  const dz = (v - 0.5) * 2;
  const center = 1 - smoothstep(0.08, 1.15, Math.hypot(dx, dz));
  return clamp(n * 0.62 + ridge * 0.24 + center * 0.24, 0, 1);
}

function buildHeightBoxLibrary(width: number, baseHeight: number): Mesh[] {
  const out: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const h = baseHeight * (0.35 + t * 1.85);
    out.push(transform(box(width, h, width), { translate: vec3(0, h * 0.5, 0) }));
  }
  return out;
}

function buildTwistedParticleBalls(p: FabcafeTwistTowerParams, phase: number): Metaball[] {
  const noise = makeNoise(p.seed);
  const balls: Metaball[] = [];
  for (let i = 0; i < p.samples; i++) {
    const t = i / (p.samples - 1);
    const a = phase + t * p.turns * TAU + Math.sin(t * TAU) * p.twist * 0.28;
    const breathe = 1 + 0.12 * Math.sin(t * TAU * 2 + phase) + 0.05 * noise.noise2(t * 4.3, phase);
    const r = p.radius * breathe;
    const y = t * p.height;
    const radius = p.tubeRadius * (1.65 + 0.38 * Math.sin(t * Math.PI));
    balls.push({
      center: vec3(Math.cos(a) * r, y, Math.sin(a) * r),
      radius,
      strength: 1,
    });
  }
  return balls;
}

function mirrorBall(ball: Metaball, mirrored: boolean): Metaball {
  if (!mirrored) return ball;
  const out: Metaball = {
    center: vec3(-ball.center.x, ball.center.y, ball.center.z),
    radius: ball.radius,
  };
  if (ball.strength !== undefined) out.strength = ball.strength;
  return out;
}

function rotateBall(ball: Metaball, yaw: number): Metaball {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const p = ball.center;
  const out: Metaball = {
    center: vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c),
    radius: ball.radius,
  };
  if (ball.strength !== undefined) out.strength = ball.strength;
  return out;
}

function buildTwistTowerRings(p: FabcafeTwistTowerParams): Mesh {
  const rings = repeat<Mesh[]>([], p.floors, (acc, ctx) => {
    const t = ctx.count <= 1 ? 0 : ctx.index / (ctx.count - 1);
    const r = p.radius * (0.92 + 0.08 * Math.sin(t * TAU * 2 + p.seed * 0.03));
    const ring = transform(torus(r, p.tubeRadius * 0.19, 64, 8), {
      rotate: vec3(0, t * p.turns * TAU * 0.18, 0),
      translate: vec3(0, t * p.height, 0),
    });
    return [...acc, ring];
  });
  return rings.length ? merge(...rings) : merge();
}

function buildTwistGuideMesh(p: FabcafeTwistTowerParams): Mesh {
  const balls = buildTwistedParticleBalls(p, 0);
  const curve = resampleCurve(smoothCurve(polyline(balls.map((b) => b.center)), 4), {
    count: Math.max(12, p.samples * 2),
  });
  return sweep(curve, {
    radius: p.tubeRadius * 0.18,
    sides: 8,
    caps: true,
  });
}

function buildParticleMarkerMesh(balls: readonly Metaball[], p: FabcafeTwistTowerParams): Mesh {
  const step = Math.max(2, Math.floor(balls.length / 10));
  const markers: Mesh[] = [];
  for (let i = 0; i < balls.length; i += step) {
    markers.push(transform(sphere(p.tubeRadius * 0.38, 10, 8), { translate: balls[i]!.center }));
  }
  return markers.length ? merge(...markers) : merge();
}

function offsetParts(parts: readonly NamedPart[], offset: Vec3, s: number): NamedPart[] {
  return parts.map((part) => {
    const out: NamedPart = {
      ...part,
      name: `fabcafe_${part.name}`,
      mesh: transform(part.mesh, { scale: s, translate: offset }),
      metadata: { ...part.metadata, showcaseOffset: offset },
    };
    if (part.colors) out.colors = part.colors.slice();
    if (part.windWeight) out.windWeight = part.windWeight.slice();
    return out;
  });
}

export function fabcafePartBounds(parts: readonly NamedPart[]): { min: Vec3; max: Vec3 } {
  return bounds(merge(...parts.map((part) => part.mesh)));
}
