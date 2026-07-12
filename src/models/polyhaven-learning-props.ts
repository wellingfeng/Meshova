import {
  box,
  cylinder,
  lathe,
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

export type PolyHavenLearningPropKind =
  | "factory-facade-kit"
  | "apartment-facade-kit"
  | "cassette-player"
  | "hand-truck"
  | "fire-extinguisher"
  | "dartboard";

export interface PolyHavenLearningPropParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenLearningMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const BRICK: RGB = [0.45, 0.21, 0.12];
const DARK_BRICK: RGB = [0.29, 0.12, 0.075];
const CONCRETE: RGB = [0.39, 0.38, 0.35];
const WINDOW: RGB = [0.09, 0.16, 0.17];
const STEEL: RGB = [0.24, 0.26, 0.25];
const DARK: RGB = [0.035, 0.038, 0.038];
const CASSETTE_SHELL: RGB = [0.36, 0.37, 0.35];
const CASSETTE_LABEL: RGB = [0.63, 0.48, 0.24];
const TRUCK_RED: RGB = [0.42, 0.055, 0.035];
const RUBBER: RGB = [0.025, 0.028, 0.027];
const EXTINGUISHER_RED: RGB = [0.62, 0.035, 0.025];
const EXTINGUISHER_LABEL: RGB = [0.72, 0.69, 0.59];
const BOARD_DARK: RGB = [0.075, 0.072, 0.065];
const BOARD_LIGHT: RGB = [0.62, 0.61, 0.52];
const BOARD_RED: RGB = [0.46, 0.035, 0.025];
const BOARD_GREEN: RGB = [0.035, 0.28, 0.12];
const NUMBER_IVORY: RGB = [0.73, 0.71, 0.61];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenLearningMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function tube(from: Vec3, to: Vec3, radius: number, sides = 10): Mesh {
  return sweep(polyline([from, to]), { radius, sides, caps: true });
}

function curvedTube(points: Vec3[], radius: number, sides = 9): Mesh {
  return sweep(smoothCurve(polyline(points), 3), { radius, sides, caps: true });
}

type FacadeStyle = "factory" | "apartment";

function buildFacadeKit(p: PolyHavenLearningPropParams, style: FacadeStyle): PolyHavenLearningMeshPart[] {
  const bays = Math.max(4, Math.min(12, Math.round(p.structure * 0.55)));
  const floors = Math.max(2, Math.min(6, Math.round(p.structure * 0.24) + (style === "factory" ? 1 : 0)));
  const bayWidth = p.width / bays;
  const floorHeight = p.height / floors;
  const wallDepth = p.depth * (style === "factory" ? 0.54 : 0.62);
  const frontZ = wallDepth * 0.5;
  const frameDepth = Math.max(0.025, p.depth * 0.035);
  const wallMeshes: Mesh[] = [];
  const frameMeshes: Mesh[] = [];
  const glassMeshes: Mesh[] = [];
  const entranceMeshes: Mesh[] = [];
  const featureMeshes: Mesh[] = [];

  for (let floor = 0; floor < floors; floor++) {
    const floorY = floor * floorHeight;
    const bandHeight = floorHeight * (floor === 0 ? 0.11 : 0.075);
    wallMeshes.push(transform(box(p.width, bandHeight, wallDepth), {
      translate: vec3(0, floorY + bandHeight * 0.5, 0),
    }));
    for (let bay = 0; bay <= bays; bay++) {
      const x = -p.width * 0.5 + bay * bayWidth;
      wallMeshes.push(transform(box(bayWidth * 0.12, floorHeight, wallDepth), {
        translate: vec3(x, floorY + floorHeight * 0.5, 0),
      }));
    }

    for (let bay = 0; bay < bays; bay++) {
      const x = -p.width * 0.5 + (bay + 0.5) * bayWidth;
      const isEntrance = floor === 0 && (style === "factory" ? bay % 3 === 1 : bay === Math.floor(bays / 2));
      const openingWidth = bayWidth * (style === "factory" ? 0.72 : 0.62);
      const openingHeight = isEntrance ? floorHeight * 0.78 : floorHeight * (style === "factory" ? 0.48 : 0.52);
      const openingY = floorY + (isEntrance ? floorHeight * 0.46 : floorHeight * 0.56);
      const openingZ = frontZ + frameDepth * 0.7;
      const frameThickness = Math.max(0.025, Math.min(openingWidth, openingHeight) * 0.07);
      const frame = merge(
        transform(box(openingWidth + frameThickness * 2, frameThickness, frameDepth), { translate: vec3(x, openingY - openingHeight * 0.5, openingZ) }),
        transform(box(openingWidth + frameThickness * 2, frameThickness, frameDepth), { translate: vec3(x, openingY + openingHeight * 0.5, openingZ) }),
        transform(box(frameThickness, openingHeight, frameDepth), { translate: vec3(x - openingWidth * 0.5, openingY, openingZ) }),
        transform(box(frameThickness, openingHeight, frameDepth), { translate: vec3(x + openingWidth * 0.5, openingY, openingZ) }),
      );
      frameMeshes.push(frame);
      if (isEntrance) {
        entranceMeshes.push(transform(box(openingWidth, openingHeight, frameDepth * 0.45), {
          translate: vec3(x, openingY, openingZ - frameDepth * 0.3),
        }));
      } else {
        glassMeshes.push(transform(box(openingWidth, openingHeight, frameDepth * 0.35), {
          translate: vec3(x, openingY, openingZ - frameDepth * 0.3),
        }));
        if (p.detail > 0) {
          frameMeshes.push(
            transform(box(frameThickness * 0.55, openingHeight, frameDepth * 1.1), { translate: vec3(x, openingY, openingZ + frameDepth * 0.08) }),
            transform(box(openingWidth, frameThickness * 0.55, frameDepth * 1.1), { translate: vec3(x, openingY, openingZ + frameDepth * 0.08) }),
          );
        }
      }

      if (style === "apartment" && floor > 0 && (bay + floor) % 2 === 0) {
        const balconyDepth = p.depth * (0.18 + p.variation * 0.2);
        const balconyZ = frontZ + balconyDepth * 0.5;
        featureMeshes.push(
          transform(box(bayWidth * 0.82, floorHeight * 0.055, balconyDepth), { translate: vec3(x, floorY + floorHeight * 0.17, balconyZ) }),
          tube(vec3(x - bayWidth * 0.34, floorY + floorHeight * 0.2, frontZ + balconyDepth), vec3(x - bayWidth * 0.34, floorY + floorHeight * 0.56, frontZ + balconyDepth), bayWidth * 0.018, 7),
          tube(vec3(x + bayWidth * 0.34, floorY + floorHeight * 0.2, frontZ + balconyDepth), vec3(x + bayWidth * 0.34, floorY + floorHeight * 0.56, frontZ + balconyDepth), bayWidth * 0.018, 7),
          tube(vec3(x - bayWidth * 0.34, floorY + floorHeight * 0.56, frontZ + balconyDepth), vec3(x + bayWidth * 0.34, floorY + floorHeight * 0.56, frontZ + balconyDepth), bayWidth * 0.018, 7),
        );
      }
    }
  }

  wallMeshes.push(transform(box(p.width, floorHeight * 0.1, wallDepth), {
    translate: vec3(0, p.height - floorHeight * 0.05, 0),
  }));
  const parapetHeight = floorHeight * (0.14 + p.variation * 0.12);
  const roofline = merge(
    transform(box(p.width, parapetHeight, wallDepth * 1.04), { translate: vec3(0, p.height + parapetHeight * 0.5, 0) }),
    transform(box(p.width * 0.35, parapetHeight * 1.8, wallDepth * 1.08), {
      translate: vec3(p.width * (p.variation - 0.5) * 0.35, p.height + parapetHeight * 0.9, 0),
    }),
  );

  if (style === "factory") {
    const serviceY = floorHeight * 0.76;
    for (let bay = 0; bay < bays; bay += 3) {
      const x = -p.width * 0.5 + (bay + 0.5) * bayWidth;
      const canopyDepth = p.depth * (0.18 + p.variation * 0.16);
      featureMeshes.push(
        transform(box(bayWidth * 0.78, floorHeight * 0.06, canopyDepth), { translate: vec3(x, serviceY, frontZ + canopyDepth * 0.5) }),
        tube(vec3(x - bayWidth * 0.31, serviceY, frontZ), vec3(x - bayWidth * 0.31, serviceY - floorHeight * 0.3, frontZ + canopyDepth), bayWidth * 0.014, 7),
        tube(vec3(x + bayWidth * 0.31, serviceY, frontZ), vec3(x + bayWidth * 0.31, serviceY - floorHeight * 0.3, frontZ + canopyDepth), bayWidth * 0.014, 7),
      );
    }
  }

  return [
    part("facade_wall_modules", style === "factory" ? "工厂立面砖墙模组、楼层带与承重壁柱" : "公寓立面砖墙模组、楼层带与承重壁柱", merge(...wallMeshes), BRICK, "brick", { color: BRICK, roughness: 0.86, wear: p.damage }),
    part("facade_window_frames", "模块化立面窗框、横梃与竖梃", merge(...frameMeshes), STEEL, "metal", { color: STEEL, roughness: 0.52, wear: p.damage }),
    part("facade_window_glass", "模块化立面后退玻璃窗阵列", merge(...glassMeshes), WINDOW, "glass", { color: WINDOW, roughness: 0.18 }),
    part("facade_entrances", style === "factory" ? "工厂立面装卸门与设备入口" : "公寓立面首层入口门", merge(...entranceMeshes), DARK_BRICK, "painted-metal", { color: DARK_BRICK, roughness: 0.68 }),
    part("facade_feature_modules", style === "factory" ? "工厂立面装卸雨棚与三角支撑" : "公寓立面错列阳台、栏杆与挑板", merge(...featureMeshes), CONCRETE, style === "factory" ? "metal" : "concrete", { color: CONCRETE, roughness: 0.7, wear: p.damage }),
    part("facade_roofline", "模块化立面女儿墙与错台设备墙", roofline, DARK_BRICK, "brick", { color: DARK_BRICK, roughness: 0.88, wear: p.damage }),
  ];
}

function buildCassettePlayer(p: PolyHavenLearningPropParams): PolyHavenLearningMeshPart[] {
  const bodyDepth = p.depth * 0.82;
  const frontZ = bodyDepth * 0.5;
  const body = transform(roundedBox({ width: p.width, height: p.height, depth: bodyDepth, radius: p.width * 0.055, steps: 3 }), {
    translate: vec3(0, p.height * 0.5, 0),
  });
  const speakerWidth = p.width * 0.78;
  const speakerHeight = p.height * 0.34;
  const speakerY = p.height * 0.76;
  const speakerPanel = transform(roundedBox({ width: speakerWidth, height: speakerHeight, depth: p.depth * 0.035, radius: p.width * 0.025, steps: 2 }), {
    translate: vec3(0, speakerY, frontZ + p.depth * 0.025),
  });
  const grille: Mesh[] = [];
  const columns = Math.max(6, Math.min(16, Math.round(p.structure * 0.7)));
  const rows = Math.max(5, Math.round(columns * speakerHeight / speakerWidth));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      grille.push(transform(cylinder(p.width * 0.008, p.depth * 0.018, 7), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(
          (column - (columns - 1) * 0.5) * speakerWidth * 0.82 / columns,
          speakerY + (row - (rows - 1) * 0.5) * speakerHeight * 0.78 / rows,
          frontZ + p.depth * 0.052,
        ),
      }));
    }
  }
  const cassetteY = p.height * 0.43;
  const cassetteWindow = merge(
    transform(roundedBox({ width: p.width * 0.82, height: p.height * 0.22, depth: p.depth * 0.045, radius: p.width * 0.02, steps: 2 }), {
      translate: vec3(0, cassetteY, frontZ + p.depth * 0.035),
    }),
    transform(box(p.width * 0.64, p.height * 0.11, p.depth * 0.025), {
      translate: vec3(0, cassetteY, frontZ + p.depth * 0.065),
    }),
  );
  const tapeSpools = merge(
    transform(cylinder(p.width * 0.075, p.depth * 0.04, 14), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.19, cassetteY, frontZ + p.depth * 0.085) }),
    transform(cylinder(p.width * 0.075, p.depth * 0.04, 14), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(p.width * 0.19, cassetteY, frontZ + p.depth * 0.085) }),
  );
  const controls: Mesh[] = [];
  const buttonCount = p.detail > 0 ? 6 : 4;
  const buttonWidth = p.width * 0.72 / buttonCount;
  for (let index = 0; index < buttonCount; index++) {
    controls.push(transform(roundedBox({ width: buttonWidth * 0.8, height: p.height * 0.075, depth: p.depth * 0.08, radius: p.width * 0.012, steps: 2 }), {
      translate: vec3((index - (buttonCount - 1) * 0.5) * buttonWidth, p.height * 0.13, frontZ + p.depth * 0.055),
    }));
  }
  const sideControls = merge(
    transform(cylinder(p.width * 0.045, p.depth * 0.07, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.53, p.height * 0.82, 0) }),
    transform(box(p.width * 0.05, p.height * 0.16, p.depth * 0.28), { translate: vec3(-p.width * 0.515, p.height * 0.58, 0) }),
    curvedTube([
      vec3(-p.width * 0.45, p.height * 0.98, 0),
      vec3(-p.width * (0.55 + p.variation * 0.22), p.height * 1.06, 0),
      vec3(p.width * (0.55 + p.variation * 0.22), p.height * 1.06, 0),
      vec3(p.width * 0.45, p.height * 0.98, 0),
    ], p.width * 0.018, 7),
  );
  return [
    part("cassette_player_shell", "便携卡带录音机竖式金属塑料外壳", body, CASSETTE_SHELL, "painted-metal", { color: CASSETTE_SHELL, roughness: 0.58, wear: p.damage }),
    part("cassette_player_speaker", "卡带录音机上部扬声器面板", speakerPanel, DARK, "plastic", { color: DARK, roughness: 0.72 }),
    part("cassette_player_grille", "卡带录音机扬声器冲孔网阵列", merge(...grille), STEEL, "metal", { color: STEEL, roughness: 0.58 }),
    part("cassette_player_window", "卡带仓透明窗与纸质磁带标签", cassetteWindow, CASSETTE_LABEL, "glass", { color: CASSETTE_LABEL, roughness: 0.32 }),
    part("cassette_player_spools", "卡带仓双卷轴与磁带轮毂", tapeSpools, DARK, "plastic", { color: DARK, roughness: 0.62 }),
    part("cassette_player_controls", "卡带录音机底部机械按键组", merge(...controls), DARK, "plastic", { color: DARK, roughness: 0.66 }),
    part("cassette_player_side_hardware", "卡带录音机侧面旋钮、接口与提带", sideControls, STEEL, "metal", { color: STEEL, roughness: 0.54, wear: p.damage }),
  ];
}

