import { describe, expect, it } from "vitest";
import { buildPcgRockClusterParts, type Mesh } from "../src/index.js";

function expectValidMesh(mesh: Mesh): void {
  expect(mesh.positions.length).toBeGreaterThan(0);
  expect(mesh.normals).toHaveLength(mesh.positions.length);
  expect(mesh.uvs).toHaveLength(mesh.positions.length);
  expect(mesh.indices.length % 3).toBe(0);
  for (const index of mesh.indices) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(mesh.positions.length);
  }
}

describe("PCG rock cluster", () => {
  it("builds semantic ground, hero, secondary, and debris parts", () => {
    const parts = buildPcgRockClusterParts({ clusterCount: 2, rocksPerCluster: 8 });
    expect(parts.map((part) => part.name)).toEqual([
      "ground",
      "hero_rocks",
      "secondary_rocks",
      "debris_ring",
    ]);
    expect(parts.map((part) => part.label)).toEqual([
      "土壤地面",
      "群落主石",
      "伴生石块",
      "环形碎石",
    ]);
    for (const part of parts) expectValidMesh(part.mesh);
  });

  it("is deterministic for the same seed", () => {
    const options = { seed: 23, clusterCount: 3, rocksPerCluster: 10, includeGround: false };
    const first = buildPcgRockClusterParts(options);
    const second = buildPcgRockClusterParts(options);
    expect(second.map((part) => part.mesh.positions)).toEqual(first.map((part) => part.mesh.positions));
  });

  it("changes placement when the seed changes", () => {
    const first = buildPcgRockClusterParts({ seed: 1, clusterCount: 2, rocksPerCluster: 8, includeGround: false });
    const second = buildPcgRockClusterParts({ seed: 2, clusterCount: 2, rocksPerCluster: 8, includeGround: false });
    expect(second[0]!.mesh.positions).not.toEqual(first[0]!.mesh.positions);
  });

  it("rests every rock on or above the ground plane", () => {
    const parts = buildPcgRockClusterParts({ seed: 9, clusterCount: 2, rocksPerCluster: 8, includeGround: false });
    for (const part of parts) {
      expect(Math.min(...part.mesh.positions.map((position) => position.y))).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});
