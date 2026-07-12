/**
 * Procedural Silo — Meshova reference build inspired by SideFX's
 * "Procedural SILO" Houdini tutorial page.
 *
 * This is not a copied asset. It re-authors the idea as Meshova primitives:
 * cylindrical cutaway shaft, stacked ring decks, modular wall cells, spiral
 * stair, vertical services, light strips, and bottom machinery. Same params +
 * seed -> same mesh.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  frustum,
  torus,
  merge,
  makeMesh,
  computeNormals,
  transform,
  helix,
  polyline,
  sweep,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const TAU = Math.PI * 2;
const CONCRETE: RGB = [0.43, 0.42, 0.37];
const DARK_CONCRETE: RGB = [0.24, 0.24, 0.22];
const WORN_METAL: RGB = [0.26, 0.27, 0.27];
const DARK_METAL: RGB = [0.12, 0.13, 0.13];
const MODULE: RGB = [0.34, 0.33, 0.29];
const GLASS: RGB = [0.3, 0.45, 0.52];
const WARM_LIGHT: RGB = [1.0, 0.78, 0.42];
const COPPER: RGB = [0.55, 0.31, 0.16];

export interface ProceduralSiloParams {
  /** Shaft radius in metres. */
  radius: number;
  /** Total shaft height. */
  height: number;
  /** Stack count for decks/modules. */
  levels: number;
  /** Repeated wall cells per level. */
  modulesPerLevel: number;
  /** Walkway depth from outer wall toward the void. */
  balconyDepth: number;
  /** Front opening angle in radians so the interior remains visible. */
  cutawayAngle: number;
  /** Number of spiral stair turns through the shaft. */
  stairTurns: number;
  /** Vertical service pipe count. */
  servicePipes: number;
  /** 0..1 density of wall modules. */
  moduleDensity: number;
  /** Seed for deterministic module jitter and service layout. */
  seed: number;
}

export const PROCEDURAL_SILO_DEFAULTS: ProceduralSiloParams = {
  radius: 5.2,
  height: 22,
  levels: 14,
  modulesPerLevel: 14,
  balconyDepth: 1.15,
  cutawayAngle: 1.45,
  stairTurns: 4.2,
  servicePipes: 8,
  moduleDensity: 0.78,
  seed: 41,
};

const surf = (type: string, params: Record<string, unknown>) => ({ type, params });

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalizedParams(params: Partial<ProceduralSiloParams>): ProceduralSiloParams {
  const d = PROCEDURAL_SILO_DEFAULTS;
  return {
    radius: clamp(params.radius ?? d.radius, 2.5, 12),
    height: clamp(params.height ?? d.height, 8, 60),
    levels: Math.max(3, Math.round(params.levels ?? d.levels)),
    modulesPerLevel: Math.max(4, Math.round(params.modulesPerLevel ?? d.modulesPerLevel)),
    balconyDepth: clamp(params.balconyDepth ?? d.balconyDepth, 0.4, 3),
    cutawayAngle: clamp(params.cutawayAngle ?? d.cutawayAngle, 0, Math.PI * 1.4),
    stairTurns: clamp(params.stairTurns ?? d.stairTurns, 0.75, 12),
    servicePipes: Math.max(0, Math.round(params.servicePipes ?? d.servicePipes)),
    moduleDensity: clamp(params.moduleDensity ?? d.moduleDensity, 0, 1),
    seed: Math.round(params.seed ?? d.seed),
  };
}

function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function inFrontCutaway(a: number, cutawayAngle: number): boolean {
  return Math.abs(angleDelta(a, Math.PI / 2)) < cutawayAngle * 0.5;
}

function radialTransform(m: Mesh, angle: number, radius: number, y: number): Mesh {
  return transform(m, {
    rotate: vec3(0, Math.PI / 2 - angle, 0),
    translate: vec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
  });
}

