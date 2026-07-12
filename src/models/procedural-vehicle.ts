import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box, cylinder, loftSurface, loftSurfacePatch, merge, sphere, torus, transform,
  type Mesh, type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type VehicleBodyStyle = "sedan" | "suv" | "pickup" | "van" | "bus";

export interface ProceduralVehicleParams {
  style: VehicleBodyStyle;
  length: number;
  width: number;
  height: number;
  wheelBase: number;
  wheelRadius: number;
  wheelWidth: number;
  rideHeight: number;
  cabinPosition: number;
  roofRoundness: number;
  hoodSlope: number;
  detail: number;
  seed: number;
  paint: RGB;
}

export const PROCEDURAL_VEHICLE_DEFAULTS: ProceduralVehicleParams = {
  style: "suv", length: 4.8, width: 1.92, height: 1.68, wheelBase: 2.82,
  wheelRadius: 0.36, wheelWidth: 0.24, rideHeight: 0.16, cabinPosition: 0,
  roofRoundness: 0.34, hoodSlope: 0.52, detail: 1, seed: 17,
  paint: [0.08, 0.3, 0.62],
};

export const PROCEDURAL_VEHICLE_PRESETS: Readonly<Record<VehicleBodyStyle, ProceduralVehicleParams>> = {
  sedan: { ...PROCEDURAL_VEHICLE_DEFAULTS, style: "sedan", length: 4.65, width: 1.84, height: 1.42, wheelBase: 2.72, wheelRadius: 0.32, wheelWidth: 0.22, rideHeight: 0.11, roofRoundness: 0.5, hoodSlope: 0.7, paint: [0.68, 0.035, 0.025] },
  suv: PROCEDURAL_VEHICLE_DEFAULTS,
  pickup: { ...PROCEDURAL_VEHICLE_DEFAULTS, style: "pickup", length: 5.35, width: 2.02, height: 1.78, wheelBase: 3.25, wheelRadius: 0.4, wheelWidth: 0.28, rideHeight: 0.2, cabinPosition: -0.12, roofRoundness: 0.24, hoodSlope: 0.32, paint: [0.43, 0.12, 0.035] },
  van: { ...PROCEDURAL_VEHICLE_DEFAULTS, style: "van", length: 5.15, width: 2.02, height: 2.25, wheelBase: 3.15, wheelRadius: 0.34, wheelWidth: 0.24, rideHeight: 0.14, cabinPosition: -0.12, roofRoundness: 0.16, hoodSlope: 0.18, paint: [0.72, 0.74, 0.7] },
  bus: { ...PROCEDURAL_VEHICLE_DEFAULTS, style: "bus", length: 8.6, width: 2.45, height: 3.05, wheelBase: 5.55, wheelRadius: 0.48, wheelWidth: 0.3, rideHeight: 0.17, roofRoundness: 0.1, hoodSlope: 0.05, paint: [0.86, 0.56, 0.06] },
};

export interface ProceduralVehicleVariant {
  id: string;
  name: string;
  description: string;
  tags: readonly string[];
  params: ProceduralVehicleParams;
}

