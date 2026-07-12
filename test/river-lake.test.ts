import { describe, expect, it } from "vitest";
import {
  buildRiverLakeParts,
  scoreRiverLake,
  solveBackwaterProfile,
} from "../src/index.js";

const compact = {
  resolution: 28,
  flowStreaks: 6,
  seed: 12,
};

describe("river lake backwater", () => {
  it("propagates a downstream lake level upstream without reverse flow", () => {
    const levels = solveBackwaterProfile([3, 1.2, 0.8, 0.4], {
      outletLevel: 1.5,
      minSlope: 0.05,
      distances: [0, 1, 2, 3],
    });
    expect(levels[0]).toBeCloseTo(3);
    expect(levels[1]).toBeCloseTo(1.6);
    expect(levels[2]).toBeCloseTo(1.55);
    expect(levels[3]).toBeCloseTo(1.5);
    expect([...levels].every((level, index) => index === 0 || level <= levels[index - 1]!)).toBe(true);
  });

  it("is deterministic and builds connected river-lake semantic layers", () => {
    const first = buildRiverLakeParts(compact);
    const second = buildRiverLakeParts(compact);
    expect(first).toEqual(second);
    expect(first.map((part) => part.name)).toEqual([
      "river_lake_terrain",
      "river_lake_river_bank",
      "river_lake_lake_shore",
      "river_lake_lake_water",
      "river_lake_river_water",
      "river_lake_flow_streaks",
    ]);
    expect(first.find((part) => part.name === "river_lake_lake_water")?.surface).toMatchObject({
      type: "water",
      params: { body: "river" },
    });
    expect(first.find((part) => part.name === "river_lake_river_water")?.surface).toMatchObject({
      type: "water",
      params: { body: "river" },
    });
    expect(scoreRiverLake(first)).toMatchObject({
      hasLake: true,
      hasBackwater: true,
      monotonicWater: true,
    });
  });

  it("supports disabling flow streaks", () => {
    const parts = buildRiverLakeParts({ ...compact, flowStreaks: 0 });
    expect(parts.some((part) => part.name === "river_lake_flow_streaks")).toBe(false);
  });

  it("keeps a broad color-coherent inlet where the river meets the lake", () => {
    const parts = buildRiverLakeParts(compact);
    const river = parts.find((part) => part.name === "river_lake_river_water")!;
    const lake = parts.find((part) => part.name === "river_lake_lake_water")!;
    const positions = river.mesh.positions;
    const left = positions[positions.length - 2]!;
    const right = positions[positions.length - 1]!;
    const inletWidth = Math.hypot(right.x - left.x, right.z - left.z);
    expect(inletWidth).toBeGreaterThan(2);
    expect(river.surface?.params).toEqual(lake.surface?.params);
    const tint = river.surface?.params?.tint as [number, number, number];
    expect(tint[1]).toBeGreaterThan(tint[2]);
  });
});
