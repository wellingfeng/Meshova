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
  bounds,
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

export interface GmcCanyonAt4xParams {
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  rideHeight: number;
  bedLength: number;
  armor: number;
  tireTread: number;
  suspensionLift: number;
}

export const GMC_CANYON_AT4X_DEFAULTS: GmcCanyonAt4xParams = {
  length: 5.85,
  width: 2.18,
  height: 1.92,
  wheelRadius: 0.39,
  rideHeight: 0.08,
  bedLength: 1.48,
  armor: 1,
  tireTread: 1,
  suspensionLift: 0.08,
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
  lower: number;
  belt: number;
  top: number;
  crown: number;
}

const PAINT: RGB = [0.48, 0.045, 0.028];
const PAINT_DARK: RGB = [0.27, 0.018, 0.014];
const BLACK: RGB = [0.01, 0.011, 0.012];
const MATTE_BLACK: RGB = [0.025, 0.026, 0.028];
const TIRE: RGB = [0.015, 0.015, 0.016];
const DARK_GLASS: RGB = [0.006, 0.011, 0.015];
const LED: RGB = [0.86, 0.96, 0.9];
const AMBER: RGB = [1, 0.44, 0.08];
const RED: RGB = [0.9, 0.02, 0.015];
const STEEL: RGB = [0.45, 0.47, 0.48];
const SKID: RGB = [0.72, 0.7, 0.64];
const GMC_RED: RGB = [0.92, 0.02, 0.02];

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
    sv(ctx, -s.halfWidth * 0.76, s.bottom, s.z),
    sv(ctx, -s.halfWidth, s.lower, s.z),
    sv(ctx, -s.halfWidth, s.belt, s.z),
    sv(ctx, -s.halfWidth * 0.68, s.top, s.z),
    sv(ctx, 0, s.crown, s.z),
    sv(ctx, s.halfWidth * 0.68, s.top, s.z),
    sv(ctx, s.halfWidth, s.belt, s.z),
    sv(ctx, s.halfWidth, s.lower, s.z),
    sv(ctx, s.halfWidth * 0.76, s.bottom, s.z),
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

function frontLetterBar(ctx: ScaleContext, x: number, y: number, w: number, h: number, rot = 0): Mesh {
  return partBox(ctx, vec3(w, h, 0.024), vec3(x, y, -2.985), vec3(0, 0, rot));
}

function gmcBadge(ctx: ScaleContext): Mesh {
  const bars: Mesh[] = [];
  const g = -0.2;
  bars.push(
    frontLetterBar(ctx, g, 0.96, 0.13, 0.026),
    frontLetterBar(ctx, g, 0.86, 0.13, 0.026),
    frontLetterBar(ctx, g - 0.055, 0.91, 0.026, 0.13),
    frontLetterBar(ctx, g + 0.045, 0.875, 0.026, 0.07),
    frontLetterBar(ctx, g + 0.02, 0.91, 0.07, 0.024),
  );

  const m = 0;
  bars.push(
    frontLetterBar(ctx, m - 0.07, 0.91, 0.026, 0.13),
    frontLetterBar(ctx, m + 0.07, 0.91, 0.026, 0.13),
    frontLetterBar(ctx, m - 0.026, 0.935, 0.025, 0.09, -0.45),
    frontLetterBar(ctx, m + 0.026, 0.935, 0.025, 0.09, 0.45),
  );

  const c = 0.2;
  bars.push(
    frontLetterBar(ctx, c, 0.96, 0.13, 0.026),
    frontLetterBar(ctx, c, 0.86, 0.13, 0.026),
    frontLetterBar(ctx, c - 0.055, 0.91, 0.026, 0.13),
  );
  return merge(...bars);
}

function cLamp(ctx: ScaleContext, side: -1 | 1): Mesh {
  const x = side * 0.8;
  return merge(
    partBox(ctx, vec3(0.055, 0.32, 0.025), vec3(x, 0.88, -2.99)),
    partBox(ctx, vec3(0.22, 0.055, 0.025), vec3(x - side * 0.075, 1.015, -2.995)),
    partBox(ctx, vec3(0.2, 0.052, 0.025), vec3(x - side * 0.085, 0.74, -2.995)),
  );
}

