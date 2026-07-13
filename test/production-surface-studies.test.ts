import { describe, expect, it } from "vitest";
import {
  PRODUCTION_STUDY_DEFINITIONS,
  PRODUCTION_STUDY_MATERIALS,
  PRODUCTION_STUDY_PARAM_SCHEMA,
  defaultProductionStudyParams,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

describe("production surface studies", () => {
  const names = Object.keys(PRODUCTION_STUDY_MATERIALS) as Array<keyof typeof PRODUCTION_STUDY_MATERIALS>;

  it("registers eight distinct production studies", () => {
    expect(names).toHaveLength(8);
    expect(Object.keys(PRODUCTION_STUDY_DEFINITIONS)).toEqual(names);
    for (const name of names) {
      expect(PRODUCTION_STUDY_PARAM_SCHEMA[name]).toHaveLength(7);
      expect(Object.keys(defaultProductionStudyParams(name))).toHaveLength(7);
    }
  });

  it("builds deterministic physically valid PBR maps", () => {
    for (const name of names) {
      const first = materialFromFields(16, PRODUCTION_STUDY_MATERIALS[name]({}));
      const second = materialFromFields(16, PRODUCTION_STUDY_MATERIALS[name]({}));
      expect(validateMaterial(first), name).toEqual([]);
      expect(Array.from(first.height.data), name).toEqual(Array.from(second.height.data));
      expect(new Set(first.height.data).size, name).toBeGreaterThan(8);
    }
  });

  it("preserves conductor, road and chainmail material classes", () => {
    const solar = materialFromFields(24, PRODUCTION_STUDY_MATERIALS.photovoltaicSolarPanel({}));
    const road = materialFromFields(24, PRODUCTION_STUDY_MATERIALS.chippedRoadMarkingAsphalt({}));
    const chainmail = materialFromFields(24, PRODUCTION_STUDY_MATERIALS.interlockedChainmail({}));
    expect(Math.max(...solar.metallic.data)).toBeGreaterThan(0.75);
    expect(Math.max(...road.metallic.data)).toBe(0);
    expect(Math.max(...chainmail.metallic.data)).toBeGreaterThan(0.8);
  });
});
