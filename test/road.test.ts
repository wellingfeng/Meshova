import { describe, it, expect } from "vitest";
import {
  roadRibbon,
  roadCurbs,
  roadCenterLine,
  roadLaneLines,
  roadEdgeLines,
  polyline,
  bezier,
  bounds,
  triangleCount,
  vertexCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";

const straight = polyline([vec3(0, 0, -10), vec3(0, 0, 10)]);

describe("roadRibbon", () => {
  it("builds a non-empty mesh from a straight centerline", () => {
    const m = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2 });
    expect(vertexCount(m)).toBeGreaterThan(0);
    expect(triangleCount(m)).toBeGreaterThan(0);
    expect(m.indices.length % 3).toBe(0);
  });

  it("respects half-width in the mesh bounds", () => {
    const m = roadRibbon(straight, { halfWidth: 4, sampleDistance: 2 });
    const b = bounds(m);
    // Road runs along Z, so X extent is the full width (~2 * halfWidth).
    expect(b.max.x - b.min.x).toBeCloseTo(8, 1);
    expect(b.max.z - b.min.z).toBeCloseTo(20, 1);
  });

  it("is deterministic: same input yields identical vertex count", () => {
    const a = roadRibbon(straight, { halfWidth: 3, sampleDistance: 1 });
    const c = roadRibbon(straight, { halfWidth: 3, sampleDistance: 1 });
    expect(vertexCount(a)).toBe(vertexCount(c));
    expect(a.indices).toEqual(c.indices);
    expect(a.positions).toEqual(c.positions);
  });

  it("adds more geometry across the width with widthSubdivisions", () => {
    const coarse = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2, widthSubdivisions: 1 });
    const fine = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2, widthSubdivisions: 6 });
    expect(vertexCount(fine)).toBeGreaterThan(vertexCount(coarse));
  });

  it("inserts extra rings on curves when adaptive curvature is on", () => {
    const curve = bezier(vec3(0, 0, 0), vec3(10, 0, 0), vec3(10, 0, 10), vec3(20, 0, 10), 4);
    const adaptive = roadRibbon(curve, { halfWidth: 2, sampleDistance: 5, adaptiveCurvature: true, curvatureThresholdDeg: 4 });
    const flat = roadRibbon(curve, { halfWidth: 2, sampleDistance: 5, adaptiveCurvature: false });
    expect(vertexCount(adaptive)).toBeGreaterThanOrEqual(vertexCount(flat));
  });

  it("applies vertical offset to lift the surface", () => {
    const low = roadRibbon(straight, { halfWidth: 2, sampleDistance: 4, verticalOffset: 0 });
    const high = roadRibbon(straight, { halfWidth: 2, sampleDistance: 4, verticalOffset: 1 });
    expect(bounds(high).min.y - bounds(low).min.y).toBeCloseTo(1, 3);
  });
});

describe("roadCurbs", () => {
  it("builds curb geometry taller than the flat road", () => {
    const curbs = roadCurbs(straight, { halfWidth: 3, sampleDistance: 2, curbHeight: 0.3 });
    expect(triangleCount(curbs)).toBeGreaterThan(0);
    const b = bounds(curbs);
    expect(b.max.y - b.min.y).toBeCloseTo(0.3, 2);
  });
});

describe("roadCenterLine", () => {
  it("builds a thin strip narrower than the road", () => {
    const line = roadCenterLine(straight, { halfWidth: 3, sampleDistance: 2, lineWidth: 0.2 });
    const b = bounds(line);
    expect(b.max.x - b.min.x).toBeCloseTo(0.2, 2);
  });
});

describe("roadLaneLines", () => {
  it("builds dividers for a multi-lane road, skipping the center", () => {
    const m = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true, skipCenter: true });
    expect(triangleCount(m)).toBeGreaterThan(0);
    // 4 lanes -> 3 internal dividers, center skipped -> 2 dashed lines within +/-halfWidth.
    const b = bounds(m);
    expect(b.max.x).toBeLessThanOrEqual(4);
    expect(b.min.x).toBeGreaterThanOrEqual(-4);
  });

  it("dashed lines split into multiple quads unlike a single solid line", () => {
    const dashed = roadLaneLines(straight, { halfWidth: 4, lanes: 2, dashed: true, skipCenter: false, dashLength: 1, gapLength: 3 });
    const solid = roadLaneLines(straight, { halfWidth: 4, lanes: 2, dashed: false, skipCenter: false });
    // A solid divider is one long quad (2 tris); dashed breaks into many.
    expect(triangleCount(solid)).toBe(2);
    expect(triangleCount(dashed)).toBeGreaterThan(triangleCount(solid));
  });

  it("is deterministic", () => {
    const a = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true });
    const b = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});

describe("roadEdgeLines", () => {
  it("builds two solid lines near the outer edges", () => {
    const m = roadEdgeLines(straight, { halfWidth: 4, lineWidth: 0.1, edgeInset: 0.2 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // Lines sit at +/-(halfWidth - inset) = +/-3.8, +/- half line width.
    expect(b.max.x).toBeCloseTo(3.85, 1);
    expect(b.min.x).toBeCloseTo(-3.85, 1);
  });
});