function grilleMesh(ctx: ScaleContext): Mesh {
  const bars: Mesh[] = [partBox(ctx, vec3(1.35, 0.58, 0.05), vec3(0, 0.88, -2.97))];
  for (let i = -2; i <= 2; i++) {
    bars.push(partBox(ctx, vec3(0.045, 0.52, 0.035), vec3(i * 0.21, 0.88, -3.0)));
  }
  for (const y of [0.72, 0.88, 1.04]) {
    bars.push(partBox(ctx, vec3(1.25, 0.03, 0.036), vec3(0, y, -3.005)));
  }
  return merge(...bars);
}

function wheelSet(ctx: ScaleContext, side: -1 | 1, z: number, radius: number, treadStrength: number): NamedPart[] {
  const parts: NamedPart[] = [];
  const center = sv(ctx, side * 1.08, 0.53, z);
  const xOuter = side * 1.13 * ctx.sx;

  const tire = transform(torus(radius, radius * 0.28, 52, 16), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: center,
  });
  add(parts, `tire_${side}_${z}`, tire, TIRE, "rubber", { color: TIRE, roughness: 0.82 });

  const tread: Mesh[] = [];
  const blocks = 20;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    const cy = center.y + Math.cos(a) * radius;
    const cz = center.z + Math.sin(a) * radius;
    tread.push(
      transform(box(0.2 * ctx.sx, radius * 0.13 * treadStrength, radius * 0.16), {
        rotate: vec3(a, 0, 0),
        translate: vec3(xOuter, cy, cz),
      }),
    );
  }
  add(parts, `tread_blocks_${side}_${z}`, merge(...tread), MATTE_BLACK, "rubber", { color: MATTE_BLACK, roughness: 0.9 });

  const rim = transform(cylinder(radius * 0.56, 0.12 * ctx.sx, 36, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.04, center.y, center.z),
  });
  add(parts, `beadlock_rim_${side}_${z}`, rim, STEEL, "brushedMetal", { color: STEEL });

  const hub = transform(cylinder(radius * 0.19, 0.135 * ctx.sx, 24, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(xOuter + side * 0.035, center.y, center.z),
  });
  add(parts, `hub_${side}_${z}`, hub, BLACK, "plastic", { color: BLACK, roughness: 0.35 });

  const spokes: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dy = Math.cos(a) * radius * 0.25;
    const dz = Math.sin(a) * radius * 0.25;
    spokes.push(
      transform(box(0.045 * ctx.sx, radius * 0.5, 0.045), {
        rotate: vec3(a, 0, 0),
        translate: vec3(xOuter + side * 0.07, center.y + dy, center.z + dz),
      }),
    );
  }
  add(parts, `six_spoke_${side}_${z}`, merge(...spokes), SKID, "brushedMetal", { color: SKID });
  return parts;
}

function wheelFlares(ctx: ScaleContext, frontZ: number, rearZ: number): Mesh {
  const meshes: Mesh[] = [];
  for (const side of [-1, 1] as const) {
    for (const z of [frontZ, rearZ]) {
      meshes.push(
        transform(torus(0.55, 0.045, 36, 8), {
          rotate: vec3(0, 0, Math.PI / 2),
          scale: vec3(0.5, 1, 1.08),
          translate: sv(ctx, side * 1.08, 0.58, z),
        }),
      );
      meshes.push(partBox(ctx, vec3(0.12, 0.16, 0.92), vec3(side * 1.1, 0.49, z)));
    }
  }
  return merge(...meshes);
}

function makeBodyShell(ctx: ScaleContext, bedLength: number): Mesh {
  const bedEnd = 2.9;
  const bedStart = Math.max(0.62, bedEnd - bedLength);
  return loftSections(ctx, [
    { z: -2.9, halfWidth: 0.82, bottom: 0.48, lower: 0.56, belt: 1.03, top: 1.1, crown: 1.12 },
    { z: -2.45, halfWidth: 1.06, bottom: 0.47, lower: 0.58, belt: 1.07, top: 1.17, crown: 1.19 },
    { z: -1.55, halfWidth: 1.11, bottom: 0.47, lower: 0.58, belt: 1.18, top: 1.22, crown: 1.24 },
    { z: -0.75, halfWidth: 1.08, bottom: 0.47, lower: 0.58, belt: 1.17, top: 1.22, crown: 1.24 },
    { z: 0.4, halfWidth: 1.06, bottom: 0.48, lower: 0.58, belt: 1.15, top: 1.18, crown: 1.2 },
    { z: bedStart, halfWidth: 1.07, bottom: 0.48, lower: 0.59, belt: 1.07, top: 1.13, crown: 1.15 },
    { z: bedEnd, halfWidth: 1.03, bottom: 0.5, lower: 0.58, belt: 1.03, top: 1.1, crown: 1.12 },
  ]);
}

