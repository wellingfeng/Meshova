import {
  box,
  capsule,
  cylinder,
  merge,
  polyline,
  prism,
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

export type PolyHavenNextPropKind =
  | "public-payphone"
  | "ceiling-fan"
  | "classic-laptop";

export interface PolyHavenNextPropParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenNextMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const DARK: RGB = [0.035, 0.038, 0.038];
const STEEL: RGB = [0.34, 0.36, 0.35];
const AGED_STEEL: RGB = [0.24, 0.26, 0.25];
const PHONE_PANEL: RGB = [0.46, 0.47, 0.43];
const PHONE_PAPER: RGB = [0.72, 0.69, 0.59];
const DRILL_LIME: RGB = [0.62, 0.72, 0.055];
const DRILL_METAL: RGB = [0.38, 0.4, 0.39];
const FAN_BLACK: RGB = [0.025, 0.028, 0.028];
const FAN_GLASS: RGB = [0.64, 0.62, 0.55];
const LAPTOP_BEIGE: RGB = [0.66, 0.65, 0.57];
const LAPTOP_KEY: RGB = [0.48, 0.49, 0.45];
const SCREEN_DARK: RGB = [0.015, 0.03, 0.028];
const CAMERA_BODY: RGB = [0.51, 0.52, 0.49];
const CAMERA_LENS: RGB = [0.035, 0.055, 0.06];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenNextMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function tube(from: Vec3, to: Vec3, radius: number, sides = 10): Mesh {
  return sweep(polyline([from, to]), { radius, sides, caps: true });
}

function curvedTube(points: Vec3[], radius: number, sides = 8): Mesh {
  return sweep(smoothCurve(polyline(points), 3), { radius, sides, caps: true });
}

function buildPublicPayphone(p: PolyHavenNextPropParams): PolyHavenNextMeshPart[] {
  const bodyWidth = p.width * 0.72;
  const bodyDepth = p.depth * 0.72;
  const bodyHeight = p.height * 0.94;
  const bodyX = p.width * 0.1;
  const frontZ = bodyDepth * 0.54;
  const body = merge(
    transform(roundedBox({ width: bodyWidth, height: bodyHeight, depth: bodyDepth, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(bodyX, bodyHeight / 2, 0),
    }),
    transform(box(bodyWidth * 0.96, bodyHeight * 0.23, bodyDepth * 0.08), {
      translate: vec3(bodyX, bodyHeight * 0.22, frontZ),
    }),
  );
  const display = merge(
    transform(roundedBox({ width: bodyWidth * 0.58, height: bodyHeight * 0.12, depth: bodyDepth * 0.055, radius: p.width * 0.012, steps: 2 }), {
      translate: vec3(bodyX, bodyHeight * 0.81, frontZ),
    }),
    transform(box(bodyWidth * 0.48, bodyHeight * 0.065, bodyDepth * 0.025), {
      translate: vec3(bodyX, bodyHeight * 0.81, frontZ + bodyDepth * 0.045),
    }),
  );
  const controls: Mesh[] = [];
  const columns = Math.max(3, Math.min(4, Math.round(p.structure / 5)));
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < columns; column++) {
      controls.push(transform(cylinder(bodyWidth * 0.032, bodyDepth * 0.055, 12), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(
          bodyX + bodyWidth * (0.08 + (column - (columns - 1) / 2) * 0.12),
          bodyHeight * (0.58 - row * 0.072),
          frontZ + bodyDepth * 0.05,
        ),
      }));
    }
  }
  controls.push(
    transform(cylinder(bodyWidth * 0.07, bodyDepth * 0.06, 18), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(bodyX + bodyWidth * 0.34, bodyHeight * 0.73, frontZ + bodyDepth * 0.05),
    }),
    transform(roundedBox({ width: bodyWidth * 0.34, height: bodyHeight * 0.055, depth: bodyDepth * 0.06, radius: p.width * 0.008, steps: 2 }), {
      translate: vec3(bodyX - bodyWidth * 0.19, bodyHeight * 0.7, frontZ + bodyDepth * 0.05),
    }),
  );
  const instruction = merge(
    transform(box(bodyWidth * 0.28, bodyHeight * 0.2, bodyDepth * 0.018), {
      translate: vec3(bodyX - bodyWidth * 0.22, bodyHeight * 0.48, frontZ + bodyDepth * 0.085),
    }),
    ...Array.from({ length: p.detail > 0 ? 6 : 3 }, (_, index) => transform(box(bodyWidth * 0.2, bodyHeight * 0.008, bodyDepth * 0.009), {
      translate: vec3(bodyX - bodyWidth * 0.22, bodyHeight * (0.54 - index * 0.025), frontZ + bodyDepth * 0.105),
    })),
  );
  const handsetX = bodyX - bodyWidth * 0.61;
  const handsetY = bodyHeight * 0.61;
  const handset = merge(
    transform(capsule(p.width * 0.065, bodyHeight * 0.39, 18, 5), {
      translate: vec3(handsetX, handsetY, frontZ + bodyDepth * 0.08),
    }),
    transform(sphere(p.width * 0.095, 16, 8), {
      scale: vec3(0.82, 1.15, 0.7),
      translate: vec3(handsetX, handsetY + bodyHeight * 0.17, frontZ + bodyDepth * 0.08),
    }),
    transform(sphere(p.width * 0.095, 16, 8), {
      scale: vec3(0.82, 1.15, 0.7),
      translate: vec3(handsetX, handsetY - bodyHeight * 0.17, frontZ + bodyDepth * 0.08),
    }),
  );
  const cordSlack = p.depth * (0.22 + p.variation * 0.5);
  const cord = curvedTube([
    vec3(handsetX, handsetY - bodyHeight * 0.2, frontZ + bodyDepth * 0.08),
    vec3(handsetX - p.width * 0.1, bodyHeight * 0.28, frontZ + cordSlack),
    vec3(bodyX - bodyWidth * 0.38, bodyHeight * 0.08, frontZ + cordSlack * 0.7),
    vec3(bodyX - bodyWidth * 0.25, bodyHeight * 0.21, frontZ + bodyDepth * 0.07),
  ], p.width * 0.018, 7);
  const tray = merge(
    transform(roundedBox({ width: bodyWidth * 0.82, height: bodyHeight * 0.17, depth: bodyDepth * 0.18, radius: p.width * 0.015, steps: 2 }), {
      translate: vec3(bodyX, bodyHeight * 0.25, frontZ + bodyDepth * 0.08),
    }),
    transform(box(bodyWidth * 0.47, bodyHeight * 0.035, bodyDepth * 0.04), {
      translate: vec3(bodyX, bodyHeight * 0.2, frontZ + bodyDepth * 0.2),
    }),
  );
  return [
    part("payphone_body", "公共电话不锈钢箱体与下部检修仓", body, PHONE_PANEL, "metal", { color: PHONE_PANEL, roughness: 0.48, wear: p.damage }),
    part("payphone_display", "公共电话状态显示窗与金属边框", display, SCREEN_DARK, "glass", { color: SCREEN_DARK, roughness: 0.2 }),
    part("payphone_controls", "公共电话数字键盘、投币口与退币旋钮", merge(...controls), DARK, "metal", { color: DARK, roughness: 0.5, wear: p.damage }),
    part("payphone_instructions", "公共电话操作说明牌与印刷行", instruction, PHONE_PAPER, "paper", { color: PHONE_PAPER, roughness: 0.9 }),
    part("payphone_handset", "公共电话弧形听筒与叉簧座", handset, DARK, "plastic", { color: DARK, roughness: 0.72, wear: p.damage }),
    part("payphone_coiled_cord", "公共电话听筒垂挂卷线", cord, DARK, "rubber", { color: DARK, roughness: 0.88 }),
    part("payphone_card_tray", "公共电话卡仓、退币托盘与防护唇边", tray, DARK, "plastic", { color: DARK, roughness: 0.62, wear: p.damage }),
  ];
}

