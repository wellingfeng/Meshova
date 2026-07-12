import { describe, expect, it } from "vitest";
import {
  bounds,
  buildWatabouCity,
  buildWatabouCityParts,
  merge,
  triangleCount,
  zFightingReport,
} from "../src/index.js";

describe("Watabou city reference model", () => {
  it("builds the river, clipped roads, fields, buildings, rocks and layered trees", () => {
    const city = buildWatabouCity();
    const names = city.parts.map((part) => part.name);
    expect(names).toContain("river_bank_outline");
    expect(names).toContain("river_water");
    expect(names).toContain("river_bridges");
    expect(names).toContain("road_network");
    expect(names).toContain("crop_rows");
    expect(names).toContain("tree_points");
    expect(names).toContain("tree_trunks");
    expect(names.some((name) => name.startsWith("river_bank_rocks_"))).toBe(true);
    expect(names.some((name) => name.startsWith("building_footprints_"))).toBe(true);
    expect(city.parts.find((part) => part.name === "data_canvas")?.color).not.toEqual([0.012, 0.025, 0.045]);
    expect(city.parts.find((part) => part.name === "road_network")?.metadata?.riverClipped).toBe(true);
    expect(city.summary.treeCount).toBeGreaterThan(700);
    expect(city.summary.rockCount).toBeGreaterThan(50);
    expect(city.summary.buildingCount).toBeGreaterThan(150);
  });

  it("is deterministic for the same seed", () => {
    const first = buildWatabouCityParts({ seed: 23, treeDensity: 0.2, buildingDensity: 0.2 });
    const second = buildWatabouCityParts({ seed: 23, treeDensity: 0.2, buildingDensity: 0.2 });
    expect(first).toEqual(second);
  });

  it("scales footprint and density from parameters", () => {
    const sparse = buildWatabouCity({ size: 120, treeDensity: 0.2, buildingDensity: 0.2 });
    const dense = buildWatabouCity({ size: 240, treeDensity: 0.8, buildingDensity: 0.8 });
    const sparseBounds = bounds(merge(...sparse.parts.map((part) => part.mesh)));
    const denseBounds = bounds(merge(...dense.parts.map((part) => part.mesh)));
    expect(denseBounds.max.x - denseBounds.min.x).toBeGreaterThan(sparseBounds.max.x - sparseBounds.min.x);
    expect(dense.summary.treeCount).toBeGreaterThan(sparse.summary.treeCount);
    expect(dense.summary.buildingCount).toBeGreaterThan(sparse.summary.buildingCount);
  });

  it("emits finite indexed geometry", () => {
    for (const part of buildWatabouCityParts({ treeDensity: 0.15, buildingDensity: 0.15 })) {
      expect(triangleCount(part.mesh), part.name).toBeGreaterThan(0);
      expect(part.mesh.positions.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))).toBe(true);
    }
  });

  it("keeps field and building footprints free of z-fighting", () => {
    const report = zFightingReport(buildWatabouCityParts(), {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });
    expect(report.pairs).toBe(0);
  });
});
