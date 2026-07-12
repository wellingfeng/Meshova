import { describe, it, expect } from "vitest";
import {
  generate,
  sample,
  blur,
  levels,
  curve,
  histogramScan,
  histogramRange,
  autoLevels,
  invert,
  clampTex,
  blendTex,
  minTex,
  maxTex,
  dilateMask,
  erodeMask,
  warp,
  slopeBlur,
  sharpen,
  edgeDetect,
  grayscale,
  splitChannel,
  mergeChannels,
  gradientMap,
  normalInvert,
  normalCombine,
  scaleNormal,
  curvature,
  aoFromHeight,
  distanceField,
  bevel,
  emboss,
  ramp,
} from "../src/index.js";

const SIZE = 16;
const ramp01 = (fn: (u: number, v: number) => number) => generate(SIZE, SIZE, 1, fn);

describe("filters: blur", () => {
  it("blur reduces variance of a step edge", () => {
    const step = ramp01((u) => (u < 0.5 ? 0 : 1));
    const b = blur(step, { radius: 3, type: "gaussian" });
    // a pixel near the edge becomes intermediate
    const mid = sample(b, SIZE / 2, SIZE / 2);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.95);
  });
  it("blur radius 0 is identity", () => {
    const t = ramp01((u, v) => u * v);
    const b = blur(t, { radius: 0 });
    expect(sample(b, 4, 4)).toBeCloseTo(sample(t, 4, 4), 6);
  });
});

