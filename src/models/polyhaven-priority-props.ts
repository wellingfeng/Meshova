import {
  box,
  capsule,
  cylinder,
  merge,
  polyline,
  roundedBox,
  smoothCurve,
  sweep,
  torus,
  transform,
  type Mesh,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type PolyHavenPriorityPropKind =
  | "rectangular-airduct-kit"
  | "welding-cart"
  | "film-projector"
  | "industrial-microscope"
  | "cash-register"
  | "overhead-crane"
  | "vintage-microscope"
  | "power-pole-system"
  | "spinning-wheel"
  | "aircon-unit"
  | "hand-plane";

export interface PolyHavenPriorityPropParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenPriorityMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const DARK_METAL: RGB = [0.055, 0.06, 0.06];
const DUCT_METAL: RGB = [0.23, 0.24, 0.23];
const DUCT_INTERIOR: RGB = [0.025, 0.028, 0.027];
const FRAME_GREEN: RGB = [0.055, 0.19, 0.11];
const OXYGEN_GREEN: RGB = [0.08, 0.3, 0.16];
const ACETYLENE_RED: RGB = [0.48, 0.045, 0.03];
const BRASS: RGB = [0.56, 0.38, 0.08];
const HOSE_RED: RGB = [0.52, 0.035, 0.025];
const PROJECTOR_CREAM: RGB = [0.58, 0.56, 0.48];
const PROJECTOR_RED: RGB = [0.52, 0.055, 0.055];
const PROJECTOR_BLACK: RGB = [0.025, 0.028, 0.028];
const MICROSCOPE_GREEN: RGB = [0.1, 0.18, 0.18];
const OPTIC_GLASS: RGB = [0.18, 0.28, 0.3];
const REGISTER_CREAM: RGB = [0.68, 0.65, 0.57];
const REGISTER_STEEL: RGB = [0.35, 0.37, 0.36];
const KEY_IVORY: RGB = [0.73, 0.7, 0.61];
const CRANE_YELLOW: RGB = [0.78, 0.49, 0.035];
const POLE_WOOD: RGB = [0.24, 0.14, 0.065];
const INSULATOR_CERAMIC: RGB = [0.48, 0.34, 0.18];
const TURNED_WOOD: RGB = [0.34, 0.19, 0.075];
const DRIVE_BELT: RGB = [0.11, 0.065, 0.035];
const AIRCON_WHITE: RGB = [0.62, 0.64, 0.61];
const AIRCON_FIN: RGB = [0.28, 0.31, 0.3];
const PLANE_IRON: RGB = [0.12, 0.13, 0.125];
const PLANE_WOOD: RGB = [0.3, 0.095, 0.045];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenPriorityMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function tube(from: Vec3, to: Vec3, radius: number, sides: number): Mesh {
  return sweep(polyline([from, to]), { radius, sides, caps: true });
}

function curvedTube(points: Vec3[], radius: number, sides: number): Mesh {
  return sweep(smoothCurve(polyline(points), 3), { radius, sides, caps: true });
}

function rectangularFrame(width: number, height: number, thickness: number, depth: number, z: number): Mesh {
  return merge(
    transform(box(width, thickness, depth), { translate: vec3(0, height / 2, z) }),
    transform(box(width, thickness, depth), { translate: vec3(0, -height / 2, z) }),
    transform(box(thickness, height, depth), { translate: vec3(-width / 2, 0, z) }),
    transform(box(thickness, height, depth), { translate: vec3(width / 2, 0, z) }),
  );
}

function buildAirductKit(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const moduleCount = Math.max(6, Math.min(10, Math.round(p.structure * 0.55)));
  const gap = p.width * 0.014;
  const moduleWidth = (p.width - gap * (moduleCount - 1)) / moduleCount;
  const baseY = p.height * 0.08;
  const bodies: Mesh[] = [];
  const flanges: Mesh[] = [];
  const interiors: Mesh[] = [];
  const grille: Mesh[] = [];

  for (let index = 0; index < moduleCount; index++) {
    const t = index / Math.max(1, moduleCount - 1);
    const x = -p.width / 2 + moduleWidth / 2 + index * (moduleWidth + gap);
    const moduleHeight = index === moduleCount - 1
      ? p.height * 0.86
      : p.height * (0.26 + (index % 3) * 0.1 + t * 0.08);
    const moduleDepth = index === 0 || index === moduleCount - 1
      ? p.depth * 0.86
      : p.depth * (0.2 + (index % 2) * 0.09);
    const y = baseY + moduleHeight / 2;
    const radius = Math.min(moduleHeight, moduleWidth) * 0.055;
    const isElbow = index >= moduleCount - 2;
    if (isElbow) {
      bodies.push(
        transform(roundedBox({ width: moduleWidth, height: moduleHeight * 0.62, depth: moduleDepth, radius, steps: 2 }), {
          rotate: vec3(0, 0, index === moduleCount - 1 ? -0.28 : 0.28),
          translate: vec3(x, y + moduleHeight * 0.1, 0),
        }),
        transform(roundedBox({ width: moduleWidth * 0.72, height: moduleHeight * 0.62, depth: moduleDepth, radius, steps: 2 }), {
          rotate: vec3(0, 0, index === moduleCount - 1 ? 0.54 : -0.54),
          translate: vec3(x, y - moduleHeight * 0.18, 0),
        }),
      );
    } else {
      bodies.push(transform(roundedBox({ width: moduleWidth, height: moduleHeight, depth: moduleDepth, radius, steps: 2 }), {
        translate: vec3(x, y, 0),
      }));
    }
    const flangeThickness = Math.min(moduleWidth, moduleHeight) * 0.055;
    const frame = rectangularFrame(moduleWidth * 0.98, moduleHeight * 0.94, flangeThickness, moduleDepth * 0.045, moduleDepth / 2 + flangeThickness);
    flanges.push(transform(frame, { translate: vec3(x, y, 0) }));
    interiors.push(transform(box(moduleWidth * 0.82, moduleHeight * 0.78, moduleDepth * 0.02), {
      translate: vec3(x, y, moduleDepth / 2 + flangeThickness * 1.05),
    }));
    if (index === 1) {
      const slatCount = p.detail > 0 ? 10 : 6;
      for (let slat = 0; slat < slatCount; slat++) {
        grille.push(transform(box(moduleWidth * 0.78, moduleHeight * 0.025, moduleDepth * 0.035), {
          translate: vec3(x, y - moduleHeight * 0.32 + moduleHeight * 0.64 * (slat / Math.max(1, slatCount - 1)), moduleDepth / 2 + flangeThickness * 1.3),
        }));
      }
    }
  }

  return [
    part("airduct_shells", "矩形风管直段、变径段与弯头模块", merge(...bodies), DUCT_METAL, "metal", { color: DUCT_METAL, roughness: 0.68, rust: p.damage }),
    part("airduct_flanges", "风管模块连接法兰与卷边", merge(...flanges), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.58 }),
    part("airduct_openings", "风管中空接口与暗色内腔", merge(...interiors), DUCT_INTERIOR, "metal", { color: DUCT_INTERIOR, roughness: 0.82 }),
    part("airduct_grille", "风管百叶送风格栅", merge(...grille), REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.58 }),
  ];
}

