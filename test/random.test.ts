import { describe, it, expect } from "vitest";
import { makeRng, makeNoise, fbm2, fbm3 } from "../src/index.js";

describe("prng determinism", () => {
  it("same seed -> identical sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seed -> different sequence", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("next stays in [0,1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int is inclusive and in range", () => {
    const r = makeRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(r.int(1, 6));
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("fork is deterministic and independent", () => {
    const base1 = makeRng(123);
    const base2 = makeRng(123);
    const f1 = base1.fork();
    const f2 = base2.fork();
    expect(f1.next()).toBe(f2.next());
  });

  it("mean of uniform is ~0.5", () => {
    const r = makeRng(2024);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });
});

describe("noise", () => {
  it("same seed -> identical field", () => {
    const a = makeNoise(5);
    const b = makeNoise(5);
    expect(a.noise2(1.3, 2.7)).toBe(b.noise2(1.3, 2.7));
    expect(a.noise3(1.3, 2.7, 0.9)).toBe(b.noise3(1.3, 2.7, 0.9));
  });

  it("noise2 stays within [-1,1]", () => {
    const n = makeNoise(11);
    for (let i = 0; i < 2000; i++) {
      const v = n.noise2(i * 0.137, i * 0.071);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it("noise3 stays within [-1,1]", () => {
    const n = makeNoise(13);
    for (let i = 0; i < 2000; i++) {
      const v = n.noise3(i * 0.13, i * 0.07, i * 0.05);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it("noise is continuous (small step -> small change)", () => {
    const n = makeNoise(3);
    const a = n.noise2(4.0, 4.0);
    const b = n.noise2(4.001, 4.0);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it("fbm is deterministic and bounded", () => {
    const n = makeNoise(8);
    const v1 = fbm2(n, 0.5, 0.5, { octaves: 6 });
    const v2 = fbm2(n, 0.5, 0.5, { octaves: 6 });
    expect(v1).toBe(v2);
    expect(Math.abs(v1)).toBeLessThanOrEqual(1.001);
    expect(Math.abs(fbm3(n, 0.5, 0.5, 0.5))).toBeLessThanOrEqual(1.001);
  });
});
