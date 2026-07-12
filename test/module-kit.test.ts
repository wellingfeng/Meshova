import { describe, expect, it } from "vitest";
import {
  JAPANESE_URBAN_KIT,
  buildJapaneseStreetBuildingParts,
  createJapaneseStreetSlots,
  isModuleCompatible,
  planModulePlacements,
  scoreJapaneseStreetBuilding,
  scoreModuleKitPlan,
  summarizeJapaneseStreetBuilding,
  bounds,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

describe("module-kit facade grammar", () => {
  it("creates semantic, human-readable slots", () => {
    const slots = createJapaneseStreetSlots({ floors: 4, width: 6, seed: 5 });
    expect(slots.length).toBeGreaterThan(10);
    expect(slots.some((s) => s.kind === "groundFacade")).toBe(true);
    expect(slots.some((s) => s.kind === "upperFacade")).toBe(true);
    for (const slot of slots) {
      expect(slot.label).not.toMatch(/^(root|component_|object_|mesh_|\d|.*\.\d+$)/i);
      expect(slot.id).toMatch(/front|roof/);
    }
  });

  it("plans compatible modules deterministically", () => {
    const slots = createJapaneseStreetSlots({ floors: 5, width: 7.2, seed: 17 });
    const a = planModulePlacements(slots, JAPANESE_URBAN_KIT, 123);
    const b = planModulePlacements(slots, JAPANESE_URBAN_KIT, 123);
    expect(a.map((p) => p.asset.id)).toEqual(b.map((p) => p.asset.id));
    for (const placement of a) {
      expect(isModuleCompatible(placement.asset, placement.slot)).toBe(true);
    }
    const score = scoreModuleKitPlan(slots, a);
    expect(score.score).toBeGreaterThan(0.95);
  });

  it("builds a finite Japanese street building with expected asset groups", () => {
    const parts = buildJapaneseStreetBuildingParts({
      floors: 5,
      width: 7.2,
      seed: 23,
      signDensity: 1,
      balconyDensity: 1,
      utilityDensity: 1,
      roofClutter: 1,
    });
    const names = parts.map((p) => p.name);
    expect(names).toContain("street_walls");
    expect(names).toContain("storefront_glass");
    expect(names).toContain("residential_windows");
    expect(names).toContain("shop_signs");
    expect(names).toContain("air_conditioners");
    expect(names).toContain("roof_service");
    expect(allFinite(parts)).toBe(true);
    expect(parts.reduce((sum, p) => sum + triangleCount(p.mesh), 0)).toBeGreaterThan(300);
    expect(scoreJapaneseStreetBuilding(parts).score).toBeGreaterThan(0.85);
  });

  it("floor count changes silhouette height", () => {
    const low = buildJapaneseStreetBuildingParts({ floors: 2, seed: 9 });
    const high = buildJapaneseStreetBuildingParts({ floors: 7, seed: 9 });
    const lowH = summarizeJapaneseStreetBuilding(low).height;
    const highH = summarizeJapaneseStreetBuilding(high).height;
    expect(highH).toBeGreaterThan(lowH + 3);
  });

  it("keeps facade modules proud of the wall shell", () => {
    const parts = buildJapaneseStreetBuildingParts({ signDensity: 1, seed: 33 });
    const wall = parts.find((p) => p.name === "street_walls")!;
    const signs = parts.find((p) => p.name === "shop_signs")!;
    expect(bounds(signs.mesh).max.z).toBeGreaterThan(bounds(wall.mesh).max.z);
  });
});
