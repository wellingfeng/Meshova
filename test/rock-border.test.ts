import { describe, expect, it } from "vitest";
import {
  bounds,
  buildRockBorder,
  buildRockBorderSceneParts,
  polyline,
  triangleCount,
  vec3,
} from "../src/index.js";

describe("rock border", () => {
  const openBoundary = polyline([
    vec3(-3, 1, 0),
    vec3(0, 1.2, 1),
    vec3(3, 1, 0),
  ]);

  it("builds tangent-aligned descending rock tiers", () => {
    const result = buildRockBorder(openBoundary, { seed: 4, spacing: 0.8, tiers: 3, side: "left" });
    expect(result.placements.length).toBeGreaterThan(result.sampledBoundary.points.length * 2);
    expect(triangleCount(result.mesh)).toBeGreaterThan(0);
    expect(result.placements.some((placement) => placement.tier === 2)).toBe(true);
    expect(result.placements.every((placement) => Number.isFinite(placement.rotation.y))).toBe(true);
  });

  it("seals the border with a continuous backing cliff", () => {
    const result = buildRockBorder(openBoundary, { seed: 14, spacing: 0.8, tiers: 3, side: "left" });
    expect(triangleCount(result.backingMesh)).toBeGreaterThan(0);
    expect(triangleCount(result.moduleMesh)).toBeGreaterThan(0);
    expect(triangleCount(result.mesh)).toBe(
      triangleCount(result.backingMesh) + triangleCount(result.moduleMesh),
    );
    const backingBounds = bounds(result.backingMesh);
    expect(backingBounds.max.x).toBeGreaterThanOrEqual(2.9);
    expect(backingBounds.min.x).toBeLessThanOrEqual(-2.9);
    expect(backingBounds.min.y).toBeLessThan(0);
  });

  it("overlaps adjacent modules and varies their silhouettes", () => {
    const result = buildRockBorder(openBoundary, { seed: 18, spacing: 0.65, tiers: 2, side: "left" });
    const topTier = result.placements.filter((placement) => placement.tier === 0);
    for (let index = 0; index < topTier.length - 1; index++) {
      const current = topTier[index]!;
      const next = topTier[index + 1]!;
      const distance = Math.hypot(
        next.position.x - current.position.x,
        next.position.z - current.position.z,
      );
      expect((current.coverage + next.coverage) * 0.5).toBeGreaterThanOrEqual(distance);
    }
    expect(new Set(result.placements.map((placement) => placement.archetype)).size).toBeGreaterThan(2);
  });

  it("staggers descending tiers instead of forming repeated columns", () => {
    const result = buildRockBorder(openBoundary, { seed: 22, spacing: 0.8, tiers: 2, jitter: 0 });
    const topArcPositions = result.placements
      .filter((placement) => placement.tier === 0)
      .map((placement) => placement.arcPosition.toFixed(4));
    const lowerArcPositions = result.placements
      .filter((placement) => placement.tier === 1)
      .map((placement) => placement.arcPosition.toFixed(4));
    expect(lowerArcPositions).not.toEqual(topArcPositions);
    expect(lowerArcPositions.slice(1, -1).some((position) => !topArcPositions.includes(position))).toBe(true);
  });

  it("supports closed, double-sided borders", () => {
    const loop = polyline([
      vec3(-2, 1, -2),
      vec3(2, 1, -2),
      vec3(2, 1, 2),
      vec3(-2, 1, 2),
    ], true);
    const result = buildRockBorder(loop, { seed: 9, spacing: 1, tiers: 2, side: "both" });
    expect(result.placements.length).toBeGreaterThan(result.sampledBoundary.points.length * 3);
    expect(result.placements.some((placement) => placement.side === "left")).toBe(true);
    expect(result.placements.some((placement) => placement.side === "right")).toBe(true);
  });

  it("is deterministic", () => {
    const first = buildRockBorder(openBoundary, { seed: 27, tiers: 2 });
    const second = buildRockBorder(openBoundary, { seed: 27, tiers: 2 });
    expect(first.mesh.positions).toEqual(second.mesh.positions);
    expect(first.placements).toEqual(second.placements);
  });

  it("anchors top rows below their boundary", () => {
    const result = buildRockBorder(openBoundary, { seed: 3, tiers: 2, anchor: "top" });
    const meshBounds = bounds(result.mesh);
    expect(meshBounds.max.y).toBeLessThanOrEqual(1.35);
    expect(meshBounds.min.y).toBeLessThan(0.5);
  });
});

describe("rock border scenes", () => {
  for (const preset of ["river-gorge", "crater-lake", "mesa-rim"] as const) {
    it(`builds ${preset}`, () => {
      const parts = buildRockBorderSceneParts({ preset, seed: 12, spacing: 1.1, tiers: 2 });
      const border = parts.find((part) => part.name.includes("border"));
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(border).toBeDefined();
      expect(triangleCount(border!.mesh)).toBeGreaterThan(100);
      expect(Number(border!.metadata?.placementCount)).toBeGreaterThan(10);
    });
  }
});
