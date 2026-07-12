import {
  box,
  capsule,
  cylinder,
  lathe,
  makeMesh,
  merge,
  polyline,
  prism,
  roundedBox,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  recomputeNormals,
  type Mesh,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type PolyHavenFinalLearningPropKind =
  | "roller-shutter"
  | "military-compressor"
  | "extension-ladder"
  | "folding-ladder"
  | "measuring-tape"
  | "incandescent-bulb"
  | "spade"
  | "handsaw"
  | "hacksaw";

export interface PolyHavenFinalLearningPropParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenFinalLearningMeshPart {
  name: string;
  label: string;
  mesh: Mesh;
  color: RGB;
  surfaceType: string;
  surfaceParams: Record<string, unknown>;
  doubleSided?: boolean;
}

const GALVANIZED: RGB = [0.38, 0.4, 0.39];
const DARK_STEEL: RGB = [0.075, 0.08, 0.078];
const SHUTTER_BLUE: RGB = [0.19, 0.28, 0.31];

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): PolyHavenFinalLearningMeshPart {
  return { name, label, mesh, color, surfaceType, surfaceParams, ...(doubleSided ? { doubleSided: true } : {}) };
}

function buildRollerShutter(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const frameWidth = p.width * 0.045;
  const headHeight = p.height * 0.12;
  const trackDepth = p.depth * 0.62;
  const frontZ = p.depth * 0.06;
  const slatCount = Math.max(10, Math.round(p.structure));
  const visibleCount = Math.max(1, Math.round(slatCount * (1 - p.variation * 0.92)));
  const clearHeight = p.height - headHeight;
  const slatHeight = clearHeight / slatCount;
  const slats: Mesh[] = [];
  for (let index = 0; index < visibleCount; index++) {
    const y = clearHeight - (index + 0.5) * slatHeight;
    slats.push(
      transform(roundedBox({
        width: p.width - frameWidth * 2.45,
        height: slatHeight * 0.86,
        depth: p.depth * 0.2,
        radius: slatHeight * 0.15,
        steps: p.detail > 0 ? 2 : 1,
      }), { translate: vec3(0, y, frontZ) }),
    );
  }
  const bottomY = clearHeight - visibleCount * slatHeight;
  slats.push(transform(box(p.width - frameWidth * 2.2, slatHeight * 0.42, p.depth * 0.27), {
    translate: vec3(0, Math.max(slatHeight * 0.22, bottomY), frontZ),
  }));

  const frame = merge(
    transform(box(frameWidth, p.height, p.depth), { translate: vec3(-p.width * 0.5 + frameWidth * 0.5, p.height * 0.5, 0) }),
    transform(box(frameWidth, p.height, p.depth), { translate: vec3(p.width * 0.5 - frameWidth * 0.5, p.height * 0.5, 0) }),
    transform(box(p.width, headHeight, p.depth), { translate: vec3(0, p.height - headHeight * 0.5, 0) }),
  );
  const tracks = merge(
    transform(box(frameWidth * 0.42, clearHeight, trackDepth), { translate: vec3(-p.width * 0.5 + frameWidth * 1.15, clearHeight * 0.5, frontZ) }),
    transform(box(frameWidth * 0.42, clearHeight, trackDepth), { translate: vec3(p.width * 0.5 - frameWidth * 1.15, clearHeight * 0.5, frontZ) }),
  );
  const drumRadius = p.depth * (0.22 + p.variation * 0.18);
  const drum = merge(
    transform(cylinder(drumRadius, p.width - frameWidth * 2.25, p.detail > 0 ? 24 : 12), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, p.height - headHeight * 0.48, 0),
    }),
    transform(torus(drumRadius * 1.06, p.depth * 0.035, 24, 6), {
      rotate: vec3(0, Math.PI / 2, 0),
      translate: vec3(-p.width * 0.5 + frameWidth * 1.05, p.height - headHeight * 0.48, 0),
    }),
    transform(torus(drumRadius * 1.06, p.depth * 0.035, 24, 6), {
      rotate: vec3(0, Math.PI / 2, 0),
      translate: vec3(p.width * 0.5 - frameWidth * 1.05, p.height - headHeight * 0.48, 0),
    }),
  );
  return [
    part("roller_shutter_frame", "卷帘门承重边框与顶部罩箱", frame, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.62, rust: p.damage }),
    part("roller_shutter_tracks", "卷帘门双侧导向轨道", tracks, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.48 }),
    part("roller_shutter_slats", "卷帘门沿轨道联动的分节帘片与底梁", merge(...slats), SHUTTER_BLUE, "metal", { color: SHUTTER_BLUE, roughness: 0.58, wear: p.damage }),
    part("roller_shutter_drum", "卷帘门顶部收纳卷筒与端部轴承", drum, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.46 }),
  ];
}

