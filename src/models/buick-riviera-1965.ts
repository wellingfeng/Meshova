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
  bounds,
  box,
  cylinder,
  loftSurface,
  makeMesh,
  merge,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
  triangleCount,
} from "../geometry/index.js";
import { turntableSignature } from "../vision/turntable.js";

type RGB = [number, number, number];

export interface BuickRiviera1965Params {
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  rideHeight: number;
  hoodLength: number;
  deckLength: number;
  chrome: number;
  hiddenHeadlights: number;
}

export const BUICK_RIVIERA_1965_DEFAULTS: BuickRiviera1965Params = {
  length: 5.3,
  width: 1.95,
  height: 1.35,
  wheelRadius: 0.33,
  rideHeight: 0.055,
  hoodLength: 2.05,
  deckLength: 1.33,
  chrome: 1,
  hiddenHeadlights: 1,
};

interface ScaleContext {
  sx: number;
  sy: number;
  sz: number;
  y0: number;
}

interface BodySection {
  z: number;
  halfWidth: number;
  bottom: number;
  rocker: number;
  belt: number;
  shoulder: number;
  crown: number;
}

const PAINT: RGB = [0.035, 0.045, 0.056];
const PAINT_HI: RGB = [0.08, 0.095, 0.11];
const PAINT_LOW: RGB = [0.018, 0.022, 0.028];
const BLACK: RGB = [0.006, 0.006, 0.007];
const GLASS: RGB = [0.01, 0.018, 0.024];
const TIRE: RGB = [0.018, 0.017, 0.016];
const WHITEWALL: RGB = [0.93, 0.9, 0.82];
const CHROME: RGB = [0.86, 0.84, 0.78];
const WARM_CHROME: RGB = [0.72, 0.69, 0.62];
const RED: RGB = [0.82, 0.02, 0.018];
const AMBER: RGB = [0.95, 0.42, 0.08];
const LENS: RGB = [0.76, 0.72, 0.6];
const SHIELD_RED: RGB = [0.75, 0.02, 0.018];
const SHIELD_BLUE: RGB = [0.02, 0.12, 0.58];
const SHIELD_SILVER: RGB = [0.8, 0.8, 0.76];

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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rangeScore(v: number, min: number, max: number): number {
  if (v >= min && v <= max) return 1;
  const span = Math.max(1e-6, max - min);
  return v < min ? clamp01(1 - (min - v) / span) : clamp01(1 - (v - max) / span);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sv(ctx: ScaleContext, x: number, y: number, z: number): Vec3 {
  return vec3(x * ctx.sx, y * ctx.sy + ctx.y0, z * ctx.sz);
}

function ss(ctx: ScaleContext, x: number, y: number, z: number): Vec3 {
  return vec3(x * ctx.sx, y * ctx.sy, z * ctx.sz);
}

function partBox(ctx: ScaleContext, size: Vec3, pos: Vec3, rot = vec3(0, 0, 0)): Mesh {
  return transform(box(size.x * ctx.sx, size.y * ctx.sy, size.z * ctx.sz), {
    rotate: rot,
    translate: sv(ctx, pos.x, pos.y, pos.z),
  });
}

function partSphere(ctx: ScaleContext, radius: number, pos: Vec3, scale = vec3(1, 1, 1)): Mesh {
  return transform(sphere(radius, 24, 16), {
    scale: ss(ctx, scale.x, scale.y, scale.z),
    translate: sv(ctx, pos.x, pos.y, pos.z),
  });
}

function ringFromSection(ctx: ScaleContext, s: BodySection): Vec3[] {
  return [
    sv(ctx, -s.halfWidth * 0.72, s.bottom, s.z),
    sv(ctx, -s.halfWidth, s.rocker, s.z),
    sv(ctx, -s.halfWidth, s.belt, s.z),
    sv(ctx, -s.halfWidth * 0.88, s.shoulder, s.z),
    sv(ctx, 0, s.crown, s.z),
    sv(ctx, s.halfWidth * 0.88, s.shoulder, s.z),
    sv(ctx, s.halfWidth, s.belt, s.z),
    sv(ctx, s.halfWidth, s.rocker, s.z),
    sv(ctx, s.halfWidth * 0.72, s.bottom, s.z),
  ];
}

function loftSections(ctx: ScaleContext, sections: BodySection[]): Mesh {
  return loftSurface(sections.map((section) => ringFromSection(ctx, section)), {
    longitudinalSubdivisions: 5,
    crossSectionSubdivisions: 3,
  });
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

function makeBodyShell(ctx: ScaleContext): Mesh {
  return loftSections(ctx, [
    { z: -2.65, halfWidth: 0.62, bottom: 0.2, rocker: 0.34, belt: 0.58, shoulder: 0.64, crown: 0.66 },
    { z: -2.24, halfWidth: 0.9, bottom: 0.19, rocker: 0.35, belt: 0.7, shoulder: 0.78, crown: 0.8 },
    { z: -1.55, halfWidth: 1.0, bottom: 0.18, rocker: 0.36, belt: 0.76, shoulder: 0.86, crown: 0.88 },
    { z: -0.65, halfWidth: 1.03, bottom: 0.17, rocker: 0.36, belt: 0.78, shoulder: 0.89, crown: 0.91 },
    { z: 0.45, halfWidth: 1.02, bottom: 0.17, rocker: 0.36, belt: 0.77, shoulder: 0.86, crown: 0.88 },
    { z: 1.45, halfWidth: 1.0, bottom: 0.18, rocker: 0.36, belt: 0.72, shoulder: 0.78, crown: 0.8 },
    { z: 2.2, halfWidth: 0.95, bottom: 0.2, rocker: 0.35, belt: 0.62, shoulder: 0.67, crown: 0.69 },
    { z: 2.62, halfWidth: 0.78, bottom: 0.22, rocker: 0.35, belt: 0.52, shoulder: 0.56, crown: 0.58 },
  ]);
}

function makeHood(ctx: ScaleContext, hoodLength: number): Mesh {
  const front = -2.55;
  const rear = Math.min(-0.78, front + hoodLength);
  return loftSections(ctx, [
    { z: front, halfWidth: 0.74, bottom: 0.6, rocker: 0.62, belt: 0.72, shoulder: 0.77, crown: 0.8 },
    { z: -2.05, halfWidth: 0.94, bottom: 0.62, rocker: 0.66, belt: 0.79, shoulder: 0.86, crown: 0.9 },
    { z: -1.35, halfWidth: 0.99, bottom: 0.67, rocker: 0.7, belt: 0.86, shoulder: 0.94, crown: 0.98 },
    { z: rear, halfWidth: 0.9, bottom: 0.74, rocker: 0.77, belt: 0.9, shoulder: 0.98, crown: 1.02 },
  ]);
}

function makeDeck(ctx: ScaleContext, deckLength: number): Mesh {
  const rear = 2.56;
  const front = Math.max(0.92, rear - deckLength);
  return loftSections(ctx, [
    { z: front, halfWidth: 0.92, bottom: 0.66, rocker: 0.69, belt: 0.75, shoulder: 0.82, crown: 0.86 },
    { z: 1.78, halfWidth: 0.95, bottom: 0.58, rocker: 0.62, belt: 0.7, shoulder: 0.76, crown: 0.79 },
    { z: rear, halfWidth: 0.76, bottom: 0.46, rocker: 0.5, belt: 0.58, shoulder: 0.62, crown: 0.64 },
  ]);
}

function makeHardtopGlass(ctx: ScaleContext): Mesh {
  return quadStrip([
    [
      sv(ctx, -0.75, 0.89, -0.68),
      sv(ctx, 0.75, 0.89, -0.68),
      sv(ctx, 0.6, 1.18, -0.22),
      sv(ctx, -0.6, 1.18, -0.22),
    ],
    [
      sv(ctx, -0.6, 1.17, 0.72),
      sv(ctx, 0.6, 1.17, 0.72),
      sv(ctx, 0.78, 0.86, 1.14),
      sv(ctx, -0.78, 0.86, 1.14),
    ],
    [
      sv(ctx, -0.84, 0.86, -0.42),
      sv(ctx, -0.64, 1.16, -0.18),
      sv(ctx, -0.64, 1.16, 0.72),
      sv(ctx, -0.87, 0.85, 0.98),
    ],
    [
      sv(ctx, 0.64, 1.16, -0.18),
      sv(ctx, 0.84, 0.86, -0.42),
      sv(ctx, 0.87, 0.85, 0.98),
      sv(ctx, 0.64, 1.16, 0.72),
    ],
  ]);
}

function makeHardtopFrame(ctx: ScaleContext): Mesh {
  return merge(
    partBox(ctx, vec3(1.24, 0.045, 1.0), vec3(0, 1.225, 0.28)),
    partBox(ctx, vec3(1.28, 0.052, 0.075), vec3(0, 1.08, -0.43), vec3(-0.58, 0, 0)),
    partBox(ctx, vec3(1.26, 0.05, 0.08), vec3(0, 1.03, 0.95), vec3(0.56, 0, 0)),
    partBox(ctx, vec3(0.055, 0.52, 0.065), vec3(-0.79, 0.98, -0.45), vec3(-0.42, 0, 0)),
    partBox(ctx, vec3(0.055, 0.52, 0.065), vec3(0.79, 0.98, -0.45), vec3(-0.42, 0, 0)),
    partBox(ctx, vec3(0.075, 0.54, 0.08), vec3(-0.83, 0.98, 0.98), vec3(0.4, 0, 0)),
    partBox(ctx, vec3(0.075, 0.54, 0.08), vec3(0.83, 0.98, 0.98), vec3(0.4, 0, 0)),
  );
}

function wheelSet(ctx: ScaleContext, side: -1 | 1, z: number, radius: number): NamedPart[] {
  const parts: NamedPart[] = [];
  const xOuter = side * 1.0 * ctx.sx;
  const center = sv(ctx, side * 0.95, 0.33, z);
  const tire = transform(torus(radius, radius * 0.2, 52, 14), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: center,
  });
  add(parts, `tire_${side}_${z}`, tire, TIRE, "rubber", { color: TIRE, roughness: 0.84 });

  const whitewall = transform(torus(radius * 0.72, radius * 0.04, 48, 8), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.075, center.y, center.z),
  });
  add(parts, `whitewall_${side}_${z}`, whitewall, WHITEWALL, "rubber", { color: WHITEWALL, roughness: 0.62 });

  const hubcap = transform(cylinder(radius * 0.6, 0.07 * ctx.sx, 40, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.088, center.y, center.z),
  });
  add(parts, `chrome_hubcap_${side}_${z}`, hubcap, CHROME, "chrome");

  const spinner = transform(cylinder(radius * 0.18, 0.09 * ctx.sx, 24, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.13, center.y, center.z),
  });
  add(parts, `spinner_cap_${side}_${z}`, spinner, WARM_CHROME, "chrome");

  const fins: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dy = Math.cos(a) * radius * 0.26;
    const dz = Math.sin(a) * radius * 0.26;
    fins.push(
      transform(box(0.032 * ctx.sx, radius * 0.42, 0.026 * ctx.sz), {
        rotate: vec3(a, 0, 0),
        translate: vec3(xOuter + side * 0.145, center.y + dy, center.z + dz),
      }),
    );
  }
  add(parts, `radial_hubcap_fins_${side}_${z}`, merge(...fins), CHROME, "chrome");
  return parts;
}

