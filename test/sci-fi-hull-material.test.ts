import { describe, expect, it } from "vitest";
import {
  bakeSciFiHullMaterialSystem,
  createSciFiHullMaterialSystem,
  MATERIAL_BUILDERS,
  PRESET_PARAM_SCHEMA,
  SCI_FI_HULL_MATERIAL_MASK_NAMES,
  sciFiHullMaterialSystem,
  validateMaterial,
  type TextureBuffer,
} from "../src/index.js";

function maximum(texture: TextureBuffer): number {
  let result = 0;
  for (const value of texture.data) result = Math.max(result, value);
  return result;
}

function weightedAverage(texture: TextureBuffer, mask: TextureBuffer): number {
  let total = 0;
  let weight = 0;
  for (let index = 0; index < mask.data.length; index++) {
    const amount = mask.data[index]!;
    total += texture.data[index]! * amount;
    weight += amount;
  }
  return total / Math.max(weight, 1e-6);
}

describe("Substance 大师班第三季：科幻船壳智能材质", () => {
  it("生成确定且物理有效的完整 PBR 材质", () => {
    const first = bakeSciFiHullMaterialSystem(48, { seed: 211 });
    const second = bakeSciFiHullMaterialSystem(48, { seed: 211 });
    const changed = bakeSciFiHullMaterialSystem(48, { seed: 212 });
    expect(validateMaterial(first.material)).toEqual([]);
    expect([...first.material.baseColor.data]).toEqual([...second.material.baseColor.data]);
    expect([...first.material.baseColor.data]).not.toEqual([...changed.material.baseColor.data]);
  });

  it("输出完整材质语义遮罩", () => {
    const result = bakeSciFiHullMaterialSystem(64, { seed: 223 });
    expect(Object.keys(result.masks)).toEqual([...SCI_FI_HULL_MATERIAL_MASK_NAMES]);
    for (const name of [
      "paint",
      "accentPaint",
      "exposedMetal",
      "dust",
      "rust",
      "oil",
      "emissionCore",
      "emissionGlow",
    ] as const) {
      expect(maximum(result.masks[name]), name).toBeGreaterThan(0.01);
    }
  });

  it("保持锈、油、积尘与裸金属的物理叙事", () => {
    const result = bakeSciFiHullMaterialSystem(80, {
      seed: 227,
      rust: 0.9,
      oil: 0.9,
      dust: 0.9,
      edgeWear: 0.9,
    });
    const exposedMetallic = weightedAverage(result.material.metallic, result.masks.exposedMetal);
    const paintMetallic = weightedAverage(result.material.metallic, result.masks.paint);
    const rustMetallic = weightedAverage(result.material.metallic, result.masks.rust);
    const oilRoughness = weightedAverage(result.material.roughness, result.masks.oil);
    const dustRoughness = weightedAverage(result.material.roughness, result.masks.dust);
    expect(exposedMetallic).toBeGreaterThan(rustMetallic);
    expect(exposedMetallic).toBeGreaterThan(paintMetallic);
    expect(paintMetallic).toBeLessThan(0.12);
    expect(dustRoughness).toBeGreaterThan(oilRoughness);
  });

  it("积尘由接缝和凹腔驱动", () => {
    const result = bakeSciFiHullMaterialSystem(72, { seed: 229, dust: 1, rain: 0 });
    let dustOnCavities = 0;
    let totalDust = 0;
    const recipe = result.hull;
    for (let y = 0; y < 72; y++) {
      const v = 1 - (y + 0.5) / 72;
      for (let x = 0; x < 72; x++) {
        const u = (x + 0.5) / 72;
        const pixel = y * 72 + x;
        const dust = result.masks.dust.data[pixel]!;
        const cavity = Math.max(recipe.masks.seams(u, v), recipe.masks.cavities(u, v));
        dustOnCavities += dust * cavity;
        totalDust += dust;
      }
    }
    expect(dustOnCavities / totalDust).toBeGreaterThan(0.72);
  });

  it("独立强度参数可关闭天气层", () => {
    const result = bakeSciFiHullMaterialSystem(48, {
      seed: 233,
      rust: 0,
      oil: 0,
      dust: 0,
      rain: 0,
      scratchDensity: 0,
    });
    expect(maximum(result.masks.rust)).toBe(0);
    expect(maximum(result.masks.oil)).toBe(0);
    expect(maximum(result.masks.dust)).toBe(0);
    expect(maximum(result.masks.rainStreaks)).toBe(0);
    expect(maximum(result.masks.scratches)).toBe(0);
  });

  it("UV 四边连续平铺", () => {
    const recipe = createSciFiHullMaterialSystem({ seed: 239 });
    for (const v of [0.07, 0.29, 0.51, 0.83]) {
      expect(recipe.fields.height!(0, v)).toBeCloseTo(recipe.fields.height!(1, v), 10);
      expect(recipe.masks.rust(0, v)).toBeCloseTo(recipe.masks.rust(1, v), 10);
      expect(recipe.masks.oil(0, v)).toBeCloseTo(recipe.masks.oil(1, v), 10);
    }
    for (const u of [0.11, 0.37, 0.63, 0.91]) {
      expect(recipe.fields.height!(u, 0)).toBeCloseTo(recipe.fields.height!(u, 1), 10);
      expect(recipe.masks.dust(u, 0)).toBeCloseTo(recipe.masks.dust(u, 1), 10);
      expect(recipe.masks.rainStreaks(u, 0)).toBeCloseTo(recipe.masks.rainStreaks(u, 1), 10);
    }
  });

  it("注册到尺寸感知构建器和浏览器参数系统", () => {
    expect(MATERIAL_BUILDERS.sciFiHullMaterialSystem).toBe(sciFiHullMaterialSystem);
    expect(PRESET_PARAM_SCHEMA.sciFiHullMaterialSystem).toHaveLength(22);
    expect(validateMaterial(MATERIAL_BUILDERS.sciFiHullMaterialSystem(32, { seed: 241 }))).toEqual([]);
  });
});
