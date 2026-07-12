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

export type PolyHavenTopCandidateKind =
  | "grandfather-clock"
  | "cordless-drill"
  | "security-camera"
  | "metal-tool-chest"
  | "modular-fire-escape"
  | "rangefinder-camera"
  | "modular-wooden-pier"
  | "modular-chainlink-fence";

export interface PolyHavenTopCandidateParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenTopCandidateMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const DARK_WOOD: RGB = [0.2, 0.075, 0.025];
const WARM_WOOD: RGB = [0.34, 0.14, 0.045];
const AGED_BRASS: RGB = [0.48, 0.31, 0.075];
const CLOCK_FACE: RGB = [0.65, 0.59, 0.46];
const CLOCK_INK: RGB = [0.045, 0.04, 0.032];
const DRILL_GREEN: RGB = [0.54, 0.62, 0.04];
const DRILL_BLACK: RGB = [0.035, 0.04, 0.038];
const DRILL_METAL: RGB = [0.3, 0.31, 0.29];
const CAMERA_METAL: RGB = [0.42, 0.43, 0.41];
const CAMERA_FACE: RGB = [0.16, 0.17, 0.16];
const CAMERA_GLASS: RGB = [0.1, 0.14, 0.15];
const TOOL_RED: RGB = [0.52, 0.045, 0.025];
const TOOL_DARK: RGB = [0.1, 0.055, 0.045];
const FIRE_ESCAPE: RGB = [0.055, 0.06, 0.058];
const CAMERA_BLACK: RGB = [0.025, 0.027, 0.025];
const CAMERA_CHROME: RGB = [0.38, 0.36, 0.3];
const STRAP_LEATHER: RGB = [0.16, 0.055, 0.025];
const PIER_WOOD: RGB = [0.23, 0.13, 0.06];
const PIER_DARK_WOOD: RGB = [0.12, 0.075, 0.04];
const FENCE_STEEL: RGB = [0.26, 0.29, 0.27];
const FENCE_GREEN: RGB = [0.08, 0.2, 0.15];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenTopCandidateMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function tube(from: Vec3, to: Vec3, radius: number, sides: number): Mesh {
  return sweep(polyline([from, to]), { radius, sides, caps: true });
}