function makeBed(ctx: ScaleContext, bedLength: number): Mesh {
  const bedEnd = 2.88;
  const bedStart = Math.max(0.62, bedEnd - bedLength);
  return merge(
    partBox(ctx, vec3(2.02, 0.08, bedLength), vec3(0, 1.09, (bedStart + bedEnd) * 0.5)),
    partBox(ctx, vec3(0.08, 0.52, bedLength), vec3(-1.04, 0.85, (bedStart + bedEnd) * 0.5)),
    partBox(ctx, vec3(0.08, 0.52, bedLength), vec3(1.04, 0.85, (bedStart + bedEnd) * 0.5)),
    partBox(ctx, vec3(2.02, 0.54, 0.08), vec3(0, 0.84, bedEnd)),
    partBox(ctx, vec3(1.82, 0.045, bedLength * 0.82), vec3(0, 0.59, bedStart + bedLength * 0.45)),
  );
}

export function buildGmcCanyonAt4xParts(params: Partial<GmcCanyonAt4xParams> = {}): NamedPart[] {
  const p = { ...GMC_CANYON_AT4X_DEFAULTS, ...params };
  const ctx: ScaleContext = {
    sx: p.width / GMC_CANYON_AT4X_DEFAULTS.width,
    sy: p.height / GMC_CANYON_AT4X_DEFAULTS.height,
    sz: p.length / GMC_CANYON_AT4X_DEFAULTS.length,
    y0: p.rideHeight + p.suspensionLift,
  };
  const parts: NamedPart[] = [];
  const frontZ = -1.72;
  const rearZ = 1.72;

  add(parts, "lower_body_shell", makeBodyShell(ctx, p.bedLength), PAINT, "carPaint", { color: PAINT, seed: 230 });
  add(parts, "hood_power_dome", merge(
    partBox(ctx, vec3(1.66, 0.1, 1.28), vec3(0, 1.18, -1.92), vec3(-0.05, 0, 0)),
    partBox(ctx, vec3(0.58, 0.055, 0.72), vec3(0, 1.25, -1.82), vec3(-0.08, 0, 0)),
  ), PAINT_DARK, "carPaint", { color: PAINT_DARK, seed: 231 });
  add(parts, "hood_black_vent", partBox(ctx, vec3(0.78, 0.035, 0.42), vec3(0, 1.3, -1.92), vec3(-0.08, 0, 0)), BLACK, "plastic", { color: BLACK, roughness: 0.4 });

  add(parts, "crew_cab_pillars", merge(
    partBox(ctx, vec3(1.52, 0.13, 1.18), vec3(0, 1.72, -0.22)),
    partBox(ctx, vec3(1.72, 0.1, 0.08), vec3(0, 1.44, -0.96), vec3(-0.55, 0, 0)),
    partBox(ctx, vec3(1.62, 0.12, 0.08), vec3(0, 1.41, 0.55), vec3(0.32, 0, 0)),
    partBox(ctx, vec3(1.58, 0.08, 0.1), vec3(0, 1.18, 0.62)),
    partBox(ctx, vec3(0.12, 0.66, 0.08), vec3(-0.88, 1.38, -0.78), vec3(-0.35, 0, 0)),
    partBox(ctx, vec3(0.12, 0.66, 0.08), vec3(0.88, 1.38, -0.78), vec3(-0.35, 0, 0)),
    partBox(ctx, vec3(0.1, 0.58, 0.07), vec3(-0.88, 1.35, -0.05)),
    partBox(ctx, vec3(0.1, 0.58, 0.07), vec3(0.88, 1.35, -0.05)),
    partBox(ctx, vec3(0.1, 0.6, 0.07), vec3(-0.88, 1.32, 0.52), vec3(0.2, 0, 0)),
    partBox(ctx, vec3(0.1, 0.6, 0.07), vec3(0.88, 1.32, 0.52), vec3(0.2, 0, 0)),
  ), PAINT, "carPaint", { color: PAINT, seed: 232 });
  add(parts, "cab_black_roof", partBox(ctx, vec3(1.52, 0.055, 1.04), vec3(0, 1.755, -0.23)), BLACK, "plastic", { color: BLACK, roughness: 0.18 });

  add(parts, "glass_pack", quadStrip([
    [
      sv(ctx, -0.72, 1.29, -1.03),
      sv(ctx, 0.72, 1.29, -1.03),
      sv(ctx, 0.58, 1.66, -0.62),
      sv(ctx, -0.58, 1.66, -0.62),
    ],
    [
      sv(ctx, -0.58, 1.44, 0.5),
      sv(ctx, 0.58, 1.44, 0.5),
      sv(ctx, 0.68, 1.66, 0.36),
      sv(ctx, -0.68, 1.66, 0.36),
    ],
    [
      sv(ctx, -0.88, 1.25, -0.78),
      sv(ctx, -0.72, 1.62, -0.55),
      sv(ctx, -0.72, 1.62, -0.05),
      sv(ctx, -0.89, 1.24, -0.02),
    ],
    [
      sv(ctx, 0.72, 1.62, -0.55),
      sv(ctx, 0.88, 1.25, -0.78),
      sv(ctx, 0.89, 1.24, -0.02),
      sv(ctx, 0.72, 1.62, -0.05),
    ],
    [
      sv(ctx, -0.9, 1.23, 0.04),
      sv(ctx, -0.72, 1.61, 0.0),
      sv(ctx, -0.72, 1.58, 0.48),
      sv(ctx, -0.9, 1.18, 0.54),
    ],
    [
      sv(ctx, 0.72, 1.61, 0.0),
      sv(ctx, 0.9, 1.23, 0.04),
      sv(ctx, 0.9, 1.18, 0.54),
      sv(ctx, 0.72, 1.58, 0.48),
    ],
  ]), DARK_GLASS, "glass", { tint: DARK_GLASS, roughness: 0.06, thickness: 0.08 });

  add(parts, "bed_box_liner", makeBed(ctx, p.bedLength), BLACK, "plastic", { color: BLACK, roughness: 0.65 });
  add(parts, "tailgate_outer_skin", partBox(ctx, vec3(1.92, 0.48, 0.07), vec3(0, 0.88, 2.93)), PAINT, "carPaint", { color: PAINT, seed: 233 });
  add(parts, "tailgate_inner_panel", partBox(ctx, vec3(1.26, 0.25, 0.035), vec3(0, 0.88, 2.975)), PAINT_DARK, "carPaint", { color: PAINT_DARK, seed: 234 });
  add(parts, "rear_gmc_bar", partBox(ctx, vec3(0.42, 0.07, 0.025), vec3(0, 0.95, 3.02)), GMC_RED, "plastic", { color: GMC_RED, roughness: 0.25 });

  add(parts, "front_grille", grilleMesh(ctx), BLACK, "plastic", { color: BLACK, roughness: 0.38 });
  add(parts, "gmc_front_badge", gmcBadge(ctx), GMC_RED, "plastic", { color: GMC_RED, roughness: 0.2 });
  for (const side of [-1, 1] as const) {
    add(parts, `c_lamp_${side}`, cLamp(ctx, side), LED, "glass", { tint: LED, roughness: 0.04, thickness: 0.035 });
    add(parts, `amber_marker_${side}`, partBox(ctx, vec3(0.06, 0.18, 0.026), vec3(side * 0.98, 0.82, -2.995)), AMBER, "glass", { tint: AMBER, roughness: 0.05 });
    add(parts, `fog_pod_${side}`, transform(cylinder(0.09, 0.035 * ctx.sz, 18, true), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: sv(ctx, side * 0.62, 0.5, -3.02),
    }), LED, "glass", { tint: LED, roughness: 0.05 });
    add(parts, `tail_lamp_${side}`, partBox(ctx, vec3(0.11, 0.42, 0.026), vec3(side * 0.93, 0.88, 3.02)), RED, "glass", { tint: RED, roughness: 0.06 });
    add(parts, `door_seam_front_${side}`, partBox(ctx, vec3(0.018, 0.58, 0.02), vec3(side * 1.075, 0.96, -0.46)), BLACK, "plastic", { color: BLACK, roughness: 0.45 });
    add(parts, `door_seam_rear_${side}`, partBox(ctx, vec3(0.018, 0.56, 0.02), vec3(side * 1.075, 0.94, 0.3)), BLACK, "plastic", { color: BLACK, roughness: 0.45 });
    add(parts, `door_handle_front_${side}`, partBox(ctx, vec3(0.035, 0.052, 0.22), vec3(side * 1.095, 1.12, -0.33)), BLACK, "plastic", { color: BLACK, roughness: 0.28 });
    add(parts, `door_handle_rear_${side}`, partBox(ctx, vec3(0.035, 0.052, 0.22), vec3(side * 1.095, 1.1, 0.34)), BLACK, "plastic", { color: BLACK, roughness: 0.28 });
    add(parts, `mirror_${side}`, partSphere(ctx, 0.13, vec3(side * 1.13, 1.33, -0.9), vec3(1.05, 0.55, 0.65)), BLACK, "plastic", { color: BLACK, roughness: 0.18 });
    add(parts, `rock_slider_${side}`, partBox(ctx, vec3(0.12, 0.08, 3.1), vec3(side * 1.15, 0.4, 0.08)), BLACK, "metal", { color: BLACK, roughness: 0.55 });
    add(parts, `nerf_step_${side}`, partBox(ctx, vec3(0.12, 0.045, 1.0), vec3(side * 1.22, 0.5, -0.08)), MATTE_BLACK, "rubber", { color: MATTE_BLACK });
  }

  add(parts, "front_steel_bumper", merge(
    partBox(ctx, vec3(1.86, 0.25, 0.15), vec3(0, 0.53, -3.05)),
    partBox(ctx, vec3(1.32, 0.16, 0.13), vec3(0, 0.42, -3.17)),
    partBox(ctx, vec3(0.62, 0.1, 0.12), vec3(0, 0.33, -3.21)),
  ), BLACK, "metal", { color: BLACK, roughness: 0.42 });
  add(parts, "front_skid_plate", partBox(ctx, vec3(0.92, 0.07, 0.58), vec3(0, 0.25, -2.82), vec3(-0.42, 0, 0)), SKID, "brushedMetal", { color: SKID });

  const towHooks = merge(
    transform(torus(0.08, 0.025, 16, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: sv(ctx, -0.42, 0.43, -3.23) }),
    transform(torus(0.08, 0.025, 16, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: sv(ctx, 0.42, 0.43, -3.23) }),
  );
  add(parts, "red_recovery_hooks", towHooks, GMC_RED, "metal", { color: GMC_RED, roughness: 0.25 });

  add(parts, "wheel_flares", wheelFlares(ctx, frontZ, rearZ), BLACK, "plastic", { color: BLACK, roughness: 0.44 });
  for (const side of [-1, 1] as const) {
    parts.push(...wheelSet(ctx, side, frontZ, p.wheelRadius, p.tireTread));
    parts.push(...wheelSet(ctx, side, rearZ, p.wheelRadius, p.tireTread));
  }

  add(parts, "underbody_frame", merge(
    partBox(ctx, vec3(0.12, 0.1, 4.55), vec3(-0.54, 0.32, 0)),
    partBox(ctx, vec3(0.12, 0.1, 4.55), vec3(0.54, 0.32, 0)),
    partBox(ctx, vec3(1.2, 0.07, 0.11), vec3(0, 0.32, -1.2)),
    partBox(ctx, vec3(1.2, 0.07, 0.11), vec3(0, 0.32, 1.2)),
  ), BLACK, "metal", { color: BLACK, roughness: 0.6 });
  add(parts, "roof_rails", merge(
    partBox(ctx, vec3(0.07, 0.05, 1.0), vec3(-0.58, 1.7975, -0.23)),
    partBox(ctx, vec3(0.07, 0.05, 1.0), vec3(0.58, 1.7975, -0.23)),
    partBox(ctx, vec3(1.12, 0.04, 0.06), vec3(0, 1.7975, -0.67)),
    partBox(ctx, vec3(1.12, 0.04, 0.06), vec3(0, 1.7975, 0.2)),
  ), BLACK, "metal", { color: BLACK, roughness: 0.42 });

  if (p.armor > 0.45) {
    add(parts, "aev_style_brush_guard", merge(
      partBox(ctx, vec3(1.3, 0.055, 0.055), vec3(0, 1.18, -3.18)),
      partBox(ctx, vec3(0.055, 0.62, 0.055), vec3(-0.7, 0.83, -3.17)),
      partBox(ctx, vec3(0.055, 0.62, 0.055), vec3(0.7, 0.83, -3.17)),
      partBox(ctx, vec3(1.15, 0.05, 0.055), vec3(0, 0.62, -3.18)),
    ), BLACK, "metal", { color: BLACK, roughness: 0.4 });
    add(parts, "bed_sport_bar", merge(
      partBox(ctx, vec3(0.08, 0.92, 0.08), vec3(-0.82, 1.33, 1.18), vec3(0.3, 0, 0)),
      partBox(ctx, vec3(0.08, 0.92, 0.08), vec3(0.82, 1.33, 1.18), vec3(0.3, 0, 0)),
      partBox(ctx, vec3(1.62, 0.075, 0.075), vec3(0, 1.68, 1.02)),
    ), BLACK, "metal", { color: BLACK, roughness: 0.38 });
  }

  return parts.map((part) => ({
    ...part,
    mesh: transform(part.mesh, { rotate: vec3(0, Math.PI, 0) }),
  }));
}