function buildWeldingCart(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const sides = p.detail > 0 ? 12 : 7;
  const frameRadius = Math.min(p.width, p.depth) * 0.035;
  const x = p.width * 0.43;
  const z = p.depth * 0.36;
  const y0 = p.height * 0.045;
  const y1 = p.height * 0.94;
  const frame: Mesh[] = [
    tube(vec3(-x, y0, -z), vec3(x, y0, -z), frameRadius, sides),
    tube(vec3(-x, y0, z), vec3(x, y0, z), frameRadius, sides),
    tube(vec3(-x, y0, -z), vec3(-x, y0, z), frameRadius, sides),
    tube(vec3(x, y0, -z), vec3(x, y0, z), frameRadius, sides),
    tube(vec3(-x, y0, -z), vec3(-x, y1, -z), frameRadius, sides),
    tube(vec3(x, y0, -z), vec3(x, y1, -z), frameRadius, sides),
    curvedTube([vec3(-x, y1 * 0.82, -z), vec3(-x, y1, -z), vec3(0, p.height * 0.99, -z), vec3(x, y1, -z), vec3(x, y1 * 0.82, -z)], frameRadius, sides),
    tube(vec3(-x, p.height * 0.42, -z), vec3(x, p.height * 0.42, -z), frameRadius, sides),
  ];
  const tankRadius = p.width * 0.205;
  const tankHeight = p.height * 0.73;
  const tankY = y0 + tankHeight / 2 + p.height * 0.03;
  const oxygenTank = transform(capsule(tankRadius * 0.92, tankHeight, p.detail > 0 ? 24 : 14, 5), {
    translate: vec3(-p.width * 0.2, tankY, 0),
  });
  const acetyleneTank = transform(capsule(tankRadius, tankHeight * 0.82, p.detail > 0 ? 24 : 14, 5), {
    translate: vec3(p.width * 0.2, y0 + tankHeight * 0.41 + p.height * 0.03, 0),
  });
  const wheelRadius = p.height * 0.105;
  const wheelMeshes: Mesh[] = [];
  for (const side of [-1, 1]) {
    wheelMeshes.push(
      transform(torus(wheelRadius, wheelRadius * 0.22, 24, 8), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(side * p.width * 0.49, wheelRadius, -z) }),
      transform(cylinder(wheelRadius * 0.28, p.width * 0.06, 18), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(side * p.width * 0.49, wheelRadius, -z) }),
    );
  }
  const regulatorY = p.height * 0.84;
  const regulators: Mesh[] = [];
  for (const side of [-1, 1]) {
    const tankX = side * p.width * 0.2;
    regulators.push(
      transform(cylinder(tankRadius * 0.22, p.height * 0.065, 16), { translate: vec3(tankX, regulatorY, 0) }),
      transform(cylinder(tankRadius * 0.19, p.depth * 0.06, 18), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(tankX - tankRadius * 0.18, regulatorY + p.height * 0.04, p.depth * 0.12) }),
      transform(cylinder(tankRadius * 0.19, p.depth * 0.06, 18), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(tankX + tankRadius * 0.18, regulatorY + p.height * 0.04, p.depth * 0.12) }),
    );
  }
  const slack = p.depth * (0.18 + p.variation * 0.32);
  const hoses = merge(
    curvedTube([vec3(-p.width * 0.2, regulatorY, p.depth * 0.1), vec3(-p.width * 0.05, p.height * 0.72, p.depth * 0.36), vec3(p.width * 0.1, p.height * 0.45, p.depth * 0.42 + slack), vec3(p.width * 0.38, p.height * 0.18, p.depth * 0.28)], frameRadius * 0.55, 8),
    curvedTube([vec3(p.width * 0.2, regulatorY, p.depth * 0.1), vec3(p.width * 0.02, p.height * 0.68, p.depth * 0.4), vec3(-p.width * 0.12, p.height * 0.38, p.depth * 0.38 + slack), vec3(p.width * 0.34, p.height * 0.15, p.depth * 0.3)], frameRadius * 0.55, 8),
  );
  const torch = merge(
    tube(vec3(p.width * 0.3, p.height * 0.16, p.depth * 0.31), vec3(p.width * 0.42, p.height * 0.25, p.depth * 0.34), frameRadius * 0.7, 10),
    tube(vec3(p.width * 0.42, p.height * 0.25, p.depth * 0.34), vec3(p.width * 0.49, p.height * 0.3, p.depth * 0.34), frameRadius * 0.38, 10),
  );
  const straps = merge(
    transform(box(p.width * 0.88, p.height * 0.035, p.depth * 0.04), { translate: vec3(0, p.height * 0.39, p.depth * 0.32) }),
    transform(box(p.width * 0.88, p.height * 0.035, p.depth * 0.04), { translate: vec3(0, p.height * 0.39, -p.depth * 0.32) }),
  );

  return [
    part("welding_cart_frame", "焊接车防撞管架、把手与固定带", merge(...frame, straps), FRAME_GREEN, "metal", { color: FRAME_GREEN, roughness: 0.62, rust: p.damage }),
    part("welding_cart_oxygen_tank", "焊接车高压氧气瓶", oxygenTank, OXYGEN_GREEN, "metal", { color: OXYGEN_GREEN, roughness: 0.64, rust: p.damage }),
    part("welding_cart_acetylene_tank", "焊接车乙炔气瓶", acetyleneTank, ACETYLENE_RED, "metal", { color: ACETYLENE_RED, roughness: 0.66, rust: p.damage }),
    part("welding_cart_regulators", "双瓶减压阀、压力表与黄铜接头", merge(...regulators, torch), BRASS, "metal", { color: BRASS, roughness: 0.46 }),
    part("welding_cart_hoses", "红绿双色焊接软管与割炬", hoses, HOSE_RED, "rubber", { color: HOSE_RED, roughness: 0.82 }),
    part("welding_cart_wheels", "焊接车左右实心轮组", merge(...wheelMeshes), PROJECTOR_BLACK, "rubber", { color: PROJECTOR_BLACK, roughness: 0.9 }),
  ];
}

