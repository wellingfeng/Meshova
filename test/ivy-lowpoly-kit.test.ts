import { describe, expect, it } from "vitest";

import {
  buildLowPolyIvyKitParts,
  buildLowPolyIvyParts,
  length,
  triangleCount,
  type Mesh,
} from "../src/index.js";

function assertValid(mesh: Mesh): void {
  expect(mesh.positions.length).toBeGreaterThan(0);
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.uvs.length).toBe(mesh.positions.length);
  expect(mesh.indices.length % 3).toBe(0);
  for (const index of mesh.indices) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(mesh.positions.length);
  }
  for (const normal of mesh.normals) expect(length(normal)).toBeCloseTo(1, 3);
}

describe("VOL23 low-poly ivy study", () => {
  it("builds semantic stem and heart-lobed foliage parts", () => {
    const parts = buildLowPolyIvyParts({ seed: 23, form: "wall" });
    expect(parts[0]?.name).toBe("stem");
    expect(parts.some((part) => part.name === "leaves_mature")).toBe(true);
    expect(parts.filter((part) => part.name.startsWith("leaves")).every((part) => part.doubleSided)).toBe(true);
    for (const part of parts) assertValid(part.mesh);
  });

  it("is deterministic for the same recipe", () => {
    const a = buildLowPolyIvyParts({ seed: 41, form: "hanging", dryness: 0.3 });
    const b = buildLowPolyIvyParts({ seed: 41, form: "hanging", dryness: 0.3 });
    expect(b.map((part) => part.name)).toEqual(a.map((part) => part.name));
    expect(b.map((part) => part.mesh.positions)).toEqual(a.map((part) => part.mesh.positions));
  });

  it("reduces geometry across LOD levels", () => {
    const high = buildLowPolyIvyParts({ seed: 23, lod: 0 });
    const low = buildLowPolyIvyParts({ seed: 23, lod: 3 });
    const tris = (parts: ReturnType<typeof buildLowPolyIvyParts>) =>
      parts.reduce((total, part) => total + triangleCount(part.mesh), 0);
    expect(tris(low)).toBeLessThan(tris(high));
  });

  it("builds all five asset forms into one compact kit", () => {
    const parts = buildLowPolyIvyKitParts({ seed: 23, variants: 10, columns: 5, lod: 2 });
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const part of parts) assertValid(part.mesh);
    expect(parts[0]?.metadata?.kit).toBe(true);
  });
});