export interface PickupVehicleScore {
  /** Overall 0..1. Vehicle templates should pass this before export. */
  score: number;
  metrics: {
    requiredParts: number;
    proportions: number;
    cabBedLayout: number;
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
    bedRatio: number;
    cabRatio: number;
    hoodRatio: number;
  };
  feedback: string;
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
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function combinedBounds(parts: NamedPart[]): { min: Vec3; max: Vec3 } {
  if (parts.length === 0) return { min: vec3(0, 0, 0), max: vec3(0, 0, 0) };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
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

function countNamed(parts: NamedPart[], pattern: RegExp): number {
  return parts.filter((part) => pattern.test(part.name)).length;
}

function oneNamed(parts: NamedPart[], name: string): NamedPart | undefined {
  return parts.find((part) => part.name === name);
}

function ratioOrZero(a: number, b: number): number {
  return b > 1e-6 ? a / b : 0;
}

/**
 * Reference-free vehicle gate for pickup attempts. This is not a beauty score;
 * it catches known failure modes before VLM/silhouette review: wrong skeleton,
 * missing cab/bed/wheels, bad vehicle material semantics, collapsed turntable.
 */
export function scorePickupVehicle(parts: NamedPart[]): PickupVehicleScore {
  const byName = new Map(parts.map((part) => [part.name, part]));
  const required = [
    "lower_body_shell", "hood_power_dome", "crew_cab_pillars", "glass_pack",
    "bed_box_liner", "tailgate_outer_skin", "front_grille", "gmc_front_badge",
    "front_steel_bumper", "front_skid_plate", "red_recovery_hooks", "wheel_flares",
    "underbody_frame", "cab_black_roof",
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
    rangeScore(lengthToWidth, 2.45, 3.15),
    rangeScore(widthToHeight, 0.92, 1.45),
    rangeScore(wheelbaseRatio, 0.46, 0.62),
    rangeScore(wheelRadiusRatio, 0.18, 0.26),
    rangeScore(trackRatio, 0.65, 0.92),
  ]);

  const hoodD = dim(oneNamed(parts, "hood_power_dome") ? bounds(oneNamed(parts, "hood_power_dome")!.mesh) : combinedBounds([]));
  const cabD = dim(oneNamed(parts, "crew_cab_pillars") ? bounds(oneNamed(parts, "crew_cab_pillars")!.mesh) : combinedBounds([]));
  const bedD = dim(oneNamed(parts, "bed_box_liner") ? bounds(oneNamed(parts, "bed_box_liner")!.mesh) : combinedBounds([]));
  const glassB = oneNamed(parts, "glass_pack") ? bounds(oneNamed(parts, "glass_pack")!.mesh) : combinedBounds([]);
  const glassD = dim(glassB);
  const bedRatio = ratioOrZero(bedD.z, allD.z);
  const cabRatio = ratioOrZero(cabD.z, allD.z);
  const hoodRatio = ratioOrZero(hoodD.z, allD.z);
  const glassBandRatio = ratioOrZero(glassD.y, allD.y);
  const glassHigh = rangeScore(ratioOrZero(glassB.min.y - allBounds.min.y, allD.y), 0.46, 0.72);
  const cabBedLayout = average([
    rangeScore(hoodRatio, 0.16, 0.31),
    rangeScore(cabRatio, 0.16, 0.35),
    rangeScore(bedRatio, 0.17, 0.34),
    rangeScore(glassBandRatio, 0.12, 0.28),
    glassHigh,
    countNamed(parts, /^door_seam_/) >= 4 ? 1 : 0,
    countNamed(parts, /^door_handle_/) >= 4 ? 1 : 0,
  ]);

  const wheelSystem = average([
    clamp01(countNamed(parts, /^tire_/) / 4),
    clamp01(countNamed(parts, /^beadlock_rim_/) / 4),
    clamp01(countNamed(parts, /^tread_blocks_/) / 4),
    clamp01(countNamed(parts, /^hub_/) / 4),
    rangeScore(wheelbaseRatio, 0.46, 0.62),
    rangeScore(wheelRadiusRatio, 0.18, 0.26),
  ]);

  const brandSignature = average([
    byName.has("gmc_front_badge") ? 1 : 0,
    byName.has("front_grille") ? 1 : 0,
    countNamed(parts, /^c_lamp_/) >= 2 ? 1 : 0,
    byName.has("front_skid_plate") ? 1 : 0,
    byName.has("red_recovery_hooks") ? 1 : 0,
    byName.has("wheel_flares") ? 1 : 0,
    byName.has("bed_sport_bar") ? 1 : 0,
  ]);

  const paintParts = parts.filter((part) => /(body|hood|cab|tailgate|bed)/.test(part.name));
  const paintGood = paintParts.filter((part) => part.surface?.type === "carPaint" || part.surface?.type === "plastic").length / Math.max(1, paintParts.length);
  const tireGood = tireParts.filter((part) => part.surface?.type === "rubber").length / Math.max(1, tireParts.length);
  const glassGood = parts.filter((part) => /(glass|lamp|marker|fog)/.test(part.name))
    .filter((part) => part.surface?.type === "glass").length / Math.max(1, countNamed(parts, /(glass|lamp|marker|fog)/));
  const badOrganic = parts.some((part) => part.surface?.type === "fur" || part.surface?.type === "hair" || part.surface?.type === "shortCoat") ? 0 : 1;
  const vehicleSemantics = paintGood * 0.35 + tireGood * 0.25 + glassGood * 0.25 + badOrganic * 0.15;

  const tris = parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0);
  const detailPartNames = [
    /^mirror_/, /^door_handle_/, /^tail_lamp_/, /^amber_marker_/, /^fog_pod_/,
    /^rock_slider_/, /^nerf_step_/, /^six_spoke_/, /^tread_blocks_/,
  ];
  const detailCoverage = clamp01(
    detailPartNames.reduce((sum, pattern) => sum + (countNamed(parts, pattern) > 0 ? 1 : 0), 0) /
      detailPartNames.length,
  );
  const detail = clamp01(parts.length / 52) * 0.35 + clamp01(tris / 9000) * 0.4 + detailCoverage * 0.25;

