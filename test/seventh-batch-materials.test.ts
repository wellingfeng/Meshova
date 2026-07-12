import { describe, expect, it } from "vitest";
import {
  defaultSeventhBatchMaterialParams,
  SEVENTH_BATCH_MATERIAL_DEFINITIONS,
  SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA,
  SEVENTH_BATCH_MATERIALS,
} from "../src/texture/seventh-batch-materials.js";
import { validateLayeredMaterial } from "../src/texture/shading-mechanics.js";

function mean(values: Float32Array): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

describe("seventh batch geometry-semantic materials", () => {
  const names = Object.keys(SEVENTH_BATCH_MATERIALS) as Array<keyof typeof SEVENTH_BATCH_MATERIALS>;

  it("registers ten materials with complete parameter schemas", () => {
    expect(names).toHaveLength(10);
    expect(Object.keys(SEVENTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
    for (const name of names) {
      expect(SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(8);
      expect(Object.keys(defaultSeventhBatchMaterialParams(name))).toHaveLength(8);
    }
  });

  it("builds deterministic valid nineteen-channel materials", () => {
    for (const name of names) {
      const first = SEVENTH_BATCH_MATERIALS[name](18, {});
      const second = SEVENTH_BATCH_MATERIALS[name](18, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect(first.baseColor.data, name).toEqual(second.baseColor.data);
      expect(first.roughness.data, name).toEqual(second.roughness.data);
      expect(first.clearcoat.data.length, name).toBe(18 * 18);
    }
  });

  it("exposes tool steel as usage removes coating", () => {
    const newTool = SEVENTH_BATCH_MATERIALS.chippedPaintedToolSteel(28, { time: 0 });
    const usedTool = SEVENTH_BATCH_MATERIALS.chippedPaintedToolSteel(28, { time: 1 });
    expect(mean(usedTool.metallic.data)).toBeGreaterThan(mean(newTool.metallic.data));
  });

  it("changes basin deposits and wood polish through semantic use", () => {
    const cleanBasin = SEVENTH_BATCH_MATERIALS.limescaleCeramicBasin(28, { amount: 0 });
    const scaledBasin = SEVENTH_BATCH_MATERIALS.limescaleCeramicBasin(28, { amount: 1 });
    const newWood = SEVENTH_BATCH_MATERIALS.trafficPolishedWoodStairs(28, { time: 0 });
    const usedWood = SEVENTH_BATCH_MATERIALS.trafficPolishedWoodStairs(28, { time: 1 });
    expect(mean(scaledBasin.roughness.data)).toBeGreaterThan(mean(cleanBasin.roughness.data));
    expect(mean(usedWood.roughness.data)).toBeLessThan(mean(newWood.roughness.data));
  });
});
