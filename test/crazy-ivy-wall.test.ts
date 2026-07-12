import { describe, expect, it } from "vitest";

import {
  buildCrazyIvyWallParts,
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
}

describe("Crazy Ivy wall reference reproduction", () => {
  it("builds semantic wall, stem, and ivy leaf parts", () => {
    const parts = buildCrazyIvyWallParts({ seed: 45, width: 4, height: 2.5, lod: 3 });
    expect(parts.some((part) => part.name === "wall_body")).toBe(true);
    expect(parts.some((part) => part.name === "ivy_stem")).toBe(true);
    expect(parts.some((part) => part.name === "ivy_leaves_mature")).toBe(true);
    expect(parts.every((part) => Boolean(part.label))).toBe(true);
    for (const part of parts) assertValid(part.mesh);
  });

  it("is deterministic for the same recipe", () => {
    const options = { seed: 81, width: 3, height: 2, coverage: 0.5, lod: 3 } as const;
    const a = buildCrazyIvyWallParts(options);
    const b = buildCrazyIvyWallParts(options);
    expect(b.map((part) => part.name)).toEqual(a.map((part) => part.name));
    expect(b.map((part) => part.mesh.positions)).toEqual(a.map((part) => part.mesh.positions));
  });

  it("adds more geometry as coverage increases", () => {
    const sparse = buildCrazyIvyWallParts({ seed: 12, width: 4, height: 2.5, coverage: 0.2, hanging: 0, lod: 3 });
    const lush = buildCrazyIvyWallParts({ seed: 12, width: 4, height: 2.5, coverage: 1.1, hanging: 0.7, lod: 3 });
    const tris = (parts: ReturnType<typeof buildCrazyIvyWallParts>) =>
      parts.reduce((total, part) => total + triangleCount(part.mesh), 0);
    expect(tris(lush)).toBeGreaterThan(tris(sparse));
  });

  it("supports the red autumn species shown in the reference", () => {
    const green = buildCrazyIvyWallParts({ width: 3, height: 2, autumn: 0, lod: 3 });
    const red = buildCrazyIvyWallParts({ width: 3, height: 2, autumn: 1, lod: 3 });
    const mature = (parts: ReturnType<typeof buildCrazyIvyWallParts>) =>
      parts.find((part) => part.name === "ivy_leaves_mature")!.color!;
    expect(mature(red)[0]).toBeGreaterThan(mature(green)[0]);
    expect(mature(red)[1]).toBeLessThan(mature(green)[1]);
  });
});
