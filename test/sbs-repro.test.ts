import { describe, it, expect } from "vitest";
import { SBS_PARAM_SCHEMA, SBS_REPRO, defaultSbsParams } from "../src/texture/sbs-repro.js";
import { materialFromFields, validateMaterial } from "../src/texture/pbr.js";

describe("SBS reproduction recipes", () => {
  const names = Object.keys(SBS_REPRO) as (keyof typeof SBS_REPRO)[];

  it("registers a curated batch of recipes", () => {
    expect(names.length).toBeGreaterThanOrEqual(28);
  });

  it("every recipe exposes multiple live parameters", () => {
    for (const name of names) {
      expect(SBS_PARAM_SCHEMA[name].length).toBeGreaterThanOrEqual(7);
      expect(Object.keys(defaultSbsParams(name))).toHaveLength(SBS_PARAM_SCHEMA[name].length);
    }
  });

  it("Wood_OBS_01 exposes and applies generator controls", () => {
    const defaults = defaultSbsParams("Wood_OBS_01");
    expect(SBS_PARAM_SCHEMA.Wood_OBS_01.some((spec) => spec.key === "fiberScale")).toBe(true);
    const fine = materialFromFields(16, SBS_REPRO.Wood_OBS_01({ ...defaults, fiberScale: 80 }));
    const coarse = materialFromFields(16, SBS_REPRO.Wood_OBS_01({ ...defaults, fiberScale: 8 }));
    expect(Array.from(fine.baseColor.data)).not.toEqual(Array.from(coarse.baseColor.data));
  });

  for (const name of names) {
    it(`${name} bakes to a physically valid material`, () => {
      const fields = SBS_REPRO[name]({});
      const material = materialFromFields(32, fields);
      expect(validateMaterial(material)).toEqual([]);
    });

    it(`${name} is deterministic (same seed -> same bytes)`, () => {
      const a = materialFromFields(16, SBS_REPRO[name]({}));
      const b = materialFromFields(16, SBS_REPRO[name]({}));
      expect(Array.from(a.baseColor.data)).toEqual(Array.from(b.baseColor.data));
    });
  }
});
