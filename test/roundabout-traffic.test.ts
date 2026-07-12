import { describe, expect, it } from "vitest";
import { bounds, buildRoundaboutTrafficParts, merge, zFightingReport } from "../src/index.js";

describe("roundabout traffic scene", () => {
  it("includes complete road furniture and multiple vehicle classes", () => {
    const parts = buildRoundaboutTrafficParts({ vehicleCount: 48, treeCount: 12, seed: 7 });
    const names = parts.map((part) => part.name);
    expect(names).toContain("road_asphalt");
    expect(names).toContain("crosswalks");
    expect(names).toContain("direction_arrows");
    expect(names).toContain("refuge_islands");
    expect(names).toContain("central_island");
    expect(names).toContain("lamp_posts");
    expect(names).toContain("traffic_signs");
    expect(names.some((name) => name.startsWith("vehicle_body_1_"))).toBe(true);
    expect(names.some((name) => name.startsWith("vehicle_body_2_"))).toBe(true);
    expect(names.some((name) => name.startsWith("vehicle_body_3_"))).toBe(true);
  });

  it("is deterministic and scales with arm length", () => {
    const options = { vehicleCount: 18, treeCount: 8, seed: 19 };
    const first = buildRoundaboutTrafficParts(options);
    const second = buildRoundaboutTrafficParts(options);
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));

    const compact = bounds(merge(...buildRoundaboutTrafficParts({ ...options, armLength: 28 }).map((part) => part.mesh)));
    const wide = bounds(merge(...buildRoundaboutTrafficParts({ ...options, armLength: 70 }).map((part) => part.mesh)));
    expect(wide.max.x - wide.min.x).toBeGreaterThan(compact.max.x - compact.min.x);
  });

  it("keeps road furniture layers free of z-fighting", () => {
    const report = zFightingReport(buildRoundaboutTrafficParts(), {
      includeSamePart: false,
      maxTriangles: Number.POSITIVE_INFINITY,
    });
    expect(report.pairs).toBe(0);
  });
});