export const PROCEDURAL_VEHICLE_VARIANTS: readonly ProceduralVehicleVariant[] = [
  {
    id: "vehicle-city-sedan",
    name: "流线城市轿车",
    description: "长车头、弧形车顶与低腰线组成的城市四门轿车。",
    tags: ["轿车", "截面放样", "内嵌玻璃", "程序化载具"],
    params: { ...PROCEDURAL_VEHICLE_PRESETS.sedan, length: 4.48, wheelBase: 2.66, cabinPosition: 0.06, roofRoundness: 0.54, hoodSlope: 0.78, seed: 101, paint: [0.62, 0.055, 0.035] },
  },
  {
    id: "vehicle-adventure-suv",
    name: "高地探险 SUV",
    description: "高离地、大轮胎、宽肩线的五门探险 SUV。",
    tags: ["SUV", "越野", "截面放样", "程序化载具"],
    params: { ...PROCEDURAL_VEHICLE_PRESETS.suv, length: 5.08, width: 2.02, height: 1.82, wheelBase: 3.02, wheelRadius: 0.42, wheelWidth: 0.28, rideHeight: 0.22, roofRoundness: 0.3, hoodSlope: 0.38, seed: 211, paint: [0.08, 0.34, 0.18] },
  },
  {
    id: "vehicle-crew-pickup",
    name: "双排工程皮卡",
    description: "双排驾驶舱、开放货箱与强化轮组组成的工程皮卡。",
    tags: ["皮卡", "货箱", "越野", "程序化载具"],
    params: { ...PROCEDURAL_VEHICLE_PRESETS.pickup, length: 5.68, width: 2.08, height: 1.86, wheelBase: 3.48, wheelRadius: 0.44, wheelWidth: 0.3, rideHeight: 0.23, cabinPosition: -0.06, seed: 307, paint: [0.49, 0.15, 0.035] },
  },
  {
    id: "vehicle-delivery-van",
    name: "城市物流厢式车",
    description: "高顶、大容积、短车头的城市物流厢式车。",
    tags: ["厢式车", "物流", "高顶", "程序化载具"],
    params: { ...PROCEDURAL_VEHICLE_PRESETS.van, length: 5.62, width: 2.08, height: 2.42, wheelBase: 3.54, cabinPosition: -0.18, roofRoundness: 0.14, hoodSlope: 0.12, seed: 401, paint: [0.76, 0.78, 0.72] },
  },
  {
    id: "vehicle-city-bus",
    name: "低地板城市巴士",
    description: "长轴距、连续窗带与低地板比例的城市巴士。",
    tags: ["巴士", "公共交通", "连续窗带", "程序化载具"],
    params: { ...PROCEDURAL_VEHICLE_PRESETS.bus, length: 9.4, width: 2.5, height: 3.16, wheelBase: 6.08, wheelRadius: 0.5, wheelWidth: 0.31, rideHeight: 0.15, roofRoundness: 0.08, seed: 503, paint: [0.9, 0.48, 0.035] },
  },
];

interface StyleProfile {
  cabinStart: number;
  cabinEnd: number;
  beltRatio: number;
  roofRatio: number;
  windowCount: number;
  roofWidthRatio: number;
  roofCrownBase: number;
  roofCrownRange: number;
  longitudinalCrownRatio: number;
}

const STYLE_PROFILES: Readonly<Record<VehicleBodyStyle, StyleProfile>> = {
  sedan: { cabinStart: 0.28, cabinEnd: 0.75, beltRatio: 0.48, roofRatio: 0.94, windowCount: 2, roofWidthRatio: 0.76, roofCrownBase: 0.035, roofCrownRange: 0.035, longitudinalCrownRatio: 0.004 },
  suv: { cabinStart: 0.22, cabinEnd: 0.86, beltRatio: 0.48, roofRatio: 0.96, windowCount: 3, roofWidthRatio: 0.82, roofCrownBase: 0.025, roofCrownRange: 0.03, longitudinalCrownRatio: 0.003 },
  pickup: { cabinStart: 0.22, cabinEnd: 0.57, beltRatio: 0.48, roofRatio: 0.95, windowCount: 2, roofWidthRatio: 0.84, roofCrownBase: 0.02, roofCrownRange: 0.025, longitudinalCrownRatio: 0.002 },
  van: { cabinStart: 0.1, cabinEnd: 0.91, beltRatio: 0.42, roofRatio: 0.97, windowCount: 4, roofWidthRatio: 0.88, roofCrownBase: 0.015, roofCrownRange: 0.018, longitudinalCrownRatio: 0.0015 },
  bus: { cabinStart: 0.035, cabinEnd: 0.965, beltRatio: 0.36, roofRatio: 0.98, windowCount: 7, roofWidthRatio: 0.92, roofCrownBase: 0.01, roofCrownRange: 0.015, longitudinalCrownRatio: 0.001 },
};

const BLACK: RGB = [0.012, 0.013, 0.015];
const GLASS: RGB = [0.015, 0.04, 0.06];
const TIRE: RGB = [0.018, 0.018, 0.019];
const METAL: RGB = [0.64, 0.66, 0.68];
const LIGHT: RGB = [0.84, 0.9, 0.82];
const RED: RGB = [0.9, 0.025, 0.018];
const AMBER: RGB = [1, 0.38, 0.04];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function addPart(parts: NamedPart[], name: string, label: string, mesh: Mesh, color: RGB, surfaceType: string, params?: Record<string, unknown>): void {
  parts.push({ name, label, mesh, color, surface: params ? { type: surfaceType, params } : { type: surfaceType } });
}

