import { describe, it, expect } from "vitest";
import { buildWaterTowerParts, WATER_TOWER_DEFAULTS } from "../src/models/water-tower.js";

describe("water-tower (CitySample Kit_roof_tank)", () => {
  it("builds tank/support/hoops/roof with geometry", () => {
    const parts = buildWaterTowerParts();
    const names = parts.map((p) => p.name);
    for (const n of ["support", "tank", "hoops", "roof"]) expect(names).toContain(n);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic (seeded stave weathering)", () => {
    const a = buildWaterTowerParts({ seed: 2 });
    const b = buildWaterTowerParts({ seed: 2 });
    const at = a.find((p) => p.name === "tank")!;
    const bt = b.find((p) => p.name === "tank")!;
    expect(at.mesh.positions).toEqual(bt.mesh.positions);
  });

  it("different seeds change stave weathering", () => {
    const a = buildWaterTowerParts({ seed: 1 }).find((p) => p.name === "tank")!.mesh.positions;
    const b = buildWaterTowerParts({ seed: 2 }).find((p) => p.name === "tank")!.mesh.positions;
    expect(a).not.toEqual(b);
  });

  it("more staves yields more tank geometry", () => {
    const few = buildWaterTowerParts({ staves: 12 });
    const many = buildWaterTowerParts({ staves: 32 });
    const fp = few.find((p) => p.name === "tank")!.mesh.positions.length;
    const mp = many.find((p) => p.name === "tank")!.mesh.positions.length;
    expect(mp).toBeGreaterThan(fp);
  });

  it("hoops count controls hoop geometry", () => {
    const few = buildWaterTowerParts({ hoops: 2 });
    const many = buildWaterTowerParts({ hoops: 6 });
    const fp = few.find((p) => p.name === "hoops")!.mesh.positions.length;
    const mp = many.find((p) => p.name === "hoops")!.mesh.positions.length;
    expect(mp).toBeGreaterThan(fp);
  });

  it("ladder flag toggles the ladder part", () => {
    expect(buildWaterTowerParts({ ladder: true }).some((p) => p.name === "ladder")).toBe(true);
    expect(buildWaterTowerParts({ ladder: false }).some((p) => p.name === "ladder")).toBe(false);
  });

  it("default tank radius is 1.6m", () => {
    expect(WATER_TOWER_DEFAULTS.radius).toBeCloseTo(1.6, 3);
  });
});
