import { box, cylinder, merge, transform, type Mesh, type NamedPart } from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import {
  createAssemblyState,
  type AssemblyModuleSpec,
  type AssemblySlot,
  type AssemblyState,
} from "./assembly.js";
import {
  buildProceduralVehicleParts,
  PROCEDURAL_VEHICLE_DEFAULTS,
  PROCEDURAL_VEHICLE_PRESETS,
  type ProceduralVehicleParams,
  type VehicleBodyStyle,
} from "./procedural-vehicle.js";

type RGB = [number, number, number];

export type VehicleModuleKind = "engine" | "cabin" | "rear";

export interface VehicleModuleAnchor {
  id: string;
  label: string;
  position: readonly [number, number, number];
  tags: readonly string[];
}

export interface VehicleFunctionalMetadata {
  kind: VehicleModuleKind;
  massKg: number;
  torqueNm?: number;
  fuelCapacityLiters?: number;
  seats?: number;
  payloadKg?: number;
  anchors: readonly VehicleModuleAnchor[];
}

export interface VehicleAssemblySlotMetadata {
  kind: VehicleModuleKind;
}

export interface VehicleAssemblySelection {
  engineModuleId?: string;
  cabinModuleId?: string;
  rearModuleId?: string;
}

export type ModularVehicleParams = Partial<ProceduralVehicleParams> & VehicleAssemblySelection;

export interface VehicleCapabilitySummary {
  totalModuleMassKg: number;
  peakTorqueNm: number;
  fuelCapacityLiters: number;
  seats: number;
  payloadKg: number;
  anchors: Array<VehicleModuleAnchor & { moduleId: string }>;
}

export interface ModularVehicleBuild {
  state: AssemblyState;
  slots: AssemblySlot<VehicleAssemblySlotMetadata>[];
  summary: VehicleCapabilitySummary;
  parts: NamedPart[];
}

const DARK: RGB = [0.025, 0.03, 0.035];
const METAL: RGB = [0.38, 0.42, 0.46];
const GLASS: RGB = [0.015, 0.055, 0.08];
const ELECTRIC_BLUE: RGB = [0.02, 0.48, 0.95];