function buildGrandfatherClock(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const frontZ = p.depth * 0.49;
  const caseWidth = p.width * 0.72;
  const clockRadius = caseWidth * (0.39 + p.variation * 0.045);
  const clockY = p.height * 0.785;
  const trimDepth = p.depth * 0.055;
  const body = merge(
    transform(roundedBox({ width: p.width * 0.72, height: p.height * 0.61, depth: p.depth * 0.7, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(0, p.height * 0.36, 0),
    }),
    transform(roundedBox({ width: p.width * 0.86, height: p.height * 0.24, depth: p.depth * 0.78, radius: p.width * 0.055, steps: 3 }), {
      translate: vec3(0, p.height * 0.79, 0),
    }),
    transform(cylinder(p.width * 0.43, p.depth * 0.76, p.detail > 0 ? 32 : 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, p.height * 0.82, 0),
    }),
    transform(roundedBox({ width: p.width * 0.95, height: p.height * 0.095, depth: p.depth * 0.9, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(0, p.height * 0.0475, 0),
    }),
    transform(roundedBox({ width: p.width, height: p.height * 0.055, depth: p.depth, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(0, p.height * 0.015, 0),
    }),
  );
  const moldings: Mesh[] = [];
  for (const y of [0.08, 0.12, 0.66, 0.7, 0.92]) {
    moldings.push(transform(roundedBox({
      width: p.width * (y > 0.9 ? 0.96 : 0.84),
      height: p.height * 0.025,
      depth: p.depth * 0.86,
      radius: p.width * 0.012,
      steps: 1,
    }), { translate: vec3(0, p.height * y, 0) }));
  }
  for (const side of [-1, 1]) {
    moldings.push(
      transform(box(p.width * 0.045, p.height * 0.48, p.depth * 0.045), {
        translate: vec3(side * p.width * 0.31, p.height * 0.38, frontZ + trimDepth),
      }),
      transform(cylinder(p.width * 0.032, p.height * 0.51, 12), {
        translate: vec3(side * p.width * 0.35, p.height * 0.385, frontZ + trimDepth * 1.15),
      }),
    );
  }
  const face = merge(
    transform(cylinder(clockRadius, trimDepth, p.detail > 0 ? 40 : 24), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, clockY, frontZ + trimDepth),
    }),
    transform(torus(clockRadius * 1.03, clockRadius * 0.055, p.detail > 0 ? 40 : 24, 8), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, clockY, frontZ + trimDepth * 1.65),
    }),
  );
  const markings: Mesh[] = [];
  const tickCount = p.detail > 0 ? 12 : 4;
  for (let index = 0; index < tickCount; index++) {
    const angle = index / tickCount * Math.PI * 2;
    markings.push(transform(box(clockRadius * 0.035, clockRadius * 0.18, trimDepth * 0.16), {
      rotate: vec3(0, 0, -angle),
      translate: vec3(
        Math.sin(angle) * clockRadius * 0.76,
        clockY + Math.cos(angle) * clockRadius * 0.76,
        frontZ + trimDepth * 2.2,
      ),
    }));
  }
  const handAngle = -0.45 + p.variation * 1.2;
  const hands = merge(
    tube(
      vec3(0, clockY, frontZ + trimDepth * 2.35),
      vec3(Math.sin(handAngle) * clockRadius * 0.58, clockY + Math.cos(handAngle) * clockRadius * 0.58, frontZ + trimDepth * 2.35),
      clockRadius * 0.025,
      8,
    ),
    tube(
      vec3(0, clockY, frontZ + trimDepth * 2.4),
      vec3(-clockRadius * 0.36, clockY + clockRadius * 0.16, frontZ + trimDepth * 2.4),
      clockRadius * 0.03,
      8,
    ),
    transform(cylinder(clockRadius * 0.06, trimDepth * 0.3, 16), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, clockY, frontZ + trimDepth * 2.4),
    }),
  );
  const lowerDoor = merge(
    transform(roundedBox({ width: p.width * 0.5, height: p.height * 0.36, depth: trimDepth, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(0, p.height * 0.36, frontZ + trimDepth),
    }),
    transform(roundedBox({ width: p.width * 0.4, height: p.height * 0.27, depth: trimDepth * 0.35, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(0, p.height * 0.36, frontZ + trimDepth * 1.65),
    }),
  );
  const pendulum = merge(
    tube(vec3(0, p.height * 0.62, frontZ + trimDepth * 1.75), vec3(0, p.height * 0.27, frontZ + trimDepth * 1.75), p.width * 0.012, 8),
    transform(cylinder(p.width * 0.11, trimDepth * 0.35, 24), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, p.height * 0.25, frontZ + trimDepth * 1.75),
    }),
  );

  return [
    part("grandfather_clock_case", "老式座钟胡桃木钟体与拱形顶箱", body, DARK_WOOD, "wood", { color: DARK_WOOD, roughness: 0.55, wear: p.damage }),
    part("grandfather_clock_moldings", "座钟底座、檐口、立柱与装饰线脚", merge(...moldings), WARM_WOOD, "wood", { color: WARM_WOOD, roughness: 0.5, wear: p.damage }),
    part("grandfather_clock_face", "座钟黄铜包边珐琅表盘", face, CLOCK_FACE, "metal", { color: CLOCK_FACE, roughness: 0.38 }),
    part("grandfather_clock_marks", "座钟十二时标与双指针", merge(...markings, hands), CLOCK_INK, "metal", { color: CLOCK_INK, roughness: 0.48 }),
    part("grandfather_clock_door", "座钟下柜门与内凹木饰面", lowerDoor, WARM_WOOD, "wood", { color: WARM_WOOD, roughness: 0.58, wear: p.damage }),
    part("grandfather_clock_pendulum", "座钟黄铜摆杆与摆锤", pendulum, AGED_BRASS, "metal", { color: AGED_BRASS, roughness: 0.42 }),
  ];
}