function cabinRatios(p: ProceduralVehicleParams, profile: StyleProfile): [number, number] {
  const start = clamp(profile.cabinStart + p.cabinPosition * 0.12, 0.03, 0.72);
  return [start, clamp(profile.cabinEnd + p.cabinPosition * 0.12, start + 0.16, 0.98)];
}

interface VehicleBodyTopology {
  stations: number[];
  rings: Vec3[][];
  frontBaseIndex: number;
  roofFrontIndex: number;
  roofRearIndex: number;
  rearBaseIndex: number;
  windowSegmentIndices: number[];
}

function bodyRoofAt(t: number, profile: StyleProfile, belt: number, p: ProceduralVehicleParams, frontBase: number, roofFront: number, roofRear: number, rearBase: number): number {
  const roof = p.rideHeight + p.height * profile.roofRatio;
  const low = belt + p.height * (p.style === "bus" || p.style === "van" ? 0.12 : 0.05);
  const frontRise = smoothstep(frontBase, roofFront, t);
  const rearFall = 1 - smoothstep(roofRear, rearBase, t);
  const cabin = Math.min(frontRise, rearFall);
  const longitudinalCrown = 1 - Math.abs(clamp((t - roofFront) / Math.max(1e-6, roofRear - roofFront), 0, 1) * 2 - 1);
  return low + (roof - low) * cabin
    + p.height * profile.longitudinalCrownRatio * (0.4 + p.roofRoundness * 0.6) * longitudinalCrown * cabin;
}

function roofCrownHeight(profile: StyleProfile, p: ProceduralVehicleParams, cabinHeight: number): number {
  return cabinHeight * (profile.roofCrownBase + p.roofRoundness * profile.roofCrownRange);
}

function buildBodyTopology(p: ProceduralVehicleParams, profile: StyleProfile): VehicleBodyTopology {
  const [frontBase, rearBase] = cabinRatios(p, profile);
  const maxSlopeSpan = Math.max(0.035, (rearBase - frontBase) * 0.28);
  const frontSlopeSpan = Math.min(maxSlopeSpan, 0.035 + p.hoodSlope * 0.055);
  const rearSlopeSpan = Math.min(maxSlopeSpan, p.style === "sedan" ? 0.085 : 0.045);
  const roofFront = frontBase + frontSlopeSpan;
  const roofRear = Math.max(roofFront + 0.08, rearBase - rearSlopeSpan);
  const windowCuts = Array.from({ length: profile.windowCount + 1 }, (_, index) => (
    roofFront + (roofRear - roofFront) * index / profile.windowCount
  ));
  const stations = [0, frontBase, ...windowCuts, rearBase, 1]
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]!) > 1e-6);
  const halfLength = p.length / 2;
  const base = p.rideHeight + p.height * 0.08;
  const rocker = p.rideHeight + p.height * 0.18;
  const belt = p.rideHeight + p.height * profile.beltRatio;
  const rings = stations.map((t) => {
    const z = -halfLength + t * p.length;
    const halfWidth = p.width / 2 * (0.76 + 0.24 * Math.sin(Math.PI * t) ** 0.35);
    const roof = bodyRoofAt(t, profile, belt, p, frontBase, roofFront, roofRear, rearBase);
    const roofMix = clamp((roof - belt) / Math.max(0.01, p.height * 0.5), 0, 1);
    const upperHalf = halfWidth * (profile.roofWidthRatio + p.roofRoundness * 0.025 - roofMix * 0.015);
    const crownHeight = roofCrownHeight(profile, p, Math.max(0, roof - belt));
    const roofEdge = roof - crownHeight * 1.3;
    const roofShoulder = roof - crownHeight * 0.2;
    const roofPlateauHalf = upperHalf * (0.46 - p.roofRoundness * 0.08);
    return [
      vec3(-halfWidth * 0.72, base, z), vec3(-halfWidth, rocker, z), vec3(-halfWidth, belt, z),
      vec3(-upperHalf, roofEdge, z), vec3(-roofPlateauHalf, roofShoulder, z), vec3(0, roof, z),
      vec3(roofPlateauHalf, roofShoulder, z), vec3(upperHalf, roofEdge, z), vec3(halfWidth, belt, z),
      vec3(halfWidth, rocker, z), vec3(halfWidth * 0.72, base, z),
    ];
  });
  const indexOf = (value: number): number => stations.findIndex((station) => Math.abs(station - value) < 1e-6);
  const roofFrontIndex = indexOf(roofFront);
  const roofRearIndex = indexOf(roofRear);
  return {
    stations,
    rings,
    frontBaseIndex: indexOf(frontBase),
    roofFrontIndex,
    roofRearIndex,
    rearBaseIndex: indexOf(rearBase),
    windowSegmentIndices: Array.from({ length: roofRearIndex - roofFrontIndex }, (_, index) => roofFrontIndex + index),
  };
}

