import { describe, expect, it } from "vitest";
import {
  bounds,
  buildGradationalCrystalMesh,
  buildGradationalCrystalParts,
  meshMetrics,
  toViewerModel,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function part(parts: readonly NamedPart[], name: string): NamedPart {
  const found = parts.find((candidate) => candidate.name === name);
  expect(found).toBeTruthy();
  return found!;
}

describe("gradational crystal", () => {
  it("builds a closed hard-faceted crystal with a pointed crown", () => {
    const mesh = buildGradationalCrystalMesh({ sides: 6, height: 3, radius: 0.5, seed: 4 });
    const bb = bounds(mesh);
    expect(bb.min.y).toBeCloseTo(0, 6);
    expect(bb.max.y).toBeCloseTo(3, 6);
    expect(triangleCount(mesh)).toBe(6 * 6);
    expect(meshMetrics(mesh).watertight).toBe(true);
    expect(new Set(mesh.normals.map((normal) => `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)}`)).size)
      .toBeGreaterThanOrEqual(12);
  });

  it("uses count to grow deterministic inner and outer crystal rings", () => {
    const low = buildGradationalCrystalParts({ count: 5, seed: 12 });
    const high = buildGradationalCrystalParts({ count: 21, seed: 12 });
    expect(high.map((candidate) => candidate.name)).toEqual([
      "crystal_base",
      "hero_crystal",
      "inner_crystals",
      "outer_crystals",
    ]);
    expect(triangleCount(part(high, "inner_crystals").mesh))
      .toBeGreaterThan(triangleCount(part(low, "inner_crystals").mesh));
    expect(triangleCount(part(high, "outer_crystals").mesh))
      .toBeGreaterThan(triangleCount(part(low, "outer_crystals").mesh));
    expect(high).toEqual(buildGradationalCrystalParts({ count: 21, seed: 12 }));
  });

  it("exports semantic labels, gradients and physical gem refs", () => {
    const parts = buildGradationalCrystalParts({ count: 9, hueShift: 80, ior: 1.8, dispersion: 2.5 });
    const hero = part(parts, "hero_crystal");
    expect(hero.label).toBe("主渐变晶柱");
    expect(hero.colors).toHaveLength(hero.mesh.positions.length * 3);
    expect(new Set(hero.colors!.map((value) => value.toFixed(3))).size).toBeGreaterThan(12);
    expect(hero.surface).toMatchObject({
      type: "gem",
      params: { ior: 1.8, dispersion: 2.5 },
    });
    const viewerHero = toViewerModel(parts, "crystal").parts.find((candidate) => candidate.name === "hero_crystal");
    expect(viewerHero?.label).toBe("主渐变晶柱");
    expect(viewerHero?.colors).toHaveLength(viewerHero!.positions.length);
    expect(viewerHero?.surface?.type).toBe("gem");
  });
});