function buildCordlessDrill(p: PolyHavenNextPropParams): PolyHavenNextMeshPart[] {
  const centerY = p.height * 0.68;
  const barrelLength = p.width * 0.57;
  const barrelRadius = Math.min(p.height * 0.14, p.depth * 0.42);
  const body = merge(
    transform(roundedBox({ width: barrelLength, height: barrelRadius * 1.9, depth: p.depth * 0.78, radius: barrelRadius * 0.38, steps: 3 }), {
      translate: vec3(p.width * 0.13, centerY, 0),
    }),
    transform(roundedBox({ width: p.width * 0.24, height: p.height * 0.18, depth: p.depth * 0.82, radius: p.depth * 0.15, steps: 2 }), {
      rotate: vec3(0, 0, -0.14),
      translate: vec3(p.width * 0.31, centerY + p.height * 0.08, 0),
    }),
  );
  const gripAngle = -0.12 + (p.variation - 0.5) * 0.14;
  const grip = merge(
    transform(roundedBox({ width: p.width * 0.2, height: p.height * 0.48, depth: p.depth * 0.75, radius: p.depth * 0.16, steps: 3 }), {
      rotate: vec3(0, 0, gripAngle),
      translate: vec3(p.width * 0.18, p.height * 0.39, 0),
    }),
    transform(roundedBox({ width: p.width * 0.12, height: p.height * 0.3, depth: p.depth * 0.8, radius: p.depth * 0.12, steps: 2 }), {
      rotate: vec3(0, 0, gripAngle),
      translate: vec3(p.width * 0.11, p.height * 0.4, 0),
    }),
  );
  const chuckX = -p.width * 0.24;
  const chuck = merge(
    transform(cylinder(barrelRadius * 0.78, p.width * 0.19, 24), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(chuckX, centerY, 0) }),
    transform(cylinder(barrelRadius * 0.58, p.width * 0.11, 20), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(chuckX - p.width * 0.13, centerY, 0) }),
    transform(cylinder(barrelRadius * 0.24, p.width * 0.07, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(chuckX - p.width * 0.22, centerY, 0) }),
  );
  const torqueRings: Mesh[] = [];
  const ringCount = Math.max(4, Math.min(10, Math.round(p.structure * 0.45)));
  for (let index = 0; index < ringCount; index++) {
    torqueRings.push(transform(torus(barrelRadius * 0.8, barrelRadius * 0.045, 20, 5), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(chuckX + p.width * (-0.05 + index * 0.012), centerY, 0),
    }));
  }
  const battery = merge(
    transform(roundedBox({ width: p.width * 0.42, height: p.height * 0.2, depth: p.depth * 0.98, radius: p.depth * 0.13, steps: 3 }), {
      translate: vec3(p.width * 0.18, p.height * 0.1, 0),
    }),
    transform(roundedBox({ width: p.width * 0.26, height: p.height * 0.08, depth: p.depth * 0.85, radius: p.depth * 0.08, steps: 2 }), {
      translate: vec3(p.width * 0.11, p.height * 0.23, 0),
    }),
  );
  const trigger = transform(roundedBox({ width: p.width * 0.08, height: p.height * 0.1, depth: p.depth * 0.46, radius: p.depth * 0.07, steps: 2 }), {
    rotate: vec3(0, 0, -0.18),
    translate: vec3(-p.width * 0.015, p.height * 0.55, 0),
  });
  const vents: Mesh[] = [];
  for (let index = 0; index < (p.detail > 0 ? 6 : 3); index++) {
    vents.push(transform(box(p.width * 0.012, p.height * 0.12, p.depth * 0.025), {
      rotate: vec3(0, 0, -0.15),
      translate: vec3(p.width * (0.26 + index * 0.026), centerY + p.height * 0.04, p.depth * 0.41),
    }));
  }
  return [
    part("cordless_drill_body", "无绳电钻青柠色电机壳与后部风罩", body, DRILL_LIME, "plastic", { color: DRILL_LIME, roughness: 0.58, wear: p.damage }),
    part("cordless_drill_grip", "无绳电钻人体工学手柄与黑色防滑包胶", grip, DARK, "rubber", { color: DARK, roughness: 0.82 }),
    part("cordless_drill_chuck", "无绳电钻金属夹头、钻轴与扭矩环", merge(chuck, ...torqueRings), DRILL_METAL, "metal", { color: DRILL_METAL, roughness: 0.48 }),
    part("cordless_drill_battery", "无绳电钻滑轨锂电池与底部保护壳", battery, DARK, "plastic", { color: DARK, roughness: 0.7, wear: p.damage }),
    part("cordless_drill_trigger", "无绳电钻扳机与正反转拨杆", trigger, DARK, "plastic", { color: DARK, roughness: 0.65 }),
    part("cordless_drill_vents", "无绳电钻电机散热槽", merge(...vents), DARK, "plastic", { color: DARK, roughness: 0.76 }),
  ];
}

