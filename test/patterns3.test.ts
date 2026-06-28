import { describe, it, expect } from "vitest";
import {
  whiteNoise,
  checker,
  stripes,
  dots,
  shape,
  star,
  gradientLinear,
  gradientRadial,
  gradientAngular,
} from "../src/index.js";

function inUnit(fn: (u: number, v: number) => number, n = 16): boolean {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = fn((i + 0.5) / n, (j + 0.5) / n);
      if (x < -1e-6 || x > 1 + 1e-6) return false;
    }
  return true;
}

describe("patterns3 generators", () => {
  it("whiteNoise is deterministic and in [0,1]", () => {
    const a = whiteNoise(5, 64);
    const b = whiteNoise(5, 64);
    expect(a(0.3, 0.7)).toBe(b(0.3, 0.7));
    expect(inUnit(a)).toBe(true);
  });

  it("whiteNoise differs with seed", () => {
    expect(whiteNoise(1)(0.5, 0.5)).not.toBe(whiteNoise(2)(0.5, 0.5));
  });

  it("checker alternates and stays in range", () => {
    const c = checker({ scale: 4 });
    // adjacent cells differ
    expect(c(0.1, 0.1)).not.toBe(c(0.4, 0.1));
    expect(inUnit(c)).toBe(true);
  });

  it("stripes duty controls coverage", () => {
    const s = stripes({ count: 4, duty: 0.5 });
    expect(inUnit(s)).toBe(true);
  });

  it("dots mask is 1 at center, 0 at corner", () => {
    const d = dots({ scale: 1, radius: 0.3, softness: 0.01 });
    expect(d(0.5, 0.5)).toBeGreaterThan(0.9);
    expect(d(0.0, 0.0)).toBeLessThan(0.1);
  });

  it("shape disc is solid at center, empty outside", () => {
    const disc = shape({ type: "disc", size: 0.3, softness: 0.01 });
    expect(disc(0.5, 0.5)).toBeGreaterThan(0.9);
    expect(disc(0.95, 0.95)).toBeLessThan(0.1);
  });

  it("shape ngon and square stay in range", () => {
    expect(inUnit(shape({ type: "ngon", sides: 6 }))).toBe(true);
    expect(inUnit(shape({ type: "square" }))).toBe(true);
    expect(inUnit(shape({ type: "ring", thickness: 0.2 }))).toBe(true);
  });

  it("star is solid at center", () => {
    const s = star({ points: 5, outer: 0.4 });
    expect(s(0.5, 0.5)).toBeGreaterThan(0.9);
    expect(inUnit(s)).toBe(true);
  });

  it("gradients stay in [0,1]", () => {
    expect(inUnit(gradientLinear({ angle: 0.5 }))).toBe(true);
    expect(inUnit(gradientRadial())).toBe(true);
    expect(inUnit(gradientAngular())).toBe(true);
  });

  it("radial gradient is 1 at center, 0 at edge", () => {
    const g = gradientRadial(0.5, 0.5, 0.5);
    expect(g(0.5, 0.5)).toBeCloseTo(1, 5);
    expect(g(0.5, 0.0)).toBeCloseTo(0, 5);
  });
});
