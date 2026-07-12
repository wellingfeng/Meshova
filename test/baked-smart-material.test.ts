import { describe, expect, it } from "vitest";
import {
  bakedSmartMaterial,
  bakeGeometryToTextures,
  paintedMetalPanelSmartMaterial,
  plane,
  validateMaterial,
} from "../src/index.js";

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

describe("baked smart material", () => {
  it("is deterministic and physically valid", () => {
    const params = { seed: 17, wear: 0.7, dirt: 0.5, rain: 0.4, scratches: 0.6 };
    const first = paintedMetalPanelSmartMaterial(64, params);
    const second = paintedMetalPanelSmartMaterial(64, params);
    expect(first.material.baseColor.data).toEqual(second.material.baseColor.data);
    expect(first.masks.exposedUnderlayer.data).toEqual(second.masks.exposedUnderlayer.data);
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("uses baked material ids for distinct surfaces", () => {
    const result = paintedMetalPanelSmartMaterial(96, {
      paintColor: [0.1, 0.3, 0.7],
      wear: 0,
      dirt: 0,
      rain: 0,
      scratches: 0,
    });
    const colors = new Map<number, Set<string>>();
    for (let pixel = 0; pixel < 96 * 96; pixel++) {
      const id = Math.round(result.masks.materialId.data[pixel]! * 2);
      const color = [0, 1, 2]
        .map((channel) => result.material.baseColor.data[pixel * 3 + channel]!.toFixed(3))
        .join(",");
      const values = colors.get(id) ?? new Set<string>();
      values.add(color);
      colors.set(id, values);
    }
    expect([...colors.keys()].sort()).toEqual([0, 1, 2]);
    expect(colors.get(0)).toEqual(new Set(["0.100,0.300,0.700"]));
    expect(colors.get(2)).toEqual(new Set(["0.320,0.340,0.350"]));
  });

  it("derives wear, scratches, dirt and rain from baked geometry maps", () => {
    const result = paintedMetalPanelSmartMaterial(128, {
      seed: 12,
      wear: 1,
      dirt: 1,
      rain: 1,
      scratches: 1,
    });
    expect(maximum(result.masks.edgeWear.data)).toBeGreaterThan(0.5);
    expect(maximum(result.masks.exposedUnderlayer.data)).toBeGreaterThan(0.5);
    expect(maximum(result.masks.scratches.data)).toBeGreaterThan(0.1);
    expect(maximum(result.masks.cavityDirt.data)).toBeGreaterThan(0.3);
    expect(maximum(result.masks.rain.data)).toBeGreaterThan(0.2);
  });

  it("rejects unmapped baked material ids", () => {
    const mesh = plane(2, 2, 1, 1);
    const bake = bakeGeometryToTextures(mesh, {
      width: 16,
      height: 16,
      materialIds: [0, 1],
    });
    expect(() => bakedSmartMaterial(bake, [
      { materialId: 0, color: [0.2, 0.2, 0.2], metallic: 0, roughness: 0.5 },
    ])).toThrow(/missing baked smart material layer id: 1/);
  });
});
