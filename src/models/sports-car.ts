import { vec2 } from "../math/vec2.js";
import {
  cross,
  normalize,
  scale as scaleVec3,
  sub,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import {
  box,
  cylinder,
  makeMesh,
  merge,
  recomputeNormals,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface SportsCarParams {
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  rideHeight: number;
  spoiler: number;
  roofGlass: number;
}

export const SPORTS_CAR_DEFAULTS: SportsCarParams = {
  length: 5.8,
  width: 2.08,
  height: 1.28,
  wheelRadius: 0.34,
  rideHeight: 0.04,
  spoiler: 0.75,
  roofGlass: 1,
};

interface BodySection {
  z: number;
  halfWidth: number;
  bottom: number;
  lower: number;
  shoulder: number;
  top: number;
  crown: number;
}

interface ScaleContext {
  sx: number;
  sy: number;
  sz: number;
  y0: number;
}

const PAINT: RGB = [0.92, 0.015, 0.01];
const DARK_PAINT: RGB = [0.55, 0.02, 0.012];
const BLACK: RGB = [0.006, 0.007, 0.008];
const GLASS: RGB = [0.012, 0.018, 0.022];
const WINDOW: RGB = [0.004, 0.006, 0.007];
const SMOKE: RGB = [0.015, 0.018, 0.02];
const CHROME: RGB = [0.86, 0.84, 0.78];
const TIRE: RGB = [0.02, 0.02, 0.022];
const AMBER: RGB = [1.0, 0.45, 0.08];
const RED_LIGHT: RGB = [0.9, 0.02, 0.015];
const HEADLIGHT: RGB = [0.18, 0.32, 0.28];
const DARK_GLASS_PARAMS = { tint: GLASS, roughness: 0.08, thickness: 0.08 };

function add(
  parts: NamedPart[],
  name: string,
  mesh: Mesh,
  color: RGB,
  surfaceType?: string,
  params?: Record<string, unknown>,
) {
  const part: NamedPart = { name, mesh, color };
  if (surfaceType) part.surface = params ? { type: surfaceType, params } : { type: surfaceType };
  parts.push(part);
}

function sv(ctx: ScaleContext, x: number, y: number, z: number): Vec3 {
  return vec3(x * ctx.sx, y * ctx.sy + ctx.y0, z * ctx.sz);
}

function ss(ctx: ScaleContext, x: number, y: number, z: number): Vec3 {
  return vec3(x * ctx.sx, y * ctx.sy, z * ctx.sz);
}

function ringFromSection(ctx: ScaleContext, s: BodySection): Vec3[] {
  return [
    sv(ctx, -s.halfWidth * 0.72, s.bottom, s.z),
    sv(ctx, -s.halfWidth, s.lower, s.z),
    sv(ctx, -s.halfWidth * 0.98, s.shoulder, s.z),
    sv(ctx, -s.halfWidth * 0.58, s.top, s.z),
    sv(ctx, 0, s.crown, s.z),
    sv(ctx, s.halfWidth * 0.58, s.top, s.z),
    sv(ctx, s.halfWidth * 0.98, s.shoulder, s.z),
    sv(ctx, s.halfWidth, s.lower, s.z),
    sv(ctx, s.halfWidth * 0.72, s.bottom, s.z),
  ];
}

function loftSections(ctx: ScaleContext, sections: BodySection[]): Mesh {
  return loftRings(sections.map((s) => ringFromSection(ctx, s)));
}

function loftRings(rings: Vec3[][]): Mesh {
  const ringSize = rings[0]?.length ?? 0;
  if (rings.length < 2 || ringSize < 3) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    for (let j = 0; j < ringSize; j++) {
      positions.push(ring[j]!);
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(j / ringSize, i / (rings.length - 1)));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < ringSize; j++) {
      const a = i * ringSize + j;
      const b = i * ringSize + ((j + 1) % ringSize);
      const c = (i + 1) * ringSize + j;
      const d = (i + 1) * ringSize + ((j + 1) % ringSize);
      indices.push(a, c, b, b, c, d);
    }
  }
  const frontCenter = positions.length;
  positions.push(avg(rings[0]!));
  normals.push(vec3(0, 0, -1));
  uvs.push(vec2(0.5, 0.5));
  for (let j = 0; j < ringSize; j++) indices.push(frontCenter, j, (j + 1) % ringSize);

  const rearBase = (rings.length - 1) * ringSize;
  const rearCenter = positions.length;
  positions.push(avg(rings[rings.length - 1]!));
  normals.push(vec3(0, 0, 1));
  uvs.push(vec2(0.5, 0.5));
  for (let j = 0; j < ringSize; j++) indices.push(rearCenter, rearBase + ((j + 1) % ringSize), rearBase + j);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function avg(points: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const inv = 1 / points.length;
  return vec3(x * inv, y * inv, z * inv);
}

function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Mesh {
  const n = normalize(cross(sub(b, a), sub(c, a)));
  const rn = scaleVec3(n, -1);
  return makeMesh({
    positions: [a, b, c, d, a, d, c, b],
    normals: [n, n, n, n, rn, rn, rn, rn],
    uvs: [
      vec2(0, 0),
      vec2(1, 0),
      vec2(1, 1),
      vec2(0, 1),
      vec2(0, 0),
      vec2(1, 0),
      vec2(1, 1),
      vec2(0, 1),
    ],
    indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
  });
}

function quadStrip(quads: Array<[Vec3, Vec3, Vec3, Vec3]>): Mesh {
  return merge(...quads.map(([a, b, c, d]) => quad(a, b, c, d)));
}

function wheelSet(ctx: ScaleContext, side: -1 | 1, z: number, radius: number): NamedPart[] {
  const parts: NamedPart[] = [];
  const xOuter = side * 1.08 * ctx.sx;
  const center = sv(ctx, side * 1.04, 0.34, z);
  const tire = transform(torus(radius, radius * 0.22, 44, 14), {
    rotate: vec3(0, 0, Math.PI / 2),
    scale: vec3(1, 1, 1),
    translate: center,
  });
  add(parts, `tire_${side}_${z}`, tire, TIRE, "rubber", { color: TIRE });

  const rim = transform(cylinder(radius * 0.62, 0.09 * ctx.sx, 36, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter, center.y, center.z),
  });
  add(parts, `rim_${side}_${z}`, rim, CHROME, "chrome");

  const hub = transform(cylinder(radius * 0.18, 0.11 * ctx.sx, 24, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.02, center.y, center.z),
  });
  add(parts, `hub_${side}_${z}`, hub, CHROME, "chrome");

  const spokeMeshes: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI * 0.08;
    const dy = Math.cos(a) * radius * 0.28;
    const dz = Math.sin(a) * radius * 0.28;
    spokeMeshes.push(
      transform(box(0.04 * ctx.sx, radius * 0.55, 0.035 * ctx.sz), {
        rotate: vec3(a, 0, 0),
        translate: vec3(xOuter + side * 0.085, center.y + dy, center.z + dz),
      }),
    );
  }
  add(parts, `five_spoke_${side}_${z}`, merge(...spokeMeshes), CHROME, "chrome");
  return parts;
}