export const VEHICLE_MODULES: readonly AssemblyModuleSpec<VehicleFunctionalMetadata>[] = [
  {
    id: "engine-standard",
    label: "标准燃油动力",
    slotType: "vehicle-engine",
    tags: ["vehicle", "powertrain"],
    size: { width: 0.9, height: 0.45, depth: 0.65 },
    capacityCost: 185,
    supportedYaw: [0],
    weight: 1,
    metadata: {
      kind: "engine",
      massKg: 185,
      torqueNm: 340,
      fuelCapacityLiters: 65,
      anchors: [{ id: "service", label: "动力检修点", position: [0, 0.25, 0], tags: ["service", "engine"] }],
    },
  },
  {
    id: "engine-performance",
    label: "高性能燃油动力",
    slotType: "vehicle-engine",
    tags: ["vehicle", "powertrain"],
    size: { width: 1.05, height: 0.52, depth: 0.78 },
    capacityCost: 235,
    supportedYaw: [0],
    weight: 0.7,
    metadata: {
      kind: "engine",
      massKg: 235,
      torqueNm: 560,
      fuelCapacityLiters: 78,
      anchors: [{ id: "service", label: "高性能动力检修点", position: [0, 0.3, 0], tags: ["service", "engine"] }],
    },
  },
  {
    id: "engine-electric",
    label: "双电机动力",
    slotType: "vehicle-engine",
    tags: ["vehicle", "powertrain"],
    size: { width: 1, height: 0.38, depth: 0.72 },
    capacityCost: 315,
    supportedYaw: [0],
    weight: 0.8,
    metadata: {
      kind: "engine",
      massKg: 315,
      torqueNm: 720,
      fuelCapacityLiters: 0,
      anchors: [{ id: "charge", label: "充电接口", position: [0.45, 0.2, -0.24], tags: ["service", "electric"] }],
    },
  },
  {
    id: "cabin-standard",
    label: "标准驾驶舱",
    slotType: "vehicle-cabin",
    tags: ["vehicle", "cabin"],
    size: { width: 1.05, height: 0.72, depth: 1.15 },
    capacityCost: 125,
    supportedYaw: [0],
    weight: 1,
    metadata: {
      kind: "cabin",
      massKg: 125,
      seats: 2,
      anchors: [{ id: "driver", label: "驾驶位", position: [-0.3, 0.2, -0.2], tags: ["seat", "driver"] }],
    },
  },
  {
    id: "cabin-crew",
    label: "多人驾驶舱",
    slotType: "vehicle-cabin",
    tags: ["vehicle", "cabin"],
    size: { width: 1.15, height: 0.76, depth: 1.55 },
    capacityCost: 215,
    supportedYaw: [0],
    weight: 0.9,
    metadata: {
      kind: "cabin",
      massKg: 215,
      seats: 5,
      anchors: [
        { id: "driver", label: "驾驶位", position: [-0.3, 0.2, -0.35], tags: ["seat", "driver"] },
        { id: "rear-seat", label: "后排座位", position: [0, 0.2, 0.42], tags: ["seat", "passenger"] },
      ],
    },
  },
  {
    id: "cabin-panoramic",
    label: "全景驾驶舱",
    slotType: "vehicle-cabin",
    tags: ["vehicle", "cabin"],
    size: { width: 1.12, height: 0.72, depth: 1.35 },
    capacityCost: 175,
    supportedYaw: [0],
    weight: 0.8,
    metadata: {
      kind: "cabin",
      massKg: 175,
      seats: 4,
      anchors: [{ id: "driver", label: "全景驾驶位", position: [-0.3, 0.2, -0.28], tags: ["seat", "driver"] }],
    },
  },
  {
    id: "rear-cargo",
    label: "开放货运模块",
    slotType: "vehicle-rear",
    tags: ["vehicle", "rear"],
    size: { width: 1.1, height: 0.55, depth: 1.25 },
    capacityCost: 185,
    supportedYaw: [0],
    weight: 1,
    metadata: {
      kind: "rear",
      massKg: 185,
      payloadKg: 1100,
      anchors: [{ id: "cargo", label: "货物固定点", position: [0, 0.25, 0], tags: ["cargo", "tie-down"] }],
    },
  },
  {
    id: "rear-passenger",
    label: "乘员舱模块",
    slotType: "vehicle-rear",
    tags: ["vehicle", "rear"],
    size: { width: 1.15, height: 0.85, depth: 1.45 },
    capacityCost: 325,
    supportedYaw: [0],
    weight: 0.8,
    metadata: {
      kind: "rear",
      massKg: 325,
      seats: 6,
      payloadKg: 320,
      anchors: [{ id: "passenger-door", label: "乘员舱入口", position: [0.55, 0.2, 0], tags: ["door", "passenger"] }],
    },
  },
  {
    id: "rear-utility",
    label: "工程设备模块",
    slotType: "vehicle-rear",
    tags: ["vehicle", "rear"],
    size: { width: 1.12, height: 0.72, depth: 1.35 },
    capacityCost: 275,
    supportedYaw: [0],
    weight: 0.85,
    metadata: {
      kind: "rear",
      massKg: 275,
      payloadKg: 720,
      anchors: [
        { id: "tool-left", label: "左工具挂点", position: [-0.5, 0.25, 0], tags: ["tool", "utility"] },
        { id: "tool-right", label: "右工具挂点", position: [0.5, 0.25, 0], tags: ["tool", "utility"] },
      ],
    },
  },
  {
    id: "rear-rescue-command",
    label: "救援指挥模块",
    slotType: "vehicle-rear",
    tags: ["vehicle", "rear"],
    size: { width: 1.18, height: 0.88, depth: 1.46 },
    capacityCost: 350,
    supportedYaw: [0],
    weight: 0.65,
    metadata: {
      kind: "rear",
      massKg: 350,
      seats: 2,
      payloadKg: 480,
      anchors: [
        { id: "drone-deck", label: "无人机起降位", position: [0, 0.62, 0.08], tags: ["drone", "rescue"] },
        { id: "medical-locker", label: "医疗装备柜", position: [-0.46, 0.18, 0], tags: ["medical", "storage"] },
        { id: "winch-control", label: "绞盘控制位", position: [0.46, 0.18, 0.42], tags: ["winch", "rescue"] },
      ],
    },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeParams(params: ModularVehicleParams): ProceduralVehicleParams {
  const style = params.style ?? PROCEDURAL_VEHICLE_DEFAULTS.style;
  const preset = PROCEDURAL_VEHICLE_PRESETS[style];
  const length = Math.max(2.4, params.length ?? preset.length);
  return {
    ...preset,
    ...params,
    style,
    length,
    width: Math.max(1.2, params.width ?? preset.width),
    height: Math.max(0.9, params.height ?? preset.height),
    wheelBase: clamp(params.wheelBase ?? preset.wheelBase, 1.4, length * 0.82),
    wheelRadius: Math.max(0.2, params.wheelRadius ?? preset.wheelRadius),
    wheelWidth: Math.max(0.12, params.wheelWidth ?? preset.wheelWidth),
    roofRoundness: clamp(params.roofRoundness ?? preset.roofRoundness, 0, 1),
    hoodSlope: clamp(params.hoodSlope ?? preset.hoodSlope, 0, 1),
    detail: clamp(params.detail ?? preset.detail, 0, 1),
    seed: Math.round(params.seed ?? preset.seed),
  };
}

function slot(
  id: string,
  label: string,
  type: string,
  kind: VehicleModuleKind,
  position: readonly [number, number, number],
  size: { width: number; height: number; depth: number },
  capacity: number,
): AssemblySlot<VehicleAssemblySlotMetadata> {
  return {
    id,
    label,
    type,
    requiredTags: ["vehicle", kind === "engine" ? "powertrain" : kind],
    position,
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    size,
    capacity,
    metadata: { kind },
  };
}

export function createVehicleAssemblySlots(params: ModularVehicleParams = {}): AssemblySlot<VehicleAssemblySlotMetadata>[] {
  const p = normalizeParams(params);
  const rearDepth = Math.max(1.5, p.length * 0.36);
  return [
    slot(
      "powertrain",
      "动力舱",
      "vehicle-engine",
      "engine",
      [0, p.rideHeight + p.height * 0.35, -p.length * 0.34],
      { width: Math.max(1.2, p.width * 0.78), height: Math.max(0.55, p.height * 0.46), depth: Math.max(0.9, p.length * 0.25) },
      420,
    ),
    slot(
      "driver-cabin",
      "驾驶舱",
      "vehicle-cabin",
      "cabin",
      [0, p.rideHeight + p.height * 0.58, -p.length * 0.04],
      { width: Math.max(1.2, p.width * 0.8), height: Math.max(0.8, p.height * 0.72), depth: Math.max(1.6, p.length * 0.36) },
      420,
    ),
    slot(
      "rear-function",
      "后舱功能位",
      "vehicle-rear",
      "rear",
      [0, p.rideHeight + p.height * 0.5, p.length * 0.3],
      { width: Math.max(1.2, p.width * 0.82), height: Math.max(0.9, p.height * 0.78), depth: rearDepth },
      p.style === "bus" ? 520 : 380,
    ),
  ];
}

function selectionRecord(selection: VehicleAssemblySelection): Record<string, string> {
  const result: Record<string, string> = {};
  if (selection.engineModuleId) result.powertrain = selection.engineModuleId;
  if (selection.cabinModuleId) result["driver-cabin"] = selection.cabinModuleId;
  if (selection.rearModuleId) result["rear-function"] = selection.rearModuleId;
  return result;
}

export function createVehicleAssembly(params: ModularVehicleParams = {}): {
  state: AssemblyState;
  slots: AssemblySlot<VehicleAssemblySlotMetadata>[];
} {
  const p = normalizeParams(params);
  const slots = createVehicleAssemblySlots(p);
  const state = createAssemblyState({
    id: `procedural-${p.style}-vehicle`,
    seed: p.seed,
    slots,
    modules: VEHICLE_MODULES,
    moduleBySlot: selectionRecord(params),
  });
  return { state, slots };
}

function partBox(size: readonly [number, number, number], position: readonly [number, number, number]): Mesh {
  return transform(box(size[0], size[1], size[2]), { translate: vec3(position[0], position[1], position[2]) });
}

function vehicleRoofY(p: ProceduralVehicleParams): number {
  const roofRatio: Readonly<Record<VehicleBodyStyle, number>> = {
    sedan: 0.94,
    suv: 0.96,
    pickup: 0.95,
    van: 0.97,
    bus: 0.98,
  };
  return p.rideHeight + p.height * roofRatio[p.style];
}

function modulePart(
  placement: AssemblyState["placements"][number],
  slotSpec: AssemblySlot<VehicleAssemblySlotMetadata>,
  module: AssemblyModuleSpec<VehicleFunctionalMetadata>,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
): NamedPart {
  return {
    name: `assembly_${slotSpec.id}`,
    label: module.label,
    mesh,
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "glass" ? 0.08 : 0.42 } },
    metadata: {
      assemblySlotId: slotSpec.id,
      assemblySlotLabel: slotSpec.label,
      moduleId: module.id,
      moduleInstanceId: placement.instanceId,
      variantSeed: placement.variantSeed,
      functional: module.metadata,
    },
  };
}