function buildHandTruck(p: PolyHavenLearningPropParams): PolyHavenLearningMeshPart[] {
  const railX = p.width * 0.31;
  const tubeRadius = p.width * 0.032;
  const wheelRadius = Math.min(p.width * 0.16, p.height * 0.12);
  const frameZ = -p.depth * 0.08;
  const handleSpread = p.width * (0.31 + p.variation * 0.09);
  const rails = merge(
    curvedTube([vec3(-railX, wheelRadius, frameZ), vec3(-railX, p.height * 0.52, frameZ), vec3(-handleSpread, p.height * 0.86, frameZ), vec3(-handleSpread, p.height, frameZ)], tubeRadius, 9),
    curvedTube([vec3(railX, wheelRadius, frameZ), vec3(railX, p.height * 0.52, frameZ), vec3(handleSpread, p.height * 0.86, frameZ), vec3(handleSpread, p.height, frameZ)], tubeRadius, 9),
  );
  const crossbars: Mesh[] = [];
  const barCount = Math.max(3, Math.min(7, Math.round(p.structure * 0.3)));
  for (let index = 0; index < barCount; index++) {
    const y = p.height * (0.25 + index * 0.52 / Math.max(1, barCount - 1));
    crossbars.push(tube(vec3(-railX, y, frameZ), vec3(railX, y, frameZ), tubeRadius * 0.82, 8));
  }
  const toeDepth = p.depth * (0.62 + p.variation * 0.25);
  const toe = merge(
    transform(roundedBox({ width: p.width * 0.82, height: p.height * 0.035, depth: toeDepth, radius: p.width * 0.018, steps: 2 }), {
      translate: vec3(0, p.height * 0.035, frameZ + toeDepth * 0.38),
    }),
    ...Array.from({ length: p.detail > 0 ? 6 : 3 }, (_, index) => transform(box(p.width * 0.035, p.height * 0.04, toeDepth * 0.76), {
      translate: vec3((index - (p.detail > 0 ? 2.5 : 1)) * p.width * 0.1, p.height * 0.058, frameZ + toeDepth * 0.4),
    })),
  );
  const axle = tube(vec3(-p.width * 0.44, wheelRadius, frameZ), vec3(p.width * 0.44, wheelRadius, frameZ), tubeRadius, 10);
  const wheels = merge(
    transform(torus(wheelRadius * 0.72, wheelRadius * 0.28, 24, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.43, wheelRadius, frameZ) }),
    transform(torus(wheelRadius * 0.72, wheelRadius * 0.28, 24, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.43, wheelRadius, frameZ) }),
  );
  const supports = merge(
    tube(vec3(-railX, wheelRadius * 0.75, frameZ), vec3(-p.width * 0.42, wheelRadius * 0.2, frameZ + toeDepth * 0.45), tubeRadius * 0.72, 8),
    tube(vec3(railX, wheelRadius * 0.75, frameZ), vec3(p.width * 0.42, wheelRadius * 0.2, frameZ + toeDepth * 0.45), tubeRadius * 0.72, 8),
  );
  return [
    part("hand_truck_rails", "手推车弯管主框架与双把手", rails, TRUCK_RED, "painted-metal", { color: TRUCK_RED, roughness: 0.62, wear: p.damage }),
    part("hand_truck_crossbars", "手推车承载横档与中部竖撑", merge(...crossbars, tube(vec3(0, p.height * 0.22, frameZ), vec3(0, p.height * 0.78, frameZ), tubeRadius * 0.7, 8)), TRUCK_RED, "painted-metal", { color: TRUCK_RED, roughness: 0.62, wear: p.damage }),
    part("hand_truck_toe_plate", "手推车前伸镂空铲板", toe, STEEL, "metal", { color: STEEL, roughness: 0.64, wear: p.damage }),
    part("hand_truck_axle", "手推车轮轴与三角加固撑", merge(axle, supports), STEEL, "metal", { color: STEEL, roughness: 0.52 }),
    part("hand_truck_wheels", "手推车双侧橡胶轮胎", wheels, RUBBER, "rubber", { color: RUBBER, roughness: 0.88 }),
  ];
}

