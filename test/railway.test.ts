import { describe, expect, it } from "vitest";
import {
  buildRailwayParts,
  DEFAULT_RAILWAY,
  railwayBallast,
  railwaySleepers,
  railwayRails,
  railwayTrack,
  STANDARD_GAUGE,
  polyline,
  vec3,
  bounds,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

const straight = polyline([vec3(0, 0, -10), vec3(0, 0, 10)]);

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("railway geometry kit", () => {
  it("ballast sweeps a trapezoidal bed that drops below the centerline", () => {
    const m = railwayBallast(straight, { ballastHeight: 0.4 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // Top sits at y=0 (verticalOffset), prism drops by ballastHeight.
    expect(b.max.y).toBeCloseTo(0, 5);
    expect(b.min.y).toBeCloseTo(-0.4, 5);
    // Bottom is wider than the top (shoulder slope) -> spans past top half-width.
    expect(b.max.x).toBeGreaterThan(STANDARD_GAUGE / 2);
  });

  it("sleepers array multiple ties along the run", () => {
    const dense = railwaySleepers(straight, { sleeperSpacing: 0.6 });
    const sparse = railwaySleepers(straight, { sleeperSpacing: 2 });
    expect(triangleCount(dense)).toBeGreaterThan(0);
    // Tighter pitch -> more geometry.
    expect(triangleCount(dense)).toBeGreaterThan(triangleCount(sparse));
  });

  it("rails are two upright beams straddling the centerline at the gauge", () => {
    const m = railwayRails(straight, { gauge: STANDARD_GAUGE });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // Rails sit on top of the sleepers and rise by railHeight.
    expect(b.min.y).toBeGreaterThan(0.1);
    // Symmetric about the centerline, roughly at half the gauge.
    expect(b.max.x).toBeGreaterThan(STANDARD_GAUGE / 2 - 0.05);
    expect(b.min.x).toBeLessThan(-(STANDARD_GAUGE / 2 - 0.05));
  });

  it("wider gauge pushes the rails farther apart", () => {
    const narrow = bounds(railwayRails(straight, { gauge: 1.0 }));
    const wide = bounds(railwayRails(straight, { gauge: 1.6 }));
    expect(wide.max.x).toBeGreaterThan(narrow.max.x);
  });

  it("railwayTrack merges all three sub-meshes", () => {
    const track = railwayTrack(straight);
    const sum =
      triangleCount(railwayBallast(straight)) +
      triangleCount(railwaySleepers(straight)) +
      triangleCount(railwayRails(straight));
    expect(triangleCount(track)).toBe(sum);
  });

  it("buildRailwayParts returns ballast/sleepers/rails as separate parts", () => {
    const parts = buildRailwayParts();
    expect(parts.map((p) => p.name)).toEqual(["ballast", "sleepers", "rails"]);
    expect(triangleCount(mergedMesh(parts))).toBeGreaterThan(0);
  });

  it("is deterministic: same params -> identical mesh", () => {
    const a = mergedMesh(buildRailwayParts(DEFAULT_RAILWAY));
    const b = mergedMesh(buildRailwayParts(DEFAULT_RAILWAY));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});
