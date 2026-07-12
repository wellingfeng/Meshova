import { describe, expect, it } from "vitest";
import { buildPcgBiomeRiverParts, scorePcgBiomeRiver } from "../src/index.js";

const compact = {
  resolution: 20,
  reeds: 12,
  dryReeds: 6,
  waterLilies: 8,
  shrubs: 5,
  rocks: 4,
  snags: 2,
  seed: 7,
};

describe("PCG biome river", () => {
  it("is deterministic", () => {
    expect(buildPcgBiomeRiverParts(compact)).toEqual(buildPcgBiomeRiverParts(compact));
  });

  it("builds wetland water, plants, debris, and banks", () => {
    const parts = buildPcgBiomeRiverParts(compact);
    const names = parts.map((part) => part.name);
    expect(names).toContain("pcg_biome_river_water");
    expect(names).toContain("pcg_biome_river_reeds");
    expect(names).toContain("pcg_biome_river_cattail_heads");
    expect(names).toContain("pcg_biome_river_lily_pads");
    expect(names).toContain("pcg_biome_river_shrubs");
    expect(names).toContain("pcg_biome_river_rocks");
    expect(names).toContain("pcg_biome_river_snags");
    expect(parts.every((part) => part.label && part.mesh.positions.length > 0)).toBe(true);
    expect(parts.find((part) => part.name === "pcg_biome_river_water")?.surface).toMatchObject({
      type: "water",
      params: { body: "river" },
    });
    expect(scorePcgBiomeRiver(parts)).toMatchObject({
      hasAquaticPlants: true,
      hasDebris: true,
    });
  });

  it("supports disabling optional scatter layers", () => {
    const parts = buildPcgBiomeRiverParts({
      ...compact,
      reeds: 0,
      dryReeds: 0,
      waterLilies: 0,
      shrubs: 0,
      rocks: 0,
      snags: 0,
    });
    expect(parts.map((part) => part.name)).toEqual([
      "pcg_biome_river_terrain",
      "pcg_biome_river_mud_bank",
      "pcg_biome_river_water",
    ]);
  });
});
