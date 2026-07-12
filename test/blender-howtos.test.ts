import { describe, expect, it } from "vitest";
import {
  bounds,
  buildBlenderHowtosShowcaseParts,
  buildDnaHelixParts,
  buildGradientBoxParts,
  buildRainingGardenParts,
  buildSpiralScalesParts,
  summarizeBlenderHowtos,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: readonly NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

function part(parts: readonly NamedPart[], name: string): NamedPart {
  const found = parts.find((p) => p.name === name);
  expect(found).toBeTruthy();
  return found!;
}

describe("BlenderHowtos cookbook models", () => {
  it("builds the four clean-room Geometry Nodes patterns", () => {
    const parts = buildBlenderHowtosShowcaseParts({ seed: 12, scale: 0.8 });
    const summary = summarizeBlenderHowtos(parts);
    expect(summary.categories.spiralScales).toBeGreaterThanOrEqual(2);
    expect(summary.categories.dnaHelix).toBeGreaterThanOrEqual(3);
    expect(summary.categories.gradientBox).toBeGreaterThanOrEqual(1);
    expect(summary.categories.rainingGarden).toBeGreaterThanOrEqual(5);
    expect(summary.vertexCount).toBeGreaterThan(1000);
    expect(summary.triangleCount).toBeGreaterThan(1000);
    expect(allFinite(parts)).toBe(true);
  });

  it("uses scale count to grow the spiral scale field", () => {
    const low = buildSpiralScalesParts({ count: 12 });
    const high = buildSpiralScalesParts({ count: 40 });
    expect(triangleCount(part(high, "spiral_scale_tiles").mesh)).toBeGreaterThan(
      triangleCount(part(low, "spiral_scale_tiles").mesh),
    );
    expect(vertexCount(part(high, "spiral_center_stem").mesh)).toBeGreaterThan(0);
    expect(part(high, "spiral_scale_tiles").surface?.type).toBe("stylizedFoliage");
  });

  it("uses pair count to grow DNA beads and cross rungs", () => {
    const low = buildDnaHelixParts({ pairs: 8 });
    const high = buildDnaHelixParts({ pairs: 24 });
    expect(vertexCount(part(high, "dna_cross_rungs").mesh)).toBeGreaterThan(
      vertexCount(part(low, "dna_cross_rungs").mesh),
    );
    expect(triangleCount(part(high, "dna_strand_a").mesh)).toBeGreaterThan(
      triangleCount(part(low, "dna_strand_a").mesh),
    );
  });

  it("bakes a gradient box array with per-vertex colors", () => {
    const parts = buildGradientBoxParts({
      cols: 4,
      rows: 3,
      minHeight: 0.2,
      maxHeight: 1.1,
      ripple: 0,
    });
    const gradient = part(parts, "gradient_box_field");
    expect(vertexCount(gradient.mesh)).toBe(4 * 3 * 24);
    expect(gradient.colors?.length).toBe(vertexCount(gradient.mesh) * 3);
    const bb = bounds(gradient.mesh);
    expect(bb.min.y).toBeCloseTo(0, 6);
    expect(bb.max.y).toBeLessThanOrEqual(1.1 + 1e-6);
  });

  it("builds deterministic raining garden scatter from seed", () => {
    const a = buildRainingGardenParts({
      seed: 7,
      grassCount: 18,
      flowerCount: 5,
      rainCount: 8,
    });
    const b = buildRainingGardenParts({
      seed: 7,
      grassCount: 18,
      flowerCount: 5,
      rainCount: 8,
    });
    const c = buildRainingGardenParts({
      seed: 8,
      grassCount: 18,
      flowerCount: 5,
      rainCount: 8,
    });
    expect(part(a, "garden_grass").mesh.positions).toEqual(part(b, "garden_grass").mesh.positions);
    expect(part(a, "garden_grass").mesh.positions).not.toEqual(part(c, "garden_grass").mesh.positions);
    expect(vertexCount(part(a, "rain_streaks").mesh)).toBeGreaterThan(0);
    expect(part(a, "rain_streaks").surface?.type).toBe("liquid");
  });
});
