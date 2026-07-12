import { describe, expect, it } from "vitest";
import {
  SIXTH_BATCH_MATERIAL_DEFINITIONS,
  SIXTH_BATCH_MATERIAL_PARAM_SCHEMA,
  SIXTH_BATCH_MATERIALS,
  defaultSixthBatchMaterialParams,
  exportLayeredPBR,
  validateLayeredMaterial,
} from "../src/index.js";

describe("sixth batch scene-aware materials", () => {
  const names = Object.keys(SIXTH_BATCH_MATERIALS) as Array<keyof typeof SIXTH_BATCH_MATERIALS>;

  it("registers all ten scene-aware materials", () => {
    expect(names).toEqual([
      "sceneAwareMossyRock",
      "rainWashedConcrete",
      "compactedSnowRuts",
      "marineCorrodedSteel",
      "slopeHeightTerrainBlend",
      "hangarOilStainedFloor",
      "windErodedSandstone",
      "wornMudTireRubber",
      "uvAgedPlastic",
      "layeredGraffitiWall",
    ]);
    expect(Object.keys(SIXTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides independent editable defaults", () => {
    for (const name of names) {
      expect(SIXTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(8);
      const first = defaultSixthBatchMaterialParams(name);
      const second = defaultSixthBatchMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid nineteen-channel materials", () => {
    for (const name of names) {
      const first = SIXTH_BATCH_MATERIALS[name](18, {});
      const second = SIXTH_BATCH_MATERIALS[name](18, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.01);
      expect(Object.keys(exportLayeredPBR(first, name).files), name).toHaveLength(19);
    }
  });

  it("activates material-specific channels", () => {
    const snow = SIXTH_BATCH_MATERIALS.compactedSnowRuts(20, {});
    const steel = SIXTH_BATCH_MATERIALS.marineCorrodedSteel(20, {});
    const sandstone = SIXTH_BATCH_MATERIALS.windErodedSandstone(20, {});
    const floor = SIXTH_BATCH_MATERIALS.hangarOilStainedFloor(20, {});
    expect(Math.max(...snow.subsurface.data)).toBeGreaterThan(0.1);
    expect(Math.max(...steel.metallic.data)).toBeGreaterThan(0.1);
    expect(Math.max(...sandstone.anisotropy.data)).toBeGreaterThan(0.4);
    expect(Math.max(...floor.clearcoat.data)).toBeGreaterThan(0.05);
  });

  it("changes evolved output with time", () => {
    const young = SIXTH_BATCH_MATERIALS.uvAgedPlastic(18, { time: 0.05 });
    const old = SIXTH_BATCH_MATERIALS.uvAgedPlastic(18, { time: 1 });
    expect([...young.baseColor.data]).not.toEqual([...old.baseColor.data]);
    expect([...young.roughness.data]).not.toEqual([...old.roughness.data]);
  });
});