function buildCordlessDrill(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const bodyY = p.height * 0.7;
  const bodyLength = p.width * (0.58 + p.variation * 0.08);
  const chuckX = -p.width * 0.37;
  const shell = merge(
    transform(roundedBox({ width: bodyLength, height: p.height * 0.3, depth: p.depth * 0.82, radius: p.height * 0.08, steps: 3 }), {
      translate: vec3(p.width * 0.08, bodyY, 0),
    }),
    transform(capsule(p.height * 0.13, p.width * 0.3, p.detail > 0 ? 20 : 12, 4), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(p.width * 0.25, bodyY + p.height * 0.015, 0),
    }),
  );
  const handle = merge(
    transform(roundedBox({ width: p.width * 0.2, height: p.height * 0.5, depth: p.depth * 0.68, radius: p.width * 0.055, steps: 3 }), {
      rotate: vec3(0, 0, -0.18 + p.variation * 0.08),
      translate: vec3(p.width * 0.13, p.height * 0.39, 0),
    }),
    transform(roundedBox({ width: p.width * 0.14, height: p.height * 0.3, depth: p.depth * 0.72, radius: p.width * 0.035, steps: 2 }), {
      rotate: vec3(0, 0, -0.18 + p.variation * 0.08),
      translate: vec3(p.width * 0.11, p.height * 0.42, 0),
    }),
  );
  const chuck = merge(
    transform(cylinder(p.height * 0.115, p.width * 0.2, p.detail > 0 ? 24 : 14), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(chuckX, bodyY, 0),
    }),
    transform(cylinder(p.height * 0.09, p.width * 0.13, p.detail > 0 ? 24 : 14), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(chuckX - p.width * 0.14, bodyY, 0),
    }),
    transform(cylinder(p.height * 0.034, p.width * 0.14, 14), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(chuckX - p.width * 0.25, bodyY, 0),
    }),
  );
  const chuckRibs: Mesh[] = [];
  const ribCount = p.detail > 0 ? 12 : 6;
  for (let index = 0; index < ribCount; index++) {
    const angle = index / ribCount * Math.PI * 2;
    chuckRibs.push(transform(box(p.width * 0.13, p.height * 0.018, p.depth * 0.035), {
      rotate: vec3(angle, 0, 0),
      translate: vec3(chuckX - p.width * 0.02, Math.cos(angle) * p.height * 0.1 + bodyY, Math.sin(angle) * p.height * 0.1),
    }));
  }
  const battery = merge(
    transform(roundedBox({ width: p.width * 0.42, height: p.height * 0.24, depth: p.depth, radius: p.width * 0.055, steps: 3 }), {
      translate: vec3(p.width * 0.13, p.height * 0.12, 0),
    }),
    transform(roundedBox({ width: p.width * 0.28, height: p.height * 0.08, depth: p.depth * 0.82, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(p.width * 0.1, p.height * 0.265, 0),
    }),
  );
  const controls = merge(
    transform(roundedBox({ width: p.width * 0.08, height: p.height * 0.09, depth: p.depth * 0.84, radius: p.width * 0.018, steps: 2 }), {
      translate: vec3(-p.width * 0.035, p.height * 0.58, 0),
    }),
    transform(box(p.width * 0.1, p.height * 0.035, p.depth * 0.45), {
      translate: vec3(p.width * 0.14, p.height * 0.86, 0),
    }),
  );

  return [
    part("cordless_drill_shell", "无绳电钻黄绿色电机外壳", shell, DRILL_GREEN, "plastic", { color: DRILL_GREEN, roughness: 0.56, wear: p.damage }),
    part("cordless_drill_grip", "无绳电钻防滑手柄与黑色软胶包覆", handle, DRILL_BLACK, "rubber", { color: DRILL_BLACK, roughness: 0.82 }),
    part("cordless_drill_chuck", "无绳电钻扭矩环、夹头与钻头", merge(chuck, ...chuckRibs), DRILL_BLACK, "metal", { color: DRILL_BLACK, roughness: 0.52, wear: p.damage }),
    part("cordless_drill_battery", "无绳电钻可拆锂电池底座", battery, DRILL_BLACK, "plastic", { color: DRILL_BLACK, roughness: 0.68, wear: p.damage }),
    part("cordless_drill_controls", "无绳电钻扳机、正反转拨杆与档位开关", controls, DRILL_METAL, "plastic", { color: DRILL_METAL, roughness: 0.62 }),
  ];
}

function buildSecurityCamera(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const frontZ = p.depth * 0.47;
  const bodyY = p.height * 0.67;
  const shell = merge(
    transform(roundedBox({ width: p.width * 0.88, height: p.height * 0.42, depth: p.depth * 0.72, radius: p.width * 0.11, steps: 4 }), {
      translate: vec3(0, bodyY, p.depth * 0.03),
    }),
    transform(roundedBox({ width: p.width, height: p.height * 0.08, depth: p.depth * (0.88 + p.variation * 0.08), radius: p.width * 0.08, steps: 3 }), {
      translate: vec3(0, p.height * 0.91, 0),
    }),
    transform(box(p.width * 0.93, p.height * 0.12, p.depth * 0.06), {
      translate: vec3(0, p.height * 0.78, frontZ),
    }),
  );
  const face = merge(
    transform(roundedBox({ width: p.width * 0.72, height: p.height * 0.29, depth: p.depth * 0.035, radius: p.width * 0.09, steps: 3 }), {
      translate: vec3(0, bodyY, frontZ + p.depth * 0.045),
    }),
    transform(torus(p.width * 0.24, p.width * 0.025, p.detail > 0 ? 32 : 18, 8), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyY, frontZ + p.depth * 0.07),
    }),
  );
  const lens = merge(
    transform(cylinder(p.width * 0.19, p.depth * 0.08, 28), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyY, frontZ + p.depth * 0.08),
    }),
    transform(cylinder(p.width * 0.1, p.depth * 0.1, 24), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyY, frontZ + p.depth * 0.13),
    }),
    transform(cylinder(p.width * 0.045, p.depth * 0.03, 20), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyY, frontZ + p.depth * 0.19),
    }),
  );
  const pivotY = p.height * (0.29 + p.variation * 0.08);
  const bracket = merge(
    transform(roundedBox({ width: p.width * 0.72, height: p.height * 0.08, depth: p.depth * 0.38, radius: p.width * 0.04, steps: 2 }), {
      translate: vec3(0, p.height * 0.08, -p.depth * 0.18),
    }),
    tube(vec3(-p.width * 0.32, p.height * 0.11, -p.depth * 0.18), vec3(-p.width * 0.32, pivotY, 0), p.width * 0.035, 10),
    tube(vec3(p.width * 0.32, p.height * 0.11, -p.depth * 0.18), vec3(p.width * 0.32, pivotY, 0), p.width * 0.035, 10),
    tube(vec3(-p.width * 0.32, pivotY, 0), vec3(p.width * 0.32, pivotY, 0), p.width * 0.035, 10),
    transform(cylinder(p.width * 0.1, p.width * 0.82, 20), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, pivotY, 0),
    }),
  );
  const fasteners: Mesh[] = [];
  for (const x of [-0.29, 0.29]) {
    for (const y of [-0.1, 0.1]) {
      fasteners.push(transform(cylinder(p.width * 0.028, p.depth * 0.025, 12), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(p.width * x, bodyY + p.height * y, frontZ + p.depth * 0.09),
      }));
    }
  }

  return [
    part("security_camera_housing", "户外监控摄像机金属防雨罩与机身", shell, CAMERA_METAL, "metal", { color: CAMERA_METAL, roughness: 0.48, wear: p.damage }),
    part("security_camera_face", "监控摄像机深色前面板与镜头压圈", face, CAMERA_FACE, "plastic", { color: CAMERA_FACE, roughness: 0.62 }),
    part("security_camera_lens", "监控摄像机多层光学镜头", lens, CAMERA_GLASS, "glass", { color: CAMERA_GLASS, roughness: 0.08, transmission: 0.38 }),
    part("security_camera_bracket", "监控摄像机可调壁装支架与转轴", bracket, CAMERA_METAL, "metal", { color: CAMERA_METAL, roughness: 0.56, wear: p.damage }),
    part("security_camera_fasteners", "监控摄像机前盖与支架紧固件", merge(...fasteners), DRILL_METAL, "metal", { color: DRILL_METAL, roughness: 0.4 }),
  ];
}