function buildMilitaryCompressor(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const sides = p.detail > 0 ? 16 : 9;
  const wheelRadius = p.width * 0.22;
  const wheelY = wheelRadius;
  const wheelZ = p.depth * 0.2;
  const railX = p.width * 0.34;
  const tubeRadius = p.width * 0.026;
  const tube = (points: ReturnType<typeof vec3>[], radius = tubeRadius): Mesh =>
    sweep(points.length > 2 ? smoothCurve(polyline(points), 2) : polyline(points), { radius, sides: 9, caps: true });
  const frame = merge(
    ...[-1, 1].map((side) => transform(box(tubeRadius * 2.4, tubeRadius * 2.4, p.depth * 0.76), {
      translate: vec3(side * railX, wheelY * 0.72, p.depth * 0.05),
    })),
    transform(box(p.width * 0.78, tubeRadius * 2.5, tubeRadius * 2.5), { translate: vec3(0, wheelY * 0.72, wheelZ) }),
    tube([vec3(-railX, wheelY * 0.72, -p.depth * 0.33), vec3(0, wheelY * 0.56, -p.depth * 0.58)]),
    tube([vec3(railX, wheelY * 0.72, -p.depth * 0.33), vec3(0, wheelY * 0.56, -p.depth * 0.58)]),
    transform(torus(wheelRadius, p.width * 0.055, 24, 8), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.46, wheelY, wheelZ) }),
    transform(torus(wheelRadius, p.width * 0.055, 24, 8), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.46, wheelY, wheelZ) }),
  );
  const tankRadius = p.width * 0.25;
  const tank = merge(
    transform(cylinder(tankRadius, p.depth * 0.58, sides + 6), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, p.height * 0.38, p.depth * 0.12) }),
    transform(sphere(tankRadius, sides, 8), { scale: vec3(1, 1, 0.32), translate: vec3(0, p.height * 0.38, -p.depth * 0.17) }),
    transform(sphere(tankRadius, sides, 8), { scale: vec3(1, 1, 0.32), translate: vec3(0, p.height * 0.38, p.depth * 0.41) }),
  );
  const engine = merge(
    transform(roundedBox({ width: p.width * 0.58, height: p.height * 0.26, depth: p.depth * 0.25, radius: p.width * 0.045, steps: 2 }), {
      translate: vec3(0, p.height * 0.66, p.depth * 0.12),
    }),
    ...Array.from({ length: Math.max(5, Math.round(p.structure * 0.4)) }, (_, index) =>
      transform(box(p.width * 0.52, p.height * 0.012, p.depth * 0.27), {
        translate: vec3(0, p.height * (0.57 + index * 0.024), p.depth * 0.12),
      })),
  );
  const phase = p.variation * Math.PI;
  const crankY = p.height * 0.72;
  const crankZ = p.depth * 0.13;
  const crankRadius = p.height * 0.12;
  const crankPinY = crankY + Math.sin(phase) * crankRadius * 0.58;
  const crankPinZ = crankZ + Math.cos(phase) * crankRadius * 0.58;
  const crank = merge(
    transform(torus(crankRadius, p.width * 0.026, 28, 7), { rotate: vec3(0, Math.PI / 2, 0), translate: vec3(p.width * 0.35, crankY, crankZ) }),
    transform(cylinder(p.width * 0.035, p.width * 0.22, 12), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.35, crankPinY, crankPinZ) }),
  );
  const pistonMeshes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * p.width * 0.15;
    const pistonY = p.height * (0.76 + side * Math.sin(phase) * 0.035);
    pistonMeshes.push(
      transform(cylinder(p.width * 0.095, p.height * 0.22, sides), { translate: vec3(x, pistonY, crankZ) }),
      tube([vec3(p.width * 0.35, crankPinY, crankPinZ), vec3(x, pistonY - p.height * 0.08, crankZ)], p.width * 0.022),
    );
  }
  const gauges = merge(
    ...[-1, 1].map((side) => merge(
      transform(cylinder(p.width * 0.065, p.depth * 0.035, 20), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(side * p.width * 0.085, p.height * 0.94, p.depth * 0.27) }),
      transform(cylinder(p.width * 0.008, p.depth * 0.045, 8), { rotate: vec3(Math.PI / 2, 0, side * 0.55), translate: vec3(side * p.width * 0.085, p.height * 0.94, p.depth * 0.293) }),
    )),
    transform(box(p.width * 0.31, p.height * 0.14, p.depth * 0.08), { translate: vec3(0, p.height * 0.93, p.depth * 0.22) }),
  );
  const hoses = merge(
    tube([vec3(-p.width * 0.18, p.height * 0.67, p.depth * 0.22), vec3(-p.width * 0.34, p.height * 0.78, p.depth * 0.34), vec3(-p.width * 0.29, p.height * 0.46, p.depth * 0.47)], p.width * 0.02),
    tube([vec3(p.width * 0.18, p.height * 0.67, p.depth * 0.22), vec3(p.width * 0.36, p.height * 0.62, p.depth * 0.38), vec3(p.width * 0.28, p.height * 0.31, p.depth * 0.52)], p.width * 0.02),
  );
  return [
    part("compressor_frame", "军用压缩机拖挂底盘、牵引架与轮组", frame, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.66, rust: p.damage }),
    part("compressor_tank", "军用压缩机卧式储气罐与封头", tank, SHUTTER_BLUE, "metal", { color: SHUTTER_BLUE, roughness: 0.62, wear: p.damage }),
    part("compressor_engine", "军用压缩机泵体与散热片", engine, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.58 }),
    part("compressor_crank", "军用压缩机曲轴飞轮与偏心销", crank, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.48 }),
    part("compressor_pistons", "军用压缩机双活塞缸与连杆联动", merge(...pistonMeshes), GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.52 }),
    part("compressor_gauges", "军用压缩机双压力表与调压面板", gauges, [0.68, 0.66, 0.57], "glass", { color: [0.68, 0.66, 0.57], roughness: 0.18 }),
    part("compressor_hoses", "军用压缩机高压软管与接头", hoses, [0.12, 0.08, 0.045], "rubber", { color: [0.12, 0.08, 0.045], roughness: 0.86 }),
  ];
}

