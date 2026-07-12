import { describe, it, expect } from "vitest";
import {
  celStep,
  shadeColor,
  painterVertex,
  stylizedPlaster,
  stylizedRoof,
  brushPainted,
  stylizedMetal,
  stylizedFoliage,
  STYLIZED_RECIPES,
  buildSurface,
  materialFromFields,
  validateMaterial,
  SURFACE_PARAM_SCHEMA,
  SURFACE_LABELS,
  defaultSurfaceParams,
} from "../src/index.js";

describe("celStep", () => {
  it("quantizes into flat bands and stays in [0,1]", () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const q = celStep(t, 3, 0);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
      // with no soft edge, output is a multiple of 1/steps
      const snapped = Math.round(q * 3) / 3;
      expect(q).toBeCloseTo(snapped, 6);
    }
  });

  it("steps=1 floors to a single flat band", () => {
    expect(celStep(0.2, 1, 0)).toBe(0);
    expect(celStep(0.9, 1, 0)).toBe(0);
    expect(celStep(1.0, 1, 0)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    expect(celStep(-0.5, 3)).toBe(0);
    expect(celStep(1.5, 3)).toBe(1);
  });
});

describe("shadeColor", () => {
  it("scales and clamps channels", () => {
    expect(shadeColor([0.5, 0.4, 0.2], 2)).toEqual([1, 0.8, 0.4]);
    expect(shadeColor([0.5, 0.5, 0.5], 0)).toEqual([0, 0, 0]);
  });
});

const RECIPES = {
  painterVertex,
  stylizedPlaster,
  stylizedRoof,
  brushPainted,
  stylizedMetal,
  stylizedFoliage,
};

describe("stylized recipes", () => {
  for (const [name, fn] of Object.entries(RECIPES)) {
    it(`${name}: fields are deterministic and in-range`, () => {
      const a = fn({ seed: 4 });
      const b = fn({ seed: 4 });
      for (let i = 0; i < 12; i++) {
        const u = i / 12;
        const v = ((i * 7) % 12) / 12;
        const ca = a.baseColor!(u, v);
        const cb = b.baseColor!(u, v);
        for (let c = 0; c < 3; c++) {
          expect(ca[c]).toBeGreaterThanOrEqual(0);
          expect(ca[c]).toBeLessThanOrEqual(1);
          expect(ca[c]).toBeCloseTo(cb[c]!, 10);
        }
        const r = a.roughness!(u, v);
        expect(r).toBeGreaterThanOrEqual(0.04);
        expect(r).toBeLessThanOrEqual(1);
      }
    });

    it(`${name}: tint recolors the base`, () => {
      const red = fn({ seed: 4, color: [0.9, 0.1, 0.1] });
      // average red channel should dominate green with a red tint
      let rSum = 0;
      let gSum = 0;
      for (let i = 0; i < 16; i++) {
        const c = red.baseColor!(i / 16, 0.3);
        rSum += c[0];
        gSum += c[1];
      }
      expect(rSum).toBeGreaterThan(gSum);
    });
  }

  it("STYLIZED_RECIPES exposes every recipe", () => {
    expect(Object.keys(STYLIZED_RECIPES).sort()).toEqual(Object.keys(RECIPES).sort());
  });
});

describe("stylized surfaces integrate with the surface pipeline", () => {
  const TYPES = Object.keys(RECIPES);

  for (const type of TYPES) {
    it(`${type}: builds a valid physical material`, () => {
      const sm = buildSurface(type);
      expect(sm).not.toBeNull();
      expect(sm!.type).toBe(type);
      const mat = materialFromFields(32, sm!.fields);
      expect(validateMaterial(mat)).toEqual([]);
    });

    it(`${type}: has a zh-CN label and a param schema`, () => {
      expect(typeof SURFACE_LABELS[type]).toBe("string");
      expect(SURFACE_PARAM_SCHEMA[type]!.length).toBeGreaterThan(0);
      const defs = defaultSurfaceParams(type);
      expect(defs).toHaveProperty("color");
    });
  }

  it("bands param actually changes the shading", () => {
    const flat = buildSurface("painterVertex", { bands: 1 })!;
    const smooth = buildSurface("painterVertex", { bands: 5 })!;
    let diff = 0;
    for (let i = 0; i < 20; i++) {
      const u = i / 20;
      diff += Math.abs(flat.fields.baseColor!(u, 0.5)[0] - smooth.fields.baseColor!(u, 0.5)[0]);
    }
    expect(diff).toBeGreaterThan(0);
  });
});