function reel(radius: number, depth: number, spokeCount: number, color: RGB): Mesh {
  const meshes: Mesh[] = [
    torus(radius * 0.84, radius * 0.1, 32, 8),
    cylinder(radius * 0.15, depth, 20),
  ];
  for (let index = 0; index < spokeCount; index++) {
    const angle = index / spokeCount * Math.PI * 2;
    meshes.push(transform(box(radius * 1.35, radius * 0.13, depth * 0.68), { rotate: vec3(0, angle, 0) }));
  }
  return merge(...meshes.map((mesh) => transform(mesh, { rotate: vec3(Math.PI / 2, 0, 0) })));
}

function buildFilmProjector(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const bodyHeight = p.height * 0.48;
  const base = merge(
    transform(roundedBox({ width: p.width * 0.82, height: bodyHeight, depth: p.depth * 0.66, radius: p.width * 0.035, steps: 2 }), { translate: vec3(p.width * 0.08, bodyHeight / 2, 0) }),
    transform(roundedBox({ width: p.width, height: p.height * 0.12, depth: p.depth * 0.78, radius: p.width * 0.025, steps: 2 }), { translate: vec3(0, p.height * 0.06, 0) }),
  );
  const reelRadius = Math.min(p.width * 0.43, p.height * 0.34);
  const frontZ = p.depth * 0.29;
  const leftRadius = reelRadius * (0.72 + p.variation * 0.2);
  const reels = merge(
    transform(reel(leftRadius, p.depth * 0.045, 5, PROJECTOR_BLACK), { translate: vec3(-p.width * 0.23, p.height * 0.68, frontZ) }),
    transform(reel(reelRadius, p.depth * 0.045, 5, PROJECTOR_RED), { translate: vec3(p.width * 0.26, p.height * 0.76, frontZ) }),
  );
  const filmPath = merge(
    curvedTube([vec3(-p.width * 0.23, p.height * 0.68, frontZ + p.depth * 0.035), vec3(-p.width * 0.05, p.height * 0.53, frontZ + p.depth * 0.045), vec3(p.width * 0.07, p.height * 0.42, frontZ + p.depth * 0.045), vec3(p.width * 0.26, p.height * 0.76, frontZ + p.depth * 0.035)], p.width * 0.008, 6),
    transform(box(p.width * 0.2, p.height * 0.42, p.depth * 0.18), { translate: vec3(0, p.height * 0.48, frontZ * 0.65) }),
  );
  const lens = merge(
    transform(cylinder(p.height * 0.09, p.width * 0.26, 24), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.49, p.height * 0.34, p.depth * 0.12) }),
    transform(torus(p.height * 0.09, p.height * 0.018, 24, 7), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.61, p.height * 0.34, p.depth * 0.12) }),
  );
  const controls: Mesh[] = [];
  const knobCount = Math.max(3, Math.min(7, Math.round(p.structure * 0.35)));
  for (let index = 0; index < knobCount; index++) {
    controls.push(transform(cylinder(p.height * 0.025, p.depth * 0.035, 14), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(-p.width * 0.34 + index * p.width * 0.16, p.height * 0.13, p.depth * 0.42),
    }));
  }
  const cable = curvedTube([
    vec3(p.width * 0.42, p.height * 0.08, -p.depth * 0.24),
    vec3(p.width * 0.6, p.height * 0.025, -p.depth * 0.3),
    vec3(p.width * 1.25, p.height * 0.02, -p.depth * 0.42),
    vec3(p.width * 1.7, p.height * 0.03, -p.depth * 0.48),
  ], p.width * 0.012, 8);

  return [
    part("projector_body", "8 毫米放映机机箱与底座", base, PROJECTOR_CREAM, "painted-metal", { color: PROJECTOR_CREAM, roughness: 0.68, wear: p.damage }),
    part("projector_reels", "放映机供片盘与收片盘", reels, PROJECTOR_RED, "painted-metal", { color: PROJECTOR_RED, roughness: 0.58 }),
    part("projector_film_gate", "胶片导向路径、片门与压片机构", filmPath, PROJECTOR_BLACK, "metal", { color: PROJECTOR_BLACK, roughness: 0.6 }),
    part("projector_lens", "放映机调焦镜筒与镜片", lens, OPTIC_GLASS, "glass", { color: OPTIC_GLASS, roughness: 0.08, transmission: 0.4 }),
    part("projector_controls", "放映机前面板旋钮与开关", merge(...controls), PROJECTOR_BLACK, "plastic", { color: PROJECTOR_BLACK, roughness: 0.74 }),
    part("projector_power_cable", "放映机外接电源线", cable, PROJECTOR_BLACK, "rubber", { color: PROJECTOR_BLACK, roughness: 0.88 }),
  ];
}