function buildLadder(
  p: PolyHavenFinalLearningPropParams,
  kind: "extension-ladder" | "folding-ladder",
): PolyHavenFinalLearningMeshPart[] {
  const sides = p.detail > 0 ? 10 : 7;
  const railRadius = Math.min(p.width, p.depth) * (kind === "extension-ladder" ? 0.08 : 0.055);
  const tube = (from: ReturnType<typeof vec3>, to: ReturnType<typeof vec3>, radius = railRadius): Mesh =>
    sweep(polyline([from, to]), { radius, sides, caps: true });
  const stiles: Mesh[] = [];
  const rungs: Mesh[] = [];
  const hinges: Mesh[] = [];
  const locks: Mesh[] = [];
  const rungCount = Math.max(6, Math.round(p.structure * 0.62));
  if (kind === "extension-ladder") {
    const half = p.width * 0.39;
    const lowerHeight = p.height * 0.72;
    const upperBase = p.height * (0.18 + p.variation * 0.2);
    const upperHeight = p.height * 0.72;
    for (const side of [-1, 1]) {
      stiles.push(
        tube(vec3(side * half, 0, 0), vec3(side * half, lowerHeight, 0), railRadius * 1.12),
        tube(vec3(side * half * 0.86, upperBase, p.depth * 0.14), vec3(side * half * 0.86, upperBase + upperHeight, p.depth * 0.14), railRadius * 0.9),
      );
      locks.push(
        transform(roundedBox({ width: railRadius * 3.2, height: railRadius * 2.7, depth: p.depth * 0.42, radius: railRadius * 0.35, steps: 2 }), {
          translate: vec3(side * half, upperBase + p.height * 0.12, p.depth * 0.06),
        }),
      );
    }
    for (let index = 0; index < rungCount; index++) {
      const t = index / Math.max(1, rungCount - 1);
      rungs.push(
        tube(vec3(-half, p.height * 0.08 + t * lowerHeight * 0.82, 0), vec3(half, p.height * 0.08 + t * lowerHeight * 0.82, 0), railRadius * 0.72),
        tube(vec3(-half * 0.86, upperBase + p.height * 0.08 + t * upperHeight * 0.82, p.depth * 0.14), vec3(half * 0.86, upperBase + p.height * 0.08 + t * upperHeight * 0.82, p.depth * 0.14), railRadius * 0.62),
      );
    }
    hinges.push(
      transform(cylinder(railRadius * 1.4, p.width * 0.92, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, upperBase + p.height * 0.12, p.depth * 0.08) }),
    );
  } else {
    const half = p.width * 0.42;
    const spread = p.depth * (0.2 + p.variation * 0.28);
    const topY = p.height * 0.96;
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        stiles.push(tube(
          vec3(side * half, 0, face * spread),
          vec3(side * half * 0.82, topY, face * p.depth * 0.035),
          railRadius,
        ));
      }
    }
    for (let index = 0; index < rungCount; index++) {
      const t = (index + 1) / (rungCount + 1);
      const y = topY * t;
      const x = half * (1 - t * 0.18);
      const z = spread * (1 - t) + p.depth * 0.035 * t;
      rungs.push(
        tube(vec3(-x, y, z), vec3(x, y, z), railRadius * 0.72),
        tube(vec3(-x, y, -z), vec3(x, y, -z), railRadius * 0.72),
      );
    }
    hinges.push(
      transform(cylinder(railRadius * 1.55, p.width * 0.82, 18), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, topY, 0) }),
      transform(torus(railRadius * 1.8, railRadius * 0.38, 18, 6), { rotate: vec3(0, Math.PI / 2, 0), translate: vec3(-half * 0.84, topY, 0) }),
      transform(torus(railRadius * 1.8, railRadius * 0.38, 18, 6), { rotate: vec3(0, Math.PI / 2, 0), translate: vec3(half * 0.84, topY, 0) }),
    );
    locks.push(
      tube(vec3(-half * 0.7, topY * 0.48, -spread * 0.52), vec3(-half * 0.7, topY * 0.48, spread * 0.52), railRadius * 0.55),
      tube(vec3(half * 0.7, topY * 0.48, -spread * 0.52), vec3(half * 0.7, topY * 0.48, spread * 0.52), railRadius * 0.55),
    );
  }
  const wood = kind === "folding-ladder";
  const railColor: RGB = wood ? [0.34, 0.19, 0.075] : GALVANIZED;
  return [
    part("ladder_stiles", `${wood ? "折叠木梯" : "伸缩梯"}成对侧梁与嵌套滑轨`, merge(...stiles), railColor, wood ? "wood" : "metal", { color: railColor, roughness: wood ? 0.78 : 0.5, wear: p.damage }),
    part("ladder_rungs", `${wood ? "折叠木梯" : "伸缩梯"}等距防滑横档`, merge(...rungs), railColor, wood ? "wood" : "metal", { color: railColor, roughness: wood ? 0.76 : 0.48 }),
    part("ladder_hinges", `${wood ? "折叠木梯" : "伸缩梯"}顶部铰链与转轴`, merge(...hinges), DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.55 }),
    part("ladder_locks", `${wood ? "折叠木梯" : "伸缩梯"}展开撑杆与安全锁扣`, merge(...locks), DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.58 }),
  ];
}

