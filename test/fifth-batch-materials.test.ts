import { describe, expect, it } from "vitest";
import {
  FIFTH_BATCH_MATERIAL_DEFINITIONS,
  FIFTH_BATCH_MATERIAL_PARAM_SCHEMA,
  FIFTH_BATCH_MATERIALS,
  defaultFifthBatchMaterialParams,
  exportLayeredPBR,
  exportOpenPBRMaterial,
  validateLayeredMaterial,
} from "../src/index.js";

describe("fifth batch manufacturing materials", () => {
  const names = Object.keys(FIFTH_BATCH_MATERIALS) as Array<keyof typeof FIFTH_BATCH_MATERIALS>;

  it("registers all ten manufacturing materials", () => {
    expect(names).toEqual([
      "clearcoatCarbonFiber",
      "etchedDamascusSteel",
      "weldedHeatTintSteel",
      "galvanizedSpangleSteel",
      "dispersiveCutGem",
      "holographicDiffractionFilm",
      "laminatedPlywood",
      "powderCoatedMetal",
      "contaminatedCondensationSurface",
      "kilnFiredClay",
    ]);
    expect(Object.keys(FIFTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(FIFTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultFifthBatchMaterialParams(name);
      const second = defaultFifthBatchMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid nineteen-channel materials", () => {
    for (const name of names) {
      const first = FIFTH_BATCH_MATERIALS[name](18, {});
      const second = FIFTH_BATCH_MATERIALS[name](18, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.01);
      expect(Object.keys(exportLayeredPBR(first, name).files), name).toHaveLength(19);
    }
  });

  it("activates process-specific shading channels", () => {
    const carbon = FIFTH_BATCH_MATERIALS.clearcoatCarbonFiber(20, {});
    const gem = FIFTH_BATCH_MATERIALS.dispersiveCutGem(20, {});
    const hologram = FIFTH_BATCH_MATERIALS.holographicDiffractionFilm(20, {});
    const weld = FIFTH_BATCH_MATERIALS.weldedHeatTintSteel(20, {});
    expect(Math.max(...carbon.anisotropy.data)).toBeGreaterThan(0.7);
    expect(Math.max(...carbon.clearcoat.data)).toBeGreaterThan(0.9);
    expect(Math.max(...gem.transmission.data)).toBeGreaterThan(0.9);
    expect(Math.max(...hologram.iridescence.data)).toBeGreaterThan(0.9);
    expect(Math.max(...weld.iridescence.data)).toBeGreaterThan(0.2);
  });

  it("exports OpenPBR metadata and MaterialX beside maps", () => {
    const material = FIFTH_BATCH_MATERIALS.clearcoatCarbonFiber(16, {});
    const exported = exportOpenPBRMaterial(material, "carbon");
    expect(Object.keys(exported.files)).toHaveLength(21);
    expect(exported.openPbr.schema).toBe("OpenPBR");
    expect(exported.materialX).toContain("<materialx version=\"1.39\">");
    expect(exported.materialX).toContain("standard_surface");
  });

  it("changes manufacturing output with process amount", () => {
    const clean = FIFTH_BATCH_MATERIALS.powderCoatedMetal(18, { amount: 0 });
    const coated = FIFTH_BATCH_MATERIALS.powderCoatedMetal(18, { amount: 1 });
    expect([...clean.height.data]).not.toEqual([...coated.height.data]);
  });
});
