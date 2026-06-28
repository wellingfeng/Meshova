import { describe, it, expect } from "vitest";
import {
  // scalar
  fit,
  fit01,
  fit11,
  invlerp,
  frac,
  sign,
  bias,
  gain,
  pulse,
  radians,
  degrees,
  solvequadratic,
  // vec3
  vec3,
  reflect,
  refract,
  project,
  reject,
  makeBasis,
  slerpVec3,
  minVec3,
  maxVec3,
  dot,
  length,
  normalize,
  // color
  hsvToRgb,
  rgbToHsv,
  blackbody,
  hueShift,
  linearToSrgb,
  srgbToLinear,
  // noise
  makeNoise,
  cellNoise2,
  worley2,
  pnoise2,
  curlNoise2,
  curlNoise3,
} from "../src/index.js";

describe("scalar VEX parity", () => {
  it("fit maps and clamps", () => {
    expect(fit(5, 0, 10, 0, 100)).toBe(50);
    expect(fit(-5, 0, 10, 0, 100)).toBe(0); // clamped
    expect(fit(15, 0, 10, 0, 100)).toBe(100); // clamped
    expect(fit01(0.25, 0, 8)).toBe(2);
    expect(fit11(0, -1, 1, )).toBe(0);
  });

  it("invlerp inverts lerp", () => {
    expect(invlerp(10, 20, 15)).toBe(0.5);
  });

  it("frac handles negatives", () => {
    expect(frac(2.25)).toBeCloseTo(0.25);
    expect(frac(-0.25)).toBeCloseTo(0.75);
  });

  it("sign", () => {
    expect(sign(-3)).toBe(-1);
    expect(sign(0)).toBe(0);
    expect(sign(2)).toBe(1);
  });

  it("bias/gain are identity at neutral params", () => {
    expect(bias(0.3, 0.5)).toBeCloseTo(0.3);
    expect(gain(0.3, 0.5)).toBeCloseTo(0.3);
  });

  it("pulse masks a band", () => {
    expect(pulse(0, 1, 0.5)).toBe(1);
    expect(pulse(0, 1, 2)).toBe(0);
  });

  it("radians/degrees round-trip", () => {
    expect(degrees(radians(90))).toBeCloseTo(90);
  });

  it("solvequadratic finds roots", () => {
    expect(solvequadratic(1, -3, 2)).toEqual([1, 2]);
    expect(solvequadratic(1, 0, 1)).toEqual([]); // no real roots
  });
});

describe("vec3 VEX parity", () => {
  it("reflect bounces off a plane", () => {
    const r = reflect(vec3(1, -1, 0), vec3(0, 1, 0));
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(1);
  });

  it("refract returns zero on total internal reflection", () => {
    // grazing ray, high eta -> TIR
    const r = refract(normalize(vec3(1, -0.01, 0)), vec3(0, 1, 0), 2.5);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.z).toBe(0);
  });

  it("project + reject reconstruct the vector", () => {
    const a = vec3(2, 3, 4);
    const b = vec3(0, 1, 0);
    const p = project(a, b);
    const q = reject(a, b);
    expect(p.x + q.x).toBeCloseTo(2);
    expect(p.y + q.y).toBeCloseTo(3);
    expect(p.z + q.z).toBeCloseTo(4);
  });

  it("makeBasis is orthonormal", () => {
    const { x, y, z } = makeBasis(vec3(0.3, 0.7, -0.2));
    expect(length(z)).toBeCloseTo(1);
    expect(dot(x, y)).toBeCloseTo(0);
    expect(dot(x, z)).toBeCloseTo(0);
    expect(dot(y, z)).toBeCloseTo(0);
  });

  it("slerp endpoints", () => {
    const a = normalize(vec3(1, 0, 0));
    const b = normalize(vec3(0, 1, 0));
    const mid = slerpVec3(a, b, 0.5);
    expect(length(mid)).toBeCloseTo(1);
  });

  it("min/max per component", () => {
    expect(minVec3(vec3(1, 5, 3), vec3(4, 2, 6))).toEqual(vec3(1, 2, 3));
    expect(maxVec3(vec3(1, 5, 3), vec3(4, 2, 6))).toEqual(vec3(4, 5, 6));
  });
});

describe("color VEX parity", () => {
  it("hsv<->rgb round-trip", () => {
    const [h, s, v] = rgbToHsv(0.2, 0.6, 0.4);
    const [r, g, b] = hsvToRgb(h, s, v);
    expect(r).toBeCloseTo(0.2);
    expect(g).toBeCloseTo(0.6);
    expect(b).toBeCloseTo(0.4);
  });

  it("pure red has hue 0 sat 1", () => {
    const [h, s, v] = rgbToHsv(1, 0, 0);
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(1);
    expect(v).toBeCloseTo(1);
  });

  it("blackbody warm vs cool", () => {
    const warm = blackbody(2000);
    const cool = blackbody(12000);
    // warm should be redder than blue; cool should be relatively bluer
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2] / cool[0]).toBeGreaterThan(warm[2] / warm[0]);
  });

  it("hueShift by full turn is identity", () => {
    const c: [number, number, number] = [0.3, 0.5, 0.2];
    const s = hueShift(c, 1);
    expect(s[0]).toBeCloseTo(c[0]);
    expect(s[1]).toBeCloseTo(c[1]);
    expect(s[2]).toBeCloseTo(c[2]);
  });

  it("srgb<->linear round-trip", () => {
    expect(srgbToLinear(linearToSrgb(0.5))).toBeCloseTo(0.5);
  });
});

describe("noise VEX parity", () => {
  it("cellNoise is constant within a cell, varies across cells", () => {
    expect(cellNoise2(0.1, 0.1, 7)).toBe(cellNoise2(0.9, 0.9, 7));
    expect(cellNoise2(0.1, 0.1, 7)).not.toBe(cellNoise2(1.1, 0.1, 7));
  });

  it("worley F1 <= F2 and id is stable", () => {
    const r = worley2(3.3, 4.7, 0);
    expect(r.f1).toBeLessThanOrEqual(r.f2);
    expect(worley2(3.3, 4.7, 0).id).toBe(r.id);
  });

  it("pnoise tiles across the period", () => {
    const n = makeNoise(42);
    const px = 4;
    const py = 4;
    const a = pnoise2(n, 0.5, 1.5, px, py);
    const b = pnoise2(n, 0.5 + px, 1.5, px, py);
    expect(a).toBeCloseTo(b, 5);
  });

  it("curlNoise2 is deterministic", () => {
    const n = makeNoise(1);
    expect(curlNoise2(n, 1.2, 3.4)).toEqual(curlNoise2(n, 1.2, 3.4));
  });

  it("curlNoise3 is roughly divergence-free", () => {
    const n = makeNoise(5);
    const eps = 1e-3;
    const f = (x: number, y: number, z: number) => curlNoise3(n, x, y, z);
    const div =
      (f(1 + eps, 1, 1).x - f(1 - eps, 1, 1).x) / (2 * eps) +
      (f(1, 1 + eps, 1).y - f(1, 1 - eps, 1).y) / (2 * eps) +
      (f(1, 1, 1 + eps).z - f(1, 1, 1 - eps).z) / (2 * eps);
    expect(Math.abs(div)).toBeLessThan(0.5);
  });
});