function frontClamshell(ctx: ScaleContext, side: -1 | 1, closed: number): Mesh {
  const y = 0.62 + closed * 0.06;
  return merge(
    partBox(ctx, vec3(0.28, 0.28, 0.04), vec3(side * 0.6, y, -2.67), vec3(-0.04, side * 0.08, 0)),
    partBox(ctx, vec3(0.028, 0.24, 0.045), vec3(side * 0.48, y, -2.69)),
    partBox(ctx, vec3(0.028, 0.24, 0.045), vec3(side * 0.6, y, -2.695)),
    partBox(ctx, vec3(0.028, 0.24, 0.045), vec3(side * 0.72, y, -2.69)),
  );
}

function trishield(ctx: ScaleContext, z: number, y: number): Mesh {
  return merge(
    partBox(ctx, vec3(0.035, 0.12, 0.018), vec3(-0.045, y, z), vec3(0, 0, -0.18)),
    partBox(ctx, vec3(0.035, 0.12, 0.018), vec3(0, y, z), vec3(0, 0, -0.18)),
    partBox(ctx, vec3(0.035, 0.12, 0.018), vec3(0.045, y, z), vec3(0, 0, -0.18)),
  );
}

function combinedBounds(parts: NamedPart[]): { min: Vec3; max: Vec3 } {
  if (parts.length === 0) return { min: vec3(0, 0, 0), max: vec3(0, 0, 0) };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    const b = bounds(part.mesh);
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    minZ = Math.min(minZ, b.min.z);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
    maxZ = Math.max(maxZ, b.max.z);
  }
  return { min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ) };
}

