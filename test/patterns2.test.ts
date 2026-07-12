import { describe, it, expect } from "vitest";
import {
  multiFractal,
  ridgedMultiFractal,
  heteroTerrain,
  wave,
  brick,
  brickHeight,
  brickValue,
  smoothVoronoi,
  materialFromFields,
  validateMaterial,
  wood,
  brickWall,
  terrain,
} from "../src/index.js";

function inRange01(fn: (u: number, v: number) => number, samples = 300) {
  for (let i = 0; i < samples; i++) {
    const u = (i % 30) / 30;
    const v = Math.floor(i / 30) / 10;
    const x = fn(u, v);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(Number.isFinite(x)).toBe(true);
  }
}

describe("fractal noise variants", () => {
  it("multiFractal stays in [0,1] and is deterministic", () => {
    const a = multiFractal(5, { octaves: 5 });
    const b = multiFractal(5, { octaves: 5 });
    inRange01(a);
    expect(a(0.3, 0.7)).toBe(b(0.3, 0.7));
  });
  it("ridgedMultiFractal stays in [0,1]", () => {
    inRange01(ridgedMultiFractal(7, { octaves: 6 }));
  });
  it("heteroTerrain stays in [0,1]", () => {
    inRange01(heteroTerrain(3, { octaves: 5 }));
  });
});

describe("wave", () => {
  it("bands oscillate within [0,1]", () => {
    inRange01(wave({ scale: 6, type: "bands" }));
  });
  it("rings are radially symmetric around center", () => {
    const r = wave({ scale: 6, type: "rings" });
    // same distance from center => same value
    expect(r(0.5 + 0.2, 0.5)).toBeCloseTo(r(0.5 - 0.2, 0.5), 5);
    expect(r(0.5, 0.5 + 0.2)).toBeCloseTo(r(0.5 + 0.2, 0.5), 5);
  });
});

describe("brick", () => {
  it("mask is 0 or 1 and has mortar gaps", () => {
    const m = brick({ columns: 4, rows: 8, mortar: 0.1 });
    let zeros = 0, ones = 0;
    for (let i = 0; i < 400; i++) {
      const x = m((i % 20) / 20, Math.floor(i / 20) / 20);
      expect(x === 0 || x === 1).toBe(true);
      if (x === 0) zeros++; else ones++;
    }
    expect(zeros).toBeGreaterThan(0);
    expect(ones).toBeGreaterThan(0);
  });
  it("brickValue is deterministic per cell", () => {
    const bv = brickValue({ columns: 4, rows: 8, seed: 1 });
    expect(bv(0.1, 0.1)).toBe(bv(0.12, 0.11)); // same brick
  });
  it("brickHeight adds deterministic bevel, variation and chips", () => {
    const first = brickHeight({
      columns: 4,
      rows: 8,
      seed: 9,
      bevel: 0.08,
      heightVariation: 0.25,
      chipAmount: 0.4,
    });
    const second = brickHeight({
      columns: 4,
      rows: 8,
      seed: 9,
      bevel: 0.08,
      heightVariation: 0.25,
      chipAmount: 0.4,
    });
    inRange01(first);
    expect(first(0.31, 0.42)).toBe(second(0.31, 0.42));
    expect(first(0.001, 0.001)).toBe(0);
  });
});

describe("smoothVoronoi", () => {
  it("stays in [0,1] and is deterministic", () => {
    const a = smoothVoronoi({ scale: 5, seed: 2 });
    const b = smoothVoronoi({ scale: 5, seed: 2 });
    inRange01(a);
    expect(a(0.4, 0.6)).toBe(b(0.4, 0.6));
  });
});

describe("new presets bake to valid materials", () => {
  for (const [name, fn] of [
    ["wood", wood],
    ["brickWall", brickWall],
    ["terrain", terrain],
  ] as const) {
    it(`${name} passes physical validation`, () => {
      const mat = materialFromFields(32, fn({ seed: 1 }));
      expect(validateMaterial(mat)).toEqual([]);
    });
  }
});
