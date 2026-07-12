import { describe, expect, it } from "vitest";
import { merge } from "../src/geometry/index.js";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
  type PolyHavenPropKind,
} from "../src/models/polyhaven-props.js";

const sourceIds = [
  "modular_airduct_circular_01",
  "modular_electric_cables",
  "desk_lamp_arm_01",
  "exterior_aircon_unit",
  "gamepad",
];

const expectedParts: Record<string, string[]> = {
  modular_airduct_circular_01: ["circular_airduct_shells", "circular_airduct_corrugations", "circular_airduct_openings", "circular_airduct_hangers"],
  modular_electric_cables: ["electric_cable_runs", "electric_cable_connectors", "electric_cable_junctions", "electric_cable_clamps"],
  desk_lamp_arm_01: ["desk_lamp_clamp", "desk_lamp_arms", "desk_lamp_springs", "desk_lamp_shade", "desk_lamp_bulb"],
  exterior_aircon_unit: ["aircon_cabinet", "aircon_fan_grille", "aircon_fan_blades", "aircon_condenser_fins"],
  gamepad: ["gamepad_shell", "gamepad_dpad", "gamepad_face_buttons", "gamepad_cable", "gamepad_connector"],
};

describe("Poly Haven recommended procedural props", () => {
  it("registers all five recommendations with preview-only provenance", () => {
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);
    expect(new Set(definitions.map((entry) => entry!.kind)).size).toBe(5);
    for (const definition of definitions) {
      expect(buildPolyHavenPropParts(definition!.defaults)[0]!.metadata).toMatchObject({
        referencePage: `https://polyhaven.com/a/${definition!.sourceAssetId}`,
        reconstruction: "procedural-from-public-preview",
        sourceMeshUsed: false,
        sourceTexturesUsed: false,
      });
    }
  });

  it.each(sourceIds)("builds semantic non-empty parts for %s", (sourceAssetId) => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((entry) => entry.name)).toEqual(expect.arrayContaining(expectedParts[sourceAssetId]!));
    expect(parts.every((entry) => entry.label && !entry.label.includes("component_"))).toBe(true);
    expect(parts.every((entry) => entry.mesh.positions.length > 0)).toBe(true);
    expect(merge(...parts.map((entry) => entry.mesh)).positions.length).toBeGreaterThan(300);
  });

  it("keeps all five generators deterministic", () => {
    for (const sourceAssetId of sourceIds) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
      const first = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      const second = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
    }
  });

  it.each([
    ["circular-airduct-kit", "circular_airduct_shells"],
    ["electric-cable-kit", "electric_cable_runs"],
    ["articulated-desk-lamp", "desk_lamp_arms"],
    ["aircon-unit", "aircon_fan_blades"],
    ["gamepad", "gamepad_cable"],
  ] as Array<[PolyHavenPropKind, string]>)("variation changes %s geometry", (kind, partName) => {
    const low = buildPolyHavenPropParts({ kind, variation: 0 });
    const high = buildPolyHavenPropParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });
});
