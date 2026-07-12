import { describe, expect, it } from "vitest";
import {
  buildPcgSuite,
  buildPcgSuiteParts,
  summarizePcgSuite,
  zFightingReport,
  type NamedPart,
} from "../src/index.js";

const FAST_PARAMS = {
  seed: 9,
  size: 32,
  terrainResolution: 28,
  forestCandidates: 70,
  forestSpacing: 3.8,
  snowPatches: 14,
  buildingCount: 3,
  includeInterior: true,
  includeTrench: true,
};

function allFinite(parts: NamedPart[]): boolean {
  for (const part of parts) {
    for (const v of part.mesh.positions) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return false;
    }
  }
  return true;
}

describe("pcg suite", () => {
  it("builds the full PCG learning scene with all four flow kinds", () => {
    const suite = buildPcgSuite(FAST_PARAMS);
    const names = new Set(suite.parts.map((p) => p.name));
    expect(names.has("terrain")).toBe(true);
    expect(names.has("road_surface")).toBe(true);
    expect(names.has("sidewalk_left")).toBe(true);
    expect(names.has("forest_trunks")).toBe(true);
    expect(names.has("trench_sandbags")).toBe(true);
    expect([...names].some((n) => n.startsWith("building_0_"))).toBe(true);
    expect([...names].some((n) => n.startsWith("interior_"))).toBe(true);

    const kinds = new Set(suite.flows.map((f) => f.kind));
    expect(kinds).toEqual(new Set(["environment", "spline", "point", "instance"]));
    for (const flow of suite.flows) {
      expect(flow.input).toBeGreaterThan(0);
      expect(flow.output).toBeGreaterThan(0);
      expect(flow.operators.length).toBeGreaterThan(1);
    }
    expect(allFinite(suite.parts)).toBe(true);
  });

  it("exposes parts-only helper for viewer/example parity", () => {
    const parts = buildPcgSuiteParts({ ...FAST_PARAMS, includeInterior: false });
    expect(parts.length).toBeGreaterThan(8);
    expect(parts.some((p) => p.name === "road_lane_lines")).toBe(true);
    expect(parts.some((p) => p.name.startsWith("interior_"))).toBe(false);
    expect(zFightingReport(parts, {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    }).pairs).toBe(0);
  });

  it("is deterministic by summary for a fixed seed", () => {
    const a = summarizePcgSuite(buildPcgSuite(FAST_PARAMS));
    const b = summarizePcgSuite(buildPcgSuite(FAST_PARAMS));
    expect(a).toEqual(b);
    expect(a.vertexCount).toBeGreaterThan(1000);
    expect(a.triangleCount).toBeGreaterThan(1000);
  });
});