function buildMicroscope(p: PolyHavenPriorityPropParams, vintage = false): PolyHavenPriorityMeshPart[] {
  const stageY = p.height * (0.39 + p.variation * 0.12);
  const base = merge(
    transform(roundedBox({ width: p.width * 0.95, height: p.height * 0.1, depth: p.depth * 0.64, radius: p.width * 0.08, steps: 3 }), { translate: vec3(0, p.height * 0.05, -p.depth * 0.06) }),
    transform(roundedBox({ width: p.width * 0.37, height: p.height * 0.08, depth: p.depth * 0.85, radius: p.width * 0.07, steps: 2 }), { translate: vec3(-p.width * 0.3, p.height * 0.055, p.depth * 0.05) }),
    transform(roundedBox({ width: p.width * 0.37, height: p.height * 0.08, depth: p.depth * 0.85, radius: p.width * 0.07, steps: 2 }), { translate: vec3(p.width * 0.3, p.height * 0.055, p.depth * 0.05) }),
  );
  const arm = curvedTube([
    vec3(0, p.height * 0.1, -p.depth * 0.26),
    vec3(0, p.height * 0.34, -p.depth * 0.34),
    vec3(0, p.height * 0.66, -p.depth * 0.31),
    vec3(0, p.height * 0.78, -p.depth * 0.12),
    vec3(0, p.height * 0.78, p.depth * 0.02),
  ], p.width * 0.11, p.detail > 0 ? 14 : 8);
  const stage = merge(
    transform(roundedBox({ width: p.width * 0.93, height: p.height * 0.045, depth: p.depth * 0.58, radius: p.width * 0.025, steps: 2 }), { translate: vec3(0, stageY, p.depth * 0.04) }),
    transform(torus(p.width * 0.1, p.width * 0.018, 20, 6), { translate: vec3(0, stageY + p.height * 0.025, p.depth * 0.04) }),
    ...[-1, 1].map((side) => transform(box(p.width * 0.025, p.height * 0.018, p.depth * 0.32), { translate: vec3(side * p.width * 0.28, stageY + p.height * 0.032, p.depth * 0.04) })),
  );
  const head = merge(
    transform(roundedBox({ width: p.width * 0.78, height: p.height * 0.13, depth: p.depth * 0.22, radius: p.width * 0.05, steps: 2 }), { translate: vec3(0, p.height * 0.78, p.depth * 0.04) }),
    transform(cylinder(p.width * 0.22, p.height * 0.07, 24), { translate: vec3(0, p.height * 0.68, p.depth * 0.05) }),
  );
  const objectives: Mesh[] = [];
  const objectiveCount = p.detail > 0 ? 3 : 2;
  for (let index = 0; index < objectiveCount; index++) {
    const angle = (index - (objectiveCount - 1) / 2) * 0.32;
    objectives.push(transform(cylinder(p.width * 0.075, p.height * 0.2, 16), {
      rotate: vec3(angle, 0, angle * 0.35),
      translate: vec3((index - 1) * p.width * 0.14, p.height * 0.57, p.depth * 0.06 + Math.abs(angle) * p.depth * 0.08),
    }));
  }
  const eyepieces: Mesh[] = [];
  for (const side of vintage ? [0] : [-1, 1]) {
    eyepieces.push(
      transform(cylinder(p.width * (vintage ? 0.12 : 0.095), p.depth * 0.3, 18), { rotate: vec3(Math.PI / 2 + 0.24, 0, 0), translate: vec3(side * p.width * 0.19, p.height * 0.85, p.depth * 0.14) }),
      transform(cylinder(p.width * (vintage ? 0.14 : 0.115), p.depth * 0.09, 18), { rotate: vec3(Math.PI / 2 + 0.24, 0, 0), translate: vec3(side * p.width * 0.19, p.height * 0.9, p.depth * 0.24) }),
    );
  }
  const focus: Mesh[] = [];
  for (const side of [-1, 1]) {
    focus.push(
      transform(cylinder(p.width * 0.16, p.width * 0.12, 20), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(side * p.width * 0.48, p.height * 0.43, -p.depth * 0.18) }),
      transform(torus(p.width * 0.13, p.width * 0.022, 20, 6), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(side * p.width * 0.55, p.height * 0.43, -p.depth * 0.18) }),
    );
  }

  return [
    part("microscope_base", "显微镜双叉底座", base, MICROSCOPE_GREEN, "painted-metal", { color: MICROSCOPE_GREEN, roughness: 0.62, wear: p.damage }),
    part("microscope_arm", "显微镜承重弓形机架", arm, MICROSCOPE_GREEN, "painted-metal", { color: MICROSCOPE_GREEN, roughness: 0.6 }),
    part("microscope_stage", "显微镜可调载物台、通光孔与压片夹", stage, PROJECTOR_BLACK, "metal", { color: PROJECTOR_BLACK, roughness: 0.56 }),
    part("microscope_head", "显微镜镜筒座与旋转物镜盘", head, MICROSCOPE_GREEN, "painted-metal", { color: MICROSCOPE_GREEN, roughness: 0.58 }),
    part("microscope_objectives", "显微镜多倍率物镜组", merge(...objectives), REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.38 }),
    part(vintage ? "microscope_eyepiece" : "microscope_binoculars", vintage ? "古董显微镜单目镜筒" : "显微镜双目观察筒与目镜", merge(...eyepieces), OPTIC_GLASS, "glass", { color: OPTIC_GLASS, roughness: 0.12, transmission: 0.26 }),
    part("microscope_focus", "显微镜粗调与微调同轴旋钮", merge(...focus), DARK_METAL, "plastic", { color: DARK_METAL, roughness: 0.72 }),
  ];
}