/** Flat annular slab, centred at y=0, spanning inner..outer radius. */
function ringSlab(innerRadius: number, outerRadius: number, thickness: number, segments: number): Mesh {
  const seg = Math.max(8, Math.round(segments));
  const hy = thickness * 0.5;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    positions.push(
      vec3(ca * outerRadius, hy, sa * outerRadius),
      vec3(ca * innerRadius, hy, sa * innerRadius),
      vec3(ca * outerRadius, -hy, sa * outerRadius),
      vec3(ca * innerRadius, -hy, sa * innerRadius),
    );
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, -1, 0));
    uvs.push(vec2(u, 1), vec2(u, 0), vec2(u, 1), vec2(u, 0));
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 2, a + 3, b + 3, a + 2, b + 3, b + 2,
      a + 2, b + 2, b, a + 2, b, a,
      a + 1, b + 1, b + 3, a + 1, b + 3, a + 3,
    );
  }
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 35);
}

function shaftWall(p: ProceduralSiloParams): Mesh {
  const meshes: Mesh[] = [];
  const segments = Math.max(32, p.modulesPerLevel * 4);
  const panelW = (TAU * p.radius) / segments * 0.86;
  for (let i = 0; i < segments; i++) {
    const a = ((i + 0.5) / segments) * TAU;
    if (inFrontCutaway(a, p.cutawayAngle)) continue;
    const panel = box(panelW, p.height, 0.18);
    meshes.push(radialTransform(panel, a, p.radius, p.height * 0.5));
  }
  return computeNormals(merge(...meshes), 25);
}

function verticalRibs(p: ProceduralSiloParams): Mesh {
  const meshes: Mesh[] = [];
  const count = Math.max(8, Math.round(p.modulesPerLevel));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    if (inFrontCutaway(a, p.cutawayAngle * 0.82)) continue;
    meshes.push(transform(cylinder(0.075, p.height + 0.2, 8, true), {
      translate: vec3(Math.cos(a) * (p.radius + 0.13), p.height * 0.5, Math.sin(a) * (p.radius + 0.13)),
    }));
  }
  return merge(...meshes);
}

function decksAndRails(p: ProceduralSiloParams): { decks: Mesh; rails: Mesh } {
  const decks: Mesh[] = [];
  const rails: Mesh[] = [];
  const spacing = p.height / (p.levels + 1);
  const inner = Math.max(1.35, p.radius - p.balconyDepth - 1.25);
  const outer = p.radius - 0.42;
  for (let i = 0; i < p.levels; i++) {
    const y = spacing * (i + 1);
    decks.push(transform(ringSlab(inner, outer, 0.13, p.modulesPerLevel * 4), { translate: vec3(0, y, 0) }));
    rails.push(transform(torus(inner + 0.06, 0.026, 8, p.modulesPerLevel * 4), { translate: vec3(0, y + 0.48, 0) }));
    rails.push(transform(torus(outer - 0.05, 0.026, 8, p.modulesPerLevel * 4), { translate: vec3(0, y + 0.48, 0) }));
  }
  return { decks: computeNormals(merge(...decks), 35), rails: merge(...rails) };
}

function wallModules(p: ProceduralSiloParams): { modules: Mesh; windows: Mesh } {
  const rng = makeRng((p.seed ^ 0x51a0) >>> 0);
  const modules: Mesh[] = [];
  const windows: Mesh[] = [];
  const spacing = p.height / (p.levels + 1);
  const depth = p.balconyDepth * 0.62;
  const bodyR = p.radius - 0.52 - depth * 0.5;
  const cellW = (TAU * bodyR) / p.modulesPerLevel;
  for (let level = 0; level < p.levels; level++) {
    const y = spacing * (level + 1) + spacing * 0.27;
    const h = spacing * rng.range(0.34, 0.55);
    const phase = (level % 2) * 0.5;
    for (let j = 0; j < p.modulesPerLevel; j++) {
      if (rng.next() > p.moduleDensity) continue;
      const a = ((j + phase) / p.modulesPerLevel) * TAU;
      if (inFrontCutaway(a, p.cutawayAngle * 0.78)) continue;
      const w = cellW * rng.range(0.46, 0.72);
      const d = depth * rng.range(0.78, 1.08);
      const localR = bodyR + rng.range(-0.08, 0.08);
      modules.push(radialTransform(box(w, h, d), a, localR, y));
      if (rng.next() < 0.76) {
        const wr = localR - d * 0.52 - 0.018;
        const ww = w * rng.range(0.35, 0.62);
        const wh = h * rng.range(0.22, 0.36);
        windows.push(radialTransform(box(ww, wh, 0.035), a, wr, y + h * rng.range(-0.06, 0.1)));
      }
    }
  }
  return { modules: computeNormals(merge(...modules), 25), windows: merge(...windows) };
}

