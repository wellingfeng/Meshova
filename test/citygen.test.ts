import { describe, expect, it } from "vitest";
import {
  buildCitygenParts,
  critique,
  generateCitygenRoads,
  bounds,
  merge,
  triangleCount,
  type CitygenParams,
  type NamedPart,
} from "../src/index.js";
import { zFightingReport } from "../src/critique/geometry-metrics.js";

function allPartsValid(parts: NamedPart[]) {
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts) {
    expect(triangleCount(part.mesh), `${part.name} has triangles`).toBeGreaterThan(0);
    expect(part.mesh.positions.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))).toBe(true);
  }
}

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("CityGen-style generator", () => {
  it("grows deterministic highway + local-road segments", () => {
    const opts = { preset: "roadGrowth" as const, seed: 5, segmentLimit: 70 };
    const a = generateCitygenRoads(opts);
    const b = generateCitygenRoads(opts);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(12);
    expect(a.some((s) => s.highway)).toBe(true);
    expect(a.some((s) => !s.highway)).toBe(true);
  });

  it("builds a road-growth model without building parts", () => {
    const parts = buildCitygenParts({ preset: "roadGrowth", seed: 7, segmentLimit: 60 });
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("citygen_highways");
    expect(names).toContain("citygen_streets");
    expect(names).toContain("citygen_road_markings");
    expect(names.some((n) => n.startsWith("citygen_building_"))).toBe(false);
  });

  it("only adds junction patches where at least three road arms meet", () => {
    const params = { preset: "roadGrowth" as const, seed: 7, segmentLimit: 60 };
    const roads = generateCitygenRoads(params);
    const intersections = buildCitygenParts(params).find((part) => part.name === "citygen_intersections")!;
    expect(triangleCount(intersections.mesh)).toBeLessThan(roads.length * 10);
  });

  it("places residential buildings and street props beside roads", () => {
    const parts = buildCitygenParts({
      preset: "residential",
      seed: 12,
      segmentLimit: 80,
      buildings: 24,
      streetProps: true,
    });
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("citygen_sidewalks");
    expect(names.some((n) => n.startsWith("citygen_building_"))).toBe(true);
    expect(names.some((n) => n.startsWith("citygen_tree_"))).toBe(true);
    const instanced = parts.filter((part) => part.renderInstances);
    expect(instanced.length).toBeGreaterThan(0);
    expect(instanced.some((part) => (part.renderInstances?.transforms.length ?? 0) > 20)).toBe(true);
  });

  it("keeps same seed output stable", () => {
    const opts: Partial<CitygenParams> = {
      preset: "downtown",
      seed: 19,
      segmentLimit: 64,
      buildings: 18,
      streetProps: false,
    };
    const a = mergedMesh(buildCitygenParts(opts));
    const b = mergedMesh(buildCitygenParts(opts));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("scales visible footprint with radius", () => {
    const small = bounds(mergedMesh(buildCitygenParts({
      preset: "roadGrowth",
      radius: 58,
      segmentLimit: 44,
      seed: 21,
    })));
    const large = bounds(mergedMesh(buildCitygenParts({
      preset: "roadGrowth",
      radius: 100,
      segmentLimit: 80,
      seed: 21,
    })));
    expect(large.max.x - large.min.x).toBeGreaterThan(small.max.x - small.min.x);
    expect(large.max.z - large.min.z).toBeGreaterThan(small.max.z - small.min.z);
  });

  it("keeps CityGen road-growth intersections free of z-fighting", () => {
    const parts = buildCitygenParts({
      preset: "roadGrowth",
      radius: 94,
      segmentLimit: 100,
      branchProbability: 0.59,
      snapDistance: 5.6,
      populationThreshold: 0.16,
      seed: 17,
    });
    expect(zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    }).pairs).toBe(0);
  });

  it("keeps downtown buildings clear of road geometry", () => {
    const parts = buildCitygenParts({
      preset: "downtown",
      radius: 95,
      segmentLimit: 100,
      branchProbability: 0.4,
      snapDistance: 5.2,
      populationThreshold: 0.14,
      buildings: 28,
      heightScale: 0.65,
      streetProps: true,
      seed: 41,
    });
    const report = critique(parts, { goal: "city settlement" });
    const findings = report.issues.map((i) => i.finding).join(" ");
    expect(findings).not.toMatch(/overlap road/);
    expect(zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    }).pairs).toBe(0);
  });
});
