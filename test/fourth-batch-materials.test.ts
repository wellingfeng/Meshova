import { describe, expect, it } from "vitest";
import {
  FOURTH_BATCH_MATERIAL_DEFINITIONS,
  FOURTH_BATCH_MATERIAL_PARAM_SCHEMA,
  FOURTH_BATCH_MATERIALS,
  defaultFourthBatchMaterialParams,
  exportLayeredPBR,
  validateLayeredMaterial,
} from "../src/index.js";

describe("fourth batch layered materials", () => {
  const names = Object.keys(FOURTH_BATCH_MATERIALS) as Array<keyof typeof FOURTH_BATCH_MATERIALS>;

  it("registers all ten shading-system materials", () => {
    expect(names).toEqual([
      "layeredAutomotivePaint",
      "translucentJadeWax",
      "directionalVelvetSilk",
      "nacreOilFilm",
      "reactionPatinatedCopper",
      "crackleCeramicGlaze",
      "thermallyCharredWood",
      "tidalBeachSediment",
      "competitiveBiologicalColony",
      "ancientWeatheredWall",
    ]);
    expect(Object.keys(FOURTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(FOURTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultFourthBatchMaterialParams(name);
      const second = defaultFourthBatchMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid nineteen-channel sets", () => {
    for (const name of names) {
      const first = FOURTH_BATCH_MATERIALS[name](20, {});
      const second = FOURTH_BATCH_MATERIALS[name](20, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.015);
      expect(Object.keys(exportLayeredPBR(first, name).files), name).toHaveLength(19);
    }
  });

  it("activates layered shading channels", () => {
    const paint = FOURTH_BATCH_MATERIALS.layeredAutomotivePaint(24, {});
    const jade = FOURTH_BATCH_MATERIALS.translucentJadeWax(24, {});
    const velvet = FOURTH_BATCH_MATERIALS.directionalVelvetSilk(24, {});
    const nacre = FOURTH_BATCH_MATERIALS.nacreOilFilm(24, {});
    const colony = FOURTH_BATCH_MATERIALS.competitiveBiologicalColony(24, {});
    expect(Math.max(...paint.clearcoat.data)).toBeGreaterThan(0.8);
    expect(Math.max(...jade.subsurface.data)).toBeGreaterThan(0.7);
    expect(Math.max(...jade.transmission.data)).toBeGreaterThan(0.5);
    expect(Math.max(...velvet.sheen.data)).toBeGreaterThan(0.8);
    expect(Math.max(...velvet.anisotropy.data)).toBeGreaterThan(0.6);
    expect(Math.max(...nacre.iridescence.data)).toBeGreaterThan(0.9);
    expect(Math.max(...colony.subsurface.data)).toBeGreaterThan(0.5);
  });

  it("changes structural output with mechanism intensity", () => {
    const clean = FOURTH_BATCH_MATERIALS.reactionPatinatedCopper(20, { amount: 0 });
    const oxidized = FOURTH_BATCH_MATERIALS.reactionPatinatedCopper(20, { amount: 1 });
    const intact = FOURTH_BATCH_MATERIALS.ancientWeatheredWall(20, { amount: 0 });
    const aged = FOURTH_BATCH_MATERIALS.ancientWeatheredWall(20, { amount: 1 });
    expect([...clean.metallic.data]).not.toEqual([...oxidized.metallic.data]);
    expect([...intact.height.data]).not.toEqual([...aged.height.data]);
  });
});