function buildMetalToolChest(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const cabinetHeight = p.height * 0.7;
  const frontZ = p.depth * 0.49;
  const shell = merge(
    transform(roundedBox({ width: p.width, height: cabinetHeight, depth: p.depth, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(0, cabinetHeight / 2, 0),
    }),
    transform(box(p.width * 0.94, p.height * 0.045, p.depth * 0.9), {
      translate: vec3(0, cabinetHeight - p.height * 0.05, 0),
    }),
  );
  const drawerCount = Math.max(3, Math.min(7, Math.round(p.structure * 0.35)));
  const drawerGap = p.height * 0.012;
  const drawerHeight = p.height * 0.48 / drawerCount;
  const drawers: Mesh[] = [];
  const pulls: Mesh[] = [];
  for (let index = 0; index < drawerCount; index++) {
    const y = p.height * 0.1 + drawerHeight / 2 + index * (drawerHeight + drawerGap);
    drawers.push(transform(roundedBox({ width: p.width * 0.9, height: drawerHeight, depth: p.depth * 0.045, radius: p.width * 0.012, steps: 1 }), {
      translate: vec3(0, y, frontZ + p.depth * 0.025),
    }));
    pulls.push(transform(capsule(p.height * 0.012, p.width * (0.62 + p.variation * 0.12), 12, 3), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, y, frontZ + p.depth * 0.065),
    }));
  }
  const lidAngle = -0.12 - p.variation * 0.22;
  const lid = merge(
    transform(roundedBox({ width: p.width * 0.98, height: p.height * 0.3, depth: p.depth * 0.06, radius: p.width * 0.025, steps: 2 }), {
      rotate: vec3(lidAngle, 0, 0),
      translate: vec3(0, p.height * 0.83, -p.depth * 0.4),
    }),
    transform(box(p.width * 0.9, p.height * 0.025, p.depth * 0.7), {
      translate: vec3(0, p.height * 0.72, -p.depth * 0.02),
    }),
  );
  const supports = merge(
    tube(vec3(-p.width * 0.44, p.height * 0.67, p.depth * 0.35), vec3(-p.width * 0.44, p.height * 0.88, -p.depth * 0.35), p.width * 0.012, 8),
    tube(vec3(p.width * 0.44, p.height * 0.67, p.depth * 0.35), vec3(p.width * 0.44, p.height * 0.88, -p.depth * 0.35), p.width * 0.012, 8),
  );
  const hardware = merge(
    ...pulls,
    transform(cylinder(p.width * 0.025, p.depth * 0.04, 14), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, p.height * 0.62, frontZ + p.depth * 0.08),
    }),
    transform(roundedBox({ width: p.width * 0.05, height: p.height * 0.14, depth: p.depth * 0.06, radius: p.width * 0.012, steps: 1 }), {
      translate: vec3(-p.width * 0.5, p.height * 0.45, 0),
    }),
    transform(roundedBox({ width: p.width * 0.05, height: p.height * 0.14, depth: p.depth * 0.06, radius: p.width * 0.012, steps: 1 }), {
      translate: vec3(p.width * 0.5, p.height * 0.45, 0),
    }),
  );

  return [
    part("tool_chest_cabinet", "红色金属工具柜箱体与顶层工具槽", shell, TOOL_RED, "painted-metal", { color: TOOL_RED, roughness: 0.66, wear: p.damage }),
    part("tool_chest_drawers", "工具柜多层抽屉面板", merge(...drawers), TOOL_RED, "painted-metal", { color: TOOL_RED, roughness: 0.64, wear: p.damage }),
    part("tool_chest_lid", "工具柜开启式翻盖与内侧衬板", lid, TOOL_DARK, "painted-metal", { color: TOOL_DARK, roughness: 0.7, wear: p.damage }),
    part("tool_chest_lid_supports", "工具柜双侧翻盖支撑杆", supports, DRILL_METAL, "metal", { color: DRILL_METAL, roughness: 0.5 }),
    part("tool_chest_hardware", "工具柜抽屉拉手、锁芯与侧提手", hardware, DRILL_METAL, "metal", { color: DRILL_METAL, roughness: 0.44, wear: p.damage }),
  ];
}

