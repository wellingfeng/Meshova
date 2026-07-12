import { describe, expect, it } from "vitest";
import {
  validateMaterial,
  wovenFabricSystem,
  wovenFabricSystemResult,
} from "../src/index.js";

describe("woven fabric system", () => {
  it("builds deterministic valid PBR channels", () => {
    const params = { seed: 227, weaveScale: 36, fuzz: 0.62, compression: 0.48 };
    const first = wovenFabricSystemResult(64, params);
    const second = wovenFabricSystemResult(64, params);

    expect(Array.from(first.material.baseColor.data)).toEqual(Array.from(second.material.baseColor.data));
    expect(Array.from(first.masks.fuzz.data)).toEqual(Array.from(second.masks.fuzz.data));
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("emits readable yarn, crossing, direction, fuzz, and compression masks", () => {
    const result = wovenFabricSystemResult(128, { fuzz: 0.8, compression: 0.75 });

    expect(maximum(result.masks.warpYarns.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.weftYarns.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.crossings.data)).toBeGreaterThan(0.5);
    expect(range(result.masks.fiberDirection.data)).toBeGreaterThan(0.3);
    expect(maximum(result.masks.fuzz.data)).toBeGreaterThan(0.05);
    expect(maximum(result.masks.compression.data)).toBeGreaterThan(0.5);
  });

  it("direction rotates weave and fiber orientation", () => {
    const vertical = wovenFabricSystemResult(96, { seed: 229, direction: 0, compression: 0 });
    const diagonal = wovenFabricSystemResult(96, { seed: 229, direction: 45, compression: 0 });

    expect(Array.from(vertical.material.height.data)).not.toEqual(Array.from(diagonal.material.height.data));
    expect(average(vertical.masks.fiberDirection.data))
      .not.toBeCloseTo(average(diagonal.masks.fiberDirection.data), 2);
  });

  it("compression flattens yarn and suppresses fuzz", () => {
    const raised = wovenFabricSystemResult(128, { seed: 233, fuzz: 1, compression: 0 });
    const pressed = wovenFabricSystemResult(128, { seed: 233, fuzz: 1, compression: 1 });

    expect(centerAverage(pressed.material.height.data, 128)).toBeLessThan(
      centerAverage(raised.material.height.data, 128),
    );
    expect(centerAverage(pressed.masks.fuzz.data, 128)).toBeLessThan(
      centerAverage(raised.masks.fuzz.data, 128),
    );
  });

  it("pattern controls crossing order", () => {
    const plain = wovenFabricSystem(96, { seed: 239, pattern: "plain", compression: 0 });
    const twill = wovenFabricSystem(96, { seed: 239, pattern: "twill", compression: 0 });

    expect(Array.from(plain.masks.warpOver.data)).not.toEqual(Array.from(twill.masks.warpOver.data));
  });

  it("rejects invalid resolution", () => {
    expect(() => wovenFabricSystem(15)).toThrow(/integer >= 16/);
  });
});

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function range(values: Float32Array): number {
  let minimum = Infinity;
  let maximumValue = -Infinity;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximumValue = Math.max(maximumValue, value);
  }
  return maximumValue - minimum;
}

function average(values: Float32Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function centerAverage(values: Float32Array, size: number): number {
  let total = 0;
  let count = 0;
  for (let y = Math.floor(size * 0.35); y < Math.floor(size * 0.55); y++) {
    for (let x = Math.floor(size * 0.46); x < Math.floor(size * 0.66); x++) {
      total += values[y * size + x]!;
      count++;
    }
  }
  return total / count;
}
