import { describe, expect, it } from "vitest";
import {
  bakeSciFiHullHeightSystem,
  createSciFiHullHeightSystem,
  materialFromFields,
  PRESETS,
  PRESET_PARAM_SCHEMA,
  SCI_FI_HULL_MASK_NAMES,
  sciFiHullHeightSystem,
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

describe("Substance 大师班第三季：科幻船壳高度系统", () => {
  it("生成确定且物理有效的完整 PBR 材质", () => {
    const first = bakeSciFiHullHeightSystem(48, { seed: 101 });
    const second = bakeSciFiHullHeightSystem(48, { seed: 101 });
    const changed = bakeSciFiHullHeightSystem(48, { seed: 102 });
    expect(validateMaterial(first.material)).toEqual([]);
    expect([...first.material.height.data]).toEqual([...second.material.height.data]);
    expect([...first.material.height.data]).not.toEqual([...changed.material.height.data]);
    expect(range(first.material.height.data)).toBeGreaterThan(0.25);
  });

  it("提供至少十二类可组合零件子图协议", () => {
    const recipe = createSciFiHullHeightSystem({ seed: 107 });
    expect(new Set(recipe.parts.map((part) => part.kind)).size).toBeGreaterThanOrEqual(12);
    expect(recipe.parts).toHaveLength(14);
    for (const part of recipe.parts) {
      expect(part.id.length).toBeGreaterThan(0);
      expect(part.bounds).toHaveLength(4);
      expect(Number.isFinite(part.priority)).toBe(true);
      expect(typeof part.height).toBe("function");
      expect(typeof part.normal).toBe("function");
      expect(typeof part.mask).toBe("function");
      expect(Object.keys(part.masks).length).toBeGreaterThan(0);
    }
  });

  it("输出完整机械语义遮罩", () => {
    const result = bakeSciFiHullHeightSystem(64, { seed: 109 });
    expect(Object.keys(result.masks)).toEqual([...SCI_FI_HULL_MASK_NAMES]);
    for (const name of [
      "panels",
      "seams",
      "hatches",
      "turbines",
      "rectangularVents",
      "circularVents",
      "pipes",
      "connectors",
      "fasteners",
      "emission",
    ] as const) {
      expect(Math.max(...result.masks[name].data), name).toBeGreaterThan(0.1);
    }
    expect(range(result.masks.componentId.data)).toBeGreaterThan(0.5);
  });

  it("占位避让阻止紧固件压过关键切口", () => {
    const recipe = createSciFiHullHeightSystem({ seed: 113, detailDensity: 1 });
    let overlap = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        const u = (x + 0.5) / 80;
        const v = (y + 0.5) / 80;
        overlap = Math.max(overlap, recipe.masks.fasteners(u, v) * recipe.masks.cutouts(u, v));
      }
    }
    expect(overlap).toBeLessThan(0.08);
  });

  it("参数控制面板布局、涡轮叶片和管线宽度", () => {
    const compact = bakeSciFiHullHeightSystem(48, {
      seed: 127,
      panelColumns: 3,
      turbineBlades: 6,
      pipeWidth: 0.008,
    });
    const dense = bakeSciFiHullHeightSystem(48, {
      seed: 127,
      panelColumns: 8,
      turbineBlades: 18,
      pipeWidth: 0.026,
    });
    expect([...compact.masks.seams.data]).not.toEqual([...dense.masks.seams.data]);
    expect([...compact.masks.turbines.data]).not.toEqual([...dense.masks.turbines.data]);
    const compactPipeArea = [...compact.masks.pipes.data].reduce((sum, value) => sum + value, 0);
    const densePipeArea = [...dense.masks.pipes.data].reduce((sum, value) => sum + value, 0);
    expect(densePipeArea).toBeGreaterThan(compactPipeArea * 1.5);
  });

  it("UV 四边连续平铺", () => {
    const recipe = createSciFiHullHeightSystem({ seed: 131, panelColumns: 6, panelRows: 5 });
    for (const v of [0.07, 0.29, 0.51, 0.83]) {
      expect(recipe.fields.height!(0, v)).toBeCloseTo(recipe.fields.height!(1, v), 10);
      expect(recipe.masks.seams(0, v)).toBeCloseTo(recipe.masks.seams(1, v), 10);
    }
    for (const u of [0.11, 0.37, 0.63, 0.91]) {
      expect(recipe.fields.height!(u, 0)).toBeCloseTo(recipe.fields.height!(u, 1), 10);
      expect(recipe.masks.panels(u, 0)).toBeCloseTo(recipe.masks.panels(u, 1), 10);
    }
  });

  it("注册到共用预设和浏览器参数系统", () => {
    expect(PRESETS.sciFiHullHeightSystem).toBe(sciFiHullHeightSystem);
    expect(PRESET_PARAM_SCHEMA.sciFiHullHeightSystem).toHaveLength(16);
    const material = materialFromFields(32, PRESETS.sciFiHullHeightSystem({ seed: 137 }));
    expect(validateMaterial(material)).toEqual([]);
  });
});