function spiralStair(p: ProceduralSiloParams): { rails: Mesh; treads: Mesh } {
  const stairH = p.height * 0.86;
  const baseY = p.height * 0.07;
  const railR = Math.max(1.2, p.radius - p.balconyDepth - 2);
  const rails: Mesh[] = [];
  for (const offset of [-0.28, 0.28]) {
    const c = helix({ radius: railR + offset, height: stairH, turns: p.stairTurns, segments: Math.round(p.stairTurns * 48) });
    const shifted = polyline(c.points.map((q) => vec3(q.x, q.y + stairH * 0.5 + baseY, q.z)), false);
    rails.push(sweep(shifted, { radius: 0.045, sides: 6, caps: true }));
  }
  const treads: Mesh[] = [];
  const stepCount = Math.max(12, Math.round(p.levels * 3.4));
  for (let i = 0; i < stepCount; i++) {
    const t = stepCount === 1 ? 0 : i / (stepCount - 1);
    const a = t * p.stairTurns * TAU;
    const y = baseY + t * stairH;
    treads.push(radialTransform(box(0.34, 0.045, 0.78), a, railR, y));
  }
  return { rails: merge(...rails), treads: computeNormals(merge(...treads), 20) };
}

function centralCore(p: ProceduralSiloParams): { core: Mesh; glass: Mesh; rings: Mesh } {
  const core = transform(cylinder(0.46, p.height * 0.94, 32, true), { translate: vec3(0, p.height * 0.47, 0) });
  const glass = transform(cylinder(0.74, p.height * 0.9, 32, false), { translate: vec3(0, p.height * 0.48, 0) });
  const rings: Mesh[] = [];
  const spacing = p.height / (p.levels + 1);
  for (let i = 0; i < p.levels; i += 2) {
    rings.push(transform(torus(0.77, 0.024, 6, 32), { translate: vec3(0, spacing * (i + 1), 0) }));
  }
  return { core, glass, rings: merge(...rings) };
}

function servicePipes(p: ProceduralSiloParams): Mesh {
  const rng = makeRng((p.seed ^ 0x70b7) >>> 0);
  const pipes: Mesh[] = [];
  for (let i = 0; i < p.servicePipes; i++) {
    const a = (i / Math.max(1, p.servicePipes)) * TAU + rng.range(-0.12, 0.12);
    const r = rng.range(1.05, Math.max(1.25, p.radius - p.balconyDepth - 1.45));
    const rad = rng.range(0.035, 0.07);
    pipes.push(transform(cylinder(rad, p.height * rng.range(0.75, 1), 8, true), {
      translate: vec3(Math.cos(a) * r, p.height * 0.5, Math.sin(a) * r),
    }));
  }
  return merge(...pipes);
}

function bridgesAndLights(p: ProceduralSiloParams): { bridges: Mesh; lights: Mesh } {
  const bridges: Mesh[] = [];
  const lights: Mesh[] = [];
  const spacing = p.height / (p.levels + 1);
  const outer = p.radius - 1.05;
  const inner = 0.85;
  const bridgeLen = outer - inner;
  for (let level = 1; level < p.levels; level += 3) {
    const y = spacing * (level + 1) + 0.08;
    for (let k = 0; k < 3; k++) {
      const a = ((k / 3) * TAU) + level * 0.19;
      if (inFrontCutaway(a, p.cutawayAngle * 0.45)) continue;
      bridges.push(radialTransform(box(0.24, 0.08, bridgeLen), a, inner + bridgeLen * 0.5, y));
    }
  }
  for (let level = 0; level < p.levels; level += 2) {
    const y = spacing * (level + 1) + spacing * 0.35;
    for (let k = 0; k < 4; k++) {
      const a = ((k + 0.5) / 4) * TAU + level * 0.11;
      if (inFrontCutaway(a, p.cutawayAngle * 0.65)) continue;
      lights.push(radialTransform(box(0.55, 0.18, 0.035), a, p.radius - 0.2, y));
    }
  }
  return { bridges: computeNormals(merge(...bridges), 20), lights: merge(...lights) };
}

