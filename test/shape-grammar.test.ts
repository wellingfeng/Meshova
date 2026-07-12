import { describe, expect, it } from "vitest";
import {
  heightLayerStack,
  materialFromFields,
  pathStroke,
  radialArray,
  SEMANTIC_MASK_NAMES,
  semanticMaskPack,
  validateMaterial,
} from "../src/index.js";

describe("Substance 大师班第三季：共用形状语法", () => {
  it("按优先级合成高度并保留命名遮罩", () => {
    const stack = heightLayerStack(0.4, [
      { name: "cover", mask: 1, height: 0.75, mode: "overlay", priority: 20 },
      { name: "panel", mask: 1, height: 0.2, mode: "raise", priority: 0 },
      { name: "seam", mask: 0.5, height: 0.2, mode: "groove", priority: 10 },
    ]);
    const result = stack.sample(0.25, 0.75);
    expect(result.height).toBeCloseTo(0.75);
    expect(result.masks).toEqual({ panel: 1, seam: 0.5, cover: 1 });
    expect(result.topLayer).toBe("cover");
    expect(stack.layers.map((layer) => layer.name)).toEqual(["panel", "seam", "cover"]);
  });

  it("切口只降低高度，重复名称立即报错", () => {
    const cut = heightLayerStack(0.6, [
      { name: "cut", mask: 0.5, height: 0.1, mode: "cutout" },
    ]);
    expect(cut.height(0.5, 0.5)).toBeCloseTo(0.35);
    expect(() => heightLayerStack(0, [
      { name: "same", mask: 1, height: 0.1 },
      { name: "same", mask: 1, height: 0.2 },
    ])).toThrow("duplicate height layer name");
  });

  it("标准化语义遮罩并确定性烘焙自定义通道", () => {
    const pack = semanticMaskPack({
      panels: (u) => u,
      damage: 2,
      customFocus: (_u, v) => v,
    });
    expect(pack.names).toEqual([...SEMANTIC_MASK_NAMES, "customFocus"]);
    expect(pack.sample(0.25, 0.75)).toMatchObject({
      panels: 0.25,
      seams: 0,
      damage: 1,
      customFocus: 0.75,
    });
    const first = pack.bake(12, 8);
    const second = pack.bake(12, 8);
    expect([...first.panels!.data]).toEqual([...second.panels!.data]);
    expect(first.customFocus!.width).toBe(12);
    expect(first.customFocus!.height).toBe(8);
  });

  it("径向复制输出稳定扇区 ID 和局部坐标", () => {
    const array = radialArray({
      count: 8,
      innerRadius: 0.2,
      outerRadius: 0.4,
      gap: 0.2,
      element: (x, y) => Math.hypot(x * 0.7, y) <= 1 ? 1 : 0,
    });
    const angle = Math.PI / 8;
    const center = array.sample(0.5 + Math.cos(angle) * 0.3, 0.5 + Math.sin(angle) * 0.3);
    expect(center.mask).toBe(1);
    expect(center.index).toBe(0);
    expect(center.segmentId).toBeCloseTo(1 / 16);
    expect(center.localX).toBeCloseTo(0);
    expect(array.sample(0.5, 0.5).mask).toBe(0);
  });

  it("路径描边支持圆帽、变宽和分叉", () => {
    const stroke = pathStroke([
      { u: 0.2, v: 0.4, width: 0.03 },
      { u: 0.8, v: 0.4, width: 0.08 },
    ], {
      height: 0.2,
      branches: [{ points: [[0.5, 0.4], [0.5, 0.8]] }],
    });
    expect(stroke.mask(0.18, 0.4)).toBeGreaterThan(0.8);
    expect(stroke.mask(0.5, 0.7)).toBeGreaterThan(0.9);
    expect(stroke.mask(0.5, 0.1)).toBe(0);
    expect(stroke.sample(0.5, 0.7).pathIndex).toBe(1);
    expect(stroke.sample(0.65, 0.4).progress).toBeGreaterThan(0.7);
  });

  it("可平铺路径跨 UV 边界连续", () => {
    const stroke = pathStroke([[0.9, 0.5], [1.1, 0.5]], {
      width: 0.05,
      tileable: true,
      cap: "butt",
    });
    expect(stroke.mask(0, 0.5)).toBeCloseTo(stroke.mask(1, 0.5), 10);
    expect(stroke.mask(0, 0.5)).toBeGreaterThan(0.9);
  });

  it("组合结果可直接驱动有效 PBR 材质", () => {
    const radial = radialArray({ count: 12, innerRadius: 0.2, outerRadius: 0.42 });
    const pipe = pathStroke([[0.1, 0.15], [0.5, 0.15], [0.5, 0.45]], { width: 0.025 });
    const stack = heightLayerStack(0.3, [
      { name: "fan", mask: radial.mask, height: 0.18, mode: "raise" },
      { name: "pipe", mask: pipe.mask, height: pipe.height, mode: "raise", priority: 1 },
    ]);
    const material = materialFromFields(32, {
      baseColor: (u, v) => radial.mask(u, v) > 0.5 ? [0.24, 0.27, 0.3] : [0.08, 0.1, 0.12],
      metallic: () => 0.9,
      roughness: (u, v) => 0.3 + pipe.mask(u, v) * 0.2,
      ao: () => 1,
      height: stack.height,
      emission: () => [0, 0, 0],
      normalStrength: 5,
    });
    expect(validateMaterial(material)).toEqual([]);
  });
});
