import { describe, it, expect } from "vitest";
import {
  hexTile,
  worldColorVariation,
  upwardMask,
  heightBlendMask,
  heightBlendMaterials,
  triplanar,
  triplanarColor,
  terrainAutoMaterial,
  groundBlendColorField,
  materialFromFields,
  validateMaterial,
  buildSurface,
  fbmPattern,
} from "../src/index.js";
import { vec3 } from "../src/math/vec3.js";

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

describe("triplanar", () => {
  it("a floor samples the XZ plane, a wall samples a vertical plane", () => {
    // pattern that returns u so we can tell which coords were used
    const pat = (u: number) => (u % 1 + 1) % 1;
    const tp = triplanar(pat, { scale: 1, sharpness: 8 });
    const pos = vec3(0.3, 0.7, 0.9);
    const floor = tp(pos, vec3(0, 1, 0)); // Y-normal -> reads (x,z) -> u=x=0.3
    const wallZ = tp(pos, vec3(0, 0, 1)); // Z-normal -> reads (x,y) -> u=x=0.3
    const wallX = tp(pos, vec3(1, 0, 0)); // X-normal -> reads (z,y) -> u=z=0.9
    expect(floor).toBeCloseTo(0.3, 4);
    expect(wallZ).toBeCloseTo(0.3, 4);
    expect(wallX).toBeCloseTo(0.9, 4);
  });

  it("triplanarColor blends without leaving [0,1]", () => {
    const pat = (u: number, v: number) => [Math.abs(u % 1), Math.abs(v % 1), 0.5] as [number, number, number];
    const tp = triplanarColor(pat, { scale: 1 });
    const c = tp(vec3(0.2, 0.4, 0.6), vec3(0.5, 0.5, 0.7));
    for (const x of c) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe("terrainAutoMaterial", () => {
  const grass: [number, number, number] = [0.2, 0.5, 0.15];
  const rock: [number, number, number] = [0.4, 0.38, 0.35];
  const auto = terrainAutoMaterial(
    [
      { color: rock, minSlope: 0 },       // rock everywhere as base
      { color: grass, minSlope: 0.7, priority: 2 }, // grass only on flat tops
    ],
    { softness: 0.05 },
  );

  it("flat ground reads grass, steep faces read rock", () => {
    const flat = auto(vec3(0, 0, 0), vec3(0, 1, 0)); // up -> grass wins
    const steep = auto(vec3(0, 0, 0), vec3(1, 0, 0)); // vertical -> only rock qualifies
    // grass greener than rock
    expect(flat[1]).toBeGreaterThan(flat[0]);
    // steep is rock: red ~>= green
    expect(steep[0]).toBeGreaterThanOrEqual(steep[1]);
  });
});

describe("groundBlendColorField (RVT-style)", () => {
  const obj = () => [0.2, 0.2, 0.2] as [number, number, number];
  const ground = () => [0.8, 0.6, 0.3] as [number, number, number];

  it("uses ground color at the contact, object color up high", () => {
    const field = groundBlendColorField(obj, ground, { groundY: 0, fade: 1, breakup: 0 });
    const low = field({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const high = field({ x: 0, y: 2, z: 0 }, { x: 0, y: 1, z: 0 });
    // contact leans toward ground (warm), top stays object (grey)
    expect(low[0]).toBeGreaterThan(high[0]);
    expect(high[0]).toBeCloseTo(0.2, 1);
  });

  it("strength scales the blend", () => {
    const full = groundBlendColorField(obj, ground, { fade: 1, strength: 1, breakup: 0 });
    const half = groundBlendColorField(obj, ground, { fade: 1, strength: 0.5, breakup: 0 });
    const p = { x: 0, y: 0, z: 0 };
    const n = { x: 0, y: 1, z: 0 };
    expect(full(p, n)[0]).toBeGreaterThan(half(p, n)[0]);
  });
});