function engineMesh(moduleId: string, p: ProceduralVehicleParams): { mesh: Mesh; color: RGB; surface: string } {
  const front = -p.length / 2 - 0.035;
  if (moduleId === "engine-performance") {
    const scoop = partBox([p.width * 0.28, p.height * 0.075, p.length * 0.18], [0, p.rideHeight + p.height * 0.72, -p.length * 0.28]);
    const bars = Array.from({ length: 5 }, (_, index) => (
      partBox([p.width * 0.58, p.height * 0.018, p.length * 0.012], [0, p.rideHeight + p.height * (0.27 + index * 0.035), front])
    ));
    return { mesh: merge(scoop, ...bars), color: DARK, surface: "metal" };
  }
  if (moduleId === "engine-electric") {
    const fascia = partBox([p.width * 0.56, p.height * 0.19, p.length * 0.014], [0, p.rideHeight + p.height * 0.33, front]);
    const charge = transform(cylinder(p.height * 0.045, p.length * 0.018, 20, true), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(p.width * 0.34, p.rideHeight + p.height * 0.44, front - p.length * 0.012),
    });
    return { mesh: merge(fascia, charge), color: ELECTRIC_BLUE, surface: "carPaint" };
  }
  const bars = Array.from({ length: 4 }, (_, index) => (
    partBox([p.width * 0.46, p.height * 0.015, p.length * 0.012], [0, p.rideHeight + p.height * (0.28 + index * 0.04), front])
  ));
  return { mesh: merge(...bars), color: METAL, surface: "metal" };
}