function buildModularFireEscape(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const sides = p.detail > 0 ? 10 : 6;
  const levels = Math.max(2, Math.min(4, Math.round(p.structure / 5)));
  const levelHeight = p.height / levels;
  const platformWidth = p.width * 0.44;
  const platformDepth = p.depth * 0.78;
  const beam = Math.min(p.width, p.depth) * 0.035;
  const platforms: Mesh[] = [];
  const stairs: Mesh[] = [];
  const rails: Mesh[] = [];
  const ladders: Mesh[] = [];
  const grating: Mesh[] = [];
  const railHeight = levelHeight * 0.24;
  for (let level = 0; level < levels; level++) {
    const y = level * levelHeight + beam;
    const side = level % 2 === 0 ? -1 : 1;
    const x = side * p.width * 0.27;
    platforms.push(transform(box(platformWidth, beam * 1.8, platformDepth), { translate: vec3(x, y, 0) }));
    const grateCount = p.detail > 0 ? 9 : 5;
    for (let index = 0; index < grateCount; index++) {
      grating.push(transform(box(platformWidth * 0.94, beam * 0.35, beam * 0.3), {
        translate: vec3(x, y + beam, -platformDepth * 0.43 + index * platformDepth * 0.86 / Math.max(1, grateCount - 1)),
      }));
    }
    for (const z of [-platformDepth * 0.46, platformDepth * 0.46]) {
      rails.push(
        tube(vec3(x - platformWidth * 0.48, y, z), vec3(x - platformWidth * 0.48, y + railHeight, z), beam * 0.42, sides),
        tube(vec3(x + platformWidth * 0.48, y, z), vec3(x + platformWidth * 0.48, y + railHeight, z), beam * 0.42, sides),
        tube(vec3(x - platformWidth * 0.48, y + railHeight, z), vec3(x + platformWidth * 0.48, y + railHeight, z), beam * 0.42, sides),
      );
      const railPostCount = p.detail > 0 ? 7 : 4;
      for (let post = 1; post < railPostCount - 1; post++) {
        const postX = x - platformWidth * 0.48 + platformWidth * 0.96 * post / (railPostCount - 1);
        rails.push(tube(vec3(postX, y, z), vec3(postX, y + railHeight, z), beam * 0.25, sides));
      }
    }
    if (level < levels - 1) {
      const nextSide = -side;
      const nextX = nextSide * p.width * 0.27;
      const from = vec3(x + side * platformWidth * 0.34, y + beam, 0);
      const to = vec3(nextX - nextSide * platformWidth * 0.34, y + levelHeight, 0);
      const stepCount = Math.max(7, Math.min(16, Math.round(p.structure * 0.75)));
      for (let step = 0; step < stepCount; step++) {
        const t = step / Math.max(1, stepCount - 1);
        stairs.push(transform(box(p.width * 0.055, beam * 1.2, platformDepth * 0.72), {
          translate: vec3(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 0),
        }));
      }
      for (const z of [-platformDepth * 0.36, platformDepth * 0.36]) {
        rails.push(
          tube(vec3(from.x, from.y, z), vec3(to.x, to.y, z), beam * 0.48, sides),
          tube(vec3(from.x, from.y + railHeight, z), vec3(to.x, to.y + railHeight, z), beam * 0.34, sides),
        );
      }
    }
  }
  const ladderX = p.width * (0.44 - p.variation * 0.08);
  const ladderBottom = p.height * 0.03;
  const ladderTop = p.height * 0.98;
  ladders.push(
    tube(vec3(ladderX - p.width * 0.055, ladderBottom, -platformDepth * 0.38), vec3(ladderX - p.width * 0.055, ladderTop, -platformDepth * 0.38), beam * 0.42, sides),
    tube(vec3(ladderX + p.width * 0.055, ladderBottom, -platformDepth * 0.38), vec3(ladderX + p.width * 0.055, ladderTop, -platformDepth * 0.38), beam * 0.42, sides),
  );
  const rungCount = Math.max(12, Math.min(36, Math.round(p.structure * 1.8)));
  for (let rung = 0; rung < rungCount; rung++) {
    const y = ladderBottom + (ladderTop - ladderBottom) * rung / Math.max(1, rungCount - 1);
    ladders.push(tube(
      vec3(ladderX - p.width * 0.055, y, -platformDepth * 0.38),
      vec3(ladderX + p.width * 0.055, y, -platformDepth * 0.38),
      beam * 0.3,
      sides,
    ));
  }

  return [
    part("fire_escape_platforms", "模块化消防梯分层钢制平台", merge(...platforms), FIRE_ESCAPE, "metal", { color: FIRE_ESCAPE, roughness: 0.76, rust: p.damage }),
    part("fire_escape_grating", "消防梯平台防滑格栅", merge(...grating), FIRE_ESCAPE, "metal", { color: FIRE_ESCAPE, roughness: 0.8, rust: p.damage }),
    part("fire_escape_stairs", "消防梯交错斜跑踏步", merge(...stairs), FIRE_ESCAPE, "metal", { color: FIRE_ESCAPE, roughness: 0.74, rust: p.damage }),
    part("fire_escape_guardrails", "消防梯平台与斜跑护栏", merge(...rails), FIRE_ESCAPE, "metal", { color: FIRE_ESCAPE, roughness: 0.72, rust: p.damage }),
    part("fire_escape_ladder", "消防梯侧置垂直逃生爬梯", merge(...ladders), FIRE_ESCAPE, "metal", { color: FIRE_ESCAPE, roughness: 0.78, rust: p.damage }),
  ];
}