function buildBody(topology: VehicleBodyTopology): Mesh {
  const windowSegments = new Set(topology.windowSegmentIndices);
  return loftSurface(topology.rings, {
    longitudinalSubdivisions: 5,
    crossSectionSubdivisions: 3,
    longitudinalTension: 0.25,
    crossSectionTension: 0.08,
    includePatch: (longitudinalSpan, crossSectionSpan) => {
      if (windowSegments.has(longitudinalSpan) && (crossSectionSpan === 2 || crossSectionSpan === 7)) return false;
      if (longitudinalSpan === topology.frontBaseIndex && crossSectionSpan >= 3 && crossSectionSpan <= 6) return false;
      if (longitudinalSpan === topology.roofRearIndex && crossSectionSpan >= 3 && crossSectionSpan <= 6) return false;
      return true;
    },
  });
}

function partBox(size: Vec3, position: Vec3, rotation = vec3(0, 0, 0)): Mesh {
  return transform(box(size.x, size.y, size.z), { rotate: rotation, translate: position });
}

function cabinRange(p: ProceduralVehicleParams, profile: StyleProfile): [number, number] {
  const [start, end] = cabinRatios(p, profile);
  return [-p.length / 2 + start * p.length, -p.length / 2 + end * p.length];
}

function buildCurvedWindowPanel(
  rings: ReadonlyArray<ReadonlyArray<Vec3>>,
  longitudinalStart: number,
  longitudinalEnd: number,
  crossSectionStart: number,
  crossSectionEnd: number,
  push: Vec3,
): { glass: Mesh; frame: Mesh } {
  const inset = 0.055;
  const du = (longitudinalEnd - longitudinalStart) * inset;
  const dv = (crossSectionEnd - crossSectionStart) * inset;
  const longitudinalSegments = Math.max(2, Math.round((longitudinalEnd - longitudinalStart) * 5));
  const crossSectionSegments = Math.max(2, Math.round((crossSectionEnd - crossSectionStart) * 3));
  const patch = (
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    offset?: Vec3,
    doubleSided = false,
  ): Mesh => loftSurfacePatch(rings, {
    longitudinalStart: u0,
    longitudinalEnd: u1,
    crossSectionStart: v0,
    crossSectionEnd: v1,
    longitudinalSegments,
    crossSectionSegments,
    longitudinalTension: 0.25,
    crossSectionTension: 0.08,
    ...(offset ? { offset } : {}),
    doubleSided,
  });

  const innerU0 = longitudinalStart + du;
  const innerU1 = longitudinalEnd - du;
  const innerV0 = crossSectionStart + dv;
  const innerV1 = crossSectionEnd - dv;
  return {
    glass: patch(innerU0, innerU1, innerV0, innerV1, push, true),
    frame: merge(
      patch(longitudinalStart, innerU0, crossSectionStart, crossSectionEnd),
      patch(innerU1, longitudinalEnd, crossSectionStart, crossSectionEnd),
      patch(innerU0, innerU1, crossSectionStart, innerV0),
      patch(innerU0, innerU1, innerV1, crossSectionEnd),
    ),
  };
}

