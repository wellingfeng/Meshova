import { describe, it, expect } from "vitest";
import {
  makeTexture,
  generate,
  sample,
  noisePattern,
  fbmPattern,
  voronoi,
  gradient,
  radialGradient,
  ramp,
  blend,
  blendColor,
  heightToNormal,
  metalBase,
  dielectricBase,
  materialFromFields,
  validateMaterial,
  scalarMap,
  encodePNG,
  textureToPNG,
  PRESETS,
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
  rustyMetal,
} from "../src/index.js";

describe("texture buffer", () => {
  it("generate fills every channel", () => {
    const t = generate(8, 8, 3, (u, v) => [u, v, 0.5]);
    expect(t.data.length).toBe(8 * 8 * 3);
    // pixel (7, top row) u ~ near 1
    expect(sample(t, 7, 0, 0)).toBeGreaterThan(0.9);
  });
  it("v axis points up (row 0 is v~1)", () => {
    const t = generate(4, 4, 1, (_u, v) => v);
    expect(sample(t, 0, 0)).toBeGreaterThan(sample(t, 0, 3));
  });
});

describe("patterns", () => {
  it("noise and fbm stay in [0,1] and are deterministic", () => {
    const n1 = noisePattern(7, 4);
    const n2 = noisePattern(7, 4);
    for (let i = 0; i < 200; i++) {
      const u = i / 200, v = (i * 1.7) % 1;
      const a = n1(u, v);
      expect(a).toBe(n2(u, v));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    const f = fbmPattern(3, 4, { octaves: 5 });
    expect(f(0.5, 0.5)).toBe(fbmPattern(3, 4, { octaves: 5 })(0.5, 0.5));
  });

  it("voronoi f1 in range and deterministic", () => {
    const vor = voronoi({ scale: 5, seed: 1 });
    const vor2 = voronoi({ scale: 5, seed: 1 });
    for (let i = 0; i < 100; i++) {
      const u = (i % 10) / 10, v = Math.floor(i / 10) / 10;
      const a = vor(u, v);
      expect(a).toBe(vor2(u, v));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("voronoi crack metric gives low values away from edges", () => {
    const crack = voronoi({ scale: 4, seed: 2, metric: "f2-f1" });
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += crack((i % 20) / 20, Math.floor(i / 20) / 20);
    expect(sum / 400).toBeLessThan(0.6);
  });

  it("gradient spans 0..1 across direction", () => {
    const g = gradient(0);
    expect(g(0, 0.5)).toBeCloseTo(0, 5);
    expect(g(1, 0.5)).toBeCloseTo(1, 5);
  });

  it("radial gradient is 0 at center", () => {
    const r = radialGradient(0.5, 0.5, 0.5);
    expect(r(0.5, 0.5)).toBeCloseTo(0, 5);
    expect(r(1, 0.5)).toBeCloseTo(1, 5);
  });

  it("ramp interpolates between stops", () => {
    const r = ramp([
      { at: 0, color: [0, 0, 0] },
      { at: 1, color: [1, 1, 1] },
    ]);
    expect(r(0.5)).toEqual([0.5, 0.5, 0.5]);
    expect(r(-1)).toEqual([0, 0, 0]);
    expect(r(2)).toEqual([1, 1, 1]);
  });

  it("blend mixes by mask", () => {
    expect(blend(0, 10, 0.5)).toBe(5);
    expect(blendColor([0, 0, 0], [1, 1, 1], 0.25)).toEqual([0.25, 0.25, 0.25]);
  });
});

describe("PBR", () => {
  it("metalBase is metallic=1 and valid", () => {
    const m = metalBase({ size: 32 });
    expect(m.metallic.data[0]).toBe(1);
    expect(validateMaterial(m)).toEqual([]);
  });

  it("dielectricBase is metallic=0", () => {
    const m = dielectricBase({ size: 32 });
    expect(m.metallic.data[0]).toBe(0);
  });

  it("roughness is clamped to physical minimum", () => {
    const m = materialFromFields(16, { roughness: () => 0 });
    // 0.04 stored as Float32 is ~0.039999999; allow epsilon.
    expect(m.roughness.data[0]).toBeGreaterThanOrEqual(0.04 - 1e-6);
  });

  it("heightToNormal yields unit normals encoded around (0.5,0.5,1)", () => {
    const flat = scalarMap(16, () => 0.5);
    const n = heightToNormal(flat, 2);
    // flat height => normal points straight up => B ~ 1 (encoded ~1), RG ~0.5
    expect(n.data[0]).toBeCloseTo(0.5, 2);
    expect(n.data[1]).toBeCloseTo(0.5, 2);
    expect(n.data[2]).toBeCloseTo(1, 2);
  });

  it("validateMaterial flags illegal values", () => {
    const m = metalBase({ size: 16 });
    m.metallic.data[0] = 5; // inject illegal
    expect(validateMaterial(m).length).toBeGreaterThan(0);
  });
});

describe("PNG encoder", () => {
  it("emits a valid PNG signature and IHDR dims", () => {
    const px = new Uint8Array(4 * 4 * 3).fill(128);
    const png = encodePNG(4, 4, 3, px);
    // signature
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR width at byte 16..19
    const w = (png[16]! << 24) | (png[17]! << 16) | (png[18]! << 8) | png[19]!;
    expect(w).toBe(4);
  });

  it("textureToPNG handles gray and rgb", () => {
    const gray = scalarMap(8, () => 0.5);
    const g = textureToPNG(gray);
    expect(g.length).toBeGreaterThan(20);
    const m = metalBase({ size: 8 });
    const c = textureToPNG(m.baseColor);
    expect(c.length).toBeGreaterThan(20);
  });
});

describe("preset params", () => {
  it("every preset has a param schema with defaults", () => {
    for (const name of Object.keys(PRESETS)) {
      expect(PRESET_PARAM_SCHEMA[name], `schema for ${name}`).toBeDefined();
      const params = defaultMatParams(name);
      expect(Object.keys(params).length).toBeGreaterThan(0);
    }
  });

  it("defaultMatParams returns independent copies for rgb defaults", () => {
    const a = defaultMatParams("ceramic");
    const b = defaultMatParams("ceramic");
    expect(a.color).not.toBe(b.color); // distinct arrays
    expect(a.color).toEqual(b.color);
  });

  it("rust param changes the metallic field output", () => {
    const low = materialFromFields(16, rustyMetal({ rust: -0.3 }));
    const high = materialFromFields(16, rustyMetal({ rust: 0.5 }));
    const avg = (t: { data: Float32Array | number[] }) => {
      let s = 0;
      for (let i = 0; i < t.data.length; i++) s += t.data[i]!;
      return s / t.data.length;
    };
    // more rust => more area non-metallic => lower mean metallic
    expect(avg(high.metallic)).toBeLessThan(avg(low.metallic));
  });

  it("brickWall columns param is accepted without error", () => {
    const fields = PRESETS.brickWall({ columns: 10, rows: 20, mortar: 0.06 });
    const mat = materialFromFields(16, fields);
    expect(validateMaterial(mat)).toEqual([]);
  });
});
