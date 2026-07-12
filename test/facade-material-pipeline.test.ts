import { describe, expect, it } from "vitest";
import {
  createFacadeDemoBake,
  facadeMaterialPipeline,
  facadeMaterialPipelineResult,
  validateMaterial,
} from "../src/index.js";

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

describe("facade material pipeline", () => {
  it("runs geometry bake through semantic layers and weather deterministically", () => {
    const params = {
      seed: 17,
      wear: 0.7,
      grime: 0.6,
      rain: 0.5,
      wetness: 0.4,
      weathering: 0.55,
      moss: 0.2,
    };
    const first = facadeMaterialPipelineResult(64, params);
    const second = facadeMaterialPipelineResult(64, params);
    expect(first.material.baseColor.data).toEqual(second.material.baseColor.data);
    expect(first.masks.materialId.data).toEqual(second.masks.materialId.data);
    expect(first.weatherMasks.rust.data).toEqual(second.weatherMasks.rust.data);
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("preserves five semantic facade surfaces", () => {
    const result = facadeMaterialPipelineResult(96, {
      wear: 0,
      grime: 0,
      rain: 0,
      wetness: 0,
      weathering: 0,
      moss: 0,
      snow: 0,
    });
    expect(maximum(result.masks.masonry.data)).toBe(1);
    expect(maximum(result.masks.plaster.data)).toBe(1);
    expect(maximum(result.masks.metal.data)).toBe(1);
    expect(maximum(result.masks.glass.data)).toBe(1);
    expect(maximum(result.masks.trim.data)).toBe(1);
    expect(maximum(result.masks.mortar.data)).toBeGreaterThan(0.9);
  });

  it("derives wear, grime, rain, rust, and moss masks", () => {
    const result = facadeMaterialPipelineResult(128, {
      wear: 1,
      grime: 1,
      rain: 1,
      wetness: 1,
      weathering: 1,
      moss: 1,
    });
    expect(maximum(result.masks.edgeWear.data)).toBeGreaterThan(0.5);
    expect(maximum(result.masks.cavityDirt.data)).toBeGreaterThan(0.25);
    expect(maximum(result.masks.rain.data)).toBeGreaterThan(0.3);
    expect(maximum(result.weatherMasks.wetness.data)).toBeGreaterThan(0.2);
    expect(maximum(result.weatherMasks.rust.data)).toBeGreaterThan(0.05);
    expect(maximum(result.weatherMasks.moss.data)).toBeGreaterThan(0.1);
  });

  it("rejects facade material ids without semantic layers", () => {
    const bake = createFacadeDemoBake(32, { bays: 2, floors: 1 });
    expect(() => facadeMaterialPipeline(bake, [
      { materialId: 0, role: "masonry", color: [0.4, 0.2, 0.1] },
    ])).toThrow(/missing facade material layer id/);
  });
});