describe("filters: levels & curve", () => {
  it("levels stretches range", () => {
    const t = ramp01(() => 0.5);
    const l = levels(t, { inLow: 0.25, inHigh: 0.75 });
    expect(sample(l, 0, 0)).toBeCloseTo(0.5, 5);
  });
  it("levels clamps and outputs to outLow/outHigh", () => {
    const t = ramp01(() => 0);
    const l = levels(t, { outLow: 0.2, outHigh: 0.8 });
    expect(sample(l, 0, 0)).toBeCloseTo(0.2, 5);
  });
  it("curve passes through identity by default endpoints", () => {
    const t = ramp01((u) => u);
    const c = curve(t, [[0.5, 0.5]]);
    expect(sample(c, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(sample(c, SIZE - 1, 0)).toBeLessThanOrEqual(1);
  });
});

describe("filters: histogram & invert", () => {
  it("histogramScan thresholds into a mask", () => {
    const grad = ramp01((u) => u);
    const m = histogramScan(grad, { position: 0.5, contrast: 1 });
    expect(sample(m, 0, 0)).toBeCloseTo(0, 3);
    expect(sample(m, SIZE - 1, 0)).toBeCloseTo(1, 3);
  });
  it("histogramRange normalizes", () => {
    const t = ramp01(() => 0.5);
    const r = histogramRange(t, 0.5, 1);
    expect(sample(r, 0, 0)).toBeCloseTo(0, 5);
  });
  it("invert flips and clampTex bounds", () => {
    const t = ramp01(() => 0.2);
    expect(sample(invert(t), 0, 0)).toBeCloseTo(0.8, 5);
    expect(sample(clampTex(ramp01(() => 2), 0, 1), 0, 0)).toBe(1);
  });
  it("autoLevels stretches the measured range without mutating input", () => {
    const source = ramp01((u) => 0.2 + u * 0.4);
    const before = [...source.data];
    const normalized = autoLevels(source);
    expect(Math.min(...normalized.data)).toBeCloseTo(0, 5);
    expect(Math.max(...normalized.data)).toBeCloseTo(1, 5);
    expect([...source.data]).toEqual(before);
  });
});

describe("filters: blend & min/max", () => {
  it("multiply blend darkens", () => {
    const a = ramp01(() => 0.5);
    const b = ramp01(() => 0.5);
    const out = blendTex(a, b, { mode: "multiply", opacity: 1 });
    expect(sample(out, 0, 0)).toBeCloseTo(0.25, 5);
  });
  it("dilates and erodes bright mask regions", () => {
    const point = generate(SIZE, SIZE, 1, (_u, _v, x, y) => (x === 8 && y === 8 ? 1 : 0));
    const expanded = dilateMask(point, { radius: 2 });
    const contracted = erodeMask(expanded, { radius: 2 });
    expect(sample(expanded, 9, 8)).toBe(1);
    expect(sample(contracted, 8, 8)).toBe(1);
    expect(sample(contracted, 10, 8)).toBe(0);
  });
  it("copy with opacity interpolates", () => {
    const fg = ramp01(() => 1);
    const bg = ramp01(() => 0);
    const out = blendTex(fg, bg, { mode: "copy", opacity: 0.5 });
    expect(sample(out, 0, 0)).toBeCloseTo(0.5, 5);
  });
  it("mask gates the blend", () => {
    const fg = ramp01(() => 1);
    const bg = ramp01(() => 0);
    const mask = ramp01((u) => (u < 0.5 ? 0 : 1));
    const out = blendTex(fg, bg, { mode: "copy", mask });
    expect(sample(out, 0, 0)).toBeCloseTo(0, 5);
    expect(sample(out, SIZE - 1, 0)).toBeCloseTo(1, 5);
  });
  it("min/max pick correct extremes", () => {
    const a = ramp01(() => 0.3);
    const b = ramp01(() => 0.7);
    expect(sample(minTex(a, b), 0, 0)).toBeCloseTo(0.3, 5);
    expect(sample(maxTex(a, b), 0, 0)).toBeCloseTo(0.7, 5);
  });
});

describe("filters: warp, slopeBlur, sharpen, edge", () => {
  it("warp keeps values bounded and runs", () => {
    const t = ramp01((u) => u);
    const intensity = ramp01(() => 0.5);
    const w = warp(t, intensity, { intensity: 4, angle: 0 });
    expect(sample(w, 8, 8)).toBeGreaterThanOrEqual(0);
  });
  it("slopeBlur produces a smoothed buffer", () => {
    const t = ramp01((u) => (u < 0.5 ? 0 : 1));
    const slope = ramp01((u) => u);
    const s = slopeBlur(t, slope, { intensity: 3, samples: 4 });
    expect(s.data.length).toBe(t.data.length);
  });
  it("slopeBlur min and max modes move height in opposite directions", () => {
    const t = ramp01((u) => u);
    const slope = ramp01((u) => u);
    const eroded = slopeBlur(t, slope, { intensity: 8, samples: 2, mode: "min" });
    const expanded = slopeBlur(t, slope, { intensity: 8, samples: 2, mode: "max" });
    expect(sample(eroded, 8, 8)).toBeLessThanOrEqual(sample(expanded, 8, 8));
  });
  it("sharpen stays in range", () => {
    const t = ramp01((u, v) => (u + v) / 2);
    const s = sharpen(t, 1, 1);
    expect(sample(s, 4, 4)).toBeGreaterThanOrEqual(0);
    expect(sample(s, 4, 4)).toBeLessThanOrEqual(1);
  });
  it("edgeDetect lights up a step edge", () => {
    const step = ramp01((u) => (u < 0.5 ? 0 : 1));
    const e = edgeDetect(step);
    // somewhere near the edge column should be > 0
    let maxV = 0;
    for (let y = 0; y < SIZE; y++) maxV = Math.max(maxV, sample(e, SIZE / 2, y));
    expect(maxV).toBeGreaterThan(0.1);
  });
});

describe("filters: channels & gradient map", () => {
  it("grayscale of white is 1", () => {
    const rgb = generate(SIZE, SIZE, 3, () => [1, 1, 1]);
    expect(sample(grayscale(rgb), 0, 0)).toBeCloseTo(1, 5);
  });
  it("split then merge round-trips a channel", () => {
    const rgb = generate(SIZE, SIZE, 3, (u, v) => [u, v, 0.5]);
    const r = splitChannel(rgb, 0);
    const g = splitChannel(rgb, 1);
    const b = splitChannel(rgb, 2);
    const merged = mergeChannels([r, g, b]);
    expect(sample(merged, 3, 3, 2)).toBeCloseTo(0.5, 5);
  });
  it("gradientMap colorizes via ramp", () => {
    const grad = ramp01((u) => u);
    const r = ramp([
      { at: 0, color: [0, 0, 0] },
      { at: 1, color: [1, 0, 0] },
    ]);
    const colored = gradientMap(grad, r);
    expect(colored.channels).toBe(3);
    expect(sample(colored, SIZE - 1, 0, 0)).toBeGreaterThan(0.8);
  });
});

describe("filters: normal & geometry-derived", () => {
  it("normalInvert flips Y only", () => {
    const n = generate(SIZE, SIZE, 3, () => [0.5, 0.3, 1]);
    const inv = normalInvert(n);
    expect(sample(inv, 0, 0, 0)).toBeCloseTo(0.5, 5);
    expect(sample(inv, 0, 0, 1)).toBeCloseTo(0.7, 5);
  });
  it("normalCombine outputs unit-ish normals", () => {
    const flat = generate(SIZE, SIZE, 3, () => [0.5, 0.5, 1]);
    const out = normalCombine(flat, flat);
    // z channel should stay near 1 for two flat normals
    expect(sample(out, 4, 4, 2)).toBeGreaterThan(0.9);
  });
  it("scaleNormal strengthens tangent components and preserves length", () => {
    const normal = generate(SIZE, SIZE, 3, () => [0.6, 0.5, 0.99]);
    const strong = scaleNormal(normal, 2);
    const x = sample(strong, 4, 4, 0) * 2 - 1;
    const y = sample(strong, 4, 4, 1) * 2 - 1;
    const z = sample(strong, 4, 4, 2) * 2 - 1;
    expect(x).toBeGreaterThan(0.2);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
  });
  it("curvature is ~0.5 on a flat field", () => {
    const flat = ramp01(() => 0.5);
    expect(sample(curvature(flat), 8, 8)).toBeCloseTo(0.5, 3);
  });
  it("aoFromHeight darkens a pit", () => {
    // a low center surrounded by high border
    const pit = ramp01((u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.2 ? 0 : 1));
    const ao = aoFromHeight(pit, { radius: 3, intensity: 1 });
    const center = sample(ao, SIZE / 2, SIZE / 2);
    const corner = sample(ao, 0, 0);
    expect(center).toBeLessThan(corner);
  });
});

describe("filters: distance, bevel, emboss", () => {
  it("distanceField is 1 at source, falls off with distance", () => {
    // single source column at left edge
    const m = ramp01((u) => (u < 0.1 ? 1 : 0));
    const d = distanceField(m, { maxDistance: SIZE, threshold: 0.5 });
    // at the source: ~1; far away: smaller
    expect(sample(d, 0, 8)).toBeCloseTo(1, 1);
    expect(sample(d, SIZE - 1, 8)).toBeLessThan(sample(d, 2, 8));
  });

  it("bevel plateaus inside the shape, slopes at the rim", () => {
    // a centered square block
    const m = ramp01((u, v) => (Math.abs(u - 0.5) < 0.3 && Math.abs(v - 0.5) < 0.3 ? 1 : 0));
    const b = bevel(m, { width: 6 });
    const center = sample(b, SIZE / 2, SIZE / 2);
    // a pixel just inside the rim is lower than the plateau center
    const rim = sample(b, Math.floor(SIZE * 0.22), SIZE / 2);
    expect(center).toBeGreaterThan(rim);
    expect(center).toBeGreaterThan(0.5);
  });

  it("emboss centers flat areas at 0.5", () => {
    const flat = ramp01(() => 0.5);
    expect(sample(emboss(flat), 8, 8)).toBeCloseTo(0.5, 3);
  });

  it("emboss lights up a slope", () => {
    const slope = ramp01((u) => u);
    const e = emboss(slope, { angle: 0, intensity: 4 });
    // a horizontal gradient produces non-0.5 shading along its slope
    expect(Math.abs(sample(e, 8, 8) - 0.5)).toBeGreaterThan(0.01);
  });
});