function cabinMesh(moduleId: string, p: ProceduralVehicleParams): { mesh: Mesh; color: RGB; surface: string } {
  const roofY = vehicleRoofY(p);
  if (moduleId === "cabin-crew") {
    const sideStepY = p.rideHeight + p.height * 0.16;
    return {
      mesh: merge(
        partBox([p.width * 0.035, p.height * 0.035, p.length * 0.48], [-p.width * 0.53, sideStepY, 0]),
        partBox([p.width * 0.035, p.height * 0.035, p.length * 0.48], [p.width * 0.53, sideStepY, 0]),
        partBox([p.width * 0.5, p.height * 0.025, p.length * 0.035], [0, roofY, 0]),
      ),
      color: DARK,
      surface: "metal",
    };
  }
  if (moduleId === "cabin-panoramic") {
    return {
      mesh: partBox([p.width * 0.58, p.height * 0.018, p.length * 0.32], [0, roofY, 0]),
      color: GLASS,
      surface: "glass",
    };
  }
  return {
    mesh: transform(cylinder(p.height * 0.015, p.height * 0.16, 12, true), {
      translate: vec3(0, roofY + p.height * 0.08, p.length * 0.08),
    }),
    color: DARK,
    surface: "metal",
  };
}

function rearMesh(moduleId: string, p: ProceduralVehicleParams): { mesh: Mesh; color: RGB; surface: string } {
  const centerZ = p.length * 0.29;
  const roofY = vehicleRoofY(p);
  if (moduleId === "rear-rescue-command") {
    const mastY = roofY + p.height * 0.19;
    return {
      mesh: merge(
        partBox([p.width * 0.72, p.height * 0.16, p.length * 0.3], [0, roofY - p.height * 0.02, centerZ]),
        partBox([p.width * 0.12, p.height * 0.24, p.length * 0.26], [-p.width * 0.4, roofY - p.height * 0.08, centerZ]),
        partBox([p.width * 0.12, p.height * 0.24, p.length * 0.26], [p.width * 0.4, roofY - p.height * 0.08, centerZ]),
        transform(cylinder(p.height * 0.025, p.height * 0.38, 12, true), {
          translate: vec3(0, mastY, centerZ + p.length * 0.04),
        }),
        partBox([p.width * 0.34, p.height * 0.025, p.length * 0.16], [0, mastY + p.height * 0.2, centerZ + p.length * 0.04]),
      ),
      color: [0.86, 0.18, 0.045],
      surface: "carPaint",
    };
  }
  if (moduleId === "rear-passenger") {
    return {
      mesh: merge(
        partBox([p.width * 0.44, p.height * 0.11, p.length * 0.22], [0, roofY + p.height * 0.045, centerZ]),
        partBox([p.width * 0.035, p.height * 0.06, p.length * 0.28], [-p.width * 0.37, roofY, centerZ]),
        partBox([p.width * 0.035, p.height * 0.06, p.length * 0.28], [p.width * 0.37, roofY, centerZ]),
      ),
      color: [0.72, 0.74, 0.76],
      surface: "plastic",
    };
  }
  if (moduleId === "rear-utility") {
    const railX = p.width * 0.38;
    return {
      mesh: merge(
        partBox([p.width * 0.035, p.height * 0.28, p.length * 0.035], [-railX, roofY - p.height * 0.12, centerZ - p.length * 0.14]),
        partBox([p.width * 0.035, p.height * 0.28, p.length * 0.035], [railX, roofY - p.height * 0.12, centerZ - p.length * 0.14]),
        partBox([p.width * 0.035, p.height * 0.28, p.length * 0.035], [-railX, roofY - p.height * 0.12, centerZ + p.length * 0.14]),
        partBox([p.width * 0.035, p.height * 0.28, p.length * 0.035], [railX, roofY - p.height * 0.12, centerZ + p.length * 0.14]),
        partBox([p.width * 0.82, p.height * 0.035, p.length * 0.035], [0, roofY, centerZ - p.length * 0.14]),
        partBox([p.width * 0.82, p.height * 0.035, p.length * 0.035], [0, roofY, centerZ + p.length * 0.14]),
      ),
      color: DARK,
      surface: "metal",
    };
  }
  return {
    mesh: merge(
      partBox([p.width * 0.68, p.height * 0.045, p.length * 0.38], [0, roofY + p.height * 0.035, centerZ]),
      partBox([p.width * 0.04, p.height * 0.11, p.length * 0.38], [-p.width * 0.34, roofY + p.height * 0.09, centerZ]),
      partBox([p.width * 0.04, p.height * 0.11, p.length * 0.38], [p.width * 0.34, roofY + p.height * 0.09, centerZ]),
    ),
    color: DARK,
    surface: "metal",
  };
}