  const sig = turntableSignature(parts.map((part) => part.mesh), { views: 8, gridSize: 48 });
  const solidity = clamp01((sig.solidity - 0.18) / 0.28);

  const metrics = {
    requiredParts,
    proportions,
    cabBedLayout,
    wheelSystem,
    brandSignature,
    vehicleSemantics,
    detail,
    solidity,
  };
  const score = clamp01(
    metrics.requiredParts * 0.14 +
      metrics.proportions * 0.22 +
      metrics.cabBedLayout * 0.2 +
      metrics.wheelSystem * 0.13 +
      metrics.brandSignature * 0.1 +
      metrics.vehicleSemantics * 0.1 +
      metrics.detail * 0.05 +
      metrics.solidity * 0.06,
  );

  const tips: string[] = [];
  if (metrics.requiredParts < 1) tips.push("missing required pickup parts");
  if (metrics.proportions < 0.82) tips.push("fix length/width/height, wheelbase, track, tire radius");
  if (metrics.cabBedLayout < 0.8) tips.push("fix hood/cab/bed/glass proportions before adding accessories");
  if (metrics.wheelSystem < 0.9) tips.push("add four complete wheels with tires, rims, hubs, tread");
  if (metrics.brandSignature < 0.85) tips.push("add GMC grille, C lamps, flares, skid plate, recovery hooks");
  if (metrics.vehicleSemantics < 0.9) tips.push("use vehicle materials: carPaint, rubber tires, glass lights/windows");
  if (metrics.solidity < 0.55) tips.push("turntable silhouette collapses from some views");

  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Pickup vehicle gate passed.`;

  return {
    score,
    metrics,
    measurements: {
      lengthToWidth,
      widthToHeight,
      wheelbaseRatio,
      wheelRadiusRatio,
      bedRatio,
      cabRatio,
      hoodRatio,
    },
    feedback,
  };
}