function dim(b: { min: Vec3; max: Vec3 }): { x: number; y: number; z: number } {
  return {
    x: Math.max(1e-6, b.max.x - b.min.x),
    y: Math.max(1e-6, b.max.y - b.min.y),
    z: Math.max(1e-6, b.max.z - b.min.z),
  };
}

function center(b: { min: Vec3; max: Vec3 }): Vec3 {
  return vec3((b.min.x + b.max.x) * 0.5, (b.min.y + b.max.y) * 0.5, (b.min.z + b.max.z) * 0.5);
}

function oneNamed(parts: NamedPart[], name: string): NamedPart | undefined {
  return parts.find((part) => part.name === name);
}

function countNamed(parts: NamedPart[], pattern: RegExp): number {
  return parts.filter((part) => pattern.test(part.name)).length;
}

function ratioOrZero(a: number, b: number): number {
  return b > 1e-6 ? a / b : 0;
}

export function buildBuickRiviera1965Parts(params: Partial<BuickRiviera1965Params> = {}): NamedPart[] {
  const p = { ...BUICK_RIVIERA_1965_DEFAULTS, ...params };
  const ctx: ScaleContext = {
    sx: p.width / BUICK_RIVIERA_1965_DEFAULTS.width,
    sy: p.height / BUICK_RIVIERA_1965_DEFAULTS.height,
    sz: p.length / BUICK_RIVIERA_1965_DEFAULTS.length,
    y0: p.rideHeight,
  };
  const parts: NamedPart[] = [];
  const frontZ = -1.54;
  const rearZ = 1.43;
  const chromeOn = clamp01(p.chrome);
  const headlightClosed = clamp01(p.hiddenHeadlights);

  add(parts, "razor_edge_lower_body", makeBodyShell(ctx), PAINT, "carPaint", { color: PAINT, seed: 650 });
  add(parts, "long_hood_spear", makeHood(ctx, p.hoodLength), PAINT_HI, "carPaint", { color: PAINT_HI, seed: 651 });
  add(parts, "short_rear_deck", makeDeck(ctx, p.deckLength), PAINT_LOW, "carPaint", { color: PAINT_LOW, seed: 652 });
  add(parts, "hardtop_roof_frame", makeHardtopFrame(ctx), PAINT, "carPaint", { color: PAINT, seed: 653 });
  add(parts, "pillarless_greenhouse_glass", makeHardtopGlass(ctx), GLASS, "glass", { tint: GLASS, roughness: 0.055, thickness: 0.08 });

  add(parts, "hood_center_crease", partBox(ctx, vec3(0.045, 0.035, 1.72), vec3(0, 1.0, -1.66), vec3(-0.035, 0, 0)), PAINT_LOW, "carPaint", { color: PAINT_LOW, seed: 654 });
  add(parts, "razor_roof_edge", merge(
    partBox(ctx, vec3(1.24, 0.03, 0.055), vec3(0, 1.245, -0.2)),
    partBox(ctx, vec3(1.22, 0.03, 0.055), vec3(0, 1.225, 0.82)),
  ), CHROME, "chrome");

  add(parts, "front_center_grille", merge(
    partBox(ctx, vec3(0.46, 0.3, 0.045), vec3(0, 0.58, -2.68)),
    ...[-2, -1, 0, 1, 2].map((i) => partBox(ctx, vec3(0.026, 0.26, 0.05), vec3(i * 0.075, 0.58, -2.71))),
  ), BLACK, "plastic", { color: BLACK, roughness: 0.32 });

  for (const side of [-1, 1] as const) {
    add(parts, `ribbed_clamshell_headlight_${side}`, frontClamshell(ctx, side, headlightClosed), PAINT, "carPaint", { color: PAINT, seed: 655 + side });
    if (headlightClosed < 0.5) {
      add(parts, `hidden_quad_headlight_lens_${side}`, partBox(ctx, vec3(0.2, 0.12, 0.018), vec3(side * 0.6, 0.56, -2.715)), LENS, "glass", { tint: LENS, roughness: 0.04 });
    } else {
      add(parts, `hidden_headlight_shadow_${side}`, partBox(ctx, vec3(0.18, 0.08, 0.016), vec3(side * 0.6, 0.56, -2.716)), BLACK, "plastic", { color: BLACK, roughness: 0.4 });
    }
    add(parts, `front_marker_${side}`, partBox(ctx, vec3(0.075, 0.12, 0.024), vec3(side * 0.89, 0.52, -2.69)), AMBER, "glass", { tint: AMBER, roughness: 0.06 });
    add(parts, `front_fender_knife_edge_${side}`, partBox(ctx, vec3(0.042, 0.48, 0.08), vec3(side * 1.02, 0.64, -2.2), vec3(0, side * 0.1, 0)), CHROME, "chrome");
    add(parts, `side_blade_crease_${side}`, partBox(ctx, vec3(0.028, 0.045, 3.86), vec3(side * 1.025, 0.72, 0.05)), CHROME, "chrome");
    add(parts, `lower_rocker_chrome_${side}`, partBox(ctx, vec3(0.05, 0.08, 4.28), vec3(side * 1.0, 0.3, 0.08)), WARM_CHROME, "chrome");
    add(parts, `ribbed_rocker_panel_${side}`, merge(
      ...[-3, -2, -1, 0, 1, 2, 3].map((i) => partBox(ctx, vec3(0.026, 0.045, 0.32), vec3(side * 1.035, 0.36, i * 0.42)))
    ), CHROME, "chrome");
    add(parts, `door_cutline_${side}`, partBox(ctx, vec3(0.018, 0.52, 0.02), vec3(side * 1.05, 0.62, -0.08)), BLACK, "plastic", { color: BLACK, roughness: 0.42 });
    add(parts, `door_handle_${side}`, partBox(ctx, vec3(0.03, 0.05, 0.23), vec3(side * 1.055, 0.74, 0.38)), CHROME, "chrome");
    add(parts, `round_mirror_${side}`, partSphere(ctx, 0.09, vec3(side * 1.06, 0.94, -0.74), vec3(1.1, 0.78, 0.8)), CHROME, "chrome");
    add(parts, `rear_fin_edge_${side}`, partBox(ctx, vec3(0.036, 0.28, 0.78), vec3(side * 0.94, 0.68, 2.02), vec3(0.08, side * 0.08, 0)), CHROME, "chrome");
    add(parts, `rear_bumper_tail_lens_${side}`, partBox(ctx, vec3(0.52, 0.08, 0.032), vec3(side * 0.42, 0.42, 2.66)), RED, "glass", { tint: RED, roughness: 0.07 });
  }

  add(parts, "front_chrome_bumper", merge(
    partBox(ctx, vec3(1.86, 0.12, 0.09), vec3(0, 0.38, -2.72)),
    partBox(ctx, vec3(1.38, 0.06, 0.08), vec3(0, 0.3, -2.79)),
  ), CHROME, "chrome");
  add(parts, "rear_one_piece_chrome_bumper", merge(
    partBox(ctx, vec3(1.78, 0.15, 0.12), vec3(0, 0.39, 2.64)),
    partBox(ctx, vec3(1.28, 0.08, 0.09), vec3(0, 0.3, 2.73)),
  ), CHROME, "chrome");
  add(parts, "front_buick_trishield_badge", trishield(ctx, -2.74, 0.74), SHIELD_SILVER, "chrome");
  add(parts, "trishield_red_insert", partBox(ctx, vec3(0.025, 0.09, 0.02), vec3(-0.045, 0.74, -2.765), vec3(0, 0, -0.18)), SHIELD_RED, "plastic", { color: SHIELD_RED });
  add(parts, "trishield_blue_insert", partBox(ctx, vec3(0.025, 0.09, 0.02), vec3(0.045, 0.74, -2.765), vec3(0, 0, -0.18)), SHIELD_BLUE, "plastic", { color: SHIELD_BLUE });
  add(parts, "rear_buick_trishield_badge", trishield(ctx, 2.68, 0.62), SHIELD_SILVER, "chrome");

  for (const side of [-1, 1] as const) {
    parts.push(...wheelSet(ctx, side, frontZ, p.wheelRadius));
    parts.push(...wheelSet(ctx, side, rearZ, p.wheelRadius));
  }

  add(parts, "front_wheel_knife_arches", merge(
    partBox(ctx, vec3(0.052, 0.08, 0.84), vec3(-0.97, 0.52, frontZ)),
    partBox(ctx, vec3(0.052, 0.08, 0.84), vec3(0.97, 0.52, frontZ)),
  ), CHROME, "chrome");
  add(parts, "rear_wheel_knife_arches", merge(
    partBox(ctx, vec3(0.052, 0.08, 0.84), vec3(-0.97, 0.52, rearZ)),
    partBox(ctx, vec3(0.052, 0.08, 0.84), vec3(0.97, 0.52, rearZ)),
  ), CHROME, "chrome");

  add(parts, "underbody_shadow_frame", merge(
    partBox(ctx, vec3(0.1, 0.08, 3.86), vec3(-0.46, 0.18, 0.0)),
    partBox(ctx, vec3(0.1, 0.08, 3.86), vec3(0.46, 0.18, 0.0)),
    partBox(ctx, vec3(1.08, 0.055, 0.08), vec3(0, 0.18, -1.2)),
    partBox(ctx, vec3(1.08, 0.055, 0.08), vec3(0, 0.18, 1.15)),
  ), BLACK, "metal", { color: BLACK, roughness: 0.65 });
  add(parts, "dual_chrome_exhaust_tips", merge(
    transform(cylinder(0.045, 0.32 * ctx.sz, 18, true), { rotate: vec3(Math.PI / 2, 0, 0), translate: sv(ctx, -0.28, 0.2, 2.72) }),
    transform(cylinder(0.045, 0.32 * ctx.sz, 18, true), { rotate: vec3(Math.PI / 2, 0, 0), translate: sv(ctx, 0.28, 0.2, 2.72) }),
  ), CHROME, "chrome");

  if (chromeOn < 0.5) {
    return parts.map((part) => ({
      ...part,
      mesh: transform(part.mesh, { rotate: vec3(0, Math.PI, 0) }),
    }));
  }

  add(parts, "thin_window_chrome_surround", merge(
    partBox(ctx, vec3(0.035, 0.04, 1.42), vec3(-0.88, 0.91, 0.25)),
    partBox(ctx, vec3(0.035, 0.04, 1.42), vec3(0.88, 0.91, 0.25)),
    partBox(ctx, vec3(1.55, 0.035, 0.04), vec3(0, 0.86, -0.46)),
    partBox(ctx, vec3(1.58, 0.035, 0.04), vec3(0, 0.86, 1.05)),
  ), CHROME, "chrome");

  return parts.map((part) => ({
    ...part,
    mesh: transform(part.mesh, { rotate: vec3(0, Math.PI, 0) }),
  }));
}

