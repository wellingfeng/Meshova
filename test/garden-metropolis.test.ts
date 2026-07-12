import { describe, expect, it } from "vitest";
import {
  GARDEN_METROPOLIS_DEFAULTS,
  bounds,
  buildGardenMetropolisParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("garden metropolis generator", () => {
  it("defaults to a large green city composition", () => {
    expect(GARDEN_METROPOLIS_DEFAULTS.skylineCount).toBeGreaterThanOrEqual(40);
    expect(GARDEN_METROPOLIS_DEFAULTS.treeCount).toBeGreaterThanOrEqual(300);
    expect(GARDEN_METROPOLIS_DEFAULTS.villaCount).toBeGreaterThanOrEqual(24);
  });

  it("builds lake, roads, villas, vegetation and skyline", () => {
    const parts = buildGardenMetropolisParts({ villaCount: 10, treeCount: 60, skylineCount: 16, seed: 9 });
    const names = parts.map((part) => part.name);
    expect(names).toContain("central_lake");
    expect(names).toContain("lake_ring_road");
    expect(names).toContain("villa_glazing");
    expect(names).toContain("skyline_window_bands");
    expect(names).toContain("tree_trunks");
    expect(names).toContain("palm_fronds");
    expect(parts.find((part) => part.name === "central_lake")?.surface?.type).toBe("water");
    for (const part of parts) {
      expect(triangleCount(part.mesh), part.name).toBeGreaterThan(0);
      expect(part.mesh.positions.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))).toBe(true);
    }
  });

  it("is deterministic and reaches skyline scale", () => {
    const options = { villaCount: 8, treeCount: 50, skylineCount: 14, seed: 77 };
    const first = merge(...buildGardenMetropolisParts(options).map((part) => part.mesh));
    const second = merge(...buildGardenMetropolisParts(options).map((part) => part.mesh));
    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);
    const sceneBounds = bounds(first);
    expect(sceneBounds.max.x - sceneBounds.min.x).toBeGreaterThan(200);
    expect(sceneBounds.max.z - sceneBounds.min.z).toBeGreaterThan(150);
    expect(sceneBounds.max.y).toBeGreaterThan(30);
  });

  it("exports repeated scene elements as render instances", () => {
    const parts = buildGardenMetropolisParts({ villaCount: 8, treeCount: 60, skylineCount: 14 });
    expect(parts.find((part) => part.name === "lake_ring_road")?.renderInstances?.transforms.length).toBe(72);
    expect(parts.find((part) => part.name === "tree_trunks")?.renderInstances?.transforms.length).toBeGreaterThan(40);
    expect(parts.filter((part) => part.renderInstances).length).toBeGreaterThan(12);
  });
});