function buildMeasuringTape(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const caseWidth = p.width * 0.58;
  const caseHeight = p.height * 0.92;
  const caseDepth = p.depth * 0.94;
  const caseX = -p.width * 0.19;
  const bladeLength = p.width * (0.12 + p.variation * 1.62);
  const bladeHeight = p.height * 0.23;
  const bladeX = caseX + caseWidth * 0.5 + bladeLength * 0.5;
  const bladeY = p.height * 0.42;
  const body = merge(
    transform(roundedBox({ width: caseWidth, height: caseHeight, depth: caseDepth, radius: Math.min(caseWidth, caseHeight) * 0.18, steps: 4 }), {
      translate: vec3(caseX, caseHeight * 0.5, 0),
    }),
    transform(torus(caseHeight * 0.28, p.depth * 0.07, 24, 7), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(caseX, caseHeight * 0.53, p.depth * 0.48) }),
  );
  const reel = merge(
    transform(cylinder(caseHeight * 0.29, caseDepth * 0.7, 24), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(caseX, caseHeight * 0.53, 0) }),
    transform(cylinder(caseHeight * 0.11, caseDepth * 0.8, 18), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(caseX, caseHeight * 0.53, 0) }),
  );
  const blade = merge(
    transform(box(bladeLength, bladeHeight, p.depth * 0.12), { translate: vec3(bladeX, bladeY, 0) }),
    transform(box(p.width * 0.035, bladeHeight * 1.4, p.depth * 0.42), { translate: vec3(bladeX + bladeLength * 0.5, bladeY - bladeHeight * 0.12, 0) }),
  );
  const tickCount = Math.max(4, Math.round(p.structure * (0.35 + p.variation * 0.65)));
  const ticks: Mesh[] = [];
  for (let index = 1; index <= tickCount; index++) {
    const t = index / (tickCount + 1);
    const major = index % 5 === 0;
    ticks.push(transform(box(p.width * 0.006, bladeHeight * (major ? 0.68 : 0.42), p.depth * 0.04), {
      translate: vec3(caseX + caseWidth * 0.5 + bladeLength * t, bladeY + bladeHeight * (major ? 0.08 : 0.18), p.depth * 0.08),
    }));
  }
  const lock = transform(roundedBox({ width: caseWidth * 0.24, height: caseHeight * 0.25, depth: caseDepth * 0.16, radius: caseHeight * 0.04, steps: 2 }), {
    rotate: vec3(0, 0, -0.18),
    translate: vec3(caseX + caseWidth * 0.14, caseHeight * 0.87, p.depth * 0.48),
  });
  const clip = merge(
    transform(box(caseWidth * 0.44, caseHeight * 0.58, p.depth * 0.06), { translate: vec3(caseX - caseWidth * 0.06, caseHeight * 0.48, -p.depth * 0.51) }),
    transform(box(caseWidth * 0.4, caseHeight * 0.08, p.depth * 0.26), { translate: vec3(caseX - caseWidth * 0.04, caseHeight * 0.2, -p.depth * 0.42) }),
  );
  return [
    part("measuring_tape_case", "卷尺防撞包胶外壳与护圈", body, [0.53, 0.65, 0.04], "plastic", { color: [0.53, 0.65, 0.04], roughness: 0.72, wear: p.damage }),
    part("measuring_tape_reel", "卷尺内部回卷盘与中心弹簧轮毂", reel, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.48 }),
    part("measuring_tape_blade", "卷尺可抽拉弧面钢带与端钩", blade, [0.78, 0.68, 0.15], "metal", { color: [0.78, 0.68, 0.15], roughness: 0.42 }),
    part("measuring_tape_ticks", "卷尺随抽出长度生成的长短刻度", merge(...ticks), DARK_STEEL, "paint", { color: DARK_STEEL, roughness: 0.7 }),
    part("measuring_tape_lock", "卷尺顶部尺带锁止滑钮", lock, [0.48, 0.04, 0.025], "plastic", { color: [0.48, 0.04, 0.025], roughness: 0.76 }),
    part("measuring_tape_clip", "卷尺背部弹性腰夹", clip, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.44 }),
  ];
}