export interface ClassicCoupeVehicleScore {
  score: number;
  metrics: {
    requiredParts: number;
    proportions: number;
    coupeLayout: number;
    wheelSystem: number;
    brandSignature: number;
    vehicleSemantics: number;
    detail: number;
    solidity: number;
  };
  measurements: {
    lengthToWidth: number;
    widthToHeight: number;
    wheelbaseRatio: number;
    wheelRadiusRatio: number;
    hoodRatio: number;
    cabinRatio: number;
    deckRatio: number;
    glassHeightRatio: number;
  };
  feedback: string;
}

/**
 * Reference-free gate for first-gen personal-luxury coupe attempts.
 * It catches category failure: wrong stance, four-door/pickup layout,
 * missing hardtop glass, missing chrome/whitewall/clamshell cues.
 */
export function scoreClassicCoupeVehicle(parts: NamedPart[]): ClassicCoupeVehicleScore {
  const byName = new Map(parts.map((part) => [part.name, part]));
  const required = [
    "razor_edge_lower_body", "long_hood_spear", "short_rear_deck",
    "hardtop_roof_frame", "pillarless_greenhouse_glass",
    "front_center_grille", "front_chrome_bumper", "rear_one_piece_chrome_bumper",
    "front_buick_trishield_badge", "underbody_shadow_frame",
  ];
  const requiredParts = required.filter((name) => byName.has(name)).length / required.length;

  const allBounds = combinedBounds(parts);
  const allD = dim(allBounds);
  const lengthToWidth = ratioOrZero(allD.z, allD.x);
  const widthToHeight = ratioOrZero(allD.x, allD.y);

  const tireParts = parts.filter((part) => /^tire_/.test(part.name));
  const tireCenters = tireParts.map((part) => center(bounds(part.mesh)));
  const tireB = combinedBounds(tireParts);
  const tireD = dim(tireB);
  const wheelbase = tireCenters.length > 0
    ? Math.max(...tireCenters.map((p) => p.z)) - Math.min(...tireCenters.map((p) => p.z))
    : 0;
  const track = tireCenters.length > 0
    ? Math.max(...tireCenters.map((p) => p.x)) - Math.min(...tireCenters.map((p) => p.x))
    : 0;
  const wheelbaseRatio = ratioOrZero(wheelbase, allD.z);
  const wheelRadiusRatio = ratioOrZero(tireD.y * 0.5, allD.y);
  const trackRatio = ratioOrZero(track, allD.x);

  const proportions = average([
    rangeScore(lengthToWidth, 2.45, 2.95),
    rangeScore(widthToHeight, 1.25, 1.62),
    rangeScore(wheelbaseRatio, 0.5, 0.62),
    rangeScore(wheelRadiusRatio, 0.18, 0.27),
    rangeScore(trackRatio, 0.74, 0.95),
  ]);

  const hoodD = dim(oneNamed(parts, "long_hood_spear") ? bounds(oneNamed(parts, "long_hood_spear")!.mesh) : combinedBounds([]));
  const cabinD = dim(oneNamed(parts, "pillarless_greenhouse_glass") ? bounds(oneNamed(parts, "pillarless_greenhouse_glass")!.mesh) : combinedBounds([]));
  const deckD = dim(oneNamed(parts, "short_rear_deck") ? bounds(oneNamed(parts, "short_rear_deck")!.mesh) : combinedBounds([]));
  const glassB = oneNamed(parts, "pillarless_greenhouse_glass") ? bounds(oneNamed(parts, "pillarless_greenhouse_glass")!.mesh) : combinedBounds([]);
  const glassD = dim(glassB);
  const hoodRatio = ratioOrZero(hoodD.z, allD.z);
  const cabinRatio = ratioOrZero(cabinD.z, allD.z);
  const deckRatio = ratioOrZero(deckD.z, allD.z);
  const glassHeightRatio = ratioOrZero(glassD.y, allD.y);
  const glassHigh = rangeScore(ratioOrZero(glassB.min.y - allBounds.min.y, allD.y), 0.42, 0.68);
  const coupeLayout = average([
    rangeScore(hoodRatio, 0.28, 0.42),
    rangeScore(cabinRatio, 0.2, 0.34),
    rangeScore(deckRatio, 0.18, 0.32),
    rangeScore(glassHeightRatio, 0.16, 0.32),
    glassHigh,
    countNamed(parts, /^door_cutline_/) === 2 ? 1 : 0,
    countNamed(parts, /^door_handle_/) === 2 ? 1 : 0,
  ]);

  const wheelSystem = average([
    clamp01(countNamed(parts, /^tire_/) / 4),
    clamp01(countNamed(parts, /^whitewall_/) / 4),
    clamp01(countNamed(parts, /^chrome_hubcap_/) / 4),
    clamp01(countNamed(parts, /^spinner_cap_/) / 4),
    rangeScore(wheelbaseRatio, 0.5, 0.62),
    rangeScore(wheelRadiusRatio, 0.18, 0.27),
  ]);

  const brandSignature = average([
    byName.has("front_buick_trishield_badge") ? 1 : 0,
    byName.has("rear_buick_trishield_badge") ? 1 : 0,
    countNamed(parts, /^ribbed_clamshell_headlight_/) >= 2 ? 1 : 0,
    countNamed(parts, /^front_fender_knife_edge_/) >= 2 ? 1 : 0,
    countNamed(parts, /^side_blade_crease_/) >= 2 ? 1 : 0,
    countNamed(parts, /^lower_rocker_chrome_/) >= 2 ? 1 : 0,
    byName.has("thin_window_chrome_surround") ? 1 : 0,
  ]);

  const paintParts = parts.filter((part) => /(body|hood|deck|roof|clamshell)/.test(part.name));
  const paintGood = paintParts.filter((part) => part.surface?.type === "carPaint").length / Math.max(1, paintParts.length);
  const tireGood = tireParts.filter((part) => part.surface?.type === "rubber").length / Math.max(1, tireParts.length);
  const glassLike = parts.filter((part) => /(glass|lens|marker)/.test(part.name));
  const glassGood = glassLike.filter((part) => part.surface?.type === "glass").length / Math.max(1, glassLike.length);
  const chromeLike = parts.filter((part) =>
    /(front_chrome_bumper|rear_one_piece_chrome_bumper|side_blade_crease|lower_rocker_chrome|chrome_hubcap|spinner_cap|buick_trishield_badge|thin_window_chrome_surround|front_fender_knife_edge|rear_fin_edge|wheel_knife_arches)/.test(part.name)
  );
  const chromeGood = chromeLike.filter((part) => part.surface?.type === "chrome").length / Math.max(1, chromeLike.length);
  const vehicleSemantics = paintGood * 0.3 + tireGood * 0.2 + glassGood * 0.2 + chromeGood * 0.3;

  const tris = parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0);
  const detailPatterns = [
    /^round_mirror_/, /^door_handle_/, /^rear_bumper_tail_lens_/, /^front_marker_/,
    /^radial_hubcap_fins_/, /^ribbed_rocker_panel_/, /^dual_chrome_exhaust_tips$/,
    /^front_wheel_knife_arches$/, /^rear_wheel_knife_arches$/,
  ];
  const detailCoverage = detailPatterns.reduce((sum, pattern) => sum + (countNamed(parts, pattern) > 0 ? 1 : 0), 0) / detailPatterns.length;
  const detail = clamp01(parts.length / 46) * 0.35 + clamp01(tris / 6500) * 0.4 + detailCoverage * 0.25;

  const sig = turntableSignature(parts.map((part) => part.mesh), { views: 8, gridSize: 48 });
  const solidity = clamp01((sig.solidity - 0.08) / 0.22);

  const metrics = {
    requiredParts,
    proportions,
    coupeLayout,
    wheelSystem,
    brandSignature,
    vehicleSemantics,
    detail,
    solidity,
  };
  const score = clamp01(
    metrics.requiredParts * 0.13 +
      metrics.proportions * 0.23 +
      metrics.coupeLayout * 0.21 +
      metrics.wheelSystem * 0.12 +
      metrics.brandSignature * 0.12 +
      metrics.vehicleSemantics * 0.1 +
      metrics.detail * 0.04 +
      metrics.solidity * 0.05,
  );

  const tips: string[] = [];
  if (metrics.requiredParts < 1) tips.push("missing required coupe parts");
  if (metrics.proportions < 0.84) tips.push("fix long-low coupe proportions, wheelbase, tire radius, track");
  if (metrics.coupeLayout < 0.82) tips.push("fix long hood, short deck, two-door hardtop glass before detail");
  if (metrics.wheelSystem < 0.88) tips.push("add four complete whitewall wheels with chrome hubcaps");
  if (metrics.brandSignature < 0.86) tips.push("add Riviera cues: clamshell lamps, knife-edge bodyline, chrome rocker, tri-shield");
  if (metrics.vehicleSemantics < 0.9) tips.push("use carPaint, chrome, rubber, glass surfaces consistently");
  if (metrics.solidity < 0.55) tips.push("turntable silhouette collapses from some views");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Classic coupe vehicle gate passed.`;

  return {
    score,
    metrics,
    measurements: {
      lengthToWidth,
      widthToHeight,
      wheelbaseRatio,
      wheelRadiusRatio,
      hoodRatio,
      cabinRatio,
      deckRatio,
      glassHeightRatio,
    },
    feedback,
  };
}