function buildRangefinderCamera(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const frontZ = p.depth * 0.48;
  const bodyY = p.height * 0.52;
  const body = merge(
    transform(roundedBox({ width: p.width * 0.9, height: p.height * 0.48, depth: p.depth * 0.78, radius: p.width * 0.035, steps: 3 }), {
      translate: vec3(0, bodyY, 0),
    }),
    transform(roundedBox({ width: p.width, height: p.height * 0.12, depth: p.depth * 0.88, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(0, p.height * 0.76, 0),
    }),
    transform(box(p.width * 0.84, p.height * 0.055, p.depth * 0.9), {
      translate: vec3(0, p.height * 0.23, 0),
    }),
  );
  const lensRadius = p.height * (0.19 + p.variation * 0.025);
  const lensX = p.width * 0.22;
  const lens = merge(
    transform(cylinder(lensRadius * 1.12, p.depth * 0.12, p.detail > 0 ? 32 : 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(lensX, bodyY, frontZ + p.depth * 0.04),
    }),
    transform(cylinder(lensRadius, p.depth * 0.22, p.detail > 0 ? 32 : 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(lensX, bodyY, frontZ + p.depth * 0.13),
    }),
    transform(torus(lensRadius * 0.82, lensRadius * 0.08, 32, 8), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(lensX, bodyY, frontZ + p.depth * 0.25),
    }),
    transform(cylinder(lensRadius * 0.68, p.depth * 0.035, 28), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(lensX, bodyY, frontZ + p.depth * 0.27),
    }),
  );
  const windows = merge(
    transform(roundedBox({ width: p.width * 0.16, height: p.height * 0.12, depth: p.depth * 0.035, radius: p.width * 0.012, steps: 2 }), {
      translate: vec3(-p.width * 0.27, p.height * 0.68, frontZ + p.depth * 0.04),
    }),
    transform(roundedBox({ width: p.width * 0.12, height: p.height * 0.1, depth: p.depth * 0.035, radius: p.width * 0.01, steps: 2 }), {
      translate: vec3(-p.width * 0.06, p.height * 0.68, frontZ + p.depth * 0.04),
    }),
    transform(roundedBox({ width: p.width * 0.1, height: p.height * 0.11, depth: p.depth * 0.035, radius: p.width * 0.01, steps: 2 }), {
      translate: vec3(p.width * 0.39, p.height * 0.68, frontZ + p.depth * 0.04),
    }),
  );
  const controls = merge(
    transform(cylinder(p.width * 0.07, p.height * 0.045, 20), { translate: vec3(-p.width * 0.31, p.height * 0.85, 0) }),
    transform(cylinder(p.width * 0.055, p.height * 0.05, 20), { translate: vec3(p.width * 0.31, p.height * 0.85, 0) }),
    transform(cylinder(p.width * 0.025, p.height * 0.065, 14), { translate: vec3(p.width * 0.4, p.height * 0.87, 0) }),
    transform(box(p.width * 0.18, p.height * 0.04, p.depth * 0.5), { translate: vec3(0, p.height * 0.84, 0) }),
  );
  const strap = sweep(smoothCurve(polyline([
    vec3(-p.width * 0.45, p.height * 0.64, 0),
    vec3(-p.width * 0.72, p.height * 0.28, p.depth * 0.1),
    vec3(-p.width * 0.78, p.height * 0.04, p.depth * 0.6),
    vec3(0, p.height * 0.015, p.depth * (1.15 + p.variation * 0.35)),
    vec3(p.width * 0.76, p.height * 0.04, p.depth * 0.58),
    vec3(p.width * 0.45, p.height * 0.64, 0),
  ]), 3), { radius: Math.min(p.width, p.height) * 0.018, sides: 8, caps: true });

  return [
    part("rangefinder_camera_body", "复古旁轴相机黑色皮革机身与顶盖", body, CAMERA_BLACK, "leather", { color: CAMERA_BLACK, roughness: 0.7, wear: p.damage }),
    part("rangefinder_camera_lens", "旁轴相机多段镜筒、调焦环与前镜片", lens, CAMERA_BLACK, "metal", { color: CAMERA_BLACK, roughness: 0.36, wear: p.damage }),
    part("rangefinder_camera_windows", "旁轴相机取景窗、测距窗与采光窗", windows, CAMERA_GLASS, "glass", { color: CAMERA_GLASS, roughness: 0.08, transmission: 0.32 }),
    part("rangefinder_camera_controls", "旁轴相机快门、过片旋钮与热靴", controls, CAMERA_CHROME, "metal", { color: CAMERA_CHROME, roughness: 0.4, wear: p.damage }),
    part("rangefinder_camera_strap", "旁轴相机环绕式皮革背带", strap, STRAP_LEATHER, "leather", { color: STRAP_LEATHER, roughness: 0.78, wear: p.damage }),
  ];
}

