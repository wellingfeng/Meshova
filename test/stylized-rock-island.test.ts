import { describe, expect, it } from "vitest";
import { bounds, buildStylizedRockIslandParts, triangleCount } from "../src/index.js";

describe("stylized rock island", () => {
  it("builds semantic cliff, underside, terrace, and grass layers", () => {
    const parts = buildStylizedRockIslandParts();
    expect(parts.map((part) => part.name)).toEqual([
      "cliff_faces",
      "recessed_rock",
      "underside_spires",
      "terrace_rocks",
      "grass_caps",
    ]);
    expect(parts.every((part) => part.label && triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("is deterministic for one seed", () => {
    const first = buildStylizedRockIslandParts({ seed: 27 });
    const second = buildStylizedRockIslandParts({ seed: 27 });
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("forms a broad top over a tapered floating underside", () => {
    const parts = buildStylizedRockIslandParts({ size: 7, cliffHeight: 4 });
    const cliff = bounds(parts.find((part) => part.name === "cliff_faces")!.mesh);
    const underside = bounds(parts.find((part) => part.name === "underside_spires")!.mesh);
    const grass = bounds(parts.find((part) => part.name === "grass_caps")!.mesh);
    expect(cliff.max.x - cliff.min.x).toBeGreaterThan(6);
    expect(underside.min.y).toBeLessThan(cliff.min.y);
    expect(grass.max.y).toBeGreaterThan(cliff.max.y - 0.25);
  });

  it("changes topology with chunk density", () => {
    const sparse = buildStylizedRockIslandParts({ chunksPerSide: 4 });
    const dense = buildStylizedRockIslandParts({ chunksPerSide: 12 });
    expect(triangleCount(dense[0]!.mesh)).toBeGreaterThan(triangleCount(sparse[0]!.mesh));
  });
});
