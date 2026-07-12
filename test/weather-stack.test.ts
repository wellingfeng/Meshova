import { describe, expect, it } from "vitest";
import {
  applyWeatherStack,
  manholeCover,
  materialFromFields,
  sample,
  validateMaterial,
} from "../src/index.js";

const average = (values: Float32Array) => (
  values.reduce((sum, value) => sum + value, 0) / values.length
);

describe("weather stack", () => {
  it("is deterministic and physically valid", () => {
    const base = materialFromFields(64, manholeCover({ seed: 9, dirt: 0 }));
    const options = { seed: 17, wetness: 0.7, dirt: 0.5, rust: 0.6, moss: 0.4, snow: 0.2 };
    const first = applyWeatherStack(base, options);
    const second = applyWeatherStack(base, options);
    expect(first.material.baseColor.data).toEqual(second.material.baseColor.data);
    expect(first.masks.snow.data).toEqual(second.masks.snow.data);
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("zero amounts preserve every authored channel", () => {
    const base = materialFromFields(32, manholeCover({ seed: 5 }));
    const result = applyWeatherStack(base, {
      wetness: 0,
      dirt: 0,
      rust: 0,
      moss: 0,
      snow: 0,
    }).material;
    expect(result.baseColor.data).toEqual(base.baseColor.data);
    expect(result.metallic.data).toEqual(base.metallic.data);
    expect(result.roughness.data).toEqual(base.roughness.data);
    expect(result.height.data).toEqual(base.height.data);
    expect(result.normal.data).toEqual(base.normal.data);
  });

  it("wetness darkens color and lowers roughness", () => {
    const base = materialFromFields(64, manholeCover({ seed: 8, dirt: 0 }));
    const wet = applyWeatherStack(base, { seed: 3, wetness: 1 }).material;
    expect(average(wet.baseColor.data)).toBeLessThan(average(base.baseColor.data));
    expect(average(wet.roughness.data)).toBeLessThan(average(base.roughness.data));
  });

  it("rust only consumes metallic regions", () => {
    const base = materialFromFields(64, manholeCover({ seed: 11, dirt: 0, groundBlend: 0 }));
    const result = applyWeatherStack(base, { seed: 4, rust: 1 });
    expect(average(result.material.metallic.data)).toBeLessThan(average(base.metallic.data));
    expect(sample(result.masks.rust, 2, 2)).toBe(0);
    expect(sample(result.masks.rust, 32, 32)).toBeGreaterThan(0);
  });

  it("wetness favors low regions while snow favors raised regions", () => {
    const base = materialFromFields(96, manholeCover({ seed: 13, dirt: 0, groundBlend: 0 }));
    const result = applyWeatherStack(base, { seed: 2, wetness: 1, snow: 1 });
    expect(sample(result.masks.wetness, 3, 3)).toBeGreaterThan(sample(result.masks.wetness, 48, 48));
    expect(sample(result.masks.snow, 48, 48)).toBeGreaterThan(sample(result.masks.snow, 3, 3));
    expect(average(result.material.height.data)).toBeGreaterThan(average(base.height.data));
  });
});
