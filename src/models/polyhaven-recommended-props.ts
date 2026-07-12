import {
  box,
  cylinder,
  lathe,
  merge,
  polyline,
  roundedBox,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  type Mesh,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type PolyHavenRecommendedPropKind =
  | "circular-airduct-kit"
  | "electric-cable-kit"
  | "articulated-desk-lamp"
  | "gamepad";

export interface PolyHavenRecommendedPropParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenRecommendedMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const DARK_METAL: RGB = [0.045, 0.05, 0.05];
const DUCT_METAL: RGB = [0.25, 0.27, 0.27];
const DUCT_INTERIOR: RGB = [0.025, 0.028, 0.027];
const CABLE_RUBBER: RGB = [0.035, 0.038, 0.037];
const CABLE_GREY: RGB = [0.2, 0.22, 0.21];
const JUNCTION_WHITE: RGB = [0.68, 0.68, 0.62];
const LAMP_ORANGE: RGB = [0.86, 0.22, 0.015];
const LAMP_REFLECTOR: RGB = [0.72, 0.71, 0.65];
const SPRING_STEEL: RGB = [0.32, 0.34, 0.33];
const GAMEPAD_GREY: RGB = [0.55, 0.55, 0.51];
const GAMEPAD_DARK: RGB = [0.15, 0.15, 0.145];
const BUTTON_RED: RGB = [0.7, 0.035, 0.025];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenRecommendedMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function tube(from: Vec3, to: Vec3, radius: number, sides: number): Mesh {
  return sweep(polyline([from, to]), { radius, sides, caps: true });
}

function curvedTube(points: Vec3[], radius: number, sides: number): Mesh {
  return sweep(smoothCurve(polyline(points), 3), { radius, sides, caps: true });
}

function frame(width: number, height: number, thickness: number, depth: number, center: Vec3): Mesh {
  return merge(
    transform(box(width, thickness, depth), { translate: vec3(center.x, center.y - height / 2, center.z) }),
    transform(box(width, thickness, depth), { translate: vec3(center.x, center.y + height / 2, center.z) }),
    transform(box(thickness, height, depth), { translate: vec3(center.x - width / 2, center.y, center.z) }),
    transform(box(thickness, height, depth), { translate: vec3(center.x + width / 2, center.y, center.z) }),
  );
}

function buildCircularAirductKit(p: PolyHavenRecommendedPropParams): PolyHavenRecommendedMeshPart[] {
  const moduleCount = Math.max(6, Math.min(9, Math.round(p.structure * 0.45)));
  const slotWidth = p.width / moduleCount;
  const radius = Math.min(p.height * 0.27, slotWidth * 0.38, p.depth * 0.3);
  const sides = p.detail > 0 ? 24 : 12;
  const shells: Mesh[] = [];
  const corrugations: Mesh[] = [];
  const openings: Mesh[] = [];
  const fittings: Mesh[] = [];
  const hangers: Mesh[] = [];

  for (let index = 0; index < moduleCount; index++) {
    const x = -p.width / 2 + slotWidth * (index + 0.5);
    const sectionRadius = radius * (0.72 + (index % 3) * 0.12) * (0.9 + p.variation * 0.18);
    const sectionLength = slotWidth * 0.72;
    const centerY = sectionRadius + p.height * 0.035;
    const corrugated = index >= Math.floor(moduleCount / 2);
    const squareInlet = index === Math.floor(moduleCount / 2) - 1;
    if (squareInlet) {
      const inletSize = sectionRadius * 1.78;
      shells.push(transform(roundedBox({ width: sectionLength * 0.62, height: inletSize, depth: inletSize, radius: inletSize * 0.04, steps: 2 }), {
        translate: vec3(x, centerY, 0),
      }));
      fittings.push(frame(sectionLength * 0.68, inletSize * 1.04, inletSize * 0.045, inletSize * 1.06, vec3(x, centerY, sectionLength * 0.34)));
    } else {
      shells.push(transform(cylinder(sectionRadius, sectionLength, sides), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(x, centerY, 0),
      }));
    }
    const ringCount = corrugated ? (p.detail > 0 ? 11 : 7) : 2;
    for (let ring = 0; ring < ringCount; ring++) {
      const ringX = x - sectionLength * 0.44 + sectionLength * 0.88 * (ring / Math.max(1, ringCount - 1));
      corrugations.push(transform(torus(sectionRadius * 1.01, sectionRadius * (corrugated ? 0.035 : 0.055), sides, 6), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(ringX, centerY, 0),
      }));
    }
    openings.push(transform(cylinder(sectionRadius * 0.84, sectionLength * 0.018, sides), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(x + sectionLength * 0.51, centerY, 0),
    }));
    if (index === moduleCount - 2) {
      const hangerY = p.height * 0.92;
      hangers.push(
        tube(vec3(x - sectionRadius * 0.72, centerY, 0), vec3(x - sectionRadius * 0.72, hangerY, 0), sectionRadius * 0.035, 8),
        tube(vec3(x + sectionRadius * 0.72, centerY, 0), vec3(x + sectionRadius * 0.72, hangerY, 0), sectionRadius * 0.035, 8),
        tube(vec3(x - sectionRadius * 0.72, hangerY, 0), vec3(x + sectionRadius * 0.72, hangerY, 0), sectionRadius * 0.035, 8),
        transform(torus(sectionRadius * 1.05, sectionRadius * 0.035, sides, 6), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(x, centerY, 0) }),
      );
    }
  }

  return [
    part("circular_airduct_shells", "圆形风管直段、方圆转接箱与软管段", merge(...shells), DUCT_METAL, "metal", { color: DUCT_METAL, roughness: 0.64, rust: p.damage }),
    part("circular_airduct_corrugations", "圆风管加强环与波纹软管褶皱", merge(...corrugations), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.58, rust: p.damage }),
    part("circular_airduct_openings", "圆风管中空接口与暗色内腔", merge(...openings), DUCT_INTERIOR, "metal", { color: DUCT_INTERIOR, roughness: 0.84 }),
    part("circular_airduct_fittings", "方形风机接口法兰", merge(...fittings), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.55 }),
    part("circular_airduct_hangers", "圆风管吊杆、抱箍与横担", merge(...hangers), SPRING_STEEL, "metal", { color: SPRING_STEEL, roughness: 0.6 }),
  ];
}

