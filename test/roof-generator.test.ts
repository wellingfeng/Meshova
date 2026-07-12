import { describe, expect, it } from "vitest";
import {
  ROOF_GENERATOR_DEFAULTS,
  buildRoofGeneratorMesh,
  buildRoofGeneratorParts,
  bounds,
  merge,
  triangleCount,
  type NamedPart,
  type RoofGeneratorStyle,
} from "../src/index.js";

function merged(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("roof generator", () => {
  it("builds semantic roof grammar parts", () => {
    const parts = buildRoofGeneratorParts({ style: "crossGable", dormers: 2, chimney: true, rafters: true });
    const names = parts.map((p) => p.name);
    expect(names).toContain("walls");
    expect(names).toContain("roof_planes");
    expect(names).toContain("ridge_caps");
    expect(names).toContain("roof_valleys");
    expect(names).toContain("dormer_walls");
    expect(names).toContain("dormer_roofs");
    expect(names).toContain("chimney");
    expect(names).toContain("rafters");
    for (const part of parts) expect(triangleCount(part.mesh)).toBeGreaterThan(0);
  });

  it("supports six roof styles", () => {
    const styles: RoofGeneratorStyle[] = ["gable", "hip", "crossGable", "mansard", "shed", "butterfly"];
    const triCounts = styles.map((style) => triangleCount(buildRoofGeneratorMesh({ style })));
    expect(triCounts.every((n) => n > 0)).toBe(true);
    expect(new Set(triCounts).size).toBeGreaterThan(3);
  });

  it("overhang makes roof wider than wall footprint", () => {
    const width = 4;
    const depth = 3;
    const parts = buildRoofGeneratorParts({ width, depth, overhang: 0.4, dormers: 0, chimney: false, rafters: false });
    const walls = bounds(parts.find((p) => p.name === "walls")!.mesh);
    const roof = bounds(parts.find((p) => p.name === "roof_planes")!.mesh);
    expect(roof.max.x - roof.min.x).toBeGreaterThan(walls.max.x - walls.min.x);
    expect(roof.max.z - roof.min.z).toBeGreaterThan(walls.max.z - walls.min.z);
  });

  it("roofHeight changes silhouette height without moving footprint", () => {
    const low = bounds(buildRoofGeneratorMesh({ style: "hip", roofHeight: 0.5 }));
    const high = bounds(buildRoofGeneratorMesh({ style: "hip", roofHeight: 1.6 }));
    expect(high.max.y).toBeGreaterThan(low.max.y);
    expect(high.max.x - high.min.x).toBeCloseTo(low.max.x - low.min.x, 4);
    expect(high.max.z - high.min.z).toBeCloseTo(low.max.z - low.min.z, 4);
  });

  it("is deterministic for same seed", () => {
    const a = merged(buildRoofGeneratorParts({ seed: 8, dormers: 3, chimney: true }));
    const b = merged(buildRoofGeneratorParts({ seed: 8, dormers: 3, chimney: true }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("seed changes chimney placement only when chimney is enabled", () => {
    const a = buildRoofGeneratorParts({ seed: 2, chimney: true }).find((p) => p.name === "chimney")!.mesh;
    const b = buildRoofGeneratorParts({ seed: 3, chimney: true }).find((p) => p.name === "chimney")!.mesh;
    expect(a.positions).not.toEqual(b.positions);

    const off = buildRoofGeneratorParts({ chimney: false }).map((p) => p.name);
    expect(off).not.toContain("chimney");
  });

  it("keeps defaults practical", () => {
    expect(ROOF_GENERATOR_DEFAULTS.width).toBeGreaterThan(ROOF_GENERATOR_DEFAULTS.depth);
    expect(ROOF_GENERATOR_DEFAULTS.overhang).toBeGreaterThan(0);
  });
});