function buildModularWoodenPier(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const deckY = p.height * 0.52;
  const deckWidth = p.width * 0.9;
  const plankCount = Math.max(10, Math.min(30, Math.round(p.structure * 1.35)));
  const plankDepth = p.depth * 0.92 / plankCount;
  const planks: Mesh[] = [];
  const beams: Mesh[] = [];
  const posts: Mesh[] = [];
  const braces: Mesh[] = [];
  const rails: Mesh[] = [];
  for (let index = 0; index < plankCount; index++) {
    const random = Math.sin((index + 1) * 91.7 + p.seed * 0.17);
    const z = -p.depth * 0.46 + plankDepth * (index + 0.5);
    planks.push(transform(box(deckWidth * (0.97 + random * p.variation * 0.018), p.height * 0.035, plankDepth * 0.88), {
      rotate: vec3(0, random * p.variation * 0.018, random * p.variation * 0.012),
      translate: vec3(random * p.width * p.variation * 0.012, deckY + random * p.height * p.variation * 0.006, z),
    }));
  }
  for (const x of [-deckWidth * 0.38, deckWidth * 0.38]) {
    beams.push(transform(box(p.width * 0.055, p.height * 0.07, p.depth * 0.94), { translate: vec3(x, deckY - p.height * 0.055, 0) }));
  }
  const bayCount = Math.max(3, Math.min(8, Math.round(p.structure / 3)));
  for (let bay = 0; bay <= bayCount; bay++) {
    const z = -p.depth * 0.46 + p.depth * 0.92 * bay / bayCount;
    for (const side of [-1, 1]) {
      const x = side * deckWidth * 0.46;
      posts.push(transform(cylinder(p.width * 0.025, p.height * 0.78, p.detail > 0 ? 12 : 7), {
        translate: vec3(x, p.height * 0.3, z),
      }));
      if (bay < bayCount) {
        const nextZ = -p.depth * 0.46 + p.depth * 0.92 * (bay + 1) / bayCount;
        braces.push(tube(vec3(x, p.height * 0.12, z), vec3(x, deckY - p.height * 0.04, nextZ), p.width * 0.012, 8));
      }
    }
  }
  const railStartZ = p.depth * 0.28;
  for (const side of [-1, 1]) {
    const x = side * deckWidth * 0.46;
    rails.push(
      tube(vec3(x, deckY, railStartZ), vec3(x, p.height * 0.9, railStartZ), p.width * 0.018, 10),
      tube(vec3(x, deckY, p.depth * 0.45), vec3(x, p.height * 0.9, p.depth * 0.45), p.width * 0.018, 10),
      tube(vec3(x, p.height * 0.9, railStartZ), vec3(x, p.height * 0.9, p.depth * 0.45), p.width * 0.012, 8),
    );
  }

  return [
    part("wooden_pier_deck", "模块化木码头错缝铺板", merge(...planks), PIER_WOOD, "wood", { color: PIER_WOOD, roughness: 0.82, wear: p.damage }),
    part("wooden_pier_beams", "木码头纵向承重梁", merge(...beams), PIER_DARK_WOOD, "wood", { color: PIER_DARK_WOOD, roughness: 0.86, wear: p.damage }),
    part("wooden_pier_piles", "木码头成组水下桩柱", merge(...posts), PIER_DARK_WOOD, "wood", { color: PIER_DARK_WOOD, roughness: 0.9, wear: p.damage }),
    part("wooden_pier_braces", "木码头跨湾斜撑", merge(...braces), PIER_DARK_WOOD, "wood", { color: PIER_DARK_WOOD, roughness: 0.88, wear: p.damage }),
    part("wooden_pier_end_rails", "木码头末端系船柱与横向护栏", merge(...rails), PIER_WOOD, "wood", { color: PIER_WOOD, roughness: 0.84, wear: p.damage }),
  ];
}