function buildWindows(p: ProceduralVehicleParams, topology: VehicleBodyTopology): { parts: NamedPart[]; frames: Mesh } {
  const parts: NamedPart[] = [];
  const frames: Mesh[] = [];
  const recess = Math.max(0.008, p.width * 0.006);
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < topology.windowSegmentIndices.length; index++) {
      const ringIndex = topology.windowSegmentIndices[index]!;
      const crossSectionStart = side < 0 ? 2 : 7;
      const panel = buildCurvedWindowPanel(
        topology.rings,
        ringIndex,
        ringIndex + 1,
        crossSectionStart,
        crossSectionStart + 1,
        vec3(-side * recess, 0, 0),
      );
      frames.push(panel.frame);
      addPart(parts, `side_window_${side}_${index}`, `侧窗 ${index + 1}`, panel.glass, GLASS, "glass", { tint: GLASS, roughness: 0.08, thickness: recess });
    }
  }
  const front = buildCurvedWindowPanel(
    topology.rings,
    topology.frontBaseIndex,
    topology.roofFrontIndex,
    3,
    7,
    vec3(0, 0, recess),
  );
  frames.push(front.frame);
  addPart(parts, "front_windshield", "前挡风玻璃", front.glass, GLASS, "glass", { tint: GLASS, roughness: 0.07, thickness: recess });
  const rear = buildCurvedWindowPanel(
    topology.rings,
    topology.roofRearIndex,
    topology.rearBaseIndex,
    3,
    7,
    vec3(0, 0, -recess),
  );
  frames.push(rear.frame);
  addPart(parts, "rear_windshield", "后挡风玻璃", rear.glass, GLASS, "glass", { tint: GLASS, roughness: 0.07, thickness: recess });
  return { parts, frames: merge(...frames) };
}

function addWheel(parts: NamedPart[], p: ProceduralVehicleParams, side: -1 | 1, axle: "front" | "rear", z: number, spokeCount: number): void {
  const center = vec3(side * (p.width / 2 + p.wheelWidth * 0.14), p.rideHeight + p.wheelRadius, z);
  const tire = transform(torus(p.wheelRadius, p.wheelWidth * 0.42, 36, 12), { rotate: vec3(0, 0, Math.PI / 2), scale: vec3(1, p.wheelWidth / Math.max(0.01, p.wheelRadius * 0.84), 1), translate: center });
  addPart(parts, `${axle}_tire_${side}`, `${axle === "front" ? "前" : "后"}轮胎`, tire, TIRE, "rubber", { color: TIRE, roughness: 0.82 });
  const rimX = center.x + side * p.wheelWidth * 0.08;
  addPart(parts, `${axle}_rim_${side}`, `${axle === "front" ? "前" : "后"}轮毂`, transform(cylinder(p.wheelRadius * 0.6, p.wheelWidth * 0.3, 32, true), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(rimX, center.y, z) }), METAL, "chrome");
  const spokes: Mesh[] = [];
  for (let index = 0; index < spokeCount; index++) {
    const angle = index / spokeCount * Math.PI * 2;
    spokes.push(partBox(vec3(p.wheelWidth * 0.12, p.wheelRadius * 0.72, p.wheelRadius * 0.075), vec3(rimX + side * p.wheelWidth * 0.18, center.y, z), vec3(angle, 0, 0)));
  }
  addPart(parts, `${axle}_spokes_${side}`, `${axle === "front" ? "前" : "后"}轮辐`, merge(...spokes), METAL, "brushedMetal", { color: METAL, roughness: 0.25 });
}

function addRunningGear(parts: NamedPart[], p: ProceduralVehicleParams, spokeCount: number): void {
  const frontZ = -p.wheelBase / 2;
  const rearZ = p.wheelBase / 2;
  for (const side of [-1, 1] as const) {
    addWheel(parts, p, side, "front", frontZ, spokeCount);
    addWheel(parts, p, side, "rear", rearZ, spokeCount);
    for (const [axle, z] of [["front", frontZ], ["rear", rearZ]] as const) {
      addPart(parts, `${axle}_wheel_arch_${side}`, `${axle === "front" ? "前" : "后"}轮拱`, transform(torus(p.wheelRadius * 1.12, p.wheelWidth * 0.18, 32, 8), { rotate: vec3(0, 0, Math.PI / 2), scale: vec3(1, 0.38, 1), translate: vec3(side * p.width * 0.505, p.rideHeight + p.wheelRadius, z) }), BLACK, "plastic", { color: BLACK, roughness: 0.62 });
    }
  }
  for (const [axle, z] of [["front", frontZ], ["rear", rearZ]] as const) {
    addPart(parts, `${axle}_axle`, `${axle === "front" ? "前" : "后"}车轴`, transform(cylinder(p.wheelWidth * 0.16, p.width, 16, true), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, p.rideHeight + p.wheelRadius, z) }), BLACK, "metal", { color: BLACK, roughness: 0.5 });
  }
}