function buildIncandescentBulb(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const radialSegments = p.detail > 0 ? 32 : 16;
  const glass = lathe([
    vec2(p.width * 0.2, p.height * 0.28),
    vec2(p.width * 0.25, p.height * 0.32),
    vec2(p.width * 0.31, p.height * 0.36),
    vec2(p.width * 0.4, p.height * 0.46),
    vec2(p.width * 0.48, p.height * 0.56),
    vec2(p.width * 0.5, p.height * 0.72),
    vec2(p.width * 0.47, p.height * 0.81),
    vec2(p.width * 0.4, p.height * 0.88),
    vec2(p.width * 0.3, p.height * 0.94),
    vec2(p.width * 0.18, p.height * 0.98),
    vec2(0, p.height),
  ], { segments: radialSegments });
  const baseRadius = p.width * 0.23;
  const threadCount = Math.max(4, Math.round(p.structure * 0.42));
  const baseMeshes: Mesh[] = [
    transform(cylinder(baseRadius, p.height * 0.25, radialSegments), { translate: vec3(0, p.height * 0.145, 0) }),
  ];
  for (let index = 0; index < threadCount; index++) {
    baseMeshes.push(transform(torus(baseRadius * 1.02, p.width * 0.024, radialSegments, 6), {
      translate: vec3(0, p.height * (0.055 + index * 0.17 / Math.max(1, threadCount - 1)), 0),
    }));
  }
  const coilCount = Math.max(5, Math.round(p.structure * 0.7));
  const filamentPoints: ReturnType<typeof vec3>[] = [];
  for (let index = 0; index <= coilCount * 5; index++) {
    const t = index / (coilCount * 5);
    const angle = t * coilCount * Math.PI * 2;
    filamentPoints.push(vec3(
      (t - 0.5) * p.width * 0.34,
      p.height * (0.6 - Math.sin(t * Math.PI) * p.variation * 0.035) + Math.sin(angle) * p.width * 0.018,
      Math.cos(angle) * p.width * 0.018,
    ));
  }
  const filament = sweep(polyline(filamentPoints), { radius: p.width * 0.009, sides: 6, caps: true });
  const supports = merge(
    sweep(smoothCurve(polyline([
      vec3(-p.width * 0.06, p.height * 0.25, 0),
      vec3(-p.width * 0.12, p.height * 0.44, 0),
      filamentPoints[0]!,
    ]), 2), { radius: p.width * 0.008, sides: 6, caps: true }),
    sweep(smoothCurve(polyline([
      vec3(p.width * 0.06, p.height * 0.25, 0),
      vec3(p.width * 0.12, p.height * 0.44, 0),
      filamentPoints[filamentPoints.length - 1]!,
    ]), 2), { radius: p.width * 0.008, sides: 6, caps: true }),
    transform(cylinder(p.width * 0.035, p.height * 0.34, 10), { translate: vec3(0, p.height * 0.4, 0) }),
  );
  const contact = merge(
    transform(cylinder(baseRadius * 0.6, p.height * 0.035, 20), { translate: vec3(0, p.height * 0.018, 0) }),
    transform(torus(baseRadius * 0.68, p.width * 0.018, 20, 6), { translate: vec3(0, p.height * 0.035, 0) }),
  );
  return [
    part("lightbulb_glass", "白炽灯泡薄壁梨形玻璃壳", glass, [0.68, 0.75, 0.72], "glass", { color: [0.68, 0.75, 0.72], roughness: 0.08, transmission: 0.92 }, true),
    part("lightbulb_screw_base", "白炽灯泡螺旋灯口与绝缘颈圈", merge(...baseMeshes), GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.4, wear: p.damage }),
    part("lightbulb_filament", "白炽灯泡程序化螺旋钨丝", filament, [1, 0.39, 0.045], "emissive", { color: [1, 0.39, 0.045], roughness: 0.35, emission: 1 }),
    part("lightbulb_supports", "白炽灯泡灯丝支撑线与玻璃芯柱", supports, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.44 }),
    part("lightbulb_contact", "白炽灯泡底部电触点与绝缘环", contact, [0.12, 0.11, 0.09], "metal", { color: [0.12, 0.11, 0.09], roughness: 0.52 }),
  ];
}