function buildElectricCableKit(p: PolyHavenRecommendedPropParams): PolyHavenRecommendedMeshPart[] {
  const moduleCount = Math.max(5, Math.min(12, Math.round(p.structure * 0.55)));
  const slotWidth = p.width / moduleCount;
  const cableRadius = Math.min(slotWidth * 0.035, p.depth * 0.08);
  const cableSides = p.detail > 0 ? 9 : 6;
  const cables: Mesh[] = [];
  const connectors: Mesh[] = [];
  const junctions: Mesh[] = [];
  const clamps: Mesh[] = [];

  for (let index = 0; index < moduleCount; index++) {
    const x = -p.width / 2 + slotWidth * (index + 0.5);
    const cableCount = 2 + index % 3;
    const topY = p.height * (0.7 + (index % 3) * 0.12);
    const bend = slotWidth * (0.12 + p.variation * 0.22) * (index % 2 === 0 ? 1 : -1);
    for (let cable = 0; cable < cableCount; cable++) {
      const offsetX = (cable - (cableCount - 1) / 2) * cableRadius * 3.2;
      cables.push(curvedTube([
        vec3(x + offsetX, p.height * 0.08, 0),
        vec3(x + offsetX, p.height * 0.34, 0),
        vec3(x + offsetX + bend, topY * 0.72, 0),
        vec3(x + offsetX + bend, topY, 0),
      ], cableRadius, cableSides));
      connectors.push(
        transform(roundedBox({ width: cableRadius * 3, height: cableRadius * 2.2, depth: p.depth * 0.42, radius: cableRadius * 0.45, steps: 2 }), { translate: vec3(x + offsetX, p.height * 0.07, 0) }),
        transform(roundedBox({ width: cableRadius * 3, height: cableRadius * 2.2, depth: p.depth * 0.42, radius: cableRadius * 0.45, steps: 2 }), { translate: vec3(x + offsetX + bend, topY, 0) }),
      );
    }
    if (index % 3 === 0) {
      junctions.push(transform(roundedBox({ width: slotWidth * 0.55, height: p.height * 0.22, depth: p.depth * 0.72, radius: slotWidth * 0.035, steps: 2 }), {
        translate: vec3(x, p.height * 0.25, 0),
      }));
    }
    const clampCount = p.detail > 0 ? 3 : 2;
    for (let clampIndex = 0; clampIndex < clampCount; clampIndex++) {
      clamps.push(transform(box(slotWidth * 0.45, cableRadius * 1.8, p.depth * 0.5), {
        translate: vec3(x, p.height * (0.2 + clampIndex * 0.17), 0),
      }));
    }
  }

  return [
    part("electric_cable_runs", "模块化多芯电缆直段、分叉与弯曲段", merge(...cables), CABLE_RUBBER, "rubber", { color: CABLE_RUBBER, roughness: 0.86 }),
    part("electric_cable_connectors", "电缆端头、插接头与应力护套", merge(...connectors), CABLE_GREY, "plastic", { color: CABLE_GREY, roughness: 0.7, wear: p.damage }),
    part("electric_cable_junctions", "模块化接线盒与分线器", merge(...junctions), JUNCTION_WHITE, "painted-metal", { color: JUNCTION_WHITE, roughness: 0.68, wear: p.damage }),
    part("electric_cable_clamps", "电缆固定卡箍与桥接压片", merge(...clamps), SPRING_STEEL, "metal", { color: SPRING_STEEL, roughness: 0.58 }),
  ];
}