function addFrontRearDetails(parts: NamedPart[], p: ProceduralVehicleParams): void {
  const halfLength = p.length / 2;
  const bumperY = p.rideHeight + p.height * 0.22;
  const lightY = p.rideHeight + p.height * 0.43;
  const bumperDepth = Math.max(0.055, p.length * 0.018);
  addPart(parts, "front_bumper", "前保险杠", partBox(vec3(p.width * 0.84, p.height * 0.1, bumperDepth), vec3(0, bumperY, -halfLength)), BLACK, "plastic", { color: BLACK, roughness: 0.48 });
  addPart(parts, "rear_bumper", "后保险杠", partBox(vec3(p.width * 0.86, p.height * 0.1, bumperDepth), vec3(0, bumperY, halfLength)), BLACK, "plastic", { color: BLACK, roughness: 0.48 });
  addPart(parts, "front_grille", "前格栅", partBox(vec3(p.width * 0.48, p.height * 0.18, bumperDepth * 0.52), vec3(0, p.rideHeight + p.height * 0.32, -halfLength - bumperDepth * 0.45)), BLACK, "metal", { color: BLACK, roughness: 0.38 });
  for (const side of [-1, 1] as const) {
    addPart(parts, `headlight_${side}`, "前照灯", partBox(vec3(p.width * 0.22, p.height * 0.1, bumperDepth * 0.48), vec3(side * p.width * 0.31, lightY, -halfLength - bumperDepth * 0.5)), LIGHT, "glass", { tint: LIGHT, roughness: 0.06 });
    addPart(parts, `tail_light_${side}`, "尾灯", partBox(vec3(p.width * 0.18, p.height * 0.11, bumperDepth * 0.48), vec3(side * p.width * 0.32, lightY, halfLength + bumperDepth * 0.5)), RED, "glass", { tint: RED, roughness: 0.08 });
    addPart(parts, `indicator_${side}`, "转向灯", partBox(vec3(p.width * 0.065, p.height * 0.065, bumperDepth * 0.52), vec3(side * p.width * 0.44, lightY - p.height * 0.03, -halfLength - bumperDepth * 0.52)), AMBER, "glass", { tint: AMBER, roughness: 0.08 });
  }
}

function addPickupBed(parts: NamedPart[], p: ProceduralVehicleParams, profile: StyleProfile): void {
  const [, cabinEnd] = cabinRange(p, profile);
  const rear = p.length / 2 - p.length * 0.035;
  const bedStart = cabinEnd + p.length * 0.045;
  const bedLength = Math.max(0.3, rear - bedStart);
  const floorY = p.rideHeight + p.height * 0.39;
  const wallHeight = p.height * 0.23;
  addPart(parts, "pickup_bed_floor", "货箱地板", partBox(vec3(p.width * 0.82, p.height * 0.045, bedLength), vec3(0, floorY, bedStart + bedLength / 2)), BLACK, "plastic", { color: BLACK, roughness: 0.72 });
  for (const side of [-1, 1] as const) addPart(parts, `pickup_bed_wall_${side}`, "货箱侧板", partBox(vec3(p.width * 0.08, wallHeight, bedLength), vec3(side * p.width * 0.45, floorY + wallHeight / 2, bedStart + bedLength / 2)), p.paint, "carPaint", { color: p.paint, seed: p.seed + side });
  addPart(parts, "pickup_tailgate", "货箱尾门", partBox(vec3(p.width * 0.82, wallHeight, p.length * 0.025), vec3(0, floorY + wallHeight / 2, rear)), p.paint, "carPaint", { color: p.paint, seed: p.seed + 3 });
}

