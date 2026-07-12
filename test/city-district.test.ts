import { describe, expect, it } from "vitest";
import {
  buildCityDistrictParts,
  CITY_DISTRICT_DEFAULTS,
  bounds,
  critique,
  foliageMetrics,
  merge,
  triangleCount,
  zFightingReport,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

function allPartsValid(parts: NamedPart[]) {
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts) {
    expect(triangleCount(part.mesh), `${part.name} has triangles`).toBeGreaterThan(0);
    expect(part.mesh.positions.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))).toBe(true);
  }
}

describe("city district generator", () => {
  it("defaults to a multi-block district, not a tiny block", () => {
    expect(CITY_DISTRICT_DEFAULTS.blocksX).toBeGreaterThanOrEqual(4);
    expect(CITY_DISTRICT_DEFAULTS.blocksZ).toBeGreaterThanOrEqual(3);
    expect(CITY_DISTRICT_DEFAULTS.streetFurniture).toBe(true);
    expect(CITY_DISTRICT_DEFAULTS.crosswalks).toBe(true);
  });

  it("builds streets, blocks, courtyards, crosswalks and sidewalk props", () => {
    const parts = buildCityDistrictParts({
      blocksX: 2,
      blocksZ: 2,
      blockX: 26,
      blockZ: 20,
      streetFurniture: true,
      streetTrees: true,
      crosswalks: true,
      seed: 9,
    });
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("street_asphalt");
    expect(names).toContain("sidewalks");
    expect(names).toContain("curbs");
    expect(names).toContain("crosswalks");
    expect(names).toContain("courtyards");
    expect(names.some((n) => n.startsWith("street_tree_"))).toBe(true);
    expect(names.some((n) => n.startsWith("street_lamp_"))).toBe(true);
  });

  it("scales footprint with district dimensions", () => {
    const small = bounds(mergedMesh(buildCityDistrictParts({
      blocksX: 1,
      blocksZ: 1,
      streetFurniture: false,
      streetTrees: false,
      crosswalks: false,
    })));
    const large = bounds(mergedMesh(buildCityDistrictParts({
      blocksX: 3,
      blocksZ: 2,
      streetFurniture: false,
      streetTrees: false,
      crosswalks: false,
    })));
    expect(large.max.x - large.min.x).toBeGreaterThan(small.max.x - small.min.x);
    expect(large.max.z - large.min.z).toBeGreaterThan(small.max.z - small.min.z);
  });

  it("is deterministic for same params and seed", () => {
    const opts = {
      blocksX: 2,
      blocksZ: 2,
      streetFurniture: true,
      streetTrees: true,
      crosswalks: true,
      seed: 17,
    };
    const a = mergedMesh(buildCityDistrictParts(opts));
    const b = mergedMesh(buildCityDistrictParts(opts));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("keeps road edges and building layers free of z-fighting", () => {
    const parts = buildCityDistrictParts({
      blocksX: 1,
      blocksZ: 1,
      streetFurniture: false,
      streetTrees: false,
      crosswalks: false,
    });
    const report = zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: 100000,
    });

    expect(report.truncated).toBe(false);
    expect(report.pairs).toBe(0);
  });

  it("keeps dense sidewalk furniture free of z-fighting", () => {
    const parts = buildCityDistrictParts({ blocksX: 3, blocksZ: 3, seed: 42 });
    const report = zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });

    expect(report.truncated).toBe(false);
    expect(report.pairs).toBe(0);
  });

  it("keeps district self-review free of street-tree hard failures", () => {
    const parts = buildCityDistrictParts({
      blocksX: 2,
      blocksZ: 2,
      blockX: 26,
      blockZ: 20,
      streetFurniture: true,
      streetTrees: true,
      crosswalks: true,
      seed: 9,
    });
    const canopy = parts.find((p) => p.name === "street_tree_canopy");
    expect(canopy).toBeDefined();
    expect(foliageMetrics(canopy!.mesh).blobRatio).toBe(0);

    const report = critique(parts, { goal: "city district settlement" });
    const findings = report.issues.map((i) => i.finding).join(" ");
    const streetTreeIssues = report.issues.filter((i) =>
      (i.part ?? "").includes("street_tree") || /green balls|overlap road/.test(i.finding),
    );
    expect(streetTreeIssues).toHaveLength(0);
    expect(findings).not.toMatch(/green balls|street_tree_soil\/curbs|overlap road/);
  });
});
