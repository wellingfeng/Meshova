import { describe, expect, it } from "vitest";
import { merge } from "../src/geometry/index.js";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
  type PolyHavenPropKind,
} from "../src/models/polyhaven-props.js";

const sourceIds = [
  "modular_airduct_rectangular_01",
  "portable_welding_cart",
  "filmstrip_projector_8mm",
  "industrial_microscope",
  "CashRegister_01",
];

const expectedParts: Record<string, string[]> = {
  modular_airduct_rectangular_01: ["airduct_shells", "airduct_flanges", "airduct_openings", "airduct_grille"],
  portable_welding_cart: ["welding_cart_frame", "welding_cart_oxygen_tank", "welding_cart_acetylene_tank", "welding_cart_hoses", "welding_cart_wheels"],
  filmstrip_projector_8mm: ["projector_body", "projector_reels", "projector_film_gate", "projector_lens", "projector_power_cable"],
  industrial_microscope: ["microscope_base", "microscope_arm", "microscope_stage", "microscope_objectives", "microscope_binoculars"],
  CashRegister_01: ["cash_register_housing", "cash_register_keys", "cash_register_display", "cash_register_drawer", "cash_register_compartments"],
};

describe("Poly Haven priority procedural props", () => {
  it("registers all five preview-based reconstructions with provenance", () => {
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);
    expect(new Set(definitions.map((entry) => entry!.kind)).size).toBe(5);
    for (const definition of definitions) {
      const metadata = buildPolyHavenPropParts(definition!.defaults)[0]!.metadata;
      expect(metadata).toMatchObject({
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
    ["welding-cart", "welding_cart_hoses"],
    ["film-projector", "projector_reels"],
    ["industrial-microscope", "microscope_stage"],
    ["cash-register", "cash_register_drawer"],
  ] as Array<[PolyHavenPropKind, string]>) ("variation changes %s geometry", (kind, partName) => {
    const low = buildPolyHavenPropParts({ kind, variation: 0 });
    const high = buildPolyHavenPropParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });
});