function buildCashRegister(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const drawerTravel = p.depth * (0.04 + p.variation * 0.5);
  const base = merge(
    transform(roundedBox({ width: p.width, height: p.height * 0.2, depth: p.depth * 0.84, radius: p.width * 0.025, steps: 2 }), { translate: vec3(0, p.height * 0.1, 0) }),
    transform(roundedBox({ width: p.width * 0.86, height: p.height * 0.64, depth: p.depth * 0.56, radius: p.width * 0.035, steps: 2 }), { rotate: vec3(-0.12, 0, 0), translate: vec3(0, p.height * 0.48, -p.depth * 0.08) }),
    transform(roundedBox({ width: p.width * 0.92, height: p.height * 0.18, depth: p.depth * 0.42, radius: p.width * 0.025, steps: 2 }), { translate: vec3(0, p.height * 0.85, -p.depth * 0.08) }),
  );
  const keyboardPanel = transform(box(p.width * 0.72, p.height * 0.39, p.depth * 0.035), {
    rotate: vec3(-0.34, 0, 0),
    translate: vec3(-p.width * 0.05, p.height * 0.48, p.depth * 0.31),
  });
  const keys: Mesh[] = [];
  const columns = Math.max(5, Math.min(9, Math.round(p.structure * 0.48)));
  const rows = p.detail > 0 ? 6 : 4;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const keyWidth = p.width * 0.045;
      const keyHeight = p.height * 0.04;
      const x = -p.width * 0.28 + column * p.width * 0.56 / Math.max(1, columns - 1);
      const y = p.height * (0.36 + row * 0.055);
      const z = p.depth * (0.35 - row * 0.021);
      keys.push(transform(roundedBox({ width: keyWidth, height: keyHeight, depth: p.depth * 0.04, radius: keyWidth * 0.16, steps: 1 }), {
        rotate: vec3(-0.34, 0, 0),
        translate: vec3(x, y, z),
      }));
    }
  }
  const specialKeys = merge(
    transform(roundedBox({ width: p.width * 0.08, height: p.height * 0.18, depth: p.depth * 0.05, radius: p.width * 0.012, steps: 1 }), { rotate: vec3(-0.34, 0, 0), translate: vec3(p.width * 0.32, p.height * 0.47, p.depth * 0.32) }),
    ...[-1, 0, 1].map((offset) => transform(cylinder(p.width * 0.025, p.depth * 0.045, 12), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.38, p.height * (0.42 + offset * 0.08), p.depth * 0.34) })),
  );
  const display = merge(
    transform(roundedBox({ width: p.width * 0.7, height: p.height * 0.105, depth: p.depth * 0.03, radius: p.width * 0.012, steps: 1 }), { translate: vec3(-p.width * 0.04, p.height * 0.87, p.depth * 0.17) }),
    ...Array.from({ length: 8 }, (_, index) => transform(box(p.width * 0.045, p.height * 0.06, p.depth * 0.015), { translate: vec3(-p.width * 0.3 + index * p.width * 0.075, p.height * 0.87, p.depth * 0.19) })),
  );
  const drawer = merge(
    transform(roundedBox({ width: p.width * 0.93, height: p.height * 0.17, depth: p.depth * 0.62, radius: p.width * 0.02, steps: 2 }), { translate: vec3(0, p.height * 0.09, p.depth * 0.12 + drawerTravel) }),
    transform(box(p.width * 0.83, p.height * 0.035, p.depth * 0.52), { translate: vec3(0, p.height * 0.18, p.depth * 0.13 + drawerTravel) }),
  );
  const compartments: Mesh[] = [];
  for (let index = -2; index <= 2; index++) {
    compartments.push(transform(box(p.width * 0.015, p.height * 0.1, p.depth * 0.48), { translate: vec3(index * p.width * 0.15, p.height * 0.22, p.depth * 0.13 + drawerTravel) }));
  }
  for (const zOffset of [-0.14, 0.05, 0.2]) {
    compartments.push(transform(box(p.width * 0.76, p.height * 0.1, p.depth * 0.012), { translate: vec3(0, p.height * 0.22, p.depth * zOffset + drawerTravel) }));
  }
  const crank = merge(
    tube(vec3(p.width * 0.48, p.height * 0.36, 0), vec3(p.width * 0.63, p.height * 0.36, 0), p.width * 0.018, 10),
    tube(vec3(p.width * 0.63, p.height * 0.36, 0), vec3(p.width * 0.63, p.height * 0.5, 0), p.width * 0.018, 10),
    transform(cylinder(p.width * 0.035, p.width * 0.12, 14), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.67, p.height * 0.52, 0) }),
  );

  return [
    part("cash_register_housing", "老式收银机铸造机壳与键盘斜面", merge(base, keyboardPanel), REGISTER_CREAM, "painted-metal", { color: REGISTER_CREAM, roughness: 0.7, wear: p.damage }),
    part("cash_register_keys", "收银机金额键、部门键与操作键阵列", merge(...keys, specialKeys), KEY_IVORY, "plastic", { color: KEY_IVORY, roughness: 0.76 }),
    part("cash_register_display", "收银机机械滚轮金额显示窗", display, PROJECTOR_BLACK, "glass", { color: PROJECTOR_BLACK, roughness: 0.18, transmission: 0.12 }),
    part("cash_register_drawer", "收银机可开合现金抽屉", drawer, REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.54 }),
    part("cash_register_compartments", "现金抽屉纸币与硬币分隔槽", merge(...compartments), PROJECTOR_BLACK, "plastic", { color: PROJECTOR_BLACK, roughness: 0.8 }),
    part("cash_register_crank", "收银机右侧机械摇柄", crank, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
  ];
}

function buildOverheadCrane(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const columnWidth = p.width * 0.045;
  const railY = p.height * 0.88;
  const supports: Mesh[] = [];
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      supports.push(transform(box(columnWidth, p.height * 0.9, p.depth * 0.06), {
        translate: vec3(sideX * p.width * 0.46, p.height * 0.45, sideZ * p.depth * 0.43),
      }));
    }
    supports.push(transform(box(p.width * 0.08, p.height * 0.07, p.depth * 0.94), {
      translate: vec3(sideX * p.width * 0.46, railY, 0),
    }));
  }
  const bridgeMembers: Mesh[] = [
    ...[-1, 1].map((sideZ) => transform(box(p.width * 0.94, p.height * 0.1, p.depth * 0.08), {
      translate: vec3(0, railY + p.height * 0.06, sideZ * p.depth * 0.24),
    })),
  ];
  const braceCount = Math.max(3, Math.round(p.structure * 0.5));
  for (let index = 0; index < braceCount; index++) {
    const x = -p.width * 0.42 + p.width * 0.84 * index / Math.max(1, braceCount - 1);
    bridgeMembers.push(transform(box(p.width * 0.025, p.height * 0.08, p.depth * 0.56), {
      translate: vec3(x, railY + p.height * 0.06, 0),
    }));
  }
  const trolleyX = (p.variation - 0.5) * p.width * 0.62;
  const trolleyY = railY + p.height * 0.01;
  const trolley = merge(
    transform(roundedBox({ width: p.width * 0.14, height: p.height * 0.12, depth: p.depth * 0.34, radius: p.height * 0.018, steps: 2 }), {
      translate: vec3(trolleyX, trolleyY, 0),
    }),
    ...[-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => transform(cylinder(p.height * 0.035, p.depth * 0.04, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(trolleyX + sideX * p.width * 0.045, trolleyY + p.height * 0.065, sideZ * p.depth * 0.25),
    }))),
  );
  const hookY = p.height * 0.16;
  const hoist = merge(
    transform(cylinder(p.height * 0.09, p.depth * 0.22, 20), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(trolleyX, trolleyY - p.height * 0.1, 0),
    }),
    tube(vec3(trolleyX, trolleyY - p.height * 0.12, 0), vec3(trolleyX, hookY + p.height * 0.13, 0), p.width * 0.004, 7),
    transform(cylinder(p.height * 0.055, p.width * 0.09, 16), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(trolleyX, hookY + p.height * 0.1, 0),
    }),
  );
  const hook = curvedTube([
    vec3(trolleyX, hookY + p.height * 0.1, 0),
    vec3(trolleyX, hookY + p.height * 0.02, 0),
    vec3(trolleyX + p.width * 0.018, hookY - p.height * 0.035, 0),
    vec3(trolleyX + p.width * 0.055, hookY - p.height * 0.02, 0),
    vec3(trolleyX + p.width * 0.065, hookY + p.height * 0.035, 0),
  ], p.width * 0.009, 10);
  return [
    part("overhead_crane_supports", "起重机门式立柱与纵向轨道", merge(...supports), REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.62, rust: p.damage }),
    part("overhead_crane_bridge", "起重机双梁桥架与横向加强筋", merge(...bridgeMembers), CRANE_YELLOW, "painted-metal", { color: CRANE_YELLOW, roughness: 0.58, wear: p.damage }),
    part("overhead_crane_trolley", "起重机横移小车与走轮", trolley, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.52 }),
    part("overhead_crane_hoist", "起重机卷扬机、钢索与滑轮", hoist, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
    part("overhead_crane_hook", "起重机承重吊钩", hook, CRANE_YELLOW, "metal", { color: CRANE_YELLOW, roughness: 0.55 }),
  ];
}

