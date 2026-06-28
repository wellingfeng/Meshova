import { describe, it, expect } from "vitest";
import { materialFromFields, mixMaterials, validateMaterial } from "../src/index.js";

const SIZE = 8;

describe("mixMaterials", () => {
  it("mask=0 yields material a, mask=1 yields material b", () => {
    const a = materialFromFields(SIZE, { baseColor: () => [1, 0, 0], metallic: () => 0, roughness: () => 0.2 });
    const b = materialFromFields(SIZE, { baseColor: () => [0, 0, 1], metallic: () => 1, roughness: () => 0.9 });

    const allA = mixMaterials(a, b, () => 0);
    const allB = mixMaterials(a, b, () => 1);

    // baseColor channel 0 (red) — a is 1, b is 0
    expect(allA.baseColor.data[0]).toBeCloseTo(1, 5);
    expect(allB.baseColor.data[0]).toBeCloseTo(0, 5);
    // metallic — a is 0, b is 1
    expect(allA.metallic.data[0]).toBeCloseTo(0, 5);
    expect(allB.metallic.data[0]).toBeCloseTo(1, 5);
  });

  it("mask=0.5 linearly interpolates every channel", () => {
    const a = materialFromFields(SIZE, { baseColor: () => [1, 0, 0], roughness: () => 0.2 });
    const b = materialFromFields(SIZE, { baseColor: () => [0, 0, 1], roughness: () => 0.8 });
    const mid = mixMaterials(a, b, () => 0.5);
    expect(mid.baseColor.data[0]).toBeCloseTo(0.5, 5); // (1+0)/2
    // roughness clamped to [0.04,1]; 0.2 and 0.8 midpoint = 0.5
    expect(mid.roughness.data[0]).toBeCloseTo(0.5, 5);
  });

  it("accepts a spatial mask function (u gradient)", () => {
    const a = materialFromFields(SIZE, { baseColor: () => [0, 0, 0] });
    const b = materialFromFields(SIZE, { baseColor: () => [1, 1, 1] });
    const mixed = mixMaterials(a, b, (u) => u);
    // left edge ~0, right edge ~1
    const ch = mixed.baseColor.channels;
    const left = mixed.baseColor.data[0]!;
    const right = mixed.baseColor.data[(SIZE - 1) * ch]!;
    expect(left).toBeLessThan(right);
    expect(left).toBeLessThan(0.2);
    expect(right).toBeGreaterThan(0.8);
  });

  it("produces a physically valid material", () => {
    const a = materialFromFields(SIZE, { baseColor: () => [0.8, 0.5, 0.2], metallic: () => 1, roughness: () => 0.3 });
    const b = materialFromFields(SIZE, { baseColor: () => [0.3, 0.2, 0.1], metallic: () => 0, roughness: () => 0.9 });
    const rust = mixMaterials(a, b, (u, v) => (u + v) * 0.5);
    expect(validateMaterial(rust)).toEqual([]);
  });
});
