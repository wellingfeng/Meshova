import { describe, expect, it } from "vitest";
import { buildLayeredWearMasks, generate } from "../src/index.js";

describe("layered wear masks", () => {
  it("derives deterministic edge, cavity, chip and scratch layers", () => {
    const height = generate(32, 32, 1, (u, v) => (
      u > 0.2 && u < 0.8 && v > 0.2 && v < 0.8 ? 0.8 : 0.2
    ));
    const original = [...height.data];
    const first = buildLayeredWearMasks(height, { seed: 17 });
    const second = buildLayeredWearMasks(height, { seed: 17 });

    expect([...height.data]).toEqual(original);
    expect([...first.chippedPaint.data]).toEqual([...second.chippedPaint.data]);
    expect(Math.max(...first.edgeWear.data)).toBeGreaterThan(0.05);
    expect(Math.max(...first.cavityDirt.data)).toBeGreaterThan(0.05);
    expect(Math.max(...first.scratches.data)).toBeGreaterThan(0);
    expect(Math.max(...first.dust.data)).toBeGreaterThan(0);
    expect(Math.max(...first.wetness.data)).toBeGreaterThan(0);
    for (const mask of Object.values(first)) {
      expect(Math.min(...mask.data)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...mask.data)).toBeLessThanOrEqual(1);
    }
  });
});