function buildFireExtinguisher(p: PolyHavenLearningPropParams): PolyHavenLearningMeshPart[] {
  const boxHeight = p.height * 0.2;
  const radius = Math.min(p.width * 0.37, p.depth * 0.3);
  const vesselBottom = boxHeight * 0.78;
  const vesselTop = p.height * 0.83;
  const body = lathe([
    vec2(radius * 0.86, vesselBottom),
    vec2(radius, vesselBottom + p.height * 0.035),
    vec2(radius, vesselTop - p.height * 0.1),
    vec2(radius * 0.95, vesselTop - p.height * 0.055),
    vec2(radius * 0.72, vesselTop - p.height * 0.015),
    vec2(radius * 0.42, vesselTop),
  ], { segments: p.detail > 0 ? 32 : 20 });
  const stand = merge(
    transform(roundedBox({ width: p.width * 0.94, height: boxHeight, depth: p.depth * 0.82, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(0, boxHeight * 0.5, 0),
    }),
    transform(box(p.width, boxHeight * 0.12, p.depth * 0.88), { translate: vec3(0, boxHeight * 0.9, 0) }),
  );
  const neckY = vesselTop + p.height * 0.025;
  const valve = merge(
    transform(cylinder(radius * 0.28, p.height * 0.055, 18), { translate: vec3(0, neckY, 0) }),
    transform(box(radius * 1.05, p.height * 0.045, radius * 0.18), { translate: vec3(radius * 0.26, neckY + p.height * 0.045, 0) }),
    transform(box(radius * 0.92, p.height * 0.035, radius * 0.16), { rotate: vec3(0, 0, -0.18 - p.variation * 0.18), translate: vec3(radius * 0.18, neckY + p.height * 0.085, 0) }),
    transform(cylinder(radius * 0.14, p.depth * 0.06, 16), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-radius * 0.52, neckY + p.height * 0.025, p.depth * 0.02) }),
  );
  const hose = curvedTube([
    vec3(-radius * 0.5, neckY + p.height * 0.02, 0),
    vec3(-radius * (0.9 + p.variation * 0.25), p.height * 0.72, radius * 0.72),
    vec3(-radius * 1.12, p.height * 0.42, radius * 1.08),
    vec3(-radius * 0.76, p.height * 0.25, radius * 1.12),
  ], radius * 0.085, 9);
  const label = transform(roundedBox({ width: radius * 1.28, height: p.height * 0.16, depth: p.depth * 0.018, radius: p.width * 0.01, steps: 1 }), {
    translate: vec3(0, p.height * 0.57, radius + p.depth * 0.012),
  });
  const bands = merge(
    transform(torus(radius * 1.01, radius * 0.035, 28, 6), { translate: vec3(0, p.height * 0.35, 0) }),
    transform(torus(radius * 1.01, radius * 0.035, 28, 6), { translate: vec3(0, p.height * 0.42, 0) }),
  );
  return [
    part("fire_extinguisher_stand", "灭火器红色落地保护箱与底座", stand, DARK_BRICK, "painted-metal", { color: DARK_BRICK, roughness: 0.68, wear: p.damage }),
    part("fire_extinguisher_vessel", "灭火器旋压钢瓶、圆肩与瓶颈", body, EXTINGUISHER_RED, "painted-metal", { color: EXTINGUISHER_RED, roughness: 0.52, wear: p.damage }),
    part("fire_extinguisher_valve", "灭火器阀体、保险销与压把", valve, DARK, "metal", { color: DARK, roughness: 0.48 }),
    part("fire_extinguisher_hose", "灭火器侧挂橡胶软管", hose, RUBBER, "rubber", { color: RUBBER, roughness: 0.86 }),
    part("fire_extinguisher_label", "灭火器正面操作说明标签", label, EXTINGUISHER_LABEL, "paper", { color: EXTINGUISHER_LABEL, roughness: 0.88 }),
    part("fire_extinguisher_bands", "灭火器瓶身固定箍带", bands, [0.74, 0.52, 0.05], "metal", { color: [0.74, 0.52, 0.05], roughness: 0.6 }),
  ];
}

