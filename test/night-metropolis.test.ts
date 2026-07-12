import { describe, expect, it } from "vitest";
import {
  NIGHT_METROPOLIS_DEFAULTS,
  bounds,
  buildNightMetropolisParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("night metropolis generator", () => {
  it("defaults to a skyline-scale city", () => {
    expect(NIGHT_METROPOLIS_DEFAULTS.blocksX).toBeGreaterThanOrEqual(8);
    expect(NIGHT_METROPOLIS_DEFAULTS.blocksZ).toBeGreaterThanOrEqual(7);
    expect(NIGHT_METROPOLIS_DEFAULTS.maxFloors).toBeGreaterThanOrEqual(40);
  });

  it("builds dense towers, roads, emissive windows and mountains", () => {
    const parts = buildNightMetropolisParts({ blocksX: 3, blocksZ: 3, lotsPerBlock: 2, seed: 19 });
    const names = parts.map((part) => part.name);
    expect(names).toContain("avenues");
    expect(names).toContain("landmark_towers");
    expect(names).toContain("street_lights");
    expect(names).toContain("distant_mountains");
    expect(names.some((name) => name.startsWith("windows_"))).toBe(true);
    for (const part of parts) {
      expect(triangleCount(part.mesh), part.name).toBeGreaterThan(0);
      expect(part.mesh.positions.every((position) => Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z))).toBe(true);
    }
  });

  it("is deterministic and grows with district dimensions", () => {
    const options = { blocksX: 3, blocksZ: 2, lotsPerBlock: 2, mountains: false, seed: 77 };
    const first = merge(...buildNightMetropolisParts(options).map((part) => part.mesh));
    const second = merge(...buildNightMetropolisParts(options).map((part) => part.mesh));
    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);

    const large = merge(...buildNightMetropolisParts({ ...options, blocksX: 5 }).map((part) => part.mesh));
    const firstBounds = bounds(first);
    const largeBounds = bounds(large);
    expect(largeBounds.max.x - largeBounds.min.x).toBeGreaterThan(firstBounds.max.x - firstBounds.min.x);
  });

  it("exports repeated boxes as render instances", () => {
    const parts = buildNightMetropolisParts({ blocksX: 2, blocksZ: 2, lotsPerBlock: 2, mountains: false });
    expect(parts.find((part) => part.name === "street_lights")?.renderInstances?.transforms.length).toBeGreaterThan(10);
    expect(parts.filter((part) => part.renderInstances).length).toBeGreaterThan(5);
  });
});