function springBetween(from: Vec3, to: Vec3, radius: number, turns: number): Mesh {
  const points: Vec3[] = [];
  const samples = turns * 8;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    const wave = Math.sin(t * turns * Math.PI * 2) * radius * 2.6;
    points.push(vec3(from.x + dx * t + perpendicularX * wave, from.y + dy * t + perpendicularY * wave, from.z));
  }
  return sweep(polyline(points), { radius, sides: 6, caps: true });
}

function buildArticulatedDeskLamp(p: PolyHavenRecommendedPropParams): PolyHavenRecommendedMeshPart[] {
  const railRadius = Math.min(p.width, p.depth) * 0.018;
  const clampX = p.width * 0.28;
  const baseY = p.height * 0.07;
  const elbow = vec3(p.width * (0.12 - p.variation * 0.16), p.height * (0.48 + p.variation * 0.08), 0);
  const headPivot = vec3(-p.width * (0.34 + p.variation * 0.12), p.height * (0.78 - p.variation * 0.05), 0);
  const rails: Mesh[] = [];
  const springs: Mesh[] = [];
  for (const zSide of [-1, 1]) {
    const z = zSide * p.depth * 0.08;
    rails.push(
      tube(vec3(clampX, baseY + p.height * 0.05, z), vec3(elbow.x, elbow.y, z), railRadius, 10),
      tube(vec3(elbow.x, elbow.y, z), vec3(headPivot.x, headPivot.y, z), railRadius, 10),
    );
    springs.push(
      springBetween(vec3(clampX - p.width * 0.015, baseY + p.height * 0.12, z), vec3(elbow.x - p.width * 0.035, elbow.y - p.height * 0.08, z), railRadius * 0.28, p.detail > 0 ? 12 : 7),
      springBetween(vec3(elbow.x - p.width * 0.025, elbow.y + p.height * 0.04, z), vec3(headPivot.x + p.width * 0.04, headPivot.y - p.height * 0.04, z), railRadius * 0.28, p.detail > 0 ? 11 : 7),
    );
  }
  const clamp = merge(
    transform(roundedBox({ width: p.width * 0.15, height: p.height * 0.12, depth: p.depth * 0.34, radius: railRadius, steps: 2 }), { translate: vec3(clampX, baseY, 0) }),
    transform(box(p.width * 0.13, p.height * 0.035, p.depth * 0.52), { translate: vec3(clampX, p.height * 0.015, 0) }),
    transform(cylinder(p.width * 0.022, p.height * 0.12, 12), { translate: vec3(clampX, p.height * 0.02, p.depth * 0.2) }),
  );
  const joints = merge(
    ...[vec3(clampX, baseY + p.height * 0.07, 0), elbow, headPivot].map((position) => transform(cylinder(railRadius * 2.5, p.depth * 0.23, 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: position,
    })),
  );
  const shadeRadius = Math.min(p.depth * 0.46, p.width * 0.18);
  const shadeLength = shadeRadius * 0.72;
  const shade = merge(
    transform(lathe([
      vec2(shadeRadius, -shadeLength / 2),
      vec2(shadeRadius * 0.52, shadeLength / 2),
      vec2(shadeRadius * 0.43, shadeLength * 0.42),
      vec2(shadeRadius * 0.86, -shadeLength * 0.42),
    ], { segments: p.detail > 0 ? 28 : 16 }), {
      rotate: vec3(0, 0, Math.PI / 2 - 0.3),
      translate: vec3(headPivot.x - shadeRadius * 0.34, headPivot.y + shadeRadius * 0.04, 0),
    }),
    transform(cylinder(shadeRadius * 0.52, shadeRadius * 0.58, 20), {
      rotate: vec3(0, 0, Math.PI / 2 - 0.3),
      translate: vec3(headPivot.x + shadeRadius * 0.3, headPivot.y - shadeRadius * 0.08, 0),
    }),
  );
  const bulb = transform(sphere(shadeRadius * 0.38, 18, 10), {
    scale: vec3(0.78, 1, 0.78),
    translate: vec3(headPivot.x - shadeRadius * 0.58, headPivot.y + shadeRadius * 0.14, 0),
  });

  return [
    part("desk_lamp_clamp", "台灯桌边夹座与锁紧螺杆", clamp, LAMP_ORANGE, "painted-metal", { color: LAMP_ORANGE, roughness: 0.56, wear: p.damage }),
    part("desk_lamp_arms", "台灯上下双平行连杆", merge(...rails), LAMP_ORANGE, "painted-metal", { color: LAMP_ORANGE, roughness: 0.54, wear: p.damage }),
    part("desk_lamp_springs", "台灯双段拉簧与平衡机构", merge(...springs), SPRING_STEEL, "metal", { color: SPRING_STEEL, roughness: 0.42 }),
    part("desk_lamp_joints", "台灯底轴、中轴与灯头转轴", joints, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.48 }),
    part("desk_lamp_shade", "台灯喇叭形金属灯罩", shade, LAMP_ORANGE, "painted-metal", { color: LAMP_ORANGE, roughness: 0.5, wear: p.damage }, true),
    part("desk_lamp_bulb", "台灯反光内壁与灯泡", bulb, LAMP_REFLECTOR, "glass", { color: LAMP_REFLECTOR, roughness: 0.15, emission: 0.08 }),
  ];
}

