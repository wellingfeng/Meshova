import { describe, expect, it } from "vitest";
import {
  bounds,
  buildMultilevelInterchangeParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("multilevel interchange", () => {
  it("builds three road levels, ramps, markings, and signals", () => {
    const parts = buildMultilevelInterchangeParts();
    const names = parts.map((part) => part.name);
    const scene = merge(...parts.map((part) => part.mesh));
    const sceneBounds = bounds(scene);

    expect(names).toContain("main_median_barrier");
    expect(names).toContain("cross_asphalt");
    expect(names).toContain("loop_east_north_asphalt");
    expect(names).toContain("direct_west_north_asphalt");
    expect(names.some((name) => name.startsWith("signal_northwest_"))).toBe(true);
    expect(sceneBounds.max.y).toBeGreaterThan(11);
    expect(sceneBounds.max.x - sceneBounds.min.x).toBeGreaterThan(180);
    expect(triangleCount(scene)).toBeGreaterThan(5000);
  });

  it("uses semantic labels and deterministic geometry", () => {
    const first = buildMultilevelInterchangeParts({ span: 150, trafficSignals: false });
    const second = buildMultilevelInterchangeParts({ span: 150, trafficSignals: false });

    expect(first.some((part) => part.name.startsWith("signal_"))).toBe(false);
    expect(first.every((part) => Boolean(part.label) && !part.label!.includes("component_"))).toBe(true);
    expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
  });
});