function pressedSpadeBlade(width: number, height: number, depth: number): Mesh {
  const rows = 5;
  const columns = 7;
  const positions: ReturnType<typeof vec3>[] = [];
  const normals: ReturnType<typeof vec3>[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    const rowWidth = width * (0.34 + Math.sin(t * Math.PI * 0.72) * 0.66);
    for (let column = 0; column < columns; column++) {
      const u = column / (columns - 1);
      const x = (u - 0.5) * rowWidth;
      const bowl = Math.sin(u * Math.PI) * Math.sin(t * Math.PI) * depth;
      positions.push(vec3(x, t * height, -bowl));
      normals.push(vec3(0, 0, 1));
      uvs.push(vec2(u, t));
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function buildSpade(p: PolyHavenFinalLearningPropParams): PolyHavenFinalLearningMeshPart[] {
  const bladeHeight = p.height * 0.29;
  const bladeWidth = p.width * 0.96;
  const pitch = -0.08 - p.variation * 0.28;
  const blade = transform(pressedSpadeBlade(bladeWidth, bladeHeight, p.depth * 0.62), {
    rotate: vec3(pitch, 0, 0),
    translate: vec3(0, p.height * 0.01, p.depth * 0.12),
  });
  const shaftBottom = p.height * 0.24;
  const shaftTop = p.height * 0.91;
  const shaftRadius = p.width * 0.045;
  const shaft = transform(cylinder(shaftRadius, shaftTop - shaftBottom, p.detail > 0 ? 14 : 8), {
    translate: vec3(0, (shaftBottom + shaftTop) * 0.5, 0),
  });
  const socket = lathe([
    vec2(p.width * 0.09, 0),
    vec2(p.width * 0.13, p.height * 0.05),
    vec2(p.width * 0.1, p.height * 0.16),
    vec2(shaftRadius * 1.15, p.height * 0.24),
  ], { segments: p.detail > 0 ? 20 : 10 });
  const gripY = p.height * 0.9;
  const gripHalf = p.width * 0.28;
  const grip = merge(
    sweep(smoothCurve(polyline([
      vec3(-gripHalf, gripY, 0),
      vec3(-gripHalf * 1.05, p.height * 0.98, 0),
      vec3(0, p.height, 0),
      vec3(gripHalf * 1.05, p.height * 0.98, 0),
      vec3(gripHalf, gripY, 0),
    ]), 2), { radius: shaftRadius * 0.8, sides: 10, caps: true }),
    transform(capsule(shaftRadius * 1.15, gripHalf * 2, 14, 3), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, gripY, 0) }),
  );
  const ribs = merge(
    ...[-1, 0, 1].map((offset) => sweep(polyline([
      vec3(offset * bladeWidth * 0.22, bladeHeight * 0.12, p.depth * 0.13),
      vec3(offset * bladeWidth * 0.28, bladeHeight * 0.86, p.depth * 0.03),
    ]), { radius: p.depth * 0.055, sides: 6, caps: true })),
  );
  return [
    part("spade_shaft", "铁锹纵向木柄", shaft, [0.38, 0.21, 0.08], "wood", { color: [0.38, 0.21, 0.08], roughness: 0.76, wear: p.damage }),
    part("spade_grip", "铁锹 D 形端部握把", grip, [0.28, 0.13, 0.045], "wood", { color: [0.28, 0.13, 0.045], roughness: 0.8 }),
    part("spade_socket", "铁锹渐变锥形柄套", socket, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.58, rust: p.damage }),
    part("spade_blade", "铁锹冲压凹面渐尖锹头", blade, [0.27, 0.18, 0.12], "metal", { color: [0.27, 0.18, 0.12], roughness: 0.72, rust: p.damage }, true),
    part("spade_ribs", "铁锹锹头纵向冲压加强筋", ribs, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.62 }),
  ];
}