function machinery(p: ProceduralSiloParams): Mesh {
  const meshes: Mesh[] = [];
  meshes.push(transform(ringSlab(0.8, p.radius - 0.65, 0.28, p.modulesPerLevel * 4), { translate: vec3(0, 0.14, 0) }));
  meshes.push(transform(frustum(1.15, 0.82, 1.4, 24, true), { translate: vec3(0, 0.98, 0) }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.24;
    const r = 2.1 + (i % 2) * 0.45;
    meshes.push(radialTransform(box(0.62, 0.42, 1.0), a, r, 0.52));
  }
  return computeNormals(merge(...meshes), 35);
}

export function buildProceduralSiloParts(params: Partial<ProceduralSiloParams> = {}): NamedPart[] {
  const p = normalizedParams(params);
  const { decks, rails } = decksAndRails(p);
  const { modules, windows } = wallModules(p);
  const { rails: stairRails, treads } = spiralStair(p);
  const { core, glass, rings } = centralCore(p);
  const { bridges, lights } = bridgesAndLights(p);
  const metadata = {
    source: "https://www.sidefx.com/tutorials/procedural-silo-houdini-tutorial/",
    note: "Re-authored procedural silo concept; no SideFX asset copied.",
  };
  const parts: NamedPart[] = [
    { name: "shaft_wall", label: "剖切筒壁", mesh: shaftWall(p), color: DARK_CONCRETE, surface: surf("stone", { color: DARK_CONCRETE, roughness: 0.92 }), metadata },
    { name: "vertical_ribs", label: "竖向肋柱", mesh: verticalRibs(p), color: CONCRETE, surface: surf("stone", { color: CONCRETE, roughness: 0.9 }), metadata },
    { name: "ring_decks", label: "环形楼层", mesh: decks, color: CONCRETE, surface: surf("concrete", { color: CONCRETE, roughness: 0.88 }), metadata },
    { name: "guard_rails", label: "栏杆", mesh: rails, color: DARK_METAL, surface: surf("metal", { color: DARK_METAL, roughness: 0.48, metallic: 1 }), metadata },
    { name: "wall_modules", label: "墙体模块舱", mesh: modules, color: MODULE, surface: surf("paintedMetal", { color: MODULE, roughness: 0.66 }), metadata },
    { name: "lit_windows", label: "暖色窗灯", mesh: windows, color: WARM_LIGHT, surface: surf("plastic", { color: WARM_LIGHT, roughness: 0.2 }), metadata },
    { name: "spiral_stair_rails", label: "螺旋梯扶手", mesh: stairRails, color: WORN_METAL, surface: surf("metal", { color: WORN_METAL, roughness: 0.5, metallic: 1 }), metadata },
    { name: "spiral_stair_treads", label: "螺旋梯踏板", mesh: treads, color: WORN_METAL, surface: surf("metal", { color: WORN_METAL, roughness: 0.62, metallic: 1 }), metadata },
    { name: "central_core", label: "中心服务核", mesh: core, color: DARK_METAL, surface: surf("metal", { color: DARK_METAL, roughness: 0.42, metallic: 1 }), metadata },
    { name: "elevator_glass", label: "电梯玻璃筒", mesh: glass, color: GLASS, surface: surf("glass", { tint: GLASS, roughness: 0.08 }), metadata },
    { name: "core_ring_bands", label: "中心环箍", mesh: rings, color: WORN_METAL, surface: surf("metal", { color: WORN_METAL, roughness: 0.45, metallic: 1 }), metadata },
    { name: "service_pipes", label: "竖向管线", mesh: servicePipes(p), color: COPPER, surface: surf("metal", { color: COPPER, roughness: 0.38, metallic: 1 }), metadata },
    { name: "radial_bridges", label: "径向连桥", mesh: bridges, color: WORN_METAL, surface: surf("metal", { color: WORN_METAL, roughness: 0.58, metallic: 1 }), metadata },
    { name: "wall_lights", label: "壁灯条", mesh: lights, color: WARM_LIGHT, surface: surf("plastic", { color: WARM_LIGHT, roughness: 0.18 }), metadata },
    { name: "bottom_machinery", label: "底部机械层", mesh: machinery(p), color: WORN_METAL, surface: surf("metal", { color: WORN_METAL, roughness: 0.55, metallic: 1 }), metadata },
  ];
  return parts;
}