function annularSector(innerRadius: number, outerRadius: number, start: number, end: number, depth: number): Mesh {
  const steps = 3;
  const outline = [];
  for (let index = 0; index <= steps; index++) {
    const angle = start + (end - start) * index / steps;
    outline.push(vec2(Math.cos(angle) * outerRadius, -Math.sin(angle) * outerRadius));
  }
  for (let index = steps; index >= 0; index--) {
    const angle = start + (end - start) * index / steps;
    outline.push(vec2(Math.cos(angle) * innerRadius, -Math.sin(angle) * innerRadius));
  }
  return transform(prism(outline, depth), { rotate: vec3(Math.PI / 2, 0, 0) });
}

const DIGIT_SEGMENTS: Record<string, string> = {
  "0": "abcedf",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function sevenSegmentDigit(digit: string, size: number, depth: number): Mesh {
  const horizontal = box(size * 0.72, size * 0.11, depth);
  const vertical = box(size * 0.11, size * 0.64, depth);
  const segments: Record<string, Mesh> = {
    a: transform(horizontal, { translate: vec3(0, size * 0.64, 0) }),
    b: transform(vertical, { translate: vec3(size * 0.37, size * 0.32, 0) }),
    c: transform(vertical, { translate: vec3(size * 0.37, -size * 0.32, 0) }),
    d: transform(horizontal, { translate: vec3(0, -size * 0.64, 0) }),
    e: transform(vertical, { translate: vec3(-size * 0.37, -size * 0.32, 0) }),
    f: transform(vertical, { translate: vec3(-size * 0.37, size * 0.32, 0) }),
    g: transform(horizontal, { translate: vec3(0, 0, 0) }),
  };
  return merge(...[...DIGIT_SEGMENTS[digit]!].map((segment) => segments[segment]!));
}

function buildDartboard(p: PolyHavenLearningPropParams): PolyHavenLearningMeshPart[] {
  const radius = Math.min(p.width, p.height) * 0.5;
  const centerY = radius;
  const bodyDepth = p.depth * 0.82;
  const board = transform(cylinder(radius, bodyDepth, p.detail > 0 ? 64 : 32), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, centerY, 0),
  });
  const values = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const darkFields: Mesh[] = [];
  const lightFields: Mesh[] = [];
  const redFields: Mesh[] = [];
  const greenFields: Mesh[] = [];
  const sectorGap = 0.012 + p.damage * 0.018;
  const frontZ = bodyDepth * 0.54;
  for (let index = 0; index < 20; index++) {
    const centerAngle = Math.PI * 0.5 - index * Math.PI * 0.1 + p.variation * Math.PI * 0.01;
    const half = Math.PI * 0.05 - sectorGap;
    const primary = index % 2 === 0 ? darkFields : lightFields;
    const accent = index % 2 === 0 ? redFields : greenFields;
    primary.push(
      transform(annularSector(radius * 0.11, radius * 0.49, centerAngle - half, centerAngle + half, p.depth * 0.035), { translate: vec3(0, centerY, frontZ) }),
      transform(annularSector(radius * 0.59, radius * 0.82, centerAngle - half, centerAngle + half, p.depth * 0.035), { translate: vec3(0, centerY, frontZ) }),
    );
    accent.push(
      transform(annularSector(radius * 0.49, radius * 0.59, centerAngle - half, centerAngle + half, p.depth * 0.04), { translate: vec3(0, centerY, frontZ + p.depth * 0.004) }),
      transform(annularSector(radius * 0.82, radius * 0.88, centerAngle - half, centerAngle + half, p.depth * 0.04), { translate: vec3(0, centerY, frontZ + p.depth * 0.004) }),
    );
  }
  const outerBull = transform(cylinder(radius * 0.11, p.depth * 0.045, 28), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, centerY, frontZ + p.depth * 0.006),
  });
  const bullseye = transform(cylinder(radius * 0.045, p.depth * 0.05, 24), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, centerY, frontZ + p.depth * 0.012),
  });
  const numberMeshes: Mesh[] = [];
  const digitSize = radius * 0.085;
  const numberRadius = radius * 0.935;
  for (let index = 0; index < values.length; index++) {
    const angle = Math.PI * 0.5 - index * Math.PI * 0.1;
    const digits = String(values[index]!);
    for (let digitIndex = 0; digitIndex < digits.length; digitIndex++) {
      const offset = (digitIndex - (digits.length - 1) * 0.5) * digitSize * 0.86;
      numberMeshes.push(transform(sevenSegmentDigit(digits[digitIndex]!, digitSize, p.depth * 0.025), {
        translate: vec3(Math.cos(angle) * numberRadius + offset, centerY + Math.sin(angle) * numberRadius, frontZ + p.depth * 0.035),
      }));
    }
  }
  const wireRings = merge(
    transform(torus(radius * 0.49, radius * 0.007, 48, 5), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, frontZ + p.depth * 0.065) }),
    transform(torus(radius * 0.59, radius * 0.007, 48, 5), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, frontZ + p.depth * 0.065) }),
    transform(torus(radius * 0.82, radius * 0.007, 48, 5), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, frontZ + p.depth * 0.065) }),
    transform(torus(radius * 0.88, radius * 0.007, 48, 5), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, centerY, frontZ + p.depth * 0.065) }),
  );
  return [
    part("dartboard_body", "飞镖盘压制纤维圆盘与黑色外圈", board, BOARD_DARK, "fiber", { color: BOARD_DARK, roughness: 0.92, wear: p.damage }),
    part("dartboard_dark_sectors", "飞镖盘交替深色单倍分区", merge(...darkFields), BOARD_DARK, "fiber", { color: BOARD_DARK, roughness: 0.9 }),
    part("dartboard_light_sectors", "飞镖盘交替浅色单倍分区", merge(...lightFields), BOARD_LIGHT, "fiber", { color: BOARD_LIGHT, roughness: 0.9, wear: p.damage }),
    part("dartboard_red_rings", "飞镖盘红色双倍与三倍环分区", merge(...redFields), BOARD_RED, "fiber", { color: BOARD_RED, roughness: 0.88 }),
    part("dartboard_green_rings", "飞镖盘绿色双倍与三倍环分区", merge(...greenFields), BOARD_GREEN, "fiber", { color: BOARD_GREEN, roughness: 0.88 }),
    part("dartboard_outer_bull", "飞镖盘绿色外牛眼", outerBull, BOARD_GREEN, "fiber", { color: BOARD_GREEN, roughness: 0.88 }),
    part("dartboard_bullseye", "飞镖盘红色中心牛眼", bullseye, BOARD_RED, "fiber", { color: BOARD_RED, roughness: 0.88 }),
    part("dartboard_numbers", "飞镖盘程序化七段式 1 至 20 分值标记", merge(...numberMeshes), NUMBER_IVORY, "paint", { color: NUMBER_IVORY, roughness: 0.78 }),
    part("dartboard_wire", "飞镖盘金属分区压线环", wireRings, STEEL, "metal", { color: STEEL, roughness: 0.55 }),
  ];
}

export function buildPolyHavenLearningPropMeshes(
  kind: PolyHavenLearningPropKind,
  params: PolyHavenLearningPropParams,
): PolyHavenLearningMeshPart[] {
  switch (kind) {
    case "factory-facade-kit": return buildFacadeKit(params, "factory");
    case "apartment-facade-kit": return buildFacadeKit(params, "apartment");
    case "cassette-player": return buildCassettePlayer(params);
    case "hand-truck": return buildHandTruck(params);
    case "fire-extinguisher": return buildFireExtinguisher(params);
    case "dartboard": return buildDartboard(params);
  }
}