function partBox(ctx: ScaleContext, size: Vec3, pos: Vec3, rot = vec3(0, 0, 0)): Mesh {
  return transform(box(size.x * ctx.sx, size.y * ctx.sy, size.z * ctx.sz), {
    rotate: rot,
    translate: sv(ctx, pos.x, pos.y, pos.z),
  });
}

export function buildSportsCarParts(params: Partial<SportsCarParams> = {}): NamedPart[] {
  const p = { ...SPORTS_CAR_DEFAULTS, ...params };
  const ctx: ScaleContext = {
    sx: p.width / SPORTS_CAR_DEFAULTS.width,
    sy: p.height / SPORTS_CAR_DEFAULTS.height,
    sz: p.length / SPORTS_CAR_DEFAULTS.length,
    y0: p.rideHeight,
  };
  const wheelR = p.wheelRadius;
  const parts: NamedPart[] = [];

  const bodySections: BodySection[] = [
    { z: -2.9, halfWidth: 0.56, bottom: 0.18, lower: 0.31, shoulder: 0.45, top: 0.47, crown: 0.49 },
    { z: -2.55, halfWidth: 0.88, bottom: 0.17, lower: 0.34, shoulder: 0.55, top: 0.59, crown: 0.62 },
    { z: -1.8, halfWidth: 1.03, bottom: 0.16, lower: 0.36, shoulder: 0.62, top: 0.72, crown: 0.75 },
    { z: -0.75, halfWidth: 1.07, bottom: 0.15, lower: 0.36, shoulder: 0.68, top: 0.77, crown: 0.8 },
    { z: 0.55, halfWidth: 1.04, bottom: 0.15, lower: 0.35, shoulder: 0.7, top: 0.78, crown: 0.81 },
    { z: 1.65, halfWidth: 1.03, bottom: 0.16, lower: 0.36, shoulder: 0.65, top: 0.7, crown: 0.72 },
    { z: 2.28, halfWidth: 1.01, bottom: 0.17, lower: 0.34, shoulder: 0.56, top: 0.58, crown: 0.59 },
    { z: 2.64, halfWidth: 0.96, bottom: 0.19, lower: 0.33, shoulder: 0.47, top: 0.49, crown: 0.5 },
  ];
  add(parts, "wedge_body", loftSections(ctx, bodySections), PAINT, "carPaint", { color: PAINT, seed: 7 });

  const glassAlpha = Math.max(0, Math.min(1, p.roofGlass));
  const roofTint: RGB = [WINDOW[0] * glassAlpha, WINDOW[1] * glassAlpha, WINDOW[2] * glassAlpha];
  const blackGlassParams = { color: WINDOW, roughness: 0.055 };
  const roofGlassParams = { color: roofTint, roughness: 0.045 };
  add(parts, "cockpit_glass_shell", quadStrip([
    [
      sv(ctx, -0.74, 0.68, -1.24),
      sv(ctx, 0.74, 0.68, -1.24),
      sv(ctx, 0.58, 1.03, -0.48),
      sv(ctx, -0.58, 1.03, -0.48),
    ],
    [
      sv(ctx, -0.58, 1.02, 0.6),
      sv(ctx, 0.58, 1.02, 0.6),
      sv(ctx, 0.8, 0.69, 1.56),
      sv(ctx, -0.8, 0.69, 1.56),
    ],
    [
      sv(ctx, -0.58, 1.055, -0.5),
      sv(ctx, -0.06, 1.075, -0.43),
      sv(ctx, -0.06, 1.06, 0.68),
      sv(ctx, -0.58, 1.035, 0.62),
    ],
    [
      sv(ctx, 0.06, 1.075, -0.43),
      sv(ctx, 0.58, 1.055, -0.5),
      sv(ctx, 0.58, 1.035, 0.62),
      sv(ctx, 0.06, 1.06, 0.68),
    ],
    [
      sv(ctx, -0.93, 0.73, -0.8),
      sv(ctx, -0.66, 1.02, -0.44),
      sv(ctx, -0.66, 1.025, 0.3),
      sv(ctx, -0.94, 0.74, 0.5),
    ],
    [
      sv(ctx, 0.66, 1.02, -0.44),
      sv(ctx, 0.93, 0.73, -0.8),
      sv(ctx, 0.94, 0.74, 0.5),
      sv(ctx, 0.66, 1.025, 0.3),
    ],
    [
      sv(ctx, -0.66, 1.02, 0.28),
      sv(ctx, -0.58, 0.97, 0.92),
      sv(ctx, -0.88, 0.73, 1.28),
      sv(ctx, -0.94, 0.74, 0.48),
    ],
    [
      sv(ctx, 0.58, 0.97, 0.92),
      sv(ctx, 0.66, 1.02, 0.28),
      sv(ctx, 0.94, 0.74, 0.48),
      sv(ctx, 0.88, 0.73, 1.28),
    ],
  ]), WINDOW, "plastic", blackGlassParams);
  add(parts, "t_top_roof_frame", merge(
    partBox(ctx, vec3(0.09, 0.038, 1.22), vec3(0, 1.06, 0.08)),
    partBox(ctx, vec3(0.075, 0.04, 1.18), vec3(-0.62, 1.035, 0.08)),
    partBox(ctx, vec3(0.075, 0.04, 1.18), vec3(0.62, 1.035, 0.08)),
    partBox(ctx, vec3(1.28, 0.04, 0.075), vec3(0, 1.03, -0.48)),
    partBox(ctx, vec3(1.18, 0.038, 0.075), vec3(0, 1.0, 0.66)),
  ), PAINT, "carPaint", { color: PAINT, seed: 13 });
  add(parts, "embedded_window_trim", merge(
    partBox(ctx, vec3(0.038, 0.36, 0.06), vec3(-0.82, 0.82, -0.84), vec3(-0.36, 0, 0)),
    partBox(ctx, vec3(0.038, 0.36, 0.06), vec3(0.82, 0.82, -0.84), vec3(-0.36, 0, 0)),
    partBox(ctx, vec3(0.04, 0.34, 0.06), vec3(-0.88, 0.82, 0.36)),
    partBox(ctx, vec3(0.04, 0.34, 0.06), vec3(0.88, 0.82, 0.36)),
    partBox(ctx, vec3(0.04, 0.34, 0.07), vec3(-0.78, 0.8, 1.02), vec3(0.26, 0, 0)),
    partBox(ctx, vec3(0.04, 0.34, 0.07), vec3(0.78, 0.8, 1.02), vec3(0.26, 0, 0)),
    partBox(ctx, vec3(1.52, 0.035, 0.055), vec3(0, 0.69, -1.23)),
    partBox(ctx, vec3(1.54, 0.035, 0.055), vec3(0, 0.69, 1.56)),
  ), BLACK, "plastic", { color: BLACK, roughness: 0.08 });

  for (const side of [-1, 1] as const) {
    add(parts, `door_cut_${side}`, partBox(ctx, vec3(0.018, 0.46, 0.018), vec3(side * 1.065, 0.58, 0.02)), BLACK, "plastic", { color: BLACK, roughness: 0.42 });
    add(parts, `door_handle_${side}`, partBox(ctx, vec3(0.025, 0.055, 0.22), vec3(side * 1.075, 0.69, 0.42)), CHROME, "chrome");
    add(parts, `side_skirt_${side}`, partBox(ctx, vec3(0.08, 0.16, 3.4), vec3(side * 1.04, 0.22, 0.05)), DARK_PAINT, "carPaint", { color: DARK_PAINT, seed: 19 });
    add(parts, `mirror_${side}`, transform(sphere(0.12, 16, 10), {
      scale: ss(ctx, 0.9, 0.55, 0.65),
      translate: sv(ctx, side * 1.1, 0.86, -0.88),
    }), PAINT, "carPaint", { color: PAINT, seed: 23 });
  }

  add(parts, "hood_panel_line", partBox(ctx, vec3(1.45, 0.018, 0.035), vec3(0, 0.77, -1.45)), BLACK, "plastic", { color: BLACK, roughness: 0.35 });
  add(parts, "front_black_mouth", partBox(ctx, vec3(1.28, 0.08, 0.035), vec3(0, 0.42, -2.66)), BLACK, "plastic", { color: BLACK, roughness: 0.5 });
  add(parts, "front_lower_intake", partBox(ctx, vec3(0.86, 0.055, 0.035), vec3(0, 0.35, -2.69)), BLACK, "plastic", { color: BLACK, roughness: 0.5 });
  add(parts, "front_lip", partBox(ctx, vec3(1.45, 0.026, 0.1), vec3(0, 0.325, -2.67), vec3(-0.01, 0, 0)), BLACK, "plastic", { color: BLACK, roughness: 0.35 });

  for (const side of [-1, 1] as const) {
    add(parts, `headlight_housing_${side}`, partBox(ctx, vec3(0.48, 0.07, 0.07), vec3(side * 0.48, 0.54, -2.55), vec3(-0.08, side * 0.08, 0)), SMOKE, "glass", { tint: SMOKE, roughness: 0.16, thickness: 0.04 });
    add(parts, `headlight_green_${side}`, partBox(ctx, vec3(0.22, 0.055, 0.035), vec3(side * 0.52, 0.53, -2.6), vec3(-0.06, side * 0.06, 0)), HEADLIGHT, "glass", { tint: HEADLIGHT, roughness: 0.08, thickness: 0.03 });
    add(parts, `fog_light_${side}`, partBox(ctx, vec3(0.28, 0.06, 0.04), vec3(side * 0.58, 0.36, -2.7)), [0.78, 0.74, 0.65], "glass", { tint: [0.78, 0.74, 0.65], roughness: 0.05 });
  }

  add(parts, "rear_flat_bumper", partBox(ctx, vec3(1.82, 0.34, 0.12), vec3(0, 0.39, 2.61)), PAINT, "carPaint", { color: PAINT, seed: 30 });
  add(parts, "rear_black_tail_bar", partBox(ctx, vec3(1.62, 0.14, 0.035), vec3(0, 0.49, 2.69)), BLACK, "plastic", { color: BLACK, roughness: 0.4 });
  for (const side of [-1, 1] as const) {
    add(parts, `tail_red_${side}`, partBox(ctx, vec3(0.42, 0.09, 0.032), vec3(side * 0.45, 0.49, 2.535)), RED_LIGHT, "glass", { tint: RED_LIGHT, roughness: 0.08, thickness: 0.04 });
    add(parts, `tail_amber_${side}`, partBox(ctx, vec3(0.16, 0.07, 0.034), vec3(side * 0.74, 0.49, 2.535)), AMBER, "glass", { tint: AMBER, roughness: 0.08, thickness: 0.04 });
  }
  add(parts, "rear_plate", partBox(ctx, vec3(0.42, 0.1, 0.034), vec3(0, 0.38, 2.53)), [0.72, 0.82, 0.72], "plastic", { color: [0.72, 0.82, 0.72], roughness: 0.3 });
  add(parts, "rear_deck_lip", partBox(ctx, vec3(1.22, 0.035 * p.spoiler, 0.08), vec3(0, 0.71, 2.18), vec3(0.02, 0, 0)), PAINT, "carPaint", { color: PAINT, seed: 31 });

  const exhausts: Mesh[] = [];
  for (const x of [-0.26, 0.26]) {
    exhausts.push(transform(cylinder(0.055, 0.34 * ctx.sz, 18, true), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: sv(ctx, x, 0.19, 2.58),
    }));
  }
  add(parts, "twin_exhaust", merge(...exhausts), CHROME, "chrome");

  const frontZ = -1.82;
  const rearZ = 1.72;
  for (const side of [-1, 1] as const) {
    parts.push(...wheelSet(ctx, side, frontZ, wheelR));
    parts.push(...wheelSet(ctx, side, rearZ, wheelR));
  }

  add(parts, "front_wheel_arches", merge(
    partBox(ctx, vec3(0.08, 0.08, 0.95), vec3(-1.02, 0.48, frontZ)),
    partBox(ctx, vec3(0.08, 0.08, 0.95), vec3(1.02, 0.48, frontZ)),
  ), DARK_PAINT, "carPaint", { color: DARK_PAINT, seed: 37 });
  add(parts, "rear_wheel_arches", merge(
    partBox(ctx, vec3(0.08, 0.08, 0.95), vec3(-1.02, 0.48, rearZ)),
    partBox(ctx, vec3(0.08, 0.08, 0.95), vec3(1.02, 0.48, rearZ)),
  ), DARK_PAINT, "carPaint", { color: DARK_PAINT, seed: 41 });

  return parts.map((part) => ({
    ...part,
    mesh: transform(part.mesh, { rotate: vec3(0, Math.PI, 0) }),
  }));
}