function addDetailParts(parts: NamedPart[], p: ProceduralVehicleParams, profile: StyleProfile): void {
  const [cabinStart, cabinEnd] = cabinRange(p, profile);
  const belt = p.rideHeight + p.height * profile.beltRatio;
  for (const side of [-1, 1] as const) {
    addPart(parts, `mirror_${side}`, "后视镜", transform(sphere(p.width * 0.055, 14, 8), { scale: vec3(1.25, 0.55, 0.75), translate: vec3(side * p.width * 0.56, belt + p.height * 0.13, cabinStart + p.length * 0.035) }), p.paint, "carPaint", { color: p.paint, seed: p.seed + 7 });
    const doorCount = p.style === "bus" ? 2 : p.style === "pickup" || p.style === "sedan" ? 2 : 3;
    const doorSpan = (cabinEnd - cabinStart) / doorCount;
    for (let door = 0; door < doorCount; door++) addPart(parts, `door_handle_${side}_${door}`, `车门把手 ${door + 1}`, partBox(vec3(p.width * 0.025, p.height * 0.025, Math.min(0.16, doorSpan * 0.18)), vec3(side * p.width * 0.505, belt - p.height * 0.06, cabinStart + doorSpan * (door + 0.62))), METAL, "chrome");
  }
  if (p.style === "suv" || p.style === "van") {
    const railLength = Math.max(0.4, cabinEnd - cabinStart - p.length * 0.1);
    const roof = p.rideHeight + p.height * profile.roofRatio;
    const belt = p.rideHeight + p.height * profile.beltRatio;
    const crownHeight = roofCrownHeight(profile, p, roof - belt);
    const railY = roof - crownHeight * 0.2 + p.height * 0.0125;
    for (const side of [-1, 1] as const) addPart(parts, `roof_rail_${side}`, "车顶行李架", partBox(vec3(p.width * 0.025, p.height * 0.025, railLength), vec3(side * p.width * 0.22, railY, (cabinStart + cabinEnd) / 2)), BLACK, "metal", { color: BLACK, roughness: 0.42 });
  }
}

export function buildProceduralVehicleParts(params: Partial<ProceduralVehicleParams> = {}): NamedPart[] {
  const style = params.style ?? PROCEDURAL_VEHICLE_DEFAULTS.style;
  const preset = PROCEDURAL_VEHICLE_PRESETS[style];
  const requestedLength = params.length ?? preset.length;
  const p: ProceduralVehicleParams = {
    ...preset, ...params, style,
    length: Math.max(2.4, requestedLength), width: Math.max(1.2, params.width ?? preset.width),
    height: Math.max(0.9, params.height ?? preset.height),
    wheelBase: clamp(params.wheelBase ?? preset.wheelBase, 1.4, requestedLength * 0.82),
    wheelRadius: Math.max(0.2, params.wheelRadius ?? preset.wheelRadius),
    wheelWidth: Math.max(0.12, params.wheelWidth ?? preset.wheelWidth),
    roofRoundness: clamp(params.roofRoundness ?? preset.roofRoundness, 0, 1),
    hoodSlope: clamp(params.hoodSlope ?? preset.hoodSlope, 0, 1), detail: clamp(params.detail ?? preset.detail, 0, 1),
    seed: Math.round(params.seed ?? preset.seed),
  };
  const profile = STYLE_PROFILES[p.style];
  const parts: NamedPart[] = [];
  const topology = buildBodyTopology(p, profile);
  const windows = buildWindows(p, topology);
  addPart(parts, "body_shell", "车身外壳", merge(buildBody(topology), windows.frames), p.paint, "carPaint", { color: p.paint, seed: p.seed });
  parts.push(...windows.parts);
  addRunningGear(parts, p, makeRng(p.seed).int(5, 8));
  addFrontRearDetails(parts, p);
  if (p.style === "pickup") addPickupBed(parts, p, profile);
  if (p.detail >= 0.5) addDetailParts(parts, p, profile);
  return parts;
}

export function buildProceduralVehicleFleet(seed = 17): Record<VehicleBodyStyle, NamedPart[]> {
  return {
    sedan: buildProceduralVehicleParts({ style: "sedan", seed }),
    suv: buildProceduralVehicleParts({ style: "suv", seed }),
    pickup: buildProceduralVehicleParts({ style: "pickup", seed }),
    van: buildProceduralVehicleParts({ style: "van", seed }),
    bus: buildProceduralVehicleParts({ style: "bus", seed }),
  };
}

export function buildProceduralVehicleVariant(
  id: string,
  params: Partial<ProceduralVehicleParams> = {},
): NamedPart[] {
  const variant = PROCEDURAL_VEHICLE_VARIANTS.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`unknown procedural vehicle variant: ${id}`);
  return buildProceduralVehicleParts({ ...variant.params, ...params, style: variant.params.style });
}
