import { describe, expect, it } from "vitest";
import {
  applyDecalGlyphSystem,
  decalGlyphIconSdf,
  decalGlyphSupported,
  decalGlyphSystemResult,
  decalTextSdf,
  materialFromFields,
  rasterizeSdf,
  validateMaterial,
  type DecalGlyphLayer,
} from "../src/index.js";

describe("decal glyph system", () => {
  it("builds deterministic semantic layers and valid PBR channels", () => {
    const params = { seed: 41, peel: 0.52, grime: 0.38, glow: 0.6 };
    const first = decalGlyphSystemResult(64, params);
    const second = decalGlyphSystemResult(64, params);

    expect(first.layers.map((layer) => layer.label)).toEqual([
      "品牌文字",
      "资产编号",
      "高压警告",
      "检验贴纸",
      "底部污渍",
    ]);
    expect(Array.from(first.material.baseColor.data)).toEqual(Array.from(second.material.baseColor.data));
    expect(Array.from(first.masks.peel.data)).toEqual(Array.from(second.masks.peel.data));
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("rasterizes text, numbers, punctuation, and semantic icons", () => {
    for (const character of ["A", "z", "7", "-", "/", ".", " "]) {
      expect(decalGlyphSupported(character)).toBe(true);
    }
    expect(decalGlyphSupported("@")).toBe(false);
    expect(maximum(rasterizeSdf(96, 32, decalTextSdf("A-17"), { extent: 1.08, softness: 0.015 }).data)).toBeGreaterThan(0.9);
    for (const icon of ["warning", "arrow", "bolt", "info"] as const) {
      expect(maximum(rasterizeSdf(48, 48, decalGlyphIconSdf(icon)).data)).toBeGreaterThan(0.9);
    }
  });

  it("emits separate text, icon, sticker, stain, peel, and layer masks", () => {
    const result = decalGlyphSystemResult(96, { peel: 0.5, grime: 0.8, glow: 1 });
    expect(maximum(result.masks.text.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.icon.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.sticker.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.stain.data)).toBeGreaterThan(0.1);
    expect(maximum(result.masks.peel.data)).toBeGreaterThan(0.05);
    expect(maximum(result.masks.emission.data)).toBeGreaterThan(0.5);
    for (const layer of result.layers) expect(maximum(result.layerMasks[layer.id]!.data)).toBeGreaterThan(0.05);
  });

  it("preserves layer order and responds to peel amount", () => {
    const base = materialFromFields(48, { baseColor: () => [0.1, 0.1, 0.1] });
    const first: DecalGlyphLayer = {
      id: "first",
      label: "底层",
      kind: "sticker",
      center: [0.5, 0.5],
      size: [0.7, 0.7],
      color: [1, 0, 0],
      age: 1,
    };
    const second: DecalGlyphLayer = { ...first, id: "second", label: "顶层", color: [0, 0, 1] };
    const forward = applyDecalGlyphSystem(base, [first, second], { seed: 9, peel: 0 });
    const reverse = applyDecalGlyphSystem(base, [second, first], { seed: 9, peel: 0 });
    const peeled = applyDecalGlyphSystem(base, [first], { seed: 9, peel: 1 });
    const clean = applyDecalGlyphSystem(base, [first], { seed: 9, peel: 0 });

    expect(Array.from(forward.material.baseColor.data)).not.toEqual(Array.from(reverse.material.baseColor.data));
    expect(sum(peeled.layerMasks.first!.data)).toBeLessThan(sum(clean.layerMasks.first!.data));
  });

  it("rejects duplicate ids, empty text, and invalid sizes", () => {
    const base = materialFromFields(32, {});
    const layer: DecalGlyphLayer = {
      id: "label",
      label: "标签",
      kind: "text",
      text: "A",
      center: [0.5, 0.5],
      size: [0.5, 0.2],
      color: [1, 1, 1],
    };
    expect(() => applyDecalGlyphSystem(base, [layer, layer])).toThrow(/duplicate/);
    expect(() => applyDecalGlyphSystem(base, [{ ...layer, text: "" }])).toThrow(/must not be empty/);
    expect(() => applyDecalGlyphSystem(base, [{ ...layer, size: [0, 1] }])).toThrow(/positive/);
  });
});

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function sum(values: Float32Array): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}