function fanBlade(radius: number, rootRadius: number, width: number, thickness: number, bend: number): Mesh {
  return prism([
    vec2(rootRadius, -width * 0.35),
    vec2(radius * 0.62, -width * 0.5 - bend),
    vec2(radius, -width * 0.22),
    vec2(radius * 0.97, width * 0.24),
    vec2(radius * 0.56, width * 0.42 + bend),
    vec2(rootRadius, width * 0.24),
  ], thickness);
}

function buildCeilingFan(p: PolyHavenNextPropParams): PolyHavenNextMeshPart[] {
  const radius = Math.min(p.width, p.depth) * 0.49;
  const hubY = p.height * 0.28;
  const hubRadius = radius * 0.15;
  const bladeCount = Math.max(3, Math.min(6, Math.round(p.structure / 4)));
  const blades: Mesh[] = [];
  const brackets: Mesh[] = [];
  for (let index = 0; index < bladeCount; index++) {
    const angle = index * Math.PI * 2 / bladeCount + p.variation * Math.PI * 0.18;
    blades.push(transform(fanBlade(radius, hubRadius * 1.08, radius * 0.19, p.height * 0.022, radius * 0.025), {
      rotate: vec3(0, angle, 0),
      translate: vec3(0, hubY, 0),
    }));
    brackets.push(transform(box(radius * 0.23, p.height * 0.035, radius * 0.055), {
      rotate: vec3(0, angle, 0),
      translate: vec3(Math.cos(angle) * radius * 0.19, hubY + p.height * 0.018, -Math.sin(angle) * radius * 0.19),
    }));
  }
  const mount = merge(
    transform(cylinder(radius * 0.14, p.height * 0.07, 24), { translate: vec3(0, p.height * 0.965, 0) }),
    tube(vec3(0, p.height * 0.4, 0), vec3(0, p.height * 0.93, 0), radius * 0.025, 14),
    transform(sphere(radius * 0.08, 18, 10), { scale: vec3(1, 0.55, 1), translate: vec3(0, p.height * 0.82, 0) }),
  );
  const motor = merge(
    transform(cylinder(hubRadius, p.height * 0.16, 28), { translate: vec3(0, hubY + p.height * 0.08, 0) }),
    transform(torus(hubRadius * 0.92, hubRadius * 0.12, 28, 8), { translate: vec3(0, hubY + p.height * 0.01, 0) }),
  );
  const light = merge(
    transform(sphere(hubRadius * 0.9, 24, 12), { scale: vec3(1, 0.48, 1), translate: vec3(0, p.height * 0.12, 0) }),
    transform(torus(hubRadius * 0.92, hubRadius * 0.08, 24, 7), { translate: vec3(0, p.height * 0.17, 0) }),
  );
  return [
    part("ceiling_fan_mount", "吊扇顶盘、吊杆与球形连接座", mount, FAN_BLACK, "metal", { color: FAN_BLACK, roughness: 0.5 }),
    part("ceiling_fan_motor", "吊扇中央电机罩与装饰环", motor, FAN_BLACK, "metal", { color: FAN_BLACK, roughness: 0.46 }),
    part("ceiling_fan_blades", "吊扇径向弯曲叶片", merge(...blades), FAN_BLACK, "painted-metal", { color: FAN_BLACK, roughness: 0.58, wear: p.damage }),
    part("ceiling_fan_blade_brackets", "吊扇叶片根部支架", merge(...brackets), STEEL, "metal", { color: STEEL, roughness: 0.42 }),
    part("ceiling_fan_light", "吊扇一体式磨砂灯罩", light, FAN_GLASS, "glass", { color: FAN_GLASS, roughness: 0.34, emission: 0.05 }),
  ];
}

