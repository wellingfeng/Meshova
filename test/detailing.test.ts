import { describe, it, expect } from "vitest";
import {
  hexTile,
  worldColorVariation,
  upwardMask,
  heightBlendMask,
  heightBlendMaterials,
  materialFromFields,
  validateMaterial,
  buildSurface,
  fbmPattern,
} from "../src/index.js";

describe("hexTile", () => {
  it("stays in [0,1] and is deterministic per seed", () => {
    const src = fbmPattern(3, 6);
    const a = hexTile(src, { scale: 4, seed: 9 });
    const b = hexTile(src, { scale: 4, seed: 9 });
    for (let i = 0; i < 20; i++) {
      const u = i / 20;
      const v = (i * 7) % 20 / 20;
      const va = a(u, v);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThanOrEqual(1);
      expect(va).toBeCloseTo(b(u, v), 10);
    }
  });

  it("breaks the source repeat (differs from raw tiled sampling)", () => {
    // a constant-per-tile source repeats every 1/scale; hexTile should perturb it
    const src = (u: number, v: number) => (Math.floor(u * 4) + Math.floor(v * 4)) % 2;
    const hx = hexTile(src, { scale: 3, seed: 1, rotationJitter: Math.PI, offsetJitter: 1 });
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const u = (i % 10) / 10 + 0.03;
      const v = Math.floor(i / 10) / 5 + 0.03;
      if (Math.abs(hx(u, v) - src(u, v)) > 1e-6) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });
});

describe("worldColorVariation", () => {
  it("drifts brightness but stays near the base hue on average", () => {
    const base = () => [0.4, 0.4, 0.4] as [number, number, number];
    const varied = worldColorVariation(base, { frequency: 0.7, strength: 0.4, seed: 5 });
    let min = 1;
    let max = 0;
    let sum = 0;
    const N = 64;
    for (let i = 0; i < N; i++) {
      const c = varied(i / N, (i * 3 % N) / N);
      min = Math.min(min, c[0]);
      max = Math.max(max, c[0]);
      sum += c[0];
    }
    expect(max).toBeGreaterThan(min); // there is variation
    expect(sum / N).toBeCloseTo(0.4, 1); // mean stays near base
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });
});

describe("upwardMask", () => {
  it("is 0 on vertical faces and 1 on top faces", () => {
    const m = upwardMask({ start: 0.3, full: 0.75 });
    expect(m(0)).toBeCloseTo(0); // vertical
    expect(m(-1)).toBeCloseTo(0); // underside
    expect(m(1)).toBeCloseTo(1); // straight up
    expect(m(0.5)).toBeGreaterThan(0);
    expect(m(0.5)).toBeLessThan(1);
  });
});

describe("heightBlendMask", () => {
  it("amount=0 is all-A (0), amount=1 is all-B (1)", () => {
    const h = (u: number) => u; // ramp 0..1
    const none = heightBlendMask(h, { amount: 0, contrast: 1 });
    const all = heightBlendMask(h, { amount: 1, contrast: 1 });
    expect(none(0.5, 0.5)).toBeCloseTo(0);
    expect(all(0.5, 0.5)).toBeCloseTo(1);
  });

  it("high height wins first as amount grows", () => {
    const h = (u: number) => u;
    const mid = heightBlendMask(h, { amount: 0.5, contrast: 1 });
    // low height -> stays A(0), high height -> B(1)
    expect(mid(0.1, 0)).toBeLessThan(0.5);
    expect(mid(0.9, 0)).toBeGreaterThan(0.5);
  });
});

describe("heightBlendMaterials", () => {
  const SIZE = 8;
  it("blends two materials by height into a valid material", () => {
    const rock = materialFromFields(SIZE, {
      baseColor: () => [0.4, 0.38, 0.35],
      roughness: () => 0.9,
      height: (u) => u, // ramp so the seam is testable
    });
    const moss = materialFromFields(SIZE, {
      baseColor: () => [0.15, 0.35, 0.1],
      roughness: () => 0.8,
      height: (u) => u,
    });
    const blended = heightBlendMaterials(rock, moss, { amount: 0.5, contrast: 1, heightFrom: "b" });
    expect(validateMaterial(blended)).toEqual([]);
    const ch = blended.baseColor.channels;
    // low-height column leans rock (more red), high-height column leans moss (more green)
    const lowR = blended.baseColor.data[0]!;
    const highR = blended.baseColor.data[(SIZE - 1) * ch]!;
    expect(lowR).toBeGreaterThan(highR); // rock redder than moss
  });
});

describe("foliage surface", () => {
  it("is a two-sided translucent surface with green base", () => {
    const s = buildSurface("foliage", {});
    expect(s.transparent).toBe(true);
    expect(s.physical.transmission).toBeGreaterThan(0);
    const c = s.fields.baseColor ? s.fields.baseColor(0.5, 0.5) : [0, 0, 0];
    expect(c[1]).toBeGreaterThan(c[0]); // green dominant
    expect(c[1]).toBeGreaterThan(c[2]);
  });

  it("season pushes color toward autumn", () => {
    const fresh = buildSurface("foliage", { season: 0 });
    const fall = buildSurface("foliage", { season: 1 });
    const cf = fresh.fields.baseColor!(0.5, 0.5);
    const ca = fall.fields.baseColor!(0.5, 0.5);
    expect(ca[0]).toBeGreaterThan(cf[0]); // autumn redder
  });
});