function buildGamepad(p: PolyHavenRecommendedPropParams): PolyHavenRecommendedMeshPart[] {
  const bodyWidth = p.width * 0.38;
  const bodyDepth = p.depth * 0.14;
  const bodyHeight = p.height * 0.82;
  const bodyX = p.width * 0.24;
  const bodyZ = p.depth * 0.35;
  const bodyY = bodyHeight / 2;
  const body = merge(
    transform(roundedBox({ width: bodyWidth * 0.68, height: bodyHeight, depth: bodyDepth * 0.92, radius: Math.min(bodyHeight * 0.38, bodyDepth * 0.2), steps: 3 }), { translate: vec3(bodyX, bodyY, bodyZ) }),
    transform(sphere(bodyDepth * 0.55, 18, 10), { scale: vec3(1.08, bodyHeight / bodyDepth, 0.92), translate: vec3(bodyX - bodyWidth * 0.32, bodyY, bodyZ + bodyDepth * 0.04) }),
    transform(sphere(bodyDepth * 0.55, 18, 10), { scale: vec3(1.08, bodyHeight / bodyDepth, 0.92), translate: vec3(bodyX + bodyWidth * 0.32, bodyY, bodyZ + bodyDepth * 0.04) }),
  );
  const topY = bodyHeight * 1.03;
  const dpadX = bodyX - bodyWidth * 0.25;
  const dpad = merge(
    transform(roundedBox({ width: bodyWidth * 0.24, height: bodyHeight * 0.18, depth: bodyDepth * 0.13, radius: bodyHeight * 0.05, steps: 2 }), { translate: vec3(dpadX, topY, bodyZ) }),
    transform(roundedBox({ width: bodyWidth * 0.09, height: bodyHeight * 0.18, depth: bodyDepth * 0.34, radius: bodyHeight * 0.05, steps: 2 }), { translate: vec3(dpadX, topY, bodyZ) }),
  );
  const redFaceButtons: Mesh[] = [];
  const darkFaceButtons: Mesh[] = [];
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + index * Math.PI / 2;
    const button = transform(cylinder(bodyHeight * 0.36, bodyHeight * 0.2, 16), {
      translate: vec3(bodyX + bodyWidth * 0.25 + Math.cos(angle) * bodyWidth * 0.095, topY, bodyZ + Math.sin(angle) * bodyDepth * 0.2),
    });
    (Math.cos(angle) < 0 ? redFaceButtons : darkFaceButtons).push(button);
  }
  const systemButtons = merge(
    transform(roundedBox({ width: bodyWidth * 0.12, height: bodyHeight * 0.14, depth: bodyDepth * 0.08, radius: bodyHeight * 0.04, steps: 2 }), { translate: vec3(bodyX - bodyWidth * 0.07, topY, bodyZ) }),
    transform(roundedBox({ width: bodyWidth * 0.12, height: bodyHeight * 0.14, depth: bodyDepth * 0.08, radius: bodyHeight * 0.04, steps: 2 }), { translate: vec3(bodyX + bodyWidth * 0.07, topY, bodyZ) }),
  );
  const slack = p.variation * p.depth * 0.08;
  const cable = curvedTube([
    vec3(bodyX, bodyHeight * 0.45, bodyZ - bodyDepth * 0.55),
    vec3(p.width * 0.42, bodyHeight * 0.45, p.depth * 0.14),
    vec3(p.width * 0.22, bodyHeight * 0.4, -p.depth * 0.18 - slack),
    vec3(-p.width * 0.02, bodyHeight * 0.42, -p.depth * 0.35),
    vec3(-p.width * 0.3, bodyHeight * 0.4, -p.depth * 0.08 + slack),
    vec3(-p.width * 0.38, bodyHeight * 0.42, p.depth * 0.28),
  ], Math.max(p.height * 0.16, p.width * 0.006), 8);
  const connector = merge(
    transform(roundedBox({ width: p.width * 0.1, height: bodyHeight * 0.8, depth: p.depth * 0.055, radius: bodyHeight * 0.12, steps: 2 }), { translate: vec3(-p.width * 0.4, bodyY, p.depth * 0.32) }),
    ...[-1, 0, 1].map((offset) => transform(box(p.width * 0.008, bodyHeight * 0.3, p.depth * 0.018), { translate: vec3(-p.width * 0.4 + offset * p.width * 0.018, bodyHeight * 0.9, p.depth * 0.292) })),
  );

  return [
    part("gamepad_shell", "复古有线手柄圆角机壳与握持翼", body, GAMEPAD_GREY, "plastic", { color: GAMEPAD_GREY, roughness: 0.66, wear: p.damage }),
    part("gamepad_dpad", "手柄十字方向键", dpad, GAMEPAD_DARK, "plastic", { color: GAMEPAD_DARK, roughness: 0.62 }),
    part("gamepad_face_buttons", "手柄红色动作键", merge(...redFaceButtons), BUTTON_RED, "plastic", { color: BUTTON_RED, roughness: 0.48 }),
    part("gamepad_dark_face_buttons", "手柄深灰动作键", merge(...darkFaceButtons), GAMEPAD_DARK, "plastic", { color: GAMEPAD_DARK, roughness: 0.52 }),
    part("gamepad_system_buttons", "手柄选择与开始键", systemButtons, GAMEPAD_DARK, "plastic", { color: GAMEPAD_DARK, roughness: 0.68 }),
    part("gamepad_cable", "手柄盘绕信号线与护套", cable, CABLE_RUBBER, "rubber", { color: CABLE_RUBBER, roughness: 0.86 }),
    part("gamepad_connector", "手柄主机插头与触点槽", connector, GAMEPAD_DARK, "plastic", { color: GAMEPAD_DARK, roughness: 0.7 }),
  ];
}

export function buildPolyHavenRecommendedPropMeshes(
  kind: PolyHavenRecommendedPropKind,
  params: PolyHavenRecommendedPropParams,
): PolyHavenRecommendedMeshPart[] {
  switch (kind) {
    case "circular-airduct-kit": return buildCircularAirductKit(params);
    case "electric-cable-kit": return buildElectricCableKit(params);
    case "articulated-desk-lamp": return buildArticulatedDeskLamp(params);
    case "gamepad": return buildGamepad(params);
  }
}
