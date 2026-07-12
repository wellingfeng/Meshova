import { describe, expect, it } from "vitest";
import {
  EXPANSION_SYSTEM_MODELS,
  buildExpansionSystemParts,
  routeUtilityNetwork,
} from "../src/models/recommended-expansion-systems.js";
import { vec3 } from "../src/math/vec3.js";

describe("recommended expansion systems", () => {
  it("covers all six expansion categories", () => {
    expect(EXPANSION_SYSTEM_MODELS).toHaveLength(25);
    expect(new Set(EXPANSION_SYSTEM_MODELS.map((entry) => entry.category))).toEqual(new Set([
      "模块化沙发",
      "管线网络",
      "家电内部",
      "户外建筑",
      "软装系统",
      "建筑立面",
    ]));
  });

  it("builds valid semantic geometry for every model", () => {
    for (const definition of EXPANSION_SYSTEM_MODELS) {
      const parts = buildExpansionSystemParts(definition.defaults);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.every((entry) => Boolean(entry.label))).toBe(true);
      expect(parts.every((entry) => entry.mesh.indices.length > 0)).toBe(true);
      expect(parts.every((entry) => entry.mesh.positions.every((position) => (
        Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
      )))).toBe(true);
    }
  });

  it("routes utility paths around blocked service zones", () => {
    const obstacle = { id: "core", minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
    const route = routeUtilityNetwork({
      start: vec3(-2, 0.4, 0),
      end: vec3(2, 1.2, 0),
      obstacles: [obstacle],
      clearance: 0.2,
    });
    expect(route.length).toBeGreaterThan(2);
    expect(route.some((point) => point.x < obstacle.minX - 0.19 || point.x > obstacle.maxX + 0.19 || point.z < obstacle.minZ - 0.19 || point.z > obstacle.maxZ + 0.19)).toBe(true);
  });

  it("exposes appliance internals and articulated states", () => {
    const refrigerator = buildExpansionSystemParts({ kind: "appliance-refrigerator", openness: 0.8 });
    const washer = buildExpansionSystemParts({ kind: "appliance-washer", openness: 0.8 });
    expect(refrigerator.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "refrigerator_shelves",
      "refrigerator_drawers",
      "refrigerator_doors",
    ]));
    expect(washer.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "washer_drum",
      "washer_drum_ribs",
      "washer_door",
    ]));
    expect(refrigerator.find((entry) => entry.name === "refrigerator_doors")!.metadata?.jointType).toBe("hinge");
  });

  it("is deterministic", () => {
    const defaults = EXPANSION_SYSTEM_MODELS.find((entry) => entry.kind === "utility-water")!.defaults;
    const first = buildExpansionSystemParts(defaults);
    const second = buildExpansionSystemParts(defaults);
    expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
  });
});
