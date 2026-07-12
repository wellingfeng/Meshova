import { describe, expect, it } from "vitest";
import {
  buildCoverageMasks,
  deriveHeightFeatures,
  erodeHeight,
  generate,
  makeDirectionField,
  sampleDirection,
} from "../src/index.js";

describe("material mechanics", () => {
  const basin = generate(16, 16, 1, (u, v) => {
    const distance = Math.hypot(u - 0.5, v - 0.5);
    return Math.min(1, distance * 1.8);
  });

  it("derives deterministic downhill accumulation and sediment", () => {
    const first = deriveHeightFeatures(basin);
    const second = deriveHeightFeatures(basin);
    expect([...first.flow.data]).toEqual([...second.flow.data]);
    expect(Math.max(...first.flow.data)).toBeCloseTo(1);
    expect(first.flow.data[8 * 16 + 8]).toBeGreaterThan(first.flow.data[0]);
    expect(Math.max(...first.sediment.data)).toBeGreaterThan(0.25);
  });

  it("erodes flow paths without mutating input height", () => {
    const before = [...basin.data];
    const eroded = erodeHeight(basin, { erosion: 0.3, deposition: 0.08 });
    expect([...basin.data]).toEqual(before);
    expect([...eroded.height.data]).not.toEqual(before);
  });

  it("melt lowers coverage and creates wet boundaries", () => {
    const frozen = buildCoverageMasks(basin, { level: 0.35, melt: 0 });
    const melting = buildCoverageMasks(basin, { level: 0.35, melt: 1, wetness: 1 });
    const sum = (values: Float32Array) => values.reduce((total, value) => total + value, 0);
    expect(sum(melting.coverage.data)).toBeLessThan(sum(frozen.coverage.data));
    expect(Math.max(...melting.boundary.data)).toBeGreaterThan(0.1);
    expect(Math.max(...melting.wetness.data)).toBeGreaterThan(0.1);
  });

  it("builds seeded normalized direction fields", () => {
    const first = makeDirectionField(12, { mode: "swirl", seed: 42, turbulence: 0.7 });
    const second = makeDirectionField(12, { mode: "swirl", seed: 42, turbulence: 0.7 });
    expect([...first.data]).toEqual([...second.data]);
    const direction = sampleDirection(first, 5, 5);
    expect(Math.hypot(direction[0], direction[1])).toBeCloseTo(1, 5);
  });
});
