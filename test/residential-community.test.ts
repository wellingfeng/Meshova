import { describe, expect, it } from "vitest";
import {
  bounds,
  buildResidentialCommunityParts,
  generateResidentialCommunityGrammar,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function expectValid(parts: NamedPart[]): void {
  expect(parts.length).toBeGreaterThan(20);
  for (const part of parts) {
    expect(part.label, `${part.name} needs semantic label`).toBeTruthy();
    expect(triangleCount(part.mesh), `${part.name} needs triangles`).toBeGreaterThan(0);
    expect(part.mesh.positions.every((point) => (
      Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
    ))).toBe(true);
  }
}

describe("residential community assembly grammar", () => {
  it("creates deterministic semantic layout", () => {
    const a = generateResidentialCommunityGrammar({ seed: 19 });
    const b = generateResidentialCommunityGrammar({ seed: 19 });
    expect(a).toEqual(b);
    expect(a.placements.some((item) => item.kind === "entrance")).toBe(true);
    expect(a.placements.some((item) => item.kind === "freeway")).toBe(true);
    expect(a.placements.filter((item) => item.kind === "tower")).toHaveLength(8);
    expect(a.placements.filter((item) => item.kind === "wall").length).toBeGreaterThan(50);
    expect(a.rules).toHaveLength(5);
  });

  it("builds complete materialed community", () => {
    const parts = buildResidentialCommunityParts({ seed: 23, treeDensity: 0.35 });
    expectValid(parts);
    const names = parts.map((part) => part.name);
    expect(names).toContain("community_ground");
    expect(names).toContain("community_roads");
    expect(names).toContain("community_gate_canopy");
    expect(names).toContain("community_clubhouse");
    expect(names).toContain("community_playground_floor");
    expect(names).toContain("community_parking_pad");
    expect(names.some((name) => name.startsWith("community_freeway_"))).toBe(true);
    expect(parts.every((part) => part.surface)).toBe(true);
  });

  it("removes freeway without changing community core", () => {
    const parts = buildResidentialCommunityParts({ includeFreeway: false, treeDensity: 0 });
    expectValid(parts);
    expect(parts.some((part) => part.name.startsWith("community_freeway_"))).toBe(false);
    expect(parts.some((part) => part.name.startsWith("community_tower_"))).toBe(true);
  });

  it("spans site and external elevated freeway", () => {
    const mesh = merge(...buildResidentialCommunityParts({
      siteWidth: 100,
      siteDepth: 76,
      treeDensity: 0.2,
      freewayElevation: 9,
    }).map((part) => part.mesh));
    const box = bounds(mesh);
    expect(box.max.x - box.min.x).toBeGreaterThan(120);
    expect(box.max.z - box.min.z).toBeGreaterThan(90);
    expect(box.max.y).toBeGreaterThan(15);
  });
});
