import { describe, it, expect } from "vitest";
import { SBS_REPRO } from "../src/texture/sbs-repro.js";
import { materialFromFields, validateMaterial } from "../src/texture/pbr.js";

describe("SBS reproduction recipes", () => {
  const names = Object.keys(SBS_REPRO) as (keyof typeof SBS_REPRO)[];

  it("registers a curated batch of recipes", () => {
    expect(names.length).toBeGreaterThanOrEqual(28);
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
