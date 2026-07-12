import { describe, expect, it } from "vitest";
import {
  IMAGE_REMESH_DEFAULTS,
  buildImageRemeshParts,
  imageRemeshSites,
  sampleImageRemeshSource,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function part(parts: NamedPart[], name: string): NamedPart {
  return parts.find((p) => p.name === name)!;
}

describe("image remesh", () => {
  it("samples a procedural portrait image field", () => {
    const center = sampleImageRemeshSource(0.5, 0.56, "portrait");
    const corner = sampleImageRemeshSource(0.04, 0.04, "portrait");
    const eye = sampleImageRemeshSource(0.42, 0.57, "portrait");
    expect(center.value).toBeGreaterThan(corner.value);
    expect(eye.value).toBeGreaterThan(center.value);
  });

  it("selects deterministic density-biased sites", () => {
    const a = imageRemeshSites({ samples: 32, seed: 9 });
    const b = imageRemeshSites({ samples: 32, seed: 9 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    const avg = a.reduce((sum, s) => sum + s.value, 0) / a.length;
    expect(avg).toBeGreaterThan(0.25);
  });

  it("builds the full remeshing suite", () => {
    const parts = buildImageRemeshParts({ resolution: 8, samples: 24 });
    expect(parts.map((p) => p.name)).toEqual([
      "image_backing",
      "source_field",
      "voronoi_cells",
      "dot_poster",
      "density_triangles",
      "relief_field",
    ]);
    for (const p of parts) {
      expect(vertexCount(p.mesh)).toBeGreaterThan(0);
      expect(triangleCount(p.mesh)).toBeGreaterThan(0);
    }
  });

  it("can emit one requested remesh method", () => {
    const parts = buildImageRemeshParts({ mode: "dots", resolution: 6 });
    expect(parts.map((p) => p.name)).toEqual(["image_backing", "dot_poster"]);
  });

  it("keeps vertex colors aligned with generated mesh vertices", () => {
    const parts = buildImageRemeshParts({ mode: "relief", resolution: 8 });
    const relief = part(parts, "relief_field");
    expect(relief.colors).toHaveLength(vertexCount(relief.mesh) * 3);
  });

  it("defaults are practical for viewer use", () => {
    expect(IMAGE_REMESH_DEFAULTS.mode).toBe("suite");
    expect(IMAGE_REMESH_DEFAULTS.samples).toBeGreaterThanOrEqual(40);
    expect(IMAGE_REMESH_DEFAULTS.resolution).toBeGreaterThanOrEqual(12);
  });
});
