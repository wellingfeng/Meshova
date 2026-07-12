import { describe, it, expect } from "vitest";
import {
  makeTrimSheet,
  architecturalTrim,
  trimSheetFields,
  trimStripBand,
  trimStripNames,
  bakeTrimSheet,
  mapUVToTrimBand,
  box,
  boxUV,
  bounds,
  type TrimStrip,
} from "../src/index.js";

const stripA: TrimStrip = {
  name: "a",
  fields: { baseColor: () => [1, 0, 0], roughness: () => 0.3 },
  weight: 1,
};
const stripB: TrimStrip = {
  name: "b",
  fields: { baseColor: () => [0, 1, 0], roughness: () => 0.8 },
  weight: 3,
};

describe("trim sheet packing", () => {
  it("assigns bands bottom->top proportional to weight", () => {
    const sheet = makeTrimSheet([stripA, stripB]);
    expect(sheet.slots.map((s) => s.name)).toEqual(["a", "b"]);
    const a = sheet.byName["a"]!;
    const b = sheet.byName["b"]!;
    expect(a.v0).toBeCloseTo(0, 6);
    // weight 1 vs 3 -> a gets 1/4 of V
    expect(a.v1).toBeCloseTo(0.25, 6);
    expect(b.v0).toBeCloseTo(0.25, 6);
    expect(b.v1).toBeCloseTo(1, 6);
  });

  it("gutters leave gaps between strips and shrink usable V", () => {
    const sheet = makeTrimSheet([stripA, stripB], { gutter: 0.1 });
    const a = sheet.byName["a"]!;
    const b = sheet.byName["b"]!;
    // usable = 0.9, gutter of 0.1 sits between the two strips
    expect(b.v0 - a.v1).toBeCloseTo(0.1, 6);
    expect(b.v1).toBeCloseTo(1, 6);
  });

  it("throws on empty strip list", () => {
    expect(() => makeTrimSheet([])).toThrow();
  });
});