function buildPowerPoleSystem(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const poleX = p.width * 0.46;
  const crossarmY = p.height * 0.84;
  const poleRadius = Math.min(p.width, p.depth) * 0.028;
  const posts = merge(...[-1, 1].map((side) => transform(cylinder(poleRadius, p.height, p.detail > 0 ? 18 : 10), {
    translate: vec3(side * poleX, p.height * 0.5, 0),
  })));
  const crossarms: Mesh[] = [];
  const insulators: Mesh[] = [];
  const hardware: Mesh[] = [];
  const conductorOffsets = [-0.34, 0, 0.34];
  for (const side of [-1, 1]) {
    const x = side * poleX;
    crossarms.push(
      transform(box(p.width * 0.035, p.height * 0.045, p.depth * 0.9), { translate: vec3(x, crossarmY, 0) }),
      tube(vec3(x, crossarmY - p.height * 0.02, -p.depth * 0.36), vec3(x, crossarmY - p.height * 0.16, 0), poleRadius * 0.35, 8),
      tube(vec3(x, crossarmY - p.height * 0.02, p.depth * 0.36), vec3(x, crossarmY - p.height * 0.16, 0), poleRadius * 0.35, 8),
    );
    for (const offset of conductorOffsets) {
      const z = offset * p.depth;
      insulators.push(
        transform(cylinder(poleRadius * 0.58, p.height * 0.095, 14), { translate: vec3(x, crossarmY + p.height * 0.065, z) }),
        transform(torus(poleRadius * 0.72, poleRadius * 0.18, 16, 6), { translate: vec3(x, crossarmY + p.height * 0.085, z) }),
      );
    }
    hardware.push(
      transform(box(p.width * 0.07, p.height * 0.18, p.depth * 0.14), { translate: vec3(x, p.height * 0.56, -p.depth * 0.1) }),
      transform(cylinder(poleRadius * 0.6, p.height * 0.04, 12), { translate: vec3(x, p.height * 0.92, 0) }),
    );
  }
  const wires: Mesh[] = [];
  const sag = p.height * (0.025 + p.variation * 0.13);
  for (const offset of conductorOffsets) {
    const z = offset * p.depth;
    const wireY = crossarmY + p.height * 0.12;
    wires.push(curvedTube([
      vec3(-poleX, wireY, z),
      vec3(-poleX * 0.5, wireY - sag * 0.75, z),
      vec3(0, wireY - sag, z),
      vec3(poleX * 0.5, wireY - sag * 0.75, z),
      vec3(poleX, wireY, z),
    ], poleRadius * 0.12, 6));
  }
  return [
    part("power_pole_posts", "输电系统双杆木质立柱", posts, POLE_WOOD, "wood", { color: POLE_WOOD, roughness: 0.86, wear: p.damage }),
    part("power_pole_crossarms", "输电杆横担与斜撑", merge(...crossarms), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.68, rust: p.damage }),
    part("power_pole_insulators", "输电杆陶瓷绝缘子阵列", merge(...insulators), INSULATOR_CERAMIC, "ceramic", { color: INSULATOR_CERAMIC, roughness: 0.34 }),
    part("power_pole_wires", "输电杆跨距悬链线导线", merge(...wires), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
    part("power_pole_hardware", "输电杆接线盒与顶部五金", merge(...hardware), REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.62 }),
  ];
}

