import { describe, expect, it } from "vitest";
import {
  STYLE_CASE_DEFINITIONS,
  STYLE_CASE_MATERIALS,
  STYLE_CASE_PARAM_SCHEMA,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

describe("Bilibili style case materials", () => {
  const names = Object.keys(STYLE_CASE_MATERIALS) as Array<keyof typeof STYLE_CASE_MATERIALS>;

  it("covers all 26 episodes in source order", () => {
    expect(names).toHaveLength(26);
    expect(Object.keys(STYLE_CASE_DEFINITIONS)).toEqual(names);
    expect(names.map((name) => STYLE_CASE_DEFINITIONS[name].episode)).toEqual(
      Array.from({ length: 26 }, (_, index) => index + 1),
    );
    expect(new Set(names.map((name) => STYLE_CASE_DEFINITIONS[name].bvid))).toEqual(
      new Set(["BV1BtxNzfE8H"]),
    );
  });

  it("exposes seven semantic controls per material", () => {
    for (const name of names) {
      expect(STYLE_CASE_PARAM_SCHEMA[name]).toHaveLength(7);
      expect(STYLE_CASE_PARAM_SCHEMA[name].map((spec) => spec.label)).not.toContain("");
    }
  });

  it("generates deterministic physically valid PBR maps", () => {
    for (const name of names) {
      const first = materialFromFields(12, STYLE_CASE_MATERIALS[name]({}));
      const second = materialFromFields(12, STYLE_CASE_MATERIALS[name]({}));
      expect(validateMaterial(first), name).toEqual([]);
      expect(Array.from(first.height.data), name).toEqual(Array.from(second.height.data));
      expect(new Set(first.height.data).size, name).toBeGreaterThan(4);
    }
  });

  it("preserves special hard-surface and emissive behavior", () => {
    const panel = materialFromFields(20, STYLE_CASE_MATERIALS.sciFiCircuitPanel({}));
    const crystal = materialFromFields(20, STYLE_CASE_MATERIALS.amethystCluster({}));
    expect(Math.max(...panel.metallic.data)).toBeGreaterThan(0.8);
    expect(Math.max(...crystal.emission.data)).toBeGreaterThan(0.05);
  });
});