function buildSaw(
  p: PolyHavenFinalLearningPropParams,
  kind: "handsaw" | "hacksaw",
): PolyHavenFinalLearningMeshPart[] {
  const hacksaw = kind === "hacksaw";
  const bladeLength = p.width * (hacksaw ? 0.76 : 0.78);
  const bladeHeight = p.height * (hacksaw ? 0.16 : 0.52);
  const bladeCenterX = p.width * (hacksaw ? 0.04 : 0.08);
  const bladeY = p.height * (hacksaw ? 0.16 : 0.42);
  const bladePitch = (p.variation - 0.5) * 0.12;
  const blade = transform(prism([
    vec2(-bladeLength * 0.5, -bladeHeight * 0.48),
    vec2(bladeLength * 0.5, -bladeHeight * 0.34),
    vec2(bladeLength * 0.5, bladeHeight * 0.08),
    vec2(-bladeLength * 0.5, bladeHeight * 0.48),
  ], p.depth * (hacksaw ? 0.32 : 0.48)), {
    rotate: vec3(-Math.PI / 2, 0, bladePitch),
    translate: vec3(bladeCenterX, bladeY, 0),
  });
  const toothCount = Math.max(10, Math.round(p.structure * (hacksaw ? 2.4 : 1.65)));
  const toothWidth = bladeLength / toothCount;
  const toothHeight = p.height * (hacksaw ? 0.055 : 0.09);
  const teeth: Mesh[] = [];
  for (let index = 0; index < toothCount; index++) {
    const x = bladeCenterX - bladeLength * 0.5 + (index + 0.5) * toothWidth;
    teeth.push(transform(prism([
      vec2(-toothWidth * 0.48, 0),
      vec2(toothWidth * 0.48, 0),
      vec2(toothWidth * (hacksaw ? 0.08 : 0.3), -toothHeight),
    ], p.depth * 0.36), {
      rotate: vec3(-Math.PI / 2, 0, bladePitch),
      translate: vec3(x, bladeY - bladeHeight * 0.46, 0),
    }));
  }
  const handleColor: RGB = hacksaw ? [0.42, 0.045, 0.025] : [0.34, 0.17, 0.055];
  const handle = hacksaw
    ? merge(
      transform(capsule(p.height * 0.12, p.height * 0.42, 14, 4), { rotate: vec3(0, 0, -0.28), translate: vec3(-p.width * 0.35, p.height * 0.35, 0) }),
      transform(torus(p.height * 0.13, p.height * 0.035, 20, 7), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.34, p.height * 0.38, 0) }),
    )
    : merge(
      transform(roundedBox({ width: p.width * 0.2, height: p.height * 0.8, depth: p.depth * 0.9, radius: p.height * 0.16, steps: 3 }), {
        rotate: vec3(0, 0, -0.22),
        translate: vec3(-p.width * 0.4, p.height * 0.48, 0),
      }),
      transform(torus(p.height * 0.17, p.height * 0.045, 22, 7), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.4, p.height * 0.5, p.depth * 0.46) }),
    );
  const parts: PolyHavenFinalLearningMeshPart[] = [
    part("saw_handle", `${hacksaw ? "钢锯" : "手锯"}符合手型的封闭握柄`, handle, handleColor, hacksaw ? "plastic" : "wood", { color: handleColor, roughness: 0.78, wear: p.damage }),
    part("saw_blade", `${hacksaw ? "钢锯" : "手锯"}薄板张紧刀身`, blade, GALVANIZED, "metal", { color: GALVANIZED, roughness: 0.42, rust: p.damage }, true),
    part("saw_teeth", `${hacksaw ? "钢锯" : "手锯"}按密度生成的连续锯齿`, merge(...teeth), DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.5, rust: p.damage }),
  ];
  if (hacksaw) {
    const frameRadius = p.height * 0.055;
    const frame = sweep(smoothCurve(polyline([
      vec3(-p.width * 0.34, p.height * 0.2, 0),
      vec3(-p.width * 0.31, p.height * 0.82, 0),
      vec3(0, p.height * 0.97, 0),
      vec3(p.width * 0.39, p.height * 0.82, 0),
      vec3(p.width * 0.46, p.height * 0.2, 0),
    ]), 3), { radius: frameRadius, sides: 10, caps: true });
    const tensioner = merge(
      transform(cylinder(frameRadius * 0.55, p.depth * 1.35, 12), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(p.width * 0.45, p.height * 0.16, 0) }),
      transform(box(frameRadius * 1.8, frameRadius * 0.42, p.depth * 1.7), { translate: vec3(p.width * 0.47, p.height * 0.16, 0) }),
    );
    parts.push(
      part("saw_frame", "钢锯弓形张紧框架", frame, [0.35, 0.045, 0.025], "metal", { color: [0.35, 0.045, 0.025], roughness: 0.62, wear: p.damage }),
      part("saw_tensioner", "钢锯刀片张紧螺杆与蝶形旋钮", tensioner, DARK_STEEL, "metal", { color: DARK_STEEL, roughness: 0.48 }),
    );
  }
  return parts;
}

export function buildPolyHavenFinalLearningPropMeshes(
  kind: PolyHavenFinalLearningPropKind,
  params: PolyHavenFinalLearningPropParams,
): PolyHavenFinalLearningMeshPart[] {
  switch (kind) {
    case "roller-shutter": return buildRollerShutter(params);
    case "military-compressor": return buildMilitaryCompressor(params);
    case "extension-ladder": return buildLadder(params, kind);
    case "folding-ladder": return buildLadder(params, kind);
    case "measuring-tape": return buildMeasuringTape(params);
    case "incandescent-bulb": return buildIncandescentBulb(params);
    case "spade": return buildSpade(params);
    case "handsaw": return buildSaw(params, kind);
    case "hacksaw": return buildSaw(params, kind);
  }
}