export function buildVehicleAssemblyModuleParts(
  state: AssemblyState,
  slots: readonly AssemblySlot<VehicleAssemblySlotMetadata>[],
  slotId: string,
  params: ModularVehicleParams = {},
): NamedPart[] {
  const p = normalizeParams(params);
  const placement = state.placements.find((candidate) => candidate.slotId === slotId);
  const slotSpec = slots.find((candidate) => candidate.id === slotId);
  if (!placement || !slotSpec) throw new Error(`unknown or empty vehicle slot ${slotId}`);
  const module = VEHICLE_MODULES.find((candidate) => candidate.id === placement.moduleId);
  if (!module) throw new Error(`unknown vehicle module ${placement.moduleId}`);
  const kind = slotSpec.metadata?.kind;
  if (!kind) throw new Error(`vehicle slot ${slotId} has no functional kind`);
  const built = kind === "engine"
    ? engineMesh(module.id, p)
    : kind === "cabin"
      ? cabinMesh(module.id, p)
      : rearMesh(module.id, p);
  return [modulePart(placement, slotSpec, module, built.mesh, built.color, built.surface)];
}

export function summarizeVehicleAssembly(
  state: AssemblyState,
  slots: readonly AssemblySlot<VehicleAssemblySlotMetadata>[],
): VehicleCapabilitySummary {
  const summary: VehicleCapabilitySummary = {
    totalModuleMassKg: 0,
    peakTorqueNm: 0,
    fuelCapacityLiters: 0,
    seats: 0,
    payloadKg: 0,
    anchors: [],
  };
  const slotById = new Map(slots.map((candidate) => [candidate.id, candidate]));
  for (const placement of state.placements) {
    const module = VEHICLE_MODULES.find((candidate) => candidate.id === placement.moduleId);
    const slotSpec = slotById.get(placement.slotId);
    if (!module?.metadata || !slotSpec) continue;
    const metadata = module.metadata;
    summary.totalModuleMassKg += metadata.massKg;
    summary.peakTorqueNm = Math.max(summary.peakTorqueNm, metadata.torqueNm ?? 0);
    summary.fuelCapacityLiters += metadata.fuelCapacityLiters ?? 0;
    summary.seats += metadata.seats ?? 0;
    summary.payloadKg += metadata.payloadKg ?? 0;
    for (const anchor of metadata.anchors) {
      summary.anchors.push({
        ...anchor,
        id: `${placement.instanceId}:${anchor.id}`,
        position: [
          slotSpec.position[0] + anchor.position[0],
          slotSpec.position[1] + anchor.position[1],
          slotSpec.position[2] + anchor.position[2],
        ],
        moduleId: module.id,
      });
    }
  }
  return summary;
}

