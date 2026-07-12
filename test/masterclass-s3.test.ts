import { describe, expect, it } from "vitest";
import {
  bakeOrganicCellScales,
  bakeStylizedCellRock,
  createOrganicCellScalesRecipe,
  createStylizedCellRockRecipe,
  materialFromFields,
  generate,
  heightToNormal,
  organicCellScales,
  PRESETS,
  PRESET_PARAM_SCHEMA,
  stylizedCellRock,
  validateMaterial,
} from "../src/index.js";

function range(values: Float32Array): number {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return maximum - minimum;
}

describe("Substance 大师班第三季：风格化岩石", () => {
  it("生成确定且物理有效的完整 PBR 材质", () => {
    const first = bakeStylizedCellRock(48, { seed: 19 });
    const second = bakeStylizedCellRock(48, { seed: 19 });
    expect(validateMaterial(first.material)).toEqual([]);
    expect([...first.material.height.data]).toEqual([...second.material.height.data]);
    expect([...first.material.baseColor.data]).toEqual([...second.material.baseColor.data]);
    expect(range(first.material.height.data)).toBeGreaterThan(0.3);
  });

  it("输出可独立调试的语义遮罩", () => {
    const result = bakeStylizedCellRock(64, { seed: 23, moss: 0.8 });
    expect(Object.keys(result.masks).sort()).toEqual([
      "cells",
      "componentId",
      "cracks",
      "creviceMoss",
      "damagedEdges",
      "edges",
      "microGrains",
      "moss",
      "topFaces",
      "topMoss",
    ]);
    expect(range(result.masks.cracks.data)).toBeGreaterThan(0.8);
    expect(range(result.masks.componentId.data)).toBeGreaterThan(0.4);
    expect(Math.max(...result.masks.moss.data)).toBeGreaterThan(0.1);
  });

  it("苔藓关闭后岩石高度结构仍成立", () => {
    const dry = bakeStylizedCellRock(48, { seed: 29, moss: 0, topMoss: 0 });
    expect(Math.max(...dry.masks.moss.data)).toBe(0);
    expect(range(dry.material.height.data)).toBeGreaterThan(0.3);
  });

  it("UV 两侧连续平铺", () => {
    const recipe = createStylizedCellRockRecipe({ seed: 31, cells: 8 });
    for (const v of [0.07, 0.29, 0.51, 0.83]) {
      expect(recipe.fields.height!(0, v)).toBeCloseTo(recipe.fields.height!(1, v), 10);
      expect(recipe.masks.cracks(0, v)).toBeCloseTo(recipe.masks.cracks(1, v), 10);
    }
    for (const u of [0.11, 0.37, 0.63, 0.91]) {
      expect(recipe.fields.height!(u, 0)).toBeCloseTo(recipe.fields.height!(u, 1), 10);
      expect(recipe.masks.moss(u, 0)).toBeCloseTo(recipe.masks.moss(u, 1), 10);
    }
  });

  it("法线派生可跨贴图边缘重复采样", () => {
    const height = generate(8, 8, 1, (u) => Math.sin(u * Math.PI * 2) * 0.5 + 0.5);
    const clamped = heightToNormal(height, 4, false);
    const tiled = heightToNormal(height, 4, true);
    expect([...tiled.data]).not.toEqual([...clamped.data]);
    for (const value of tiled.data) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("注册到共用预设和浏览器参数系统", () => {
    expect(PRESETS.stylizedCellRock).toBe(stylizedCellRock);
    expect(PRESET_PARAM_SCHEMA.stylizedCellRock).toHaveLength(13);
    const material = materialFromFields(32, PRESETS.stylizedCellRock({ seed: 41 }));
    expect(validateMaterial(material)).toEqual([]);
  });
});

describe("Substance 大师班第三季：有机细胞鳞片", () => {
  it("生成确定且物理有效的完整 PBR 材质", () => {
    const first = bakeOrganicCellScales(48, { seed: 53 });
    const second = bakeOrganicCellScales(48, { seed: 53 });
    const changed = bakeOrganicCellScales(48, { seed: 54 });
    expect(validateMaterial(first.material)).toEqual([]);
    expect([...first.material.height.data]).toEqual([...second.material.height.data]);
    expect([...first.material.height.data]).not.toEqual([...changed.material.height.data]);
    expect(range(first.material.height.data)).toBeGreaterThan(0.35);
  });

  it("输出逐组件与损伤语义遮罩", () => {
    const result = bakeOrganicCellScales(64, { seed: 59, microDamage: 0.8 });
    expect(Object.keys(result.masks).sort()).toEqual([
      "cells",
      "componentId",
      "cracks",
      "damagedEdges",
      "deposition",
      "edges",
      "highScales",
      "microDamage",
      "pits",
      "scratches",
      "slope",
    ]);
    expect(range(result.masks.componentId.data)).toBeGreaterThan(0.7);
    expect(Math.max(...result.masks.cracks.data)).toBeGreaterThan(0.9);
    expect(Math.max(...result.masks.microDamage.data)).toBeGreaterThan(0.1);
  });

  it("组件 ID 和逐片属性不依赖烘焙分辨率", () => {
    const recipe = createOrganicCellScalesRecipe({ seed: 61, cells: 9 });
    const samples = [[0.13, 0.17], [0.37, 0.53], [0.79, 0.83]] as const;
    const first = samples.map(([u, v]) => recipe.sample(u, v));
    const second = samples.map(([u, v]) => recipe.sample(u, v));
    expect(second).toEqual(first);
    expect(new Set(first.map((sample) => sample.masks.componentId)).size).toBeGreaterThan(1);
  });

  it("关闭损伤和沉积后仍保留主要鳞片结构", () => {
    const clean = bakeOrganicCellScales(48, {
      seed: 67,
      edgeDamage: 0,
      deposition: 0,
      microDamage: 0,
    });
    expect(Math.max(...clean.masks.damagedEdges.data)).toBe(0);
    expect(Math.max(...clean.masks.deposition.data)).toBe(0);
    expect(Math.max(...clean.masks.microDamage.data)).toBe(0);
    expect(range(clean.material.height.data)).toBeGreaterThan(0.3);
  });

  it("UV 四边连续平铺", () => {
    const recipe = createOrganicCellScalesRecipe({ seed: 71, cells: 8, aspectRatio: 1.5 });
    for (const v of [0.07, 0.29, 0.51, 0.83]) {
      expect(recipe.fields.height!(0, v)).toBeCloseTo(recipe.fields.height!(1, v), 10);
      expect(recipe.masks.cracks(0, v)).toBeCloseTo(recipe.masks.cracks(1, v), 10);
      expect(recipe.masks.componentId(0, v)).toBeCloseTo(recipe.masks.componentId(1, v), 10);
    }
    for (const u of [0.11, 0.37, 0.63, 0.91]) {
      expect(recipe.fields.height!(u, 0)).toBeCloseTo(recipe.fields.height!(u, 1), 10);
      expect(recipe.masks.deposition(u, 0)).toBeCloseTo(recipe.masks.deposition(u, 1), 10);
    }
  });

  it("注册到共用预设和浏览器参数系统", () => {
    expect(PRESETS.organicCellScales).toBe(organicCellScales);
    expect(PRESET_PARAM_SCHEMA.organicCellScales).toHaveLength(15);
    const material = materialFromFields(32, PRESETS.organicCellScales({ seed: 73 }));
    expect(validateMaterial(material)).toEqual([]);
  });
});
