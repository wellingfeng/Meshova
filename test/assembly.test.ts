import { describe, expect, it } from "vitest";
import {
  buildModularVehicle,
  checkAssemblyCompatibility,
  createAssemblyHistory,
  createAssemblyState,
  createVehicleAssembly,
  deserializeAssemblyState,
  executeAssemblyReplacement,
  redoAssembly,
  replaceAssemblyModule,
  serializeAssemblyState,
  undoAssembly,
  VEHICLE_MODULES,
  type AssemblyModuleSpec,
  type AssemblySlot,
} from "../src/index.js";

const slots: AssemblySlot[] = [
  {
    id: "engine",
    label: "动力舱",
    type: "engine",
    requiredTags: ["vehicle", "powertrain"],
    position: [0, 0, 0],
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    size: { width: 2, height: 1, depth: 1.5 },
    capacity: 400,
  },
  {
    id: "rear",
    label: "后舱功能位",
    type: "rear",
    requiredTags: ["vehicle", "rear"],
    position: [0, 0, 2],
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    size: { width: 2, height: 1.5, depth: 2 },
    capacity: 500,
  },
];

const modules: AssemblyModuleSpec[] = [
  {
    id: "engine-a",
    label: "标准动力",
    slotType: "engine",
    tags: ["vehicle", "powertrain"],
    size: { width: 1.2, height: 0.7, depth: 1 },
    capacityCost: 180,
    supportedYaw: [0],
    weight: 1,
  },
  {
    id: "engine-b",
    label: "高性能动力",
    slotType: "engine",
    tags: ["vehicle", "powertrain"],
    size: { width: 1.3, height: 0.8, depth: 1.1 },
    capacityCost: 230,
    supportedYaw: [0],
    weight: 1,
  },
  {
    id: "rear-a",
    label: "货运模块",
    slotType: "rear",
    tags: ["vehicle", "rear"],
    size: { width: 1.4, height: 1, depth: 1.5 },
    capacityCost: 250,
    supportedYaw: [0],
    weight: 1,
  },
];

describe("generic assembly kernel", () => {
  it("reports type, tag, size, orientation, and capacity conflicts", () => {
    const bad: AssemblyModuleSpec = {
      id: "bad",
      label: "不兼容模块",
      slotType: "rear",
      tags: ["vehicle"],
      size: { width: 3, height: 2, depth: 2 },
      capacityCost: 600,
      supportedYaw: [90],
      weight: 1,
    };
    const result = checkAssemblyCompatibility(slots[0]!, bad);
    expect(result.compatible).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "slot-type",
      "required-tag",
      "width",
      "height",
      "depth",
      "orientation",
      "capacity",
    ]);
  });

  it("creates stable ids and round-trips canonical state", () => {
    const options = { id: "test-vehicle", seed: 73, slots, modules };
    const first = createAssemblyState(options);
    const second = createAssemblyState(options);
    expect(first).toEqual(second);
    expect(new Set(first.placements.map((placement) => placement.instanceId)).size).toBe(2);
    const serialized = serializeAssemblyState(first);
    expect(deserializeAssemblyState(serialized, slots, modules)).toEqual(first);
    expect(serializeAssemblyState(first)).toBe(serializeAssemblyState(second));
  });

  it("replaces one slot immutably and supports undo/redo", () => {
    const initial = createAssemblyState({
      id: "editable-vehicle",
      seed: 9,
      slots,
      modules,
      moduleBySlot: { engine: "engine-a", rear: "rear-a" },
    });
    const edit = replaceAssemblyModule(initial, slots, modules, "engine", "engine-b");
    expect(initial.placements.find((placement) => placement.slotId === "engine")?.moduleId).toBe("engine-a");
    expect(edit.state.placements.find((placement) => placement.slotId === "engine")?.moduleId).toBe("engine-b");
    expect(edit.invalidatedSlotIds).toEqual(["engine"]);

    let history = createAssemblyHistory(initial);
    history = executeAssemblyReplacement(history, slots, modules, "engine", "engine-b");
    history = undoAssembly(history);
    expect(history.state.placements.find((placement) => placement.slotId === "engine")?.moduleId).toBe("engine-a");
    history = redoAssembly(history);
    expect(history.state.placements.find((placement) => placement.slotId === "engine")?.moduleId).toBe("engine-b");
  });
});

describe("modular procedural vehicle", () => {
  it("builds semantic modules with deterministic functional metadata", () => {
    const params = {
      style: "pickup" as const,
      seed: 42,
      engineModuleId: "engine-electric",
      cabinModuleId: "cabin-crew",
      rearModuleId: "rear-cargo",
    };
    const first = buildModularVehicle(params);
    const second = buildModularVehicle(params);
    expect(first.state).toEqual(second.state);
    expect(first.summary.peakTorqueNm).toBe(720);
    expect(first.summary.fuelCapacityLiters).toBe(0);
    expect(first.summary.seats).toBe(5);
    expect(first.summary.payloadKg).toBe(1100);
    expect(first.summary.anchors.length).toBeGreaterThanOrEqual(3);
    const moduleParts = first.parts.filter((part) => part.name.startsWith("assembly_"));
    expect(moduleParts.map((part) => part.label)).toEqual(["双电机动力", "多人驾驶舱", "开放货运模块"]);
    expect(moduleParts.every((part) => part.metadata?.moduleInstanceId)).toBe(true);
  });

  it("keeps catalog choices compatible with all semantic vehicle slots", () => {
    const { state, slots: vehicleSlots } = createVehicleAssembly({
      style: "bus",
      engineModuleId: "engine-performance",
      cabinModuleId: "cabin-panoramic",
      rearModuleId: "rear-passenger",
    });
    for (const placement of state.placements) {
      const slot = vehicleSlots.find((candidate) => candidate.id === placement.slotId)!;
      const module = VEHICLE_MODULES.find((candidate) => candidate.id === placement.moduleId)!;
      expect(checkAssemblyCompatibility(slot, module).compatible).toBe(true);
    }
  });
});