describe("trim sheet fields sampling", () => {
  it("selects the owning strip's recipe by global V", () => {
    const sheet = makeTrimSheet([stripA, stripB]);
    const fields = trimSheetFields(sheet);
    // v=0.1 is inside strip a (red), v=0.6 inside strip b (green)
    expect(fields.baseColor!(0.5, 0.1)).toEqual([1, 0, 0]);
    expect(fields.baseColor!(0.5, 0.6)).toEqual([0, 1, 0]);
    expect(fields.roughness!(0.5, 0.1)).toBeCloseTo(0.3, 6);
    expect(fields.roughness!(0.5, 0.6)).toBeCloseTo(0.8, 6);
  });

  it("falls back to neutral grey in a gutter", () => {
    const sheet = makeTrimSheet([stripA, stripB], { gutter: 0.2 });
    const fields = trimSheetFields(sheet);
    const a = sheet.byName["a"]!;
    const b = sheet.byName["b"]!;
    const gutterV = (a.v1 + b.v0) / 2;
    expect(fields.baseColor!(0.5, gutterV)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("bakeTrimSheet", () => {
  it("bakes a full material at the requested size, deterministically", () => {
    const sheet = architecturalTrim({ seed: 7 });
    const m1 = bakeTrimSheet(sheet, 64);
    const m2 = bakeTrimSheet(sheet, 64);
    expect(m1.baseColor.width).toBe(64);
    expect(m1.baseColor.height).toBe(64);
    expect(m1.roughness.channels).toBe(1);
    // determinism
    expect(Array.from(m1.baseColor.data)).toEqual(Array.from(m2.baseColor.data));
  });

  it("roughness stays in physical range after baking", () => {
    const sheet = architecturalTrim();
    const m = bakeTrimSheet(sheet, 48);
    for (const v of m.roughness.data) {
      expect(v).toBeGreaterThanOrEqual(0.04 - 1e-4);
      expect(v).toBeLessThanOrEqual(1 + 1e-4);
    }
  });
});

describe("architecturalTrim", () => {
  it("exposes the four named bands", () => {
    const sheet = architecturalTrim();
    expect(trimStripNames(sheet).sort()).toEqual(["metal", "plank", "plaster", "wood"].sort());
    expect(trimStripBand(sheet, "wood")).not.toBeNull();
    expect(trimStripBand(sheet, "missing")).toBeNull();
  });
});

describe("mapUVToTrimBand", () => {
  it("squeezes mesh V into the target band range", () => {
    const sheet = architecturalTrim();
    const band = trimStripBand(sheet, "metal")!;
    const panel = boxUV(box(1, 2, 1), { scale: 1 });
    const mapped = mapUVToTrimBand(panel, { v0: band.v0, v1: band.v1 });
    let lo = Infinity;
    let hi = -Infinity;
    for (const uv of mapped.uvs) {
      if (uv.y < lo) lo = uv.y;
      if (uv.y > hi) hi = uv.y;
    }
    expect(lo).toBeGreaterThanOrEqual(band.v0 - 1e-6);
    expect(hi).toBeLessThanOrEqual(band.v1 + 1e-6);
  });

  it("preserves geometry (positions/indices unchanged)", () => {
    const sheet = architecturalTrim();
    const band = trimStripBand(sheet, "wood")!;
    const panel = boxUV(box(1, 1, 1));
    const mapped = mapUVToTrimBand(panel, { v0: band.v0, v1: band.v1, uTile: 2 });
    expect(mapped.positions).toEqual(panel.positions);
    expect(mapped.indices).toEqual(panel.indices);
    expect(bounds(mapped)).toEqual(bounds(panel));
  });

  it("uTile repeats U across the strip", () => {
    const sheet = architecturalTrim();
    const band = trimStripBand(sheet, "plank")!;
    const panel = boxUV(box(1, 1, 1));
    const mapped = mapUVToTrimBand(panel, { v0: band.v0, v1: band.v1, uTile: 4 });
    let maxU = -Infinity;
    for (const uv of mapped.uvs) if (uv.x > maxU) maxU = uv.x;
    expect(maxU).toBeGreaterThan(1);
  });
});

import { trimBlendColorField, type TrimBlendContext } from "../src/index.js";

function ctx(index: number, u: number, v: number, attrs: Record<string, number[]> = {}): TrimBlendContext {
  return { index, uv: { x: u, y: v }, attributes: attrs };
}

describe("trimBlendColorField (M_Trim_Vertex)", () => {
  const solid = (name: string, c: [number, number, number]): TrimStrip => ({
    name,
    fields: { baseColor: () => c },
    weight: 1,
  });
  const sheet = makeTrimSheet([solid("red", [1, 0, 0]), solid("green", [0, 1, 0]), solid("blue", [0, 0, 1])]);

  it("full weight on one layer returns that strip's color", () => {
    const field = trimBlendColorField(sheet, [
      { strip: "red", weight: 1 },
      { strip: "green", weight: 0 },
    ]);
    expect(field(ctx(0, 0.5, 0.5))).toEqual([1, 0, 0]);
  });

  it("equal weights average the strip colors", () => {
    const field = trimBlendColorField(sheet, [
      { strip: "red", weight: 1 },
      { strip: "green", weight: 1 },
    ]);
    const [r, g, b] = field(ctx(0, 0.5, 0.5));
    expect(r).toBeCloseTo(0.5, 6);
    expect(g).toBeCloseTo(0.5, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it("normalizes loose weights (sum need not be 1)", () => {
    const field = trimBlendColorField(sheet, [
      { strip: "red", weight: 3 },
      { strip: "blue", weight: 1 },
    ]);
    const [r, g, b] = field(ctx(0, 0.5, 0.5));
    expect(r).toBeCloseTo(0.75, 6);
    expect(g).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0.25, 6);
  });

  it("reads per-vertex weight from a named attribute", () => {
    const attrs = { wear: [0, 1] }; // vertex 0 = all red, vertex 1 = all green
    const field = trimBlendColorField(sheet, [
      { strip: "red", weight: (c) => 1 - (c.attributes["wear"]?.[c.index] ?? 0) },
      { strip: "green", weight: "wear" },
    ]);
    expect(field(ctx(0, 0.5, 0.5, attrs))).toEqual([1, 0, 0]);
    expect(field(ctx(1, 0.5, 0.5, attrs))).toEqual([0, 1, 0]);
  });

  it("falls back to the first strip when all weights are zero", () => {
    const field = trimBlendColorField(sheet, [
      { strip: "green", weight: 0 },
      { strip: "blue", weight: 0 },
    ]);
    expect(field(ctx(0, 0.5, 0.5))).toEqual([0, 1, 0]);
  });

  it("throws on empty layer list", () => {
    expect(() => trimBlendColorField(sheet, [])).toThrow();
  });
});
