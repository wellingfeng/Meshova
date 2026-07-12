import { describe, expect, it } from "vitest";
import { buildProceduralRiverParts, scoreProceduralRiver, vec3 } from "../src/index.js";

const compact = {
  resolution: 24,
  bankRocks: 8,
  riverBoulders: 3,
  trees: 12,
  flowStreaks: 5,
  seed: 9,
};

describe("procedural river", () => {
  it("is deterministic for identical parameters", () => {
    expect(buildProceduralRiverParts(compact)).toEqual(buildProceduralRiverParts(compact));
  });

  it("builds terrain, water, banks, scatter, and foam layers", () => {
    const parts = buildProceduralRiverParts(compact);
    const names = parts.map((part) => part.name);
    expect(names).toContain("procedural_river_terrain");
    expect(names).toContain("procedural_river_water");
    expect(names).toContain("procedural_river_bank_rocks");
    expect(names).toContain("procedural_river_bed_pebbles");
    expect(names).toContain("procedural_river_riparian_trees");
    expect(names).toContain("procedural_river_bank_understory");
    expect(names).toContain("procedural_river_boulder_foam");
    expect(parts.every((part) => part.label && part.mesh.positions.length > 0)).toBe(true);
    expect(parts.find((part) => part.name === "procedural_river_water")?.surface).toMatchObject({
      type: "water",
      params: { body: "river" },
    });
    expect(scoreProceduralRiver(parts)).toMatchObject({ hasWater: true, hasFoam: true });
  });

  it("builds tapered flow ribbons instead of rigid box streaks", () => {
    const parts = buildProceduralRiverParts({ ...compact, flowStreaks: 1 });
    const streaks = parts.find((part) => part.name === "procedural_river_flow_streaks")!.mesh;

    expect(streaks.positions.length).toBeGreaterThan(8);
    expect(streaks.uvs.length).toBe(streaks.positions.length);
    expect(streaks.indices.length).toBeGreaterThan(6);
  });

  it("changes terrain and scatter when seed changes", () => {
    const first = buildProceduralRiverParts(compact);
    const second = buildProceduralRiverParts({ ...compact, seed: compact.seed + 1 });
    expect(second[0]!.mesh.positions).not.toEqual(first[0]!.mesh.positions);
    expect(second.find((part) => part.name === "procedural_river_bank_rocks")!.mesh.positions)
      .not.toEqual(first.find((part) => part.name === "procedural_river_bank_rocks")!.mesh.positions);
  });

  it("keeps sharp river bends free of inverted surface triangles", () => {
    const parts = buildProceduralRiverParts({
      bankRocks: 0,
      riverBoulders: 0,
      trees: 0,
      flowStreaks: 0,
    });
    const water = parts.find((part) => part.name === "procedural_river_water")!.mesh;

    for (let index = 0; index < water.indices.length; index += 3) {
      const first = water.positions[water.indices[index]!]!;
      const second = water.positions[water.indices[index + 1]!]!;
      const third = water.positions[water.indices[index + 2]!]!;
      const faceNormalY = (second.z - first.z) * (third.x - first.x)
        - (second.x - first.x) * (third.z - first.z);
      expect(faceNormalY).toBeGreaterThan(0);
    }
  });

  it("builds water as one connected strip without overlapping join patches", () => {
    const parts = buildProceduralRiverParts({
      bankRocks: 0,
      riverBoulders: 0,
      trees: 0,
      flowStreaks: 0,
    });
    const water = parts.find((part) => part.name === "procedural_river_water")!.mesh;

    expect(water.positions.length).toBeGreaterThan(4);
    expect(water.positions.length % 2).toBe(0);
    expect(water.indices.length).toBe((water.positions.length - 2) * 3);
  });

  it("rebuilds the river and scatter from editable control points", () => {
    const parts = buildProceduralRiverParts({
      ...compact,
      bankRocks: 0,
      riverBoulders: 0,
      trees: 0,
      flowStreaks: 0,
      controlPoints: [vec3(-5, 0, -11), vec3(-5, 0, 0), vec3(-5, 0, 11)],
    });
    const water = parts.find((part) => part.name === "procedural_river_water")!.mesh;
    const averageX = water.positions.reduce((sum, point) => sum + point.x, 0) / water.positions.length;
    expect(averageX).toBeCloseTo(-5, 1);
  });
});
