import { describe, expect, it } from "vitest";
import {
  validateMaterial,
  woodMaterialSystem,
  woodMaterialSystemResult,
} from "../src/index.js";

describe("wood material system", () => {
  it("builds deterministic valid PBR channels", () => {
    const params = { seed: 181, ringScale: 11, grainScale: 42, varnish: 0.7, wear: 0.36 };
    const first = woodMaterialSystemResult(64, params);
    const second = woodMaterialSystemResult(64, params);

    expect(Array.from(first.material.baseColor.data)).toEqual(Array.from(second.material.baseColor.data));
    expect(Array.from(first.masks.annualRings.data)).toEqual(Array.from(second.masks.annualRings.data));
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("emits grain, rings, pores, knots, and coating masks", () => {
    const result = woodMaterialSystemResult(128, { endGrain: 0.35, varnish: 0.82, wear: 0.64 });

    expect(maximum(result.masks.longitudinalGrain.data)).toBeGreaterThan(0.15);
    expect(maximum(result.masks.annualRings.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.pores.data)).toBeGreaterThan(0.03);
    expect(maximum(result.masks.knots.data)).toBeGreaterThan(0.25);
    expect(maximum(result.masks.varnish.data)).toBeGreaterThan(0.2);
    expect(maximum(result.masks.wornVarnish.data)).toBeGreaterThan(0.02);
  });

  it("cut direction rotates longitudinal grain", () => {
    const horizontal = woodMaterialSystemResult(96, { seed: 191, cutDirection: 0, endGrain: 0 });
    const vertical = woodMaterialSystemResult(96, { seed: 191, cutDirection: 90, endGrain: 0 });

    expect(Array.from(horizontal.masks.longitudinalGrain.data))
      .not.toEqual(Array.from(vertical.masks.longitudinalGrain.data));
  });

  it("end-grain control switches from streaks to radial rings", () => {
    const side = woodMaterialSystemResult(96, { seed: 199, endGrain: 0 });
    const end = woodMaterialSystemResult(96, { seed: 199, endGrain: 1 });

    expect(maximum(side.masks.endGrain.data)).toBe(0);
    expect(minimum(end.masks.endGrain.data)).toBe(1);
    expect(maximum(end.masks.longitudinalGrain.data)).toBe(0);
    expect(Array.from(side.masks.annualRings.data)).not.toEqual(Array.from(end.masks.annualRings.data));
  });

  it("wear removes varnish and raises surface roughness", () => {
    const intact = woodMaterialSystemResult(96, { seed: 211, varnish: 1, wear: 0 });
    const worn = woodMaterialSystemResult(96, { seed: 211, varnish: 1, wear: 1 });

    expect(sum(intact.masks.wornVarnish.data)).toBe(0);
    expect(sum(worn.masks.wornVarnish.data)).toBeGreaterThan(1);
    expect(sum(worn.masks.varnish.data)).toBeLessThan(sum(intact.masks.varnish.data));
    expect(average(worn.material.roughness.data)).toBeGreaterThan(average(intact.material.roughness.data));
  });

  it("rejects invalid resolution", () => {
    expect(() => woodMaterialSystem(15)).toThrow(/integer >= 16/);
  });
});

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function minimum(values: Float32Array): number {
  let result = Infinity;
  for (const value of values) result = Math.min(result, value);
  return result;
}

function sum(values: Float32Array): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

function average(values: Float32Array): number {
  return sum(values) / values.length;
}