function buildClassicLaptop(p: PolyHavenNextPropParams): PolyHavenNextMeshPart[] {
  const baseHeight = p.height * 0.12;
  const baseDepth = p.depth * 0.72;
  const hingeY = baseHeight;
  const hingeZ = -baseDepth * 0.35;
  const openAngle = Math.PI * (0.36 + p.variation * 0.18);
  const screenHeight = p.height * 0.8;
  const screenDepth = p.depth * 0.055;
  const screenCenter = vec3(0, hingeY + Math.sin(openAngle) * screenHeight * 0.5, hingeZ - Math.cos(openAngle) * screenHeight * 0.5);
  const screenRotation = vec3(openAngle - Math.PI / 2, 0, 0);
  const base = merge(
    transform(roundedBox({ width: p.width * 0.96, height: baseHeight, depth: baseDepth, radius: p.height * 0.025, steps: 2 }), {
      translate: vec3(0, baseHeight / 2, p.depth * 0.08),
    }),
    transform(roundedBox({ width: p.width * 0.88, height: baseHeight * 0.28, depth: p.depth * 0.12, radius: p.height * 0.012, steps: 2 }), {
      translate: vec3(0, baseHeight * 0.72, p.depth * 0.4),
    }),
  );
  const lid = transform(roundedBox({ width: p.width, height: screenHeight, depth: screenDepth, radius: p.height * 0.025, steps: 2 }), {
    rotate: screenRotation,
    translate: screenCenter,
  });
  const screen = transform(box(p.width * 0.78, screenHeight * 0.7, screenDepth * 0.1), {
    rotate: screenRotation,
    translate: vec3(screenCenter.x, screenCenter.y + Math.sin(openAngle) * screenHeight * 0.02, screenCenter.z + Math.sin(openAngle) * screenDepth * 0.58),
  });
  const screenLines: Mesh[] = [];
  if (p.detail > 0) {
    for (let index = 0; index < 7; index++) {
      screenLines.push(transform(box(p.width * (0.36 + (index % 3) * 0.09), p.height * 0.007, screenDepth * 0.08), {
        rotate: screenRotation,
        translate: vec3(-p.width * 0.12, screenCenter.y + screenHeight * (0.2 - index * 0.05), screenCenter.z + screenDepth * 0.62),
      }));
    }
  }
  const keys: Mesh[] = [];
  const rows = p.detail > 0 ? 6 : 4;
  const columns = Math.max(8, Math.min(13, Math.round(p.structure * 0.62)));
  const keyWidth = p.width * 0.72 / columns;
  const keyDepth = baseDepth * 0.52 / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (row === rows - 1 && column > 2 && column < columns - 3) continue;
      keys.push(transform(roundedBox({ width: keyWidth * 0.78, height: baseHeight * 0.16, depth: keyDepth * 0.72, radius: baseHeight * 0.03, steps: 1 }), {
        translate: vec3((column - (columns - 1) / 2) * keyWidth, baseHeight * 1.02, p.depth * (0.04 - row * 0.055)),
      }));
    }
  }
  keys.push(transform(roundedBox({ width: p.width * 0.34, height: baseHeight * 0.16, depth: keyDepth * 0.72, radius: baseHeight * 0.03, steps: 1 }), {
    translate: vec3(0, baseHeight * 1.02, p.depth * (0.04 - (rows - 1) * 0.055)),
  }));
  const trackball = merge(
    transform(sphere(p.width * 0.035, 18, 10), { scale: vec3(1, 0.5, 1), translate: vec3(p.width * 0.18, baseHeight * 1.12, p.depth * 0.3) }),
    transform(torus(p.width * 0.045, p.width * 0.009, 20, 6), { translate: vec3(p.width * 0.18, baseHeight * 1.08, p.depth * 0.3) }),
  );
  const hinges = merge(
    transform(cylinder(p.height * 0.028, p.width * 0.15, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.34, hingeY, hingeZ) }),
    transform(cylinder(p.height * 0.028, p.width * 0.15, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.34, hingeY, hingeZ) }),
  );
  return [
    part("classic_laptop_base", "经典笔记本厚重米色底座与掌托", base, LAPTOP_BEIGE, "plastic", { color: LAPTOP_BEIGE, roughness: 0.72, wear: p.damage }),
    part("classic_laptop_lid", "经典笔记本可开合厚边屏幕上盖", lid, LAPTOP_BEIGE, "plastic", { color: LAPTOP_BEIGE, roughness: 0.7, wear: p.damage }),
    part("classic_laptop_screen", "经典笔记本深色 DOS 液晶屏与字符行", merge(screen, ...screenLines), SCREEN_DARK, "glass", { color: SCREEN_DARK, roughness: 0.18, emission: 0.03 }),
    part("classic_laptop_keyboard", "经典笔记本凸起键帽阵列与长空格键", merge(...keys), LAPTOP_KEY, "plastic", { color: LAPTOP_KEY, roughness: 0.74 }),
    part("classic_laptop_trackball", "经典笔记本内置轨迹球与环形座", trackball, DARK, "plastic", { color: DARK, roughness: 0.62 }),
    part("classic_laptop_hinges", "经典笔记本双圆柱铰链", hinges, AGED_STEEL, "metal", { color: AGED_STEEL, roughness: 0.55 }),
  ];
}