function buildSpinningWheel(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const wheelX = -p.width * 0.12;
  const wheelY = p.height * 0.5;
  const wheelZ = -p.depth * 0.12;
  const wheelRadius = Math.min(p.depth * 0.4, p.height * 0.39);
  const woodRadius = Math.min(p.width, p.depth) * 0.025;
  const frame = merge(
    transform(box(p.width * 0.92, p.height * 0.075, p.depth * 0.82), { translate: vec3(0, p.height * 0.075, 0) }),
    ...[-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => tube(
      vec3(sideX * p.width * 0.38, p.height * 0.08, sideZ * p.depth * 0.32),
      vec3(sideX * p.width * 0.3, p.height * 0.58, sideZ * p.depth * 0.2),
      woodRadius,
      10,
    ))),
    tube(vec3(-p.width * 0.42, p.height * 0.62, -p.depth * 0.2), vec3(p.width * 0.42, p.height * 0.62, -p.depth * 0.2), woodRadius, 10),
  );
  const driveWheel = merge(
    transform(torus(wheelRadius, woodRadius * 1.35, p.detail > 0 ? 40 : 24, 8), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(wheelX, wheelY, wheelZ),
    }),
    transform(cylinder(woodRadius * 1.8, p.width * 0.22, 18), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(wheelX, wheelY, wheelZ),
    }),
  );
  const spokeCount = Math.max(8, Math.min(18, Math.round(p.structure)));
  const spokes: Mesh[] = [];
  for (let index = 0; index < spokeCount; index++) {
    const angle = index / spokeCount * Math.PI * 2;
    spokes.push(tube(
      vec3(wheelX, wheelY, wheelZ),
      vec3(wheelX, wheelY + Math.cos(angle) * wheelRadius * 0.9, wheelZ + Math.sin(angle) * wheelRadius * 0.9),
      woodRadius * 0.48,
      7,
    ));
  }
  const flyerY = p.height * 0.72;
  const flyerZ = p.depth * 0.28;
  const flyer = merge(
    transform(cylinder(woodRadius * 1.4, p.width * 0.86, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, flyerY, flyerZ) }),
    transform(cylinder(woodRadius * 2.2, p.width * 0.18, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.32, flyerY, flyerZ) }),
    tube(vec3(p.width * 0.32, flyerY - p.height * 0.08, flyerZ), vec3(p.width * 0.32, flyerY + p.height * 0.08, flyerZ), woodRadius * 0.65, 8),
  );
  const pulleyRadius = wheelRadius * 0.17;
  const belt = merge(
    transform(torus(wheelRadius * 0.98, woodRadius * 0.22, 40, 5), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(wheelX - woodRadius * 1.8, wheelY, wheelZ) }),
    transform(torus(pulleyRadius, woodRadius * 0.22, 24, 5), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(wheelX - woodRadius * 1.8, flyerY, flyerZ) }),
    tube(vec3(wheelX - woodRadius * 1.8, wheelY + wheelRadius * 0.8, wheelZ + wheelRadius * 0.55), vec3(wheelX - woodRadius * 1.8, flyerY + pulleyRadius * 0.7, flyerZ), woodRadius * 0.22, 6),
    tube(vec3(wheelX - woodRadius * 1.8, wheelY - wheelRadius * 0.8, wheelZ + wheelRadius * 0.55), vec3(wheelX - woodRadius * 1.8, flyerY - pulleyRadius * 0.7, flyerZ), woodRadius * 0.22, 6),
  );
  const treadleY = p.height * (0.09 + p.variation * 0.055);
  const treadle = merge(
    transform(roundedBox({ width: p.width * 0.64, height: p.height * 0.04, depth: p.depth * 0.25, radius: p.height * 0.015, steps: 2 }), {
      rotate: vec3((p.variation - 0.5) * 0.2, 0, 0),
      translate: vec3(0, treadleY, p.depth * 0.18),
    }),
    tube(vec3(p.width * 0.18, treadleY + p.height * 0.02, p.depth * 0.18), vec3(wheelX, wheelY - wheelRadius * 0.62, wheelZ), woodRadius * 0.45, 8),
  );
  return [
    part("spinning_wheel_frame", "纺车车木底架与立柱", frame, TURNED_WOOD, "wood", { color: TURNED_WOOD, roughness: 0.78, wear: p.damage }),
    part("spinning_wheel_drive_wheel", "纺车大型驱动轮圈与轮毂", driveWheel, TURNED_WOOD, "wood", { color: TURNED_WOOD, roughness: 0.76 }),
    part("spinning_wheel_spokes", "纺车径向车木辐条", merge(...spokes), TURNED_WOOD, "wood", { color: TURNED_WOOD, roughness: 0.74 }),
    part("spinning_wheel_belt", "纺车飞轮至纱锭传动带", belt, DRIVE_BELT, "leather", { color: DRIVE_BELT, roughness: 0.88 }),
    part("spinning_wheel_flyer", "纺车纱锭、飞翼与卷轴", flyer, REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.5 }),
    part("spinning_wheel_treadle", "纺车踏板与曲柄连杆", treadle, TURNED_WOOD, "wood", { color: TURNED_WOOD, roughness: 0.8 }),
  ];
}

function buildAirconUnit(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const cabinet = merge(
    transform(roundedBox({ width: p.width * 0.96, height: p.height * 0.9, depth: p.depth * 0.92, radius: p.height * 0.045, steps: 3 }), {
      translate: vec3(0, p.height * 0.5, 0),
    }),
    transform(box(p.width * 0.9, p.height * 0.82, p.depth * 0.025), { translate: vec3(0, p.height * 0.5, p.depth * 0.47) }),
  );
  const fanRadius = Math.min(p.width * 0.2, p.height * 0.31);
  const fanCenters = [-p.width * 0.25, p.width * 0.25];
  const grille: Mesh[] = [];
  const blades: Mesh[] = [];
  const frontZ = p.depth * 0.49;
  for (const centerX of fanCenters) {
    for (const ratio of [0.34, 0.58, 0.82, 1]) {
      grille.push(transform(torus(fanRadius * ratio, p.height * 0.006, 32, 5), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(centerX, p.height * 0.52, frontZ),
      }));
    }
    const barCount = p.detail > 0 ? 12 : 8;
    for (let index = 0; index < barCount; index++) {
      const angle = index / barCount * Math.PI * 2;
      grille.push(tube(
        vec3(centerX, p.height * 0.52, frontZ),
        vec3(centerX + Math.cos(angle) * fanRadius, p.height * 0.52 + Math.sin(angle) * fanRadius, frontZ),
        p.height * 0.005,
        5,
      ));
    }
    const bladeCount = 5;
    for (let index = 0; index < bladeCount; index++) {
      const angle = index / bladeCount * Math.PI * 2 + p.variation * 0.35;
      blades.push(transform(capsule(fanRadius * 0.1, fanRadius * 0.88, 14, 4), {
        rotate: vec3(0, 0, angle - Math.PI / 2),
        translate: vec3(centerX + Math.cos(angle) * fanRadius * 0.38, p.height * 0.52 + Math.sin(angle) * fanRadius * 0.38, frontZ - p.depth * 0.035),
      }));
    }
    blades.push(transform(cylinder(fanRadius * 0.18, p.depth * 0.08, 20), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(centerX, p.height * 0.52, frontZ - p.depth * 0.02),
    }));
  }
  const fins: Mesh[] = [];
  const finCount = Math.max(6, Math.round(p.structure));
  for (let index = 0; index < finCount; index++) {
    const x = -p.width * 0.42 + p.width * 0.84 * index / Math.max(1, finCount - 1);
    fins.push(transform(box(p.width * 0.012, p.height * 0.76, p.depth * 0.035), {
      translate: vec3(x, p.height * 0.51, -p.depth * 0.47),
    }));
  }
  const lines = merge(
    curvedTube([vec3(p.width * 0.46, p.height * 0.38, -p.depth * 0.2), vec3(p.width * 0.55, p.height * 0.3, -p.depth * 0.28), vec3(p.width * 0.57, p.height * 0.08, -p.depth * 0.3)], p.height * 0.018, 8),
    curvedTube([vec3(p.width * 0.46, p.height * 0.48, -p.depth * 0.18), vec3(p.width * 0.58, p.height * 0.42, -p.depth * 0.25), vec3(p.width * 0.61, p.height * 0.1, -p.depth * 0.28)], p.height * 0.012, 8),
    ...[0.34, 0.45].map((y) => transform(cylinder(p.height * 0.035, p.width * 0.05, 14), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.5, p.height * y, -p.depth * 0.2) })),
  );
  const feet = merge(...[-1, 1].map((side) => transform(roundedBox({ width: p.width * 0.32, height: p.height * 0.08, depth: p.depth * 0.32, radius: p.height * 0.018, steps: 2 }), {
    translate: vec3(side * p.width * 0.31, p.height * 0.04, 0),
  })));
  return [
    part("aircon_cabinet", "空调外机钣金机壳与检修面板", cabinet, AIRCON_WHITE, "painted-metal", { color: AIRCON_WHITE, roughness: 0.7, wear: p.damage }),
    part("aircon_fan_grille", "空调外机双风扇同心防护格栅", merge(...grille), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.62 }),
    part("aircon_fan_blades", "空调外机双叶轮与电机轮毂", merge(...blades), AIRCON_FIN, "plastic", { color: AIRCON_FIN, roughness: 0.68 }),
    part("aircon_condenser_fins", "空调外机换热器翅片阵列", merge(...fins), AIRCON_FIN, "metal", { color: AIRCON_FIN, roughness: 0.48 }),
    part("aircon_service_lines", "空调外机冷媒铜管与检修阀", lines, BRASS, "metal", { color: BRASS, roughness: 0.45 }),
    part("aircon_feet", "空调外机减振安装脚座", feet, DARK_METAL, "rubber", { color: DARK_METAL, roughness: 0.86 }),
  ];
}

