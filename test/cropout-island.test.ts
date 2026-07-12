import { describe, expect, it } from "vitest";
import {
  CROPOUT_ISLAND_PRESETS,
  buildCropoutIslandParts,
  buildCropoutIslandPresetParts,
  triangleCount,
} from "../src/index.js";

describe("Cropout-style island generator", () => {
  it("is deterministic for the same seed", () => {
    const first = buildCropoutIslandParts({ seed: 19, trees: 6, rocks: 4 });
    const second = buildCropoutIslandParts({ seed: 19, trees: 6, rocks: 4 });
    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("changes the fused coastline when the seed changes", () => {
    const first = buildCropoutIslandParts({ seed: 3, trees: 0, rocks: 0 });
    const second = buildCropoutIslandParts({ seed: 4, trees: 0, rocks: 0 });
    const firstBeach = first.find((part) => part.name === "cropout_beach")!;
    const secondBeach = second.find((part) => part.name === "cropout_beach")!;
    expect(firstBeach.mesh.positions).not.toEqual(secondBeach.mesh.positions);
  });

  it("emits semantic coast layers and valid meshes", () => {
    const parts = buildCropoutIslandParts({ trees: 4, rocks: 3 });
    const names = parts.map((part) => part.name);
    expect(names).toEqual(expect.arrayContaining([
      "cropout_ocean",
      "cropout_foam",
      "cropout_bedrock",
      "cropout_beach",
      "cropout_grass",
      "cropout_tree_trunks",
      "cropout_tree_canopies",
      "cropout_rocks",
    ]));
    for (const part of parts) {
      expect(triangleCount(part.mesh)).toBeGreaterThan(0);
      expect(part.mesh.indices.every((index) => index >= 0 && index < part.mesh.positions.length)).toBe(true);
    }
  });

  it("builds all six model-library presets", () => {
    const presetNames = Object.keys(CROPOUT_ISLAND_PRESETS) as Array<keyof typeof CROPOUT_ISLAND_PRESETS>;
    expect(presetNames).toHaveLength(6);
    for (const preset of presetNames) {
      const parts = buildCropoutIslandPresetParts(preset, { trees: 0, rocks: 0 });
      const grass = parts.find((part) => part.name === "cropout_grass")!;
      expect(grass.metadata?.generator).toBe("cropout-overlapping-discs");
      expect(grass.metadata?.islandCount).toBe(CROPOUT_ISLAND_PRESETS[preset].islandCount ?? 1);
    }
  });
});