export function buildModularVehicle(params: ModularVehicleParams = {}): ModularVehicleBuild {
  const p = normalizeParams(params);
  const { state, slots } = createVehicleAssembly(params);
  const assemblyParts = slots.flatMap((slotSpec) => buildVehicleAssemblyModuleParts(state, slots, slotSpec.id, p));
  return {
    state,
    slots,
    summary: summarizeVehicleAssembly(state, slots),
    parts: [...buildProceduralVehicleParts(p), ...assemblyParts],
  };
}

export function buildModularVehicleParts(params: ModularVehicleParams = {}): NamedPart[] {
  return buildModularVehicle(params).parts;
}

export function vehicleModuleLabel(moduleId: string): string {
  return VEHICLE_MODULES.find((module) => module.id === moduleId)?.label ?? moduleId;
}

export function vehicleModuleIds(kind: VehicleModuleKind): string[] {
  const slotType = kind === "engine" ? "vehicle-engine" : kind === "cabin" ? "vehicle-cabin" : "vehicle-rear";
  return VEHICLE_MODULES.filter((module) => module.slotType === slotType).map((module) => module.id);
}

export function vehicleDefaultModuleIds(style: VehicleBodyStyle): Required<VehicleAssemblySelection> {
  return {
    engineModuleId: style === "bus" ? "engine-electric" : "engine-standard",
    cabinModuleId: style === "pickup" ? "cabin-crew" : "cabin-standard",
    rearModuleId: style === "pickup" ? "rear-cargo" : style === "bus" ? "rear-passenger" : "rear-utility",
  };
}