function buildHandPlane(p: PolyHavenPriorityPropParams): PolyHavenPriorityMeshPart[] {
  const sole = transform(roundedBox({ width: p.width * 0.98, height: p.height * 0.09, depth: p.depth * 0.96, radius: p.height * 0.018, steps: 2 }), {
    translate: vec3(0, p.height * 0.045, 0),
  });
  const body = merge(
    transform(roundedBox({ width: p.width * 0.9, height: p.height * 0.24, depth: p.depth * 0.9, radius: p.height * 0.035, steps: 3 }), {
      translate: vec3(0, p.height * 0.16, 0),
    }),
    ...[-1, 1].map((side) => transform(box(p.width * 0.82, p.height * 0.1, p.depth * 0.1), {
      translate: vec3(0, p.height * 0.25, side * p.depth * 0.42),
    })),
  );
  const bladeAngle = -0.34 - p.variation * 0.12;
  const blade = merge(
    transform(box(p.width * 0.24, p.height * 0.58, p.depth * 0.72), {
      rotate: vec3(0, 0, bladeAngle),
      translate: vec3(p.width * (0.02 + p.variation * 0.03), p.height * 0.39, 0),
    }),
    transform(box(p.width * 0.16, p.height * 0.08, p.depth * 0.78), {
      rotate: vec3(0, 0, bladeAngle),
      translate: vec3(-p.width * 0.11, p.height * 0.14, 0),
    }),
  );
  const handles = merge(
    transform(capsule(p.depth * 0.22, p.height * 0.34, 20, 5), {
      translate: vec3(-p.width * 0.29, p.height * 0.39, 0),
    }),
    curvedTube([
      vec3(p.width * 0.21, p.height * 0.24, 0),
      vec3(p.width * 0.25, p.height * 0.55, 0),
      vec3(p.width * 0.35, p.height * 0.9, 0),
      vec3(p.width * 0.42, p.height * 0.68, 0),
      vec3(p.width * 0.38, p.height * 0.32, 0),
    ], p.depth * 0.2, 12),
  );
  const adjuster = merge(
    transform(cylinder(p.height * 0.075, p.depth * 0.6, 20), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(p.width * 0.09, p.height * 0.38, 0) }),
    transform(torus(p.height * 0.08, p.height * 0.018, 20, 6), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(p.width * 0.09, p.height * 0.38, p.depth * 0.32) }),
    transform(cylinder(p.height * 0.035, p.depth * 0.82, 14), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.04, p.height * 0.28, 0) }),
  );
  const mouth = merge(
    transform(box(p.width * 0.15, p.height * 0.025, p.depth * 0.74), { translate: vec3(-p.width * 0.03, p.height * 0.095, 0) }),
    ...[-1, 1].map((side) => transform(box(p.width * 0.2, p.height * 0.03, p.depth * 0.08), { translate: vec3(-p.width * 0.03, p.height * 0.11, side * p.depth * 0.38) })),
  );
  return [
    part("hand_plane_body", "4 号手刨铸铁机身与侧壁", body, PLANE_IRON, "metal", { color: PLANE_IRON, roughness: 0.55, wear: p.damage }),
    part("hand_plane_sole", "手刨精磨底板", sole, REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.38 }),
    part("hand_plane_blade", "手刨斜置刨铁与压铁", blade, REGISTER_STEEL, "metal", { color: REGISTER_STEEL, roughness: 0.32 }),
    part("hand_plane_handles", "手刨前旋钮与后曲面握柄", handles, PLANE_WOOD, "wood", { color: PLANE_WOOD, roughness: 0.72 }),
    part("hand_plane_adjuster", "手刨深度调节轮、横杆与锁紧件", adjuster, BRASS, "metal", { color: BRASS, roughness: 0.42 }),
    part("hand_plane_mouth", "手刨底板刨口与刀口通道", mouth, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
  ];
}

export function buildPolyHavenPriorityPropMeshes(
  kind: PolyHavenPriorityPropKind,
  params: PolyHavenPriorityPropParams,
): PolyHavenPriorityMeshPart[] {
  switch (kind) {
    case "rectangular-airduct-kit": return buildAirductKit(params);
    case "welding-cart": return buildWeldingCart(params);
    case "film-projector": return buildFilmProjector(params);
    case "industrial-microscope": return buildMicroscope(params);
    case "cash-register": return buildCashRegister(params);
    case "overhead-crane": return buildOverheadCrane(params);
    case "vintage-microscope": return buildMicroscope(params, true);
    case "power-pole-system": return buildPowerPoleSystem(params);
    case "spinning-wheel": return buildSpinningWheel(params);
    case "aircon-unit": return buildAirconUnit(params);
    case "hand-plane": return buildHandPlane(params);
  }
}