function buildModularChainlinkFence(p: PolyHavenTopCandidateParams): PolyHavenTopCandidateMeshPart[] {
  const panelCount = Math.max(2, Math.min(6, Math.round(p.structure / 4)));
  const panelWidth = p.width / panelCount;
  const postRadius = Math.min(p.depth, p.width) * 0.12;
  const frameRadius = postRadius * 0.55;
  const z = p.depth * (0.15 + p.variation * 0.2);
  const posts: Mesh[] = [];
  const frames: Mesh[] = [];
  const wire: Mesh[] = [];
  const panels: Mesh[] = [];
  for (let panel = 0; panel < panelCount; panel++) {
    const left = -p.width / 2 + panel * panelWidth;
    const right = left + panelWidth;
    if (panel === 0) posts.push(transform(cylinder(postRadius, p.height, 12), { translate: vec3(left, p.height / 2, 0) }));
    posts.push(transform(cylinder(postRadius, p.height, 12), { translate: vec3(right, p.height / 2, 0) }));
    frames.push(
      tube(vec3(left, p.height * 0.08, z), vec3(right, p.height * 0.08, z), frameRadius, 8),
      tube(vec3(left, p.height * 0.92, z), vec3(right, p.height * 0.92, z), frameRadius, 8),
      tube(vec3(left + frameRadius, p.height * 0.08, z), vec3(left + frameRadius, p.height * 0.92, z), frameRadius, 8),
      tube(vec3(right - frameRadius, p.height * 0.08, z), vec3(right - frameRadius, p.height * 0.92, z), frameRadius, 8),
    );
    const columns = p.detail > 0 ? 8 : 4;
    const rows = p.detail > 0 ? 5 : 3;
    const cellWidth = panelWidth * 0.92 / columns;
    const cellHeight = p.height * 0.78 / rows;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const x0 = left + panelWidth * 0.04 + column * cellWidth;
        const x1 = x0 + cellWidth;
        const y0 = p.height * 0.11 + row * cellHeight;
        const y1 = y0 + cellHeight;
        wire.push(
          tube(vec3(x0, y0, z + frameRadius * 0.15), vec3(x1, y1, z + frameRadius * 0.15), frameRadius * 0.22, 6),
          tube(vec3(x0, y1, z + frameRadius * 0.15), vec3(x1, y0, z + frameRadius * 0.15), frameRadius * 0.22, 6),
        );
      }
    }
    if (panel > 0) {
      panels.push(transform(box(panelWidth * 0.88, p.height * 0.72, p.depth * 0.025), {
        translate: vec3((left + right) / 2, p.height * 0.5, z - frameRadius * 0.2),
      }));
    }
  }
  const caps: Mesh[] = [];
  for (let index = 0; index <= panelCount; index++) {
    caps.push(transform(cylinder(postRadius * 1.15, p.height * 0.025, 12), {
      translate: vec3(-p.width / 2 + index * panelWidth, p.height * 1.01, 0),
    }));
  }

  return [
    part("chainlink_fence_posts", "模块化铁丝网围栏立柱与柱帽", merge(...posts, ...caps), FENCE_STEEL, "metal", { color: FENCE_STEEL, roughness: 0.62, rust: p.damage }),
    part("chainlink_fence_frames", "铁丝网围栏分段矩形管框", merge(...frames), FENCE_STEEL, "metal", { color: FENCE_STEEL, roughness: 0.58, rust: p.damage }),
    part("chainlink_fence_mesh", "铁丝网围栏交叉菱形钢丝网", merge(...wire), FENCE_STEEL, "metal", { color: FENCE_STEEL, roughness: 0.66, rust: p.damage }),
    part("chainlink_fence_privacy", "铁丝网围栏绿色防护衬板", merge(...panels), FENCE_GREEN, "plastic", { color: FENCE_GREEN, roughness: 0.78 }, true),
  ];
}

export function buildPolyHavenTopCandidateMeshes(
  kind: PolyHavenTopCandidateKind,
  params: PolyHavenTopCandidateParams,
): PolyHavenTopCandidateMeshPart[] {
  switch (kind) {
    case "grandfather-clock": return buildGrandfatherClock(params);
    case "cordless-drill": return buildCordlessDrill(params);
    case "security-camera": return buildSecurityCamera(params);
    case "metal-tool-chest": return buildMetalToolChest(params);
    case "modular-fire-escape": return buildModularFireEscape(params);
    case "rangefinder-camera": return buildRangefinderCamera(params);
    case "modular-wooden-pier": return buildModularWoodenPier(params);
    case "modular-chainlink-fence": return buildModularChainlinkFence(params);
  }
}