function buildSecurityCamera(p: PolyHavenNextPropParams): PolyHavenNextMeshPart[] {
  const cameraLength = p.depth * 0.67;
  const bodyWidth = p.width * 0.82;
  const bodyHeight = p.height * 0.48;
  const centerY = p.height * 0.67;
  const centerZ = -p.depth * 0.1;
  const tilt = -0.04 - p.variation * 0.22;
  const cameraTransform = { rotate: vec3(tilt, 0, 0), translate: vec3(0, centerY, centerZ) };
  const body = merge(
    transform(roundedBox({ width: bodyWidth, height: bodyHeight, depth: cameraLength, radius: p.width * 0.1, steps: 3 }), cameraTransform),
    transform(roundedBox({ width: bodyWidth * 0.92, height: bodyHeight * 0.88, depth: cameraLength * 0.18, radius: p.width * 0.08, steps: 2 }), {
      rotate: cameraTransform.rotate,
      translate: vec3(0, centerY, centerZ + cameraLength * 0.47),
    }),
  );
  const hood = transform(roundedBox({ width: p.width, height: bodyHeight * 0.13, depth: cameraLength * 1.12, radius: p.width * 0.06, steps: 2 }), {
    rotate: cameraTransform.rotate,
    translate: vec3(0, centerY + bodyHeight * 0.55, centerZ - cameraLength * 0.05),
  });
  const faceZ = centerZ + cameraLength * 0.57;
  const lens = merge(
    transform(cylinder(bodyWidth * 0.29, p.depth * 0.035, 28), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, faceZ) }),
    transform(cylinder(bodyWidth * 0.17, p.depth * 0.048, 24), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, faceZ + p.depth * 0.025) }),
    transform(sphere(bodyWidth * 0.12, 20, 10), { scale: vec3(1, 1, 0.35), translate: vec3(0, centerY, faceZ + p.depth * 0.055) }),
  );
  const bolts: Mesh[] = [];
  for (const xSide of [-1, 1]) {
    for (const ySide of [-1, 1]) {
      bolts.push(transform(cylinder(p.width * 0.025, p.depth * 0.025, 10), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(xSide * bodyWidth * 0.38, centerY + ySide * bodyHeight * 0.34, faceZ + p.depth * 0.02),
      }));
    }
  }
  const bracket = merge(
    transform(box(p.width * 0.62, p.height * 0.07, p.depth * 0.28), { translate: vec3(0, p.height * 0.12, -p.depth * 0.34) }),
    transform(box(p.width * 0.12, p.height * 0.38, p.depth * 0.12), { translate: vec3(0, p.height * 0.31, -p.depth * 0.34) }),
    transform(cylinder(p.width * 0.15, p.width * 0.16, 20), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, p.height * 0.49, -p.depth * 0.27) }),
    ...[-1, 1].map((side) => transform(box(p.width * 0.09, p.height * 0.25, p.depth * 0.08), {
      rotate: vec3(-0.42, 0, 0),
      translate: vec3(side * p.width * 0.3, p.height * 0.25, -p.depth * 0.28),
    })),
  );
  const cable = curvedTube([
    vec3(0, centerY, centerZ - cameraLength * 0.52),
    vec3(p.width * 0.22, p.height * 0.47, -p.depth * 0.25),
    vec3(p.width * 0.18, p.height * 0.25, -p.depth * 0.38),
  ], p.width * 0.018, 7);
  return [
    part("security_camera_housing", "监控摄像头圆角金属机身与前面板", body, CAMERA_BODY, "metal", { color: CAMERA_BODY, roughness: 0.48, wear: p.damage }),
    part("security_camera_hood", "监控摄像头一体式弧边防雨罩", hood, CAMERA_BODY, "metal", { color: CAMERA_BODY, roughness: 0.44, wear: p.damage }),
    part("security_camera_lens", "监控摄像头同心镜头、玻璃与遮光筒", lens, CAMERA_LENS, "glass", { color: CAMERA_LENS, roughness: 0.12 }),
    part("security_camera_face_bolts", "监控摄像头前盖固定螺钉", merge(...bolts), STEEL, "metal", { color: STEEL, roughness: 0.4 }),
    part("security_camera_mount", "监控摄像头墙装底板、支臂与俯仰云台", bracket, AGED_STEEL, "metal", { color: AGED_STEEL, roughness: 0.58, wear: p.damage }),
    part("security_camera_cable", "监控摄像头背部电源信号线", cable, DARK, "rubber", { color: DARK, roughness: 0.84 }),
  ];
}

export function buildPolyHavenNextPropMeshes(
  kind: PolyHavenNextPropKind,
  params: PolyHavenNextPropParams,
): PolyHavenNextMeshPart[] {
  switch (kind) {
    case "public-payphone": return buildPublicPayphone(params);
    case "ceiling-fan": return buildCeilingFan(params);
    case "classic-laptop": return buildClassicLaptop(params);
  }
}
